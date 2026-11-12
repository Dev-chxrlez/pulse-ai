// Reads comment text from the user's OWN post in a visible Chrome window where the user signs in
// themselves. No stealth plugins, no captcha solving, no password handling: if the platform asks
// for a login or security check, PULSE stops and tells the user. Local demo use only.
import path from 'node:path';
import {NicheError} from './socialmonitor.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const MORE = /(view|see|load) (\d+ )?(more|previous|all) (comments|replies)|more comments|view \d+ repl|tingnan ang (iba pang|higit pa)|view more/i;

export function createCommentBrowser({dataDir, launch}) {
  let context = null, idle = null, busy = false;
  async function open() {
    if (context) return context;
    const {chromium} = await import('playwright-core');
    const start = launch || (options => chromium.launchPersistentContext(path.join(dataDir, 'browser-profile'), options));
    context = await start({channel: 'chrome', headless: false, viewport: null, args: ['--window-size=1200,900']});
    context.on('close', () => { context = null; });
    return context;
  }
  function closeLater() { clearTimeout(idle); idle = setTimeout(() => context?.close().catch(() => {}), 10 * 60 * 1000); }
  return {
    async comments(postUrl, platform) {
      if (busy) throw new NicheError('BROWSER_BUSY', 'Already reading comments. Wait a moment.', 409);
      busy = true;
      try {
        const browser = await open().catch(() => { throw new NicheError('BROWSER_UNAVAILABLE', 'Could not open Google Chrome. Make sure Chrome is installed.', 503); });
        const page = browser.pages()[0] || await browser.newPage();
        await page.bringToFront().catch(() => {});
        await page.goto(postUrl, {waitUntil: 'domcontentloaded', timeout: 30000}).catch(() => { throw new NicheError('BROWSER_LOAD', 'The post did not load. Check your connection and try again.', 502); });
        await pause(3000);
        const url = page.url();
        if (/\/(checkpoint|two_step_verification|challenge)/i.test(url) || await page.locator('iframe[src*="captcha"], #captcha, [id*="captcha"]').count() > 0) return {status: 'blocked', message: 'The platform is asking for a security check. Finish it in the Chrome window yourself, then try again later. PULSE will not bypass it.'};
        const needsLogin = /\/(login|accounts\/login)/i.test(url) || await page.locator('input[name="pass"], input[name="password"], form[action*="login"]').count() > 0;
        if (needsLogin) return {status: 'login', message: `Sign in to ${platform === 'tiktok' ? 'TikTok' : platform === 'instagram' ? 'Instagram' : 'Facebook'} in the Chrome window PULSE opened, then click “Fetch comments” again.`};
        // Reveal more comments at a calm, human pace.
        for (let round = 0; round < 6; round++) {
          const more = page.getByRole('button', {name: MORE}).first();
          if (!(await more.count()) || !(await more.isVisible().catch(() => false))) break;
          await more.click({timeout: 4000}).catch(() => {});
          await pause(1200 + Math.round(Math.random() * 900));
        }
        // Prefer the comment items themselves; fall back to the visible page text.
        const text = await page.evaluate(() => {
          const pick = selector => [...document.querySelectorAll(selector)].map(node => node.innerText.trim()).filter(Boolean);
          const items = [...pick('div[role="article"][aria-label*="omment"]'), ...pick('[data-e2e="comment-level-1"], [data-e2e="comment-level-2"]'), ...pick('ul ul li')];
          return (items.length >= 2 ? items.join('\n\n') : document.body.innerText).slice(0, 39000);
        });
        closeLater();
        if (!text || text.trim().length < 10) return {status: 'empty', message: 'No comments were visible on that post.'};
        return {status: 'ok', text};
      } finally { busy = false; }
    },
    close: () => context?.close().catch(() => {}),
  };
}
