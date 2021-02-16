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

import fs from 'fs';
import * as os from 'os';
import path from 'path';
import * as util from 'util';
import { BrowserContext, normalizeProxySettings, validateBrowserContextOptions } from './browserContext';
import * as registry from '../utils/registry';
import { ConnectionTransport, WebSocketTransport } from './transport';
import { BrowserOptions, Browser, BrowserProcess, PlaywrightOptions } from './browser';
import { launchProcess, Env, envArrayToObject } from './processLauncher';
import { PipeTransport } from './pipeTransport';
import { Progress, ProgressController } from './progress';
import * as types from './types';
import { TimeoutSettings } from '../utils/timeoutSettings';
import { validateHostRequirements } from './validateDependencies';
import { isDebugMode } from '../utils/utils';
import { helper } from './helper';
import { RecentLogsCollector } from '../utils/debugLogger';
import { CallMetadata, SdkObject } from './instrumentation';

const mkdirAsync = util.promisify(fs.mkdir);
const mkdtempAsync = util.promisify(fs.mkdtemp);
const existsAsync = (path: string): Promise<boolean> => new Promise(resolve => fs.stat(path, err => resolve(!err)));
const DOWNLOADS_FOLDER = path.join(os.tmpdir(), 'playwright_downloads-');

export abstract class BrowserType extends SdkObject {
  private _name: registry.BrowserName;
  readonly _registry: registry.Registry;
  readonly _playwrightOptions: PlaywrightOptions;

  constructor(browserName: registry.BrowserName, playwrightOptions: PlaywrightOptions) {
    super(playwrightOptions.rootSdkObject);
    this.attribution.browserType = this;
    this._playwrightOptions = playwrightOptions;
    this._name = browserName;
    this._registry = playwrightOptions.registry;
  }

  executablePath(): string {
    return this._registry.executablePath(this._name) || '';
  }

  name(): string {
    return this._name;
  }

  async launch(metadata: CallMetadata, options: types.LaunchOptions, protocolLogger?: types.ProtocolLogger): Promise<Browser> {
    options = validateLaunchOptions(options);
    const controller = new ProgressController(metadata, this);
    controller.setLogName('browser');
    const browser = await controller.run(progress => {
      return this._innerLaunchWithRetries(progress, options, undefined, helper.debugProtocolLogger(protocolLogger)).catch(e => { throw this._rewriteStartupError(e); });
    }, TimeoutSettings.timeout(options));
    return browser;
  }

  async launchPersistentContext(metadata: CallMetadata, userDataDir: string, options: types.LaunchPersistentOptions): Promise<BrowserContext> {
    options = validateLaunchOptions(options);
    const controller = new ProgressController(metadata, this);
    const persistent: types.BrowserContextOptions = options;
    controller.setLogName('browser');
    const browser = await controller.run(progress => {
      return this._innerLaunchWithRetries(progress, options, persistent, helper.debugProtocolLogger(), userDataDir).catch(e => { throw this._rewriteStartupError(e); });
    }, TimeoutSettings.timeout(options));
    return browser._defaultContext!;
  }

  async _innerLaunchWithRetries(progress: Progress, options: types.LaunchOptions, persistent: types.BrowserContextOptions | undefined, protocolLogger: types.ProtocolLogger, userDataDir?: string): Promise<Browser> {
    try {
      return this._innerLaunch(progress, options, persistent, protocolLogger, userDataDir);
    } catch (error) {
      // @see https://github.com/microsoft/playwright/issues/5214
      const errorMessage = typeof error === 'object' && typeof error.message === 'string' ? error.message : '';
      if (errorMessage.includes('Inconsistency detected by ld.so')) {
        progress.log(`<restarting browser due to hitting race condition in glibc>`);
        return this._innerLaunch(progress, options, persistent, protocolLogger, userDataDir);
      }
      throw error;
    }
  }

  async _innerLaunch(progress: Progress, options: types.LaunchOptions, persistent: types.BrowserContextOptions | undefined, protocolLogger: types.ProtocolLogger, userDataDir?: string): Promise<Browser> {
    options.proxy = options.proxy ? normalizeProxySettings(options.proxy) : undefined;
    const browserLogsCollector = new RecentLogsCollector();
    const { browserProcess, downloadsPath, transport } = await this._launchProcess(progress, options, !!persistent, browserLogsCollector, userDataDir);
    if ((options as any).__testHookBeforeCreateBrowser)
      await (options as any).__testHookBeforeCreateBrowser();
    const browserOptions: BrowserOptions = {
      ...this._playwrightOptions,
      name: this._name,
      isChromium: this._name === 'chromium',
      slowMo: options.slowMo,
      persistent,
      headful: !options.headless,
      downloadsPath,
      browserProcess,
      proxy: options.proxy,
      protocolLogger,
      browserLogsCollector,
      wsEndpoint: options.useWebSocket ? (transport as WebSocketTransport).wsEndpoint : undefined,
    };
    if (persistent)
      validateBrowserContextOptions(persistent, browserOptions);
    copyTestHooks(options, browserOptions);
    const browser = await this._connectToTransport(transport, browserOptions);
    // We assume no control when using custom arguments, and do not prepare the default context in that case.
    if (persistent && !options.ignoreAllDefaultArgs)
      await browser._defaultContext!._loadDefaultContext(progress);
    return browser;
  }

  private async _launchProcess(progress: Progress, options: types.LaunchOptions, isPersistent: boolean, browserLogsCollector: RecentLogsCollector, userDataDir?: string): Promise<{ browserProcess: BrowserProcess, downloadsPath: string, transport: ConnectionTransport }> {
    const {
      ignoreDefaultArgs,
      ignoreAllDefaultArgs,
      args = [],
      executablePath = null,
      handleSIGINT = true,
      handleSIGTERM = true,
      handleSIGHUP = true,
    } = options;

    const env = options.env ? envArrayToObject(options.env) : process.env;

    const tempDirectories = [];
    const ensurePath = async (tmpPrefix: string, pathFromOptions?: string) => {
      let dir;
      if (pathFromOptions) {
        dir = pathFromOptions;
        await mkdirAsync(pathFromOptions, { recursive: true });
      } else {
        dir = await mkdtempAsync(tmpPrefix);
        tempDirectories.push(dir);
      }
      return dir;
    };
    // TODO: add downloadsPath to newContext().
    const downloadsPath = await ensurePath(DOWNLOADS_FOLDER, options.downloadsPath);

    if (!userDataDir) {
      userDataDir = await mkdtempAsync(path.join(os.tmpdir(), `playwright_${this._name}dev_profile-`));
      tempDirectories.push(userDataDir);
    }

    const browserArguments = [];
    if (ignoreAllDefaultArgs)
      browserArguments.push(...args);
    else if (ignoreDefaultArgs)
      browserArguments.push(...this._defaultArgs(options, isPersistent, userDataDir).filter(arg => ignoreDefaultArgs.indexOf(arg) === -1));
    else
      browserArguments.push(...this._defaultArgs(options, isPersistent, userDataDir));

    const executable = executablePath || this.executablePath();
    if (!executable)
      throw new Error(`No executable path is specified. Pass "executablePath" option directly.`);
    if (!(await existsAsync(executable))) {
      const errorMessageLines = [`Failed to launch ${this._name} because executable doesn't exist at ${executable}`];
      // If we tried using stock downloaded browser, suggest re-installing playwright.
      if (!executablePath)
        errorMessageLines.push(`Try re-installing playwright with "npm install playwright"`);
      throw new Error(errorMessageLines.join('\n'));
    }

    if (!executablePath) {
      // We can only validate dependencies for bundled browsers.
      await validateHostRequirements(this._registry, this._name);
    }

    let wsEndpointCallback: ((wsEndpoint: string) => void) | undefined;
    const wsEndpoint = options.useWebSocket ? new Promise<string>(f => wsEndpointCallback = f) : undefined;
    // Note: it is important to define these variables before launchProcess, so that we don't get
    // "Cannot access 'browserServer' before initialization" if something went wrong.
    let transport: ConnectionTransport | undefined = undefined;
    let browserProcess: BrowserProcess | undefined = undefined;
    const { launchedProcess, gracefullyClose, kill } = await launchProcess({
      executablePath: executable,
      args: browserArguments,
      env: this._amendEnvironment(env, userDataDir, executable, browserArguments),
      handleSIGINT,
      handleSIGTERM,
      handleSIGHUP,
      log: (message: string) => {
        if (wsEndpointCallback) {
          const match = message.match(/DevTools listening on (.*)/);
          if (match)
            wsEndpointCallback(match[1]);
        }
        progress.log(message);
        browserLogsCollector.log(message);
      },
      stdio: 'pipe',
      tempDirectories,
      attemptToGracefullyClose: async () => {
        if ((options as any).__testHookGracefullyClose)
          await (options as any).__testHookGracefullyClose();
        // We try to gracefully close to prevent crash reporting and core dumps.
        // Note that it's fine to reuse the pipe transport, since
        // our connection ignores kBrowserCloseMessageId.
        this._attemptToGracefullyCloseBrowser(transport!);
      },
      onExit: (exitCode, signal) => {
        if (browserProcess && browserProcess.onclose)
          browserProcess.onclose(exitCode, signal);
      },
    });
    browserProcess = {
      onclose: undefined,
      process: launchedProcess,
      close: gracefullyClose,
      kill
    };
    progress.cleanupWhenAborted(() => browserProcess && closeOrKill(browserProcess, progress.timeUntilDeadline()));
    if (options.useWebSocket) {
      transport = await WebSocketTransport.connect(progress, await wsEndpoint!);
    } else {
      const stdio = launchedProcess.stdio as unknown as [NodeJS.ReadableStream, NodeJS.WritableStream, NodeJS.WritableStream, NodeJS.WritableStream, NodeJS.ReadableStream];
      transport = new PipeTransport(stdio[3], stdio[4]);
    }
    return { browserProcess, downloadsPath, transport };
  }

  async connectOverCDP(metadata: CallMetadata, wsEndpoint: string, options: { slowMo?: number, sdkLanguage: string }, timeout?: number): Promise<Browser> {
    throw new Error('CDP connections are only supported by Chromium');
  }

  abstract _defaultArgs(options: types.LaunchOptions, isPersistent: boolean, userDataDir: string): string[];
  abstract _connectToTransport(transport: ConnectionTransport, options: BrowserOptions): Promise<Browser>;
  abstract _amendEnvironment(env: Env, userDataDir: string, executable: string, browserArguments: string[]): Env;
  abstract _rewriteStartupError(error: Error): Error;
  abstract _attemptToGracefullyCloseBrowser(transport: ConnectionTransport): void;
}

function copyTestHooks(from: object, to: object) {
  for (const [key, value] of Object.entries(from)) {
    if (key.startsWith('__testHook'))
      (to as any)[key] = value;
  }
}

function validateLaunchOptions<Options extends types.LaunchOptions>(options: Options): Options {
  const { devtools = false } = options;
  let { headless = !devtools } = options;
  if (isDebugMode())
    headless = false;
  return { ...options, devtools, headless };
}

async function closeOrKill(browserProcess: BrowserProcess, timeout: number): Promise<void> {
  let timer: NodeJS.Timer;
  try {
    await Promise.race([
      browserProcess.close(),
      new Promise((resolve, reject) => timer = setTimeout(reject, timeout)),
    ]);
  } catch (ignored) {
    await browserProcess.kill().catch(ignored => {}); // Make sure to await actual process exit.
  } finally {
    clearTimeout(timer!);
  }
}
