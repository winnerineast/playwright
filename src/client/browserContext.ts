/**
 * Copyright 2017 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Page, BindingCall } from './page';
import * as network from './network';
import * as channels from '../protocol/channels';
import * as util from 'util';
import fs from 'fs';
import { ChannelOwner } from './channelOwner';
import { deprecate, evaluationScript, urlMatches } from './clientHelper';
import { Browser } from './browser';
import { Events } from './events';
import { TimeoutSettings } from '../utils/timeoutSettings';
import { Waiter } from './waiter';
import { URLMatch, Headers, WaitForEventOptions, BrowserContextOptions, StorageState, LaunchOptions } from './types';
import { isUnderTest, headersObjectToArray, mkdirIfNeeded } from '../utils/utils';
import { isSafeCloseError } from '../utils/errors';
import * as api from '../../types/types';
import * as structs from '../../types/structs';

const fsWriteFileAsync = util.promisify(fs.writeFile.bind(fs));
const fsReadFileAsync = util.promisify(fs.readFile.bind(fs));

export class BrowserContext extends ChannelOwner<channels.BrowserContextChannel, channels.BrowserContextInitializer> implements api.BrowserContext {
  _pages = new Set<Page>();
  private _routes: { url: URLMatch, handler: network.RouteHandler }[] = [];
  readonly _browser: Browser | null = null;
  readonly _bindings = new Map<string, (source: structs.BindingSource, ...args: any[]) => any>();
  _timeoutSettings = new TimeoutSettings();
  _ownerPage: Page | undefined;
  private _closedPromise: Promise<void>;
  _options: channels.BrowserNewContextParams = {
    sdkLanguage: 'javascript'
  };

  static from(context: channels.BrowserContextChannel): BrowserContext {
    return (context as any)._object;
  }

  static fromNullable(context: channels.BrowserContextChannel | null): BrowserContext | null {
    return context ? BrowserContext.from(context) : null;
  }

  constructor(parent: ChannelOwner, type: string, guid: string, initializer: channels.BrowserContextInitializer) {
    super(parent, type, guid, initializer);
    if (parent instanceof Browser)
      this._browser = parent;

    this._channel.on('bindingCall', ({binding}) => this._onBinding(BindingCall.from(binding)));
    this._channel.on('close', () => this._onClose());
    this._channel.on('page', ({page}) => this._onPage(Page.from(page)));
    this._channel.on('route', ({ route, request }) => this._onRoute(network.Route.from(route), network.Request.from(request)));
    this._closedPromise = new Promise(f => this.once(Events.BrowserContext.Close, f));
  }

  private _onPage(page: Page): void {
    this._pages.add(page);
    this.emit(Events.BrowserContext.Page, page);
  }

  _onRoute(route: network.Route, request: network.Request) {
    for (const {url, handler} of this._routes) {
      if (urlMatches(request.url(), url)) {
        handler(route, request);
        return;
      }
    }
    route.continue();
  }

  async _onBinding(bindingCall: BindingCall) {
    const func = this._bindings.get(bindingCall._initializer.name);
    if (!func)
      return;
    bindingCall.call(func);
  }

  setDefaultNavigationTimeout(timeout: number) {
    this._timeoutSettings.setDefaultNavigationTimeout(timeout);
    this._channel.setDefaultNavigationTimeoutNoReply({ timeout });
  }

  setDefaultTimeout(timeout: number) {
    this._timeoutSettings.setDefaultTimeout(timeout);
    this._channel.setDefaultTimeoutNoReply({ timeout });
  }

  browser(): Browser | null {
    return this._browser;
  }

  pages(): Page[] {
    return [...this._pages];
  }

  async newPage(): Promise<Page> {
    return this._wrapApiCall('browserContext.newPage', async () => {
      if (this._ownerPage)
        throw new Error('Please use browser.newContext()');
      return Page.from((await this._channel.newPage()).page);
    });
  }

  async cookies(urls?: string | string[]): Promise<network.NetworkCookie[]> {
    if (!urls)
      urls = [];
    if (urls && typeof urls === 'string')
      urls = [ urls ];
    return this._wrapApiCall('browserContext.cookies', async () => {
      return (await this._channel.cookies({ urls: urls as string[] })).cookies;
    });
  }

  async addCookies(cookies: network.SetNetworkCookieParam[]): Promise<void> {
    return this._wrapApiCall('browserContext.addCookies', async () => {
      await this._channel.addCookies({ cookies });
    });
  }

  async clearCookies(): Promise<void> {
    return this._wrapApiCall('browserContext.clearCookies', async () => {
      await this._channel.clearCookies();
    });
  }

  async grantPermissions(permissions: string[], options?: { origin?: string }): Promise<void> {
    return this._wrapApiCall('browserContext.grantPermissions', async () => {
      await this._channel.grantPermissions({ permissions, ...options });
    });
  }

  async clearPermissions(): Promise<void> {
    return this._wrapApiCall('browserContext.clearPermissions', async () => {
      await this._channel.clearPermissions();
    });
  }

  async setGeolocation(geolocation: { longitude: number, latitude: number, accuracy?: number } | null): Promise<void> {
    return this._wrapApiCall('browserContext.setGeolocation', async () => {
      await this._channel.setGeolocation({ geolocation: geolocation || undefined });
    });
  }

  async setExtraHTTPHeaders(headers: Headers): Promise<void> {
    return this._wrapApiCall('browserContext.setExtraHTTPHeaders', async () => {
      network.validateHeaders(headers);
      await this._channel.setExtraHTTPHeaders({ headers: headersObjectToArray(headers) });
    });
  }

  async setOffline(offline: boolean): Promise<void> {
    return this._wrapApiCall('browserContext.setOffline', async () => {
      await this._channel.setOffline({ offline });
    });
  }

  async setHTTPCredentials(httpCredentials: { username: string, password: string } | null): Promise<void> {
    if (!isUnderTest())
      deprecate(`context.setHTTPCredentials`, `warning: method |context.setHTTPCredentials()| is deprecated. Instead of changing credentials, create another browser context with new credentials.`);
    return this._wrapApiCall('browserContext.setHTTPCredentials', async () => {
      await this._channel.setHTTPCredentials({ httpCredentials: httpCredentials || undefined });
    });
  }

  async addInitScript(script: Function | string | { path?: string, content?: string }, arg?: any): Promise<void> {
    return this._wrapApiCall('browserContext.addInitScript', async () => {
      const source = await evaluationScript(script, arg);
      await this._channel.addInitScript({ source });
    });
  }

  async exposeBinding(name: string, callback: (source: structs.BindingSource, ...args: any[]) => any, options: { handle?: boolean } = {}): Promise<void> {
    return this._wrapApiCall('browserContext.exposeBinding', async () => {
      await this._channel.exposeBinding({ name, needsHandle: options.handle });
      this._bindings.set(name, callback);
    });
  }

  async exposeFunction(name: string, callback: Function): Promise<void> {
    return this._wrapApiCall('browserContext.exposeFunction', async () => {
      await this._channel.exposeBinding({ name });
      const binding = (source: structs.BindingSource, ...args: any[]) => callback(...args);
      this._bindings.set(name, binding);
    });
  }

  async route(url: URLMatch, handler: network.RouteHandler): Promise<void> {
    return this._wrapApiCall('browserContext.route', async () => {
      this._routes.push({ url, handler });
      if (this._routes.length === 1)
        await this._channel.setNetworkInterceptionEnabled({ enabled: true });
    });
  }

  async unroute(url: URLMatch, handler?: network.RouteHandler): Promise<void> {
    return this._wrapApiCall('browserContext.unroute', async () => {
      this._routes = this._routes.filter(route => route.url !== url || (handler && route.handler !== handler));
      if (this._routes.length === 0)
        await this._channel.setNetworkInterceptionEnabled({ enabled: false });
    });
  }

  async waitForEvent(event: string, optionsOrPredicate: WaitForEventOptions = {}): Promise<any> {
    const timeout = this._timeoutSettings.timeout(typeof optionsOrPredicate === 'function'  ? {} : optionsOrPredicate);
    const predicate = typeof optionsOrPredicate === 'function'  ? optionsOrPredicate : optionsOrPredicate.predicate;
    const waiter = Waiter.createForEvent(this, event);
    waiter.rejectOnTimeout(timeout, `Timeout while waiting for event "${event}"`);
    if (event !== Events.BrowserContext.Close)
      waiter.rejectOnEvent(this, Events.BrowserContext.Close, new Error('Context closed'));
    const result = await waiter.waitForEvent(this, event, predicate as any);
    waiter.dispose();
    return result;
  }

  async storageState(options: { path?: string } = {}): Promise<StorageState> {
    return await this._wrapApiCall('browserContext.storageState', async () => {
      const state = await this._channel.storageState();
      if (options.path) {
        await mkdirIfNeeded(options.path);
        await fsWriteFileAsync(options.path, JSON.stringify(state), 'utf8');
      }
      return state;
    });
  }

  async _onClose() {
    if (this._browser)
      this._browser._contexts.delete(this);
    this.emit(Events.BrowserContext.Close, this);
  }

  async close(): Promise<void> {
    try {
      await this._wrapApiCall('browserContext.close', async () => {
        await this._channel.close();
        await this._closedPromise;
      });
    } catch (e) {
      if (isSafeCloseError(e))
        return;
      throw e;
    }
  }

  async _pause() {
    return this._wrapApiCall('browserContext.pause', async () => {
      await this._channel.pause();
    });
  }

  async _enableRecorder(params: {
      language: string,
      launchOptions?: LaunchOptions,
      contextOptions?: BrowserContextOptions,
      device?: string,
      saveStorage?: string,
      startRecording?: boolean,
      outputFile?: string
  }) {
    await this._channel.recorderSupplementEnable(params);
  }
}

export async function prepareBrowserContextParams(options: BrowserContextOptions): Promise<channels.BrowserNewContextParams> {
  if (options.videoSize && !options.videosPath)
    throw new Error(`"videoSize" option requires "videosPath" to be specified`);
  if (options.extraHTTPHeaders)
    network.validateHeaders(options.extraHTTPHeaders);
  const contextParams: channels.BrowserNewContextParams = {
    sdkLanguage: 'javascript',
    ...options,
    viewport: options.viewport === null ? undefined : options.viewport,
    noDefaultViewport: options.viewport === null,
    extraHTTPHeaders: options.extraHTTPHeaders ? headersObjectToArray(options.extraHTTPHeaders) : undefined,
    storageState: typeof options.storageState === 'string' ? JSON.parse(await fsReadFileAsync(options.storageState, 'utf8')) : options.storageState,
  };
  if (!contextParams.recordVideo && options.videosPath) {
    contextParams.recordVideo = {
      dir: options.videosPath,
      size: options.videoSize
    };
  }
  return contextParams;
}
