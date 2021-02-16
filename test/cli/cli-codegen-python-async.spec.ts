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
import { folio } from './cli.fixtures';

const { it, expect } = folio;

const emptyHTML = new URL('file://' + path.join(__dirname, '..', 'assets', 'empty.html')).toString();

it('should print the correct imports and context options', async ({ browserName, runCLI }) => {
  const cli = runCLI(['codegen', '--target=python-async', emptyHTML]);
  const expectedResult = `import asyncio
from playwright.async_api import async_playwright

async def run(playwright):
    browser = await playwright.${browserName}.launch(headless=False)
    context = await browser.new_context()`;
  await cli.waitFor(expectedResult);
  expect(cli.text()).toContain(expectedResult);
});

it('should print the correct context options for custom settings', async ({ browserName, runCLI }) => {
  const cli = runCLI(['--color-scheme=light', 'codegen', '--target=python-async', emptyHTML]);
  const expectedResult = `import asyncio
from playwright.async_api import async_playwright

async def run(playwright):
    browser = await playwright.${browserName}.launch(headless=False)
    context = await browser.new_context(color_scheme="light")`;
  await cli.waitFor(expectedResult);
  expect(cli.text()).toContain(expectedResult);
});

it('should print the correct context options when using a device', async ({ runCLI }) => {
  const cli = runCLI(['--device=Pixel 2', 'codegen', '--target=python-async', emptyHTML]);
  const expectedResult = `import asyncio
from playwright.async_api import async_playwright

async def run(playwright):
    browser = await playwright.chromium.launch(headless=False)
    context = await browser.new_context(**playwright.devices["Pixel 2"])`;
  await cli.waitFor(expectedResult);
  expect(cli.text()).toContain(expectedResult);
});

it('should print the correct context options when using a device and additional options', async ({ runCLI }) => {
  const cli = runCLI(['--color-scheme=light', '--device=iPhone 11', 'codegen', '--target=python-async', emptyHTML]);
  const expectedResult = `import asyncio
from playwright.async_api import async_playwright

async def run(playwright):
    browser = await playwright.webkit.launch(headless=False)
    context = await browser.new_context(**playwright.devices["iPhone 11"], color_scheme="light")`;
  await cli.waitFor(expectedResult);
  expect(cli.text()).toContain(expectedResult);
});

it('should save the codegen output to a file if specified', async ({ browserName, runCLI, testInfo }) => {
  const tmpFile = testInfo.outputPath('script.js');
  const cli = runCLI(['codegen', '--target=python-async', '--output', tmpFile, emptyHTML]);
  await cli.exited;
  const content = await fs.readFileSync(tmpFile);
  expect(content.toString()).toBe(`import asyncio
from playwright.async_api import async_playwright

async def run(playwright):
    browser = await playwright.${browserName}.launch(headless=False)
    context = await browser.new_context()

    # Open new page
    page = await context.new_page()

    # Go to ${emptyHTML}
    await page.goto("${emptyHTML}")

    # Close page
    await page.close()

    # ---------------------
    await context.close()
    await browser.close()

async def main():
    async with async_playwright() as playwright:
        await run(playwright)
asyncio.run(main())`);
});

it('should print load/save storage_state', async ({ browserName, runCLI, testInfo }) => {
  const loadFileName = testInfo.outputPath('load.json');
  const saveFileName = testInfo.outputPath('save.json');
  await fs.promises.writeFile(loadFileName, JSON.stringify({ cookies: [], origins: [] }), 'utf8');
  const cli = runCLI([`--load-storage=${loadFileName}`, `--save-storage=${saveFileName}`, 'codegen', '--target=python-async', emptyHTML]);
  const expectedResult1 = `import asyncio
from playwright.async_api import async_playwright

async def run(playwright):
    browser = await playwright.${browserName}.launch(headless=False)
    context = await browser.new_context(storage_state="${loadFileName}")`;
  await cli.waitFor(expectedResult1);

  const expectedResult2 = `
    # ---------------------
    await context.storage_state(path="${saveFileName}")
    await context.close()
    await browser.close()

async def main():
    async with async_playwright() as playwright:
        await run(playwright)
asyncio.run(main())`;
  await cli.waitFor(expectedResult2);
});
