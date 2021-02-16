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

import path from 'path';
import { Tracer } from '../trace/tracer';
import { Android } from './android/android';
import { AdbBackend } from './android/backendAdb';
import { PlaywrightOptions } from './browser';
import { Chromium } from './chromium/chromium';
import { Electron } from './electron/electron';
import { Firefox } from './firefox/firefox';
import { Selectors, serverSelectors } from './selectors';
import { HarTracer } from './supplements/har/harTracer';
import { InspectorController } from './supplements/inspectorController';
import { WebKit } from './webkit/webkit';
import { Registry } from '../utils/registry';
import { InstrumentationListener, multiplexInstrumentation, SdkObject } from './instrumentation';

export class Playwright extends SdkObject {
  readonly selectors: Selectors;
  readonly chromium: Chromium;
  readonly android: Android;
  readonly electron: Electron;
  readonly firefox: Firefox;
  readonly webkit: WebKit;
  readonly options: PlaywrightOptions;

  constructor(isInternal: boolean) {
    const listeners: InstrumentationListener[] = [];
    if (!isInternal) {
      listeners.push(new Tracer());
      listeners.push(new HarTracer());
      listeners.push(new InspectorController());
    }
    const instrumentation = multiplexInstrumentation(listeners);
    super({ attribution: {}, instrumentation } as any);
    this.options = {
      registry: new Registry(path.join(__dirname, '..', '..')),
      rootSdkObject: this,
    };
    this.chromium = new Chromium(this.options);
    this.firefox = new Firefox(this.options);
    this.webkit = new WebKit(this.options);
    this.electron = new Electron(this.options);
    this.android = new Android(new AdbBackend(), this.options);
    this.selectors = serverSelectors;
  }
}

export function createPlaywright(isInternal = false) {
  return new Playwright(isInternal);
}
