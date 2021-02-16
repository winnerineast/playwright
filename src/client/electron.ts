/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as structs from '../../types/structs';
import * as api from '../../types/types';
import * as channels from '../protocol/channels';
import { TimeoutSettings } from '../utils/timeoutSettings';
import { BrowserContext } from './browserContext';
import { ChannelOwner } from './channelOwner';
import type { ChromiumBrowserContext } from './chromiumBrowserContext';
import { envObjectToArray } from './clientHelper';
import { Events } from './events';
import { JSHandle, parseResult, serializeArgument } from './jsHandle';
import { Page } from './page';
import { Env, WaitForEventOptions } from './types';
import { Waiter } from './waiter';

type ElectronOptions = Omit<channels.ElectronLaunchOptions, 'env'> & {
  env?: Env,
};

type ElectronAppType = typeof import('electron');

export class Electron extends ChannelOwner<channels.ElectronChannel, channels.ElectronInitializer> implements api.Electron {
  static from(electron: channels.ElectronChannel): Electron {
    return (electron as any)._object;
  }

  constructor(parent: ChannelOwner, type: string, guid: string, initializer: channels.ElectronInitializer) {
    super(parent, type, guid, initializer);
  }

  async launch(options: ElectronOptions = {}): Promise<ElectronApplication> {
    return this._wrapApiCall('electron.launch', async () => {
      const params: channels.ElectronLaunchParams = {
        sdkLanguage: 'javascript',
        ...options,
        env: envObjectToArray(options.env ? options.env : process.env),
      };
      return ElectronApplication.from((await this._channel.launch(params)).electronApplication);
    });
  }
}

export class ElectronApplication extends ChannelOwner<channels.ElectronApplicationChannel, channels.ElectronApplicationInitializer> implements api.ElectronApplication {
  private _context?: BrowserContext;
  private _windows = new Set<Page>();
  private _timeoutSettings = new TimeoutSettings();

  static from(electronApplication: channels.ElectronApplicationChannel): ElectronApplication {
    return (electronApplication as any)._object;
  }

  constructor(parent: ChannelOwner, type: string, guid: string, initializer: channels.ElectronApplicationInitializer) {
    super(parent, type, guid, initializer);
    this._channel.on('context', ({ context }) => this._context = BrowserContext.from(context));
    this._channel.on('window', ({ page, browserWindow }) => {
      const window = Page.from(page);
      (window as any).browserWindow = JSHandle.from(browserWindow);
      this._windows.add(window);
      this.emit(Events.ElectronApplication.Window, window);
      window.once(Events.Page.Close, () => this._windows.delete(window));
    });
    this._channel.on('close', () => this.emit(Events.ElectronApplication.Close));
  }

  windows(): Page[] {
    // TODO: add ElectronPage class inherting from Page.
    return [...this._windows];
  }

  async firstWindow(): Promise<Page> {
    return this._wrapApiCall('electronApplication.firstWindow', async () => {
      if (this._windows.size)
        return this._windows.values().next().value;
      return this.waitForEvent('window');
    });
  }

  context(): ChromiumBrowserContext {
    return this._context! as ChromiumBrowserContext;
  }

  async close() {
    await this._channel.close();
  }

  async waitForEvent(event: string, optionsOrPredicate: WaitForEventOptions = {}): Promise<any> {
    const timeout = this._timeoutSettings.timeout(typeof optionsOrPredicate === 'function' ? {} : optionsOrPredicate);
    const predicate = typeof optionsOrPredicate === 'function' ? optionsOrPredicate : optionsOrPredicate.predicate;
    const waiter = Waiter.createForEvent(this, event);
    waiter.rejectOnTimeout(timeout, `Timeout while waiting for event "${event}"`);
    if (event !== Events.ElectronApplication.Close)
      waiter.rejectOnEvent(this, Events.ElectronApplication.Close, new Error('Electron application closed'));
    const result = await waiter.waitForEvent(this, event, predicate as any);
    waiter.dispose();
    return result;
  }

  async evaluate<R, Arg>(pageFunction: structs.PageFunctionOn<ElectronAppType, Arg, R>, arg: Arg): Promise<R> {
    return this._wrapApiCall('electronApplication.evaluate', async () => {
      const result = await this._channel.evaluateExpression({ expression: String(pageFunction), isFunction: typeof pageFunction === 'function', arg: serializeArgument(arg) });
      return parseResult(result.value);
    });
  }

  async evaluateHandle<R, Arg>(pageFunction: structs.PageFunctionOn<ElectronAppType, Arg, R>, arg: Arg): Promise<structs.SmartHandle<R>> {
    return this._wrapApiCall('electronApplication.evaluateHandle', async () => {
      const result = await this._channel.evaluateExpressionHandle({ expression: String(pageFunction), isFunction: typeof pageFunction === 'function', arg: serializeArgument(arg) });
      return JSHandle.from(result.handle) as any as structs.SmartHandle<R>;
    });
  }
}
