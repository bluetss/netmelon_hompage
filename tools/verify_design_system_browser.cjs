/* Read-only checks; never submit forms, log in, or mutate public content. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(process.argv[2], 'browsers');
const {chromium} = require(path.join(process.argv[2], 'node_modules/playwright'));
const base = process.argv[3];
const output = process.argv[4];
const site = process.argv[5] || 'company';
const routes = site === 'studio' ? ['/vocab/new', '/login'] : site === 'company' && process.argv[6] === 'all'
  ? ['/', '/en/', '/company.html', '/careers.html', '/problems.html', '/ir.html', '/company-privacy.html', '/privacy.html', '/terms.html', '/data-deletion.html', '/en/company.html', '/en/careers.html', '/en/problems.html', '/en/ir.html', '/problems/creator-supply.html', '/en/problems/creator-supply.html']
  : ['/', '/en/'];
fs.mkdirSync(output, {recursive: true});
(async () => {
  const browser = await chromium.launch({headless:true, args:['--no-sandbox']});
  try {
    for(const width of [320,390,1440]) for(const route of routes) for(const scale of site==='studio'?[1]:[1,2]) {
      const page = await browser.newPage({viewport:{width,height:900}});
      if(base.startsWith('http://127.')) await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
      await page.goto(base+route, {waitUntil:'domcontentloaded'});
      if(site==='studio') await page.locator(site==='studio'&&route==='/login'?'.btn.kakao':'textarea').first().waitFor();
      const fonts = await page.evaluate(async () => (await document.fonts.load('16px Pretendard','내팝퀴즈 Abc')).some(f => f.status==='loaded'));
      assert.ok(fonts, `${site} ${route}: bundled Pretendard loaded`);
      if(scale===2) await page.addStyleTag({content:'html {font-size:200% !important;}'});
      const metrics = await page.evaluate(() => ({
        family:getComputedStyle(document.body).fontFamily,
        overflow:document.documentElement.scrollWidth>innerWidth+1,
        width:document.documentElement.scrollWidth,
        primary:getComputedStyle(document.documentElement).getPropertyValue('--npq-color-primary').trim(),
        invalid:[...document.styleSheets].filter(s=>!s.href || s.href.startsWith(location.origin)).flatMap(s=>{
          try{return [...s.cssRules].filter(r=>/NaN|undefined/.test(r.cssText)).map(r=>r.cssText);}catch{return [];}
        })
      }));
      assert.match(metrics.family,/Pretendard/);
      assert.equal(metrics.primary.toLowerCase(),'#00bfa5');
      assert.equal(metrics.invalid.length,0);
      assert.equal(metrics.overflow,false, `${site} ${route} ${width}px text ${scale}: width ${metrics.width}`);
      if(site==='company'&&width<600&&scale===1&&await page.locator('.menu-toggle').count()){
        const menu=page.locator('.menu-toggle');
        const box=await menu.boundingBox(); assert.ok(box.width>=48&&box.height>=48);
        await menu.click(); await page.locator('.site-nav').waitFor({state:'visible'});
        assert.equal(await menu.getAttribute('aria-expanded'),'true');
        await menu.click();
      }
      if(site==='landing'&&scale===1){
        for(const theme of ['light','dark']) {
          await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
          const color=await page.locator('.concept-b').evaluate(n=>getComputedStyle(n).color);
          assert.equal(color,theme==='dark'?'rgb(229, 234, 243)':'rgb(17, 24, 39)');
        }
        await page.evaluate(()=>document.documentElement.dataset.theme='light');
      }
      await page.screenshot({path:path.join(output,`${site}-${route==='/en/'?'en':route==='/login'?'login':'ko'}-${width}-${scale}.png`),fullPage:false});
      console.log(`${site} ${route} ${width}px text ${scale}: font, app color, no overflow PASS`);
      await page.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
