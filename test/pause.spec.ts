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

import { expect } from 'folio';
import { Page } from '..';
import { folio } from './recorder.fixtures';
const { it, describe} = folio;

describe('pause', (suite, { mode }) => {
  suite.skip(mode !== 'default');
}, () => {
  it('should pause and resume the script', async ({ page, recorderPageGetter }) => {
    const scriptPromise = (async () => {
      await page.pause();
    })();
    const recorderPage = await recorderPageGetter();
    await recorderPage.click('[title=Resume]');
    await scriptPromise;
  });

  it('should resume from console', async ({page}) => {
    const scriptPromise = (async () => {
      await page.pause();
    })();
    await Promise.all([
      page.waitForFunction(() => (window as any).playwright && (window as any).playwright.resume).then(() => {
        return page.evaluate('window.playwright.resume()');
      })
    ]);
    await scriptPromise;
  });

  it('should pause after a navigation', async ({page, server, recorderPageGetter}) => {
    const scriptPromise = (async () => {
      await page.goto(server.EMPTY_PAGE);
      await page.pause();
    })();
    const recorderPage = await recorderPageGetter();
    await recorderPage.click('[title=Resume]');
    await scriptPromise;
  });

  it('should show source', async ({page, recorderPageGetter}) => {
    const scriptPromise = (async () => {
      await page.pause();
    })();
    const recorderPage = await recorderPageGetter();
    const source = await recorderPage.textContent('.source-line-paused .source-code');
    expect(source).toContain('page.pause()');
    await recorderPage.click('[title=Resume]');
    await scriptPromise;
  });

  it('should pause on next pause', async ({page, recorderPageGetter}) => {
    const scriptPromise = (async () => {
      await page.pause();  // 1
      await page.pause();  // 2
    })();
    const recorderPage = await recorderPageGetter();
    const source = await recorderPage.textContent('.source-line-paused');
    expect(source).toContain('page.pause();  // 1');
    await recorderPage.click('[title=Resume]');
    await recorderPage.waitForSelector('.source-line-paused:has-text("page.pause();  // 2")');
    await recorderPage.click('[title=Resume]');
    await scriptPromise;
  });

  it('should step', async ({page, recorderPageGetter}) => {
    await page.setContent('<button>Submit</button>');
    const scriptPromise = (async () => {
      await page.pause();
      await page.click('button');
    })();
    const recorderPage = await recorderPageGetter();
    const source = await recorderPage.textContent('.source-line-paused');
    expect(source).toContain('page.pause();');

    await recorderPage.click('[title="Step over"]');
    await recorderPage.waitForSelector('.source-line-paused :has-text("page.click")');

    await recorderPage.click('[title=Resume]');
    await scriptPromise;
  });

  it('should highlight pointer', async ({page, recorderPageGetter}) => {
    await page.setContent('<button>Submit</button>');
    const scriptPromise = (async () => {
      await page.pause();
      await page.click('button');
    })();
    const recorderPage = await recorderPageGetter();
    await recorderPage.click('[title="Step over"]');

    const point = await page.waitForSelector('x-pw-action-point');
    const button = await page.waitForSelector('button');
    const box1 = await button.boundingBox();
    const box2 = await point.boundingBox();

    const x1 = box1.x + box1.width / 2;
    const y1 = box1.y + box1.height / 2;
    const x2 = box2.x + box2.width / 2;
    const y2 = box2.y + box2.height / 2;

    expect(Math.abs(x1 - x2) < 2).toBeTruthy();
    expect(Math.abs(y1 - y2) < 2).toBeTruthy();

    await recorderPage.click('[title="Step over"]');
    await scriptPromise;
  });

  it('should skip input when resuming', async ({page, recorderPageGetter}) => {
    await page.setContent('<button>Submit</button>');
    const scriptPromise = (async () => {
      await page.pause();
      await page.click('button');
      await page.pause();  // 2
    })();
    const recorderPage = await recorderPageGetter();
    await recorderPage.click('[title="Resume"]');
    await recorderPage.waitForSelector('.source-line-paused:has-text("page.pause();  // 2")');
    await recorderPage.click('[title=Resume]');
    await scriptPromise;
  });

  it('should populate log', async ({page, recorderPageGetter}) => {
    await page.setContent('<button>Submit</button>');
    const scriptPromise = (async () => {
      await page.pause();
      await page.click('button');
      await page.pause();  // 2
    })();
    const recorderPage = await recorderPageGetter();
    await recorderPage.click('[title="Resume"]');
    await recorderPage.waitForSelector('.source-line-paused:has-text("page.pause();  // 2")');
    expect(await sanitizeLog(recorderPage)).toEqual([
      'pause',
      'click',
      'waiting for selector "button"',
      'selector resolved to visible <button>Submit</button>',
      'attempting click action',
      'waiting for element to be visible, enabled and stable',
      'element is visible, enabled and stable',
      'scrolling into view if needed',
      'done scrolling',
      'checking that element receives pointer events at ()',
      'element does receive pointer events',
      'performing click action',
      'click action done',
      'waiting for scheduled navigations to finish',
      'navigations have finished',
      'pause',
    ]);
    await recorderPage.click('[title="Resume"]');
    await scriptPromise;
  });

  it('should populate log with waitForEvent', async ({page, recorderPageGetter}) => {
    await page.setContent('<button onclick="console.log(1)">Submit</button>');
    const scriptPromise = (async () => {
      await page.pause();
      await Promise.all([
        page.waitForEvent('console'),
        page.click('button'),
      ]);
      await page.pause();  // 2
    })();
    const recorderPage = await recorderPageGetter();
    await recorderPage.click('[title="Resume"]');
    await recorderPage.waitForSelector('.source-line-paused:has-text("page.pause();  // 2")');
    expect(await sanitizeLog(recorderPage)).toEqual([
      'pause',
      'waitForEvent()',
      'waiting for event \"console\"',
      'click',
      'waiting for selector "button"',
      'selector resolved to visible <button onclick=\"console.log()\">Submit</button>',
      'attempting click action',
      'waiting for element to be visible, enabled and stable',
      'element is visible, enabled and stable',
      'scrolling into view if needed',
      'done scrolling',
      'checking that element receives pointer events at ()',
      'element does receive pointer events',
      'performing click action',
      'click action done',
      'waiting for scheduled navigations to finish',
      'navigations have finished',
      'pause',
    ]);
    await recorderPage.click('[title="Resume"]');
    await scriptPromise;
  });

  it('should populate log with error', async ({page, recorderPageGetter}) => {
    await page.setContent('<button onclick="console.log(1)">Submit</button>');
    const scriptPromise = (async () => {
      await page.pause();
      await page.isChecked('button');
    })().catch(e => e);
    const recorderPage = await recorderPageGetter();
    await recorderPage.click('[title="Resume"]');
    await recorderPage.waitForSelector('.source-line-error');
    expect(await sanitizeLog(recorderPage)).toEqual([
      'pause',
      'isChecked',
      'checking \"checked\" state of \"button\"',
      'selector resolved to <button onclick=\"console.log()\">Submit</button>',
      'Not a checkbox or radio button',
    ]);
    const error = await scriptPromise;
    expect(error.message).toContain('Not a checkbox or radio button');
  });
});

async function sanitizeLog(recorderPage: Page): Promise<string[]> {
  const text = await recorderPage.innerText('.recorder-log');
  return text.split('\n').filter(l => {
    return l !== 'element is not stable - waiting...';
  }).map(l => {
    return l.replace(/\(.*\)/, '()');
  });
}
