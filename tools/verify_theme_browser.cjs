/* Real browser appearance checks; no authentication or API writes. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const [runtime, base, output, site] = process.argv.slice(2);
const {chromium} = require(path.join(runtime, 'node_modules/playwright'));
const key = 'appearance.theme_mode';
const url = base + (site === 'studio' ? '/vocab/new' : '/');
async function state(page) {
  return page.evaluate(() => ({mode: document.documentElement.dataset.themeMode,
    theme: document.documentElement.dataset.theme,
    scheme: getComputedStyle(document.documentElement).colorScheme,
    bg: getComputedStyle(document.body).backgroundColor,
    color: getComputedStyle(document.body).color,
    overflow: document.documentElement.scrollWidth > innerWidth,
    saved: localStorage.getItem('appearance.theme_mode')}));
}
async function expectTheme(page, expected) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if ((await state(page)).theme === expected) return;
    await page.waitForTimeout(100);
  }
  assert.equal((await state(page)).theme,expected);
}
async function ready(page) {
  if (site === 'studio') await page.getByRole('button', {name:'파일 첨부',exact:true}).waitFor({timeout:90000});
  else await page.locator('.site-header:visible, .npq-appbar:visible, .yt-header:visible').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function picker(page, width) {
  if (site === 'landing') {
    await page.locator('.theme-picker summary:visible').first().click();
  } else {
    const box = await page.locator('[data-theme-open]').first().boundingBox();
    if (!box || box.x < 0) {
      if (site === 'studio' && width <= 860) await page.getByRole('button',{name:'사이드바 열기',exact:true}).click();
    }
    await page.locator('[data-theme-open]:visible').first().click();
  }
}
(async () => {
  await fs.mkdir(output,{recursive:true});
  const browser = await chromium.launch({headless:true});
  const rows = [];
  try {
    for (const width of [320,390,1440]) {
      const context = await browser.newContext({viewport:{width,height:900},colorScheme:'light'});
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(url,{waitUntil:'domcontentloaded'}); await ready(page);
      if (site === 'company') {
        assert.equal(await page.locator('.site-header [data-theme-open]').count(),0);
        assert.equal(await page.locator('.site-footer [data-theme-open]').count(),1);
        assert.equal(await page.locator('.footer-links [data-theme-open]').count(),1);
        assert.equal(await page.locator('.footer-appearance').count(),0);
        const utility = await page.locator('.footer-links [data-theme-open]').evaluate(el => {
          const link = el.parentElement.querySelector('a'), s = getComputedStyle(el);
          const a = link.getBoundingClientRect(), b = el.getBoundingClientRect();
          return {sameSize:s.fontSize === getComputedStyle(link).fontSize, height:b.height,
            leftToRight:b.left > a.left, aligned:Math.abs((a.top+a.height/2)-(b.top+b.height/2)) < 1,
            border:s.borderWidth, background:s.backgroundColor};
        });
        assert.deepEqual(utility,{sameSize:true,height:48,leftToRight:true,aligned:true,border:'0px',background:'rgba(0, 0, 0, 0)'});
      }
      if (site === 'landing') {
        assert.ok((await page.content()).includes("addEventListener('storage'"),'served Landing must include current appearance code');
      }
      assert.equal((await state(page)).mode,'system');
      assert.equal((await state(page)).theme,'light');
      await page.screenshot({path:path.join(output,`${site}-${width}-light.png`)});
      await page.emulateMedia({colorScheme:'dark'});
      await page.waitForTimeout(150);
      assert.equal((await state(page)).theme,'dark');
      assert.match((await state(page)).scheme,/only dark|dark only/);
      assert.equal((await state(page)).overflow,false);
      await page.screenshot({path:path.join(output,`${site}-${width}-dark.png`)});
      await picker(page,width);
      if (site === 'company' && width === 390) {
        await page.keyboard.press('Escape');
        await page.locator('.footer-company-name').click();
        await page.screenshot({path:path.join(output,'company-390-footer-dark.png')});
        await picker(page,width);
      }
      if (width === 390) await page.screenshot({path:path.join(output,`${site}-390-theme-menu-dark.png`)});
      const choice = page.locator('button[data-theme-mode="light"]:visible');
      if (site !== 'landing') {
        const box = await choice.boundingBox(); assert.ok(box.height >= 48);
        assert.equal(await page.locator('dialog[open]').count(),1);
      }
      await choice.click();
      assert.equal((await state(page)).theme,'light'); assert.equal((await state(page)).saved,'light');
      await page.reload({waitUntil:'domcontentloaded'}); await ready(page);
      assert.equal((await state(page)).theme,'light');
      if (width === 390) {
        const {PNG} = require(path.join(runtime,'node_modules/playwright-core/lib/utilsBundle.js'));
        const sample = buffer => {
          const png = PNG.sync.read(buffer);
          return [[2,2],[2,png.height-2]].map(([x,y]) => [...png.data.slice((y*png.width+x)*4,(y*png.width+x)*4+4)]);
        };
        const normal = sample(await page.screenshot());
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setAutoDarkModeOverride',{enabled:true});
        await page.waitForTimeout(150);
        assert.deepEqual(sample(await page.screenshot()),normal,'authored light surfaces resist Chrome auto-dark recoloring');
        await cdp.send('Emulation.setAutoDarkModeOverride',{enabled:false});
        await cdp.detach();
      }
      await picker(page,width);
      await page.locator('button[data-theme-mode="system"]:visible').click();
      assert.equal((await state(page)).theme,'dark');
      await page.emulateMedia({colorScheme:'light'}); await page.waitForTimeout(150);
      assert.equal((await state(page)).theme,'light');
      // Cross-tab changes within the same origin; never cross-domain sync.
      const second = await context.newPage(); await second.goto(url,{waitUntil:'domcontentloaded'}); await ready(second);
      await second.evaluate(() => localStorage.setItem('appearance.theme_mode','dark'));
      await expectTheme(page,'dark');
      await second.evaluate(() => localStorage.removeItem('appearance.theme_mode'));
      await expectTheme(page,'light'); assert.equal((await state(page)).mode,'system');
      if (site !== 'landing') {
        // Sidebar/menu may remain open after the previous selection.
        await picker(page,width);
        await page.keyboard.press('Escape'); assert.equal(await page.locator('dialog[open]').count(),0);
        assert.equal(await page.evaluate(() => document.activeElement.hasAttribute('data-theme-open')),true,'Escape returns focus to theme control');
      }
      if (site !== 'company') {
        assert.equal(await page.locator('link[rel="icon"]').count(),1);
        const href = await page.locator('link[rel="icon"]').getAttribute('href');
        const response = await page.request.get(new URL(href,page.url()).href); assert.equal(response.status(),200);
        rows.push({width,faviconSha256:createHash('sha256').update(await response.body()).digest('hex')});
      } else rows.push({width});
      assert.deepEqual(errors,[]);
      await context.close();
      console.log(`${site} ${width}px: system, explicit override, reload, OS change, cross-tab and layout PASS`);
    }
    for (const saved of ['invalid','dark']) {
      const context = await browser.newContext({colorScheme:'light'});
      await context.addInitScript(([key,saved]) => localStorage.setItem(key,saved),[key,saved]);
      const page = await context.newPage(); await page.goto(url,{waitUntil:'domcontentloaded'}); await ready(page);
      assert.equal((await state(page)).theme,saved==='dark'?'dark':'light');
      assert.equal((await state(page)).mode,saved==='dark'?'dark':'system'); await context.close();
    }
    const blocked = await browser.newContext({colorScheme:'dark'});
    await blocked.addInitScript(() => Object.defineProperty(window,'localStorage',{get(){throw new Error('Blocked storage');}}));
    const page = await blocked.newPage(); await page.goto(url,{waitUntil:'domcontentloaded'}); await ready(page);
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark'); await blocked.close();
    if (site === 'company') {
      for (const route of ['/en/','/company.html','/careers.html','/problems/creator-supply.html','/company-privacy.html']) {
        const context = await browser.newContext({colorScheme:'dark'}); const page = await context.newPage();
        await page.goto(base+route,{waitUntil:'domcontentloaded'});
        assert.equal(await page.locator('html').getAttribute('data-theme'),'dark',route);
        assert.equal(await page.locator('[data-theme-open]').count(),1,route);
        assert.equal(await page.locator('.site-header [data-theme-open]').count(),0,route);
        assert.equal(await page.locator('.site-footer [data-theme-open]').count(),1,route);
        assert.equal(await page.locator('.footer-links [data-theme-open]').count(),1,route);
        await context.close();
      }
    }
    await fs.writeFile(path.join(output,`${site}-theme-results.json`),JSON.stringify({site,base,rows,pass:true},null,2));
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
