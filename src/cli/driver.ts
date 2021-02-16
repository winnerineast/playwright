/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License");
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

/* eslint-disable no-console */

import fs from 'fs';
import path from 'path';
import { DispatcherConnection } from '../dispatchers/dispatcher';
import { PlaywrightDispatcher } from '../dispatchers/playwrightDispatcher';
import { installBrowsersWithProgressBar } from '../install/installer';
import { Transport } from '../protocol/transport';
import { createPlaywright } from '../server/playwright';
import { gracefullyCloseAll } from '../server/processLauncher';
import { BrowserName } from '../utils/registry';

export function printApiJson() {
  console.log(JSON.stringify(require('../../api.json')));
}

export function printProtocol() {
  console.log(fs.readFileSync(path.join(__dirname, '..', '..', 'protocol.yml'), 'utf8'));
}

export function runServer() {
  const dispatcherConnection = new DispatcherConnection();
  const transport = new Transport(process.stdout, process.stdin);
  transport.onmessage = message => dispatcherConnection.dispatch(JSON.parse(message));
  dispatcherConnection.onmessage = message => transport.send(JSON.stringify(message));
  transport.onclose = async () => {
    // Drop any messages during shutdown on the floor.
    dispatcherConnection.onmessage = () => {};
    // Force exit after 30 seconds.
    setTimeout(() => process.exit(0), 30000);
    // Meanwhile, try to gracefully close all browsers.
    await gracefullyCloseAll();
    process.exit(0);
  };

  const playwright = createPlaywright();
  new PlaywrightDispatcher(dispatcherConnection.rootDispatcher(), playwright);
}

export async function installBrowsers(browserNames?: BrowserName[]) {
  await installBrowsersWithProgressBar(browserNames);
}
