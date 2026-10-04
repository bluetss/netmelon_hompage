const {chromium} = require('/tmp/npq-homepage-browser.8OTw0C/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({headless:true});
 try {
  const context = await browser.newContext();
  for (const path of ['/release-manifest.json','/scripts/runtime-config.js']) {
   const r = await context.request.get('https://company-dev.netmelonai.com'+path);
   const body = await r.text();
   console.log(JSON.stringify({path,status:r.status(),body:body.slice(0,1100)}));
  }
  await context.close();
  for (const path of ['/', '/en/']) {
   const page = await browser.newPage();
   const response = await page.goto('https://company-dev.netmelonai.com'+path, {waitUntil:'domcontentloaded'});
   await page.waitForTimeout(1000);
   const links = await page.locator('.studio-cta').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,href:n.href})));
   console.log(JSON.stringify({path,status:response.status(),links}));
   if (!links.length || links.some(n=>n.href!=='https://studio-dev.naepopquiz.com/')) process.exitCode=1;
   await page.close();
  }
 } finally { await browser.close(); }
})().catch(e=>{console.error(e.message);process.exitCode=1});
