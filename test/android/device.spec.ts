/**
 * Copyright 2020 Microsoft Corporation. All rights reserved.
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

import fs from 'fs';
import { PNG } from 'pngjs';

import { folio } from './android.fixtures';
const { it, expect } = folio;

if (process.env.PW_ANDROID_TESTS) {
  it('androidDevice.shell', async function({ device }) {
    const output = await device.shell('echo 123');
    expect(output.toString()).toBe('123\n');
  });

  it('androidDevice.open', async function({ device }) {
    const socket = await device.open('shell:/bin/cat');
    await socket.write(Buffer.from('321\n'));
    const output = await new Promise(resolve => socket.on('data', resolve));
    expect(output.toString()).toBe('321\n');
    const closedPromise = new Promise(resolve => socket.on('close', resolve));
    await socket.close();
    await closedPromise;
  });

  it('androidDevice.screenshot', async function({ device, testInfo }) {
    const path = testInfo.outputPath('screenshot.png');
    const result = await device.screenshot({ path });
    const buffer = fs.readFileSync(path);
    expect(result.length).toBe(buffer.length);
    const { width, height} = PNG.sync.read(result);
    expect(width).toBe(1080);
    expect(height).toBe(1920);
  });

  it('androidDevice.push', async function({ device, testInfo }) {
    await device.shell('rm /data/local/tmp/hello-world');
    await device.push(Buffer.from('hello world'), '/data/local/tmp/hello-world');
    const data = await device.shell('cat /data/local/tmp/hello-world');
    expect(data).toEqual(Buffer.from('hello world'));
  });

  it('androidDevice.fill', test => {
    test.fixme(!!process.env.CI, 'Hangs on the bots');
  }, async function({ device }) {
    await device.shell('am start org.chromium.webview_shell/.WebViewBrowserActivity');
    await device.fill({ res: 'org.chromium.webview_shell:id/url_field' }, 'Hello');
    expect((await device.info({ res: 'org.chromium.webview_shell:id/url_field' })).text).toBe('Hello');
  });
}
