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
import path from 'path';
import * as util from 'util';
import { CRPage } from '../../chromium/crPage';
import { Page } from '../../page';
import { ProgressController } from '../../progress';
import { createPlaywright } from '../../playwright';
import { EventEmitter } from 'events';
import { internalCallMetadata } from '../../instrumentation';
import type { CallLog, EventData, Mode, Source } from './recorderTypes';
import { BrowserContext } from '../../browserContext';
import { isUnderTest } from '../../../utils/utils';

const readFileAsync = util.promisify(fs.readFile);

declare global {
  interface Window {
    playwrightSetMode: (mode: Mode) => void;
    playwrightSetPaused: (paused: boolean) => void;
    playwrightSetSources: (sources: Source[]) => void;
    playwrightUpdateLogs: (callLogs: CallLog[]) => void;
    dispatch(data: EventData): Promise<void>;
  }
}

export class RecorderApp extends EventEmitter {
  private _page: Page;
  readonly wsEndpoint: string | undefined;

  constructor(page: Page, wsEndpoint: string | undefined) {
    super();
    this.setMaxListeners(0);
    this._page = page;
    this.wsEndpoint = wsEndpoint;
  }

  async close() {
    await this._page.context().close();
  }

  private async _init() {
    const icon = await readFileAsync(require.resolve('../../../web/recorder/app_icon.png'));
    const crPopup = this._page._delegate as CRPage;
    await crPopup._mainFrameSession._client.send('Browser.setDockTile', {
      image: icon.toString('base64')
    });

    await this._page._setServerRequestInterceptor(async route => {
      if (route.request().url().startsWith('https://playwright/')) {
        const uri = route.request().url().substring('https://playwright/'.length);
        const file = require.resolve('../../../web/recorder/' + uri);
        const buffer = await readFileAsync(file);
        await route.fulfill({
          status: 200,
          headers: [
            { name: 'Content-Type', value: extensionToMime[path.extname(file)] }
          ],
          body: buffer.toString('base64'),
          isBase64: true
        });
        return;
      }
      await route.continue();
    });

    await this._page.exposeBinding('dispatch', false, (_, data: any) => this.emit('event', data));

    this._page.once('close', () => {
      this.emit('close');
      this._page.context().close().catch(e => console.error(e));
    });

    const mainFrame = this._page.mainFrame();
    await mainFrame.goto(internalCallMetadata(), 'https://playwright/index.html');
  }

  static async open(inspectedContext: BrowserContext): Promise<RecorderApp> {
    const recorderPlaywright = createPlaywright(true);
    const args = [
      '--app=data:text/html,',
      '--window-size=600,600',
      '--window-position=1280,10',
    ];
    if (isUnderTest())
      args.push(`--remote-debugging-port=0`);
    const context = await recorderPlaywright.chromium.launchPersistentContext(internalCallMetadata(), '', {
      sdkLanguage: inspectedContext._options.sdkLanguage,
      args,
      noDefaultViewport: true,
      headless: !!process.env.PWCLI_HEADLESS_FOR_TEST || (isUnderTest() && !inspectedContext._browser.options.headful),
      useWebSocket: isUnderTest()
    });
    const controller = new ProgressController(internalCallMetadata(), context._browser);
    await controller.run(async progress => {
      await context._browser._defaultContext!._loadDefaultContextAsIs(progress);
    });

    const [page] = context.pages();
    const result = new RecorderApp(page, context._browser.options.wsEndpoint);
    await result._init();
    return result;
  }

  async setMode(mode: 'none' | 'recording' | 'inspecting'): Promise<void> {
    await this._page.mainFrame()._evaluateExpression(((mode: Mode) => {
      window.playwrightSetMode(mode);
    }).toString(), true, mode, 'main').catch(() => {});
  }

  async setPaused(paused: boolean): Promise<void> {
    await this._page.mainFrame()._evaluateExpression(((paused: boolean) => {
      window.playwrightSetPaused(paused);
    }).toString(), true, paused, 'main').catch(() => {});
  }

  async setSources(sources: Source[]): Promise<void> {
    await this._page.mainFrame()._evaluateExpression(((sources: Source[]) => {
      window.playwrightSetSources(sources);
    }).toString(), true, sources, 'main').catch(() => {});

    // Testing harness for runCLI mode.
    {
      if (process.env.PWCLI_EXIT_FOR_TEST) {
        process.stdout.write('\n-------------8<-------------\n');
        process.stdout.write(sources[0].text);
        process.stdout.write('\n-------------8<-------------\n');
      }
    }
  }

  async updateCallLogs(callLogs: CallLog[]): Promise<void> {
    await this._page.mainFrame()._evaluateExpression(((callLogs: CallLog[]) => {
      window.playwrightUpdateLogs(callLogs);
    }).toString(), true, callLogs, 'main').catch(() => {});
  }

  async bringToFront() {
    await this._page.bringToFront();
  }
}

const extensionToMime: { [key: string]: string } = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.jpeg': 'image/jpeg',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
