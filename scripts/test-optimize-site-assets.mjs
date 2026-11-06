import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, readdir, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {optimizeSiteAssets} from './optimize-site-assets.mjs';

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'company-assets-'));
  const put = async (name, text) => {await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),text);};
  try {
    for(const dir of ['images','styles','scripts']) await mkdir(path.join(root,dir));
    await put('styles/base.css', ':root{--npq-color-primary:#00BFA5}');
    await put('styles/page.css', '@import url("./base.css");.menu{mask:url(../images/menu.svg)}');
    await put('images/menu.svg', '<svg>same-icon</svg>');
    await put('images/logo.svg', '<svg>same-logo</svg>');
    await put('images/unused.png', 'unused');
    await put('styles/unreferenced.ttf', 'unused-font');
    await put('scripts/site-shell.js', 'window.shell=true');
    await put('scripts/runtime-config.js', 'window.config=""');
    await put('index.html', '<link rel="stylesheet" href="styles/page.css"><script defer src="scripts/site-shell.js"></script><script src="scripts/runtime-config.js"></script><img src="images/logo.svg"><img src="https://example.invalid/screen.png" width="100" height="200" alt="screen" loading="lazy" decoding="async">');
    await run(root,put);
  } finally {await rm(root,{recursive:true,force:true});}
}

test('flattens the full CSS cascade and preserves hashed icon bytes and system tokens', async()=>fixture(async root=>{
  await optimizeSiteAssets(root,['index.html']);
  const html=await readFile(path.join(root,'index.html'),'utf8');
  const cssName=html.match(/href="\/(assets\/[^"]+\.css)"/)[1];
  const css=await readFile(path.join(root,cssName),'utf8');
  assert.ok(css.startsWith(':root{--npq-color-primary:#00BFA5}'));
  assert.ok(!css.includes('@import'));
  const icon=css.match(/url\("\/(assets\/[^"]+)"\)/)[1];
  assert.equal(await readFile(path.join(root,icon),'utf8'),'<svg>same-icon</svg>');
  assert.match(html,/<script defer src="\/assets\/site\.[a-f0-9]{64}\.js"/);
  assert.ok(html.includes('src="scripts/runtime-config.js"'));
}));

test('removes unreachable binaries and original CSS/JS but retains the displayed brand',async()=>fixture(async root=>{
  await optimizeSiteAssets(root,['index.html']);
  assert.deepEqual(await readdir(path.join(root,'styles')),[]);
  assert.deepEqual(await readdir(path.join(root,'images')),[]);
  const html=await readFile(path.join(root,'index.html'),'utf8');
  const logo=html.match(/<img src="\/(assets\/[^"]+)"/)[1];
  assert.equal(await readFile(path.join(root,logo),'utf8'),'<svg>same-logo</svg>');
  assert.deepEqual(await readdir(path.join(root,'scripts')),['runtime-config.js']);
}));

test('retains exact screenshot binding, dimensions, alt and no-JS fallback',async()=>fixture(async root=>{
  const result=await optimizeSiteAssets(root,['index.html']);
  const html=await readFile(path.join(root,'index.html'),'utf8');
  assert.equal(result.deferredImages,1);
  assert.match(html,/<img data-site-src="https:\/\/example.invalid\/screen.png" width="100" height="200" alt="screen" loading="lazy" decoding="async">/);
  assert.match(html,/<noscript><img src="https:\/\/example.invalid\/screen.png"/);
}));

test('shared token changes invalidate the content-addressed CSS URL',async()=>fixture(async(root,put)=>{
  await optimizeSiteAssets(root,['index.html']);
  const before=await readFile(path.join(root,'index.html'),'utf8');
  await put('styles/base.css',':root{--npq-color-primary:#00564B}');
  await put('styles/page.css','@import "./base.css";');
  await put('index.html','<link rel="stylesheet" href="styles/page.css">');
  await optimizeSiteAssets(root,['index.html']);
  assert.notEqual(before.match(/href="([^"]+)/)[1],(await readFile(path.join(root,'index.html'),'utf8')).match(/href="([^"]+)/)[1]);
}));

test('relative nested pages retain duplicate stylesheet cascade order',async()=>fixture(async(root,put)=>{
  await put('en/page.html','<link rel="stylesheet" href="../styles/base.css"><link rel="stylesheet" href="../styles/base.css">');
  await optimizeSiteAssets(root,['en/page.html']);
  const html=await readFile(path.join(root,'en/page.html'),'utf8');
  assert.equal((html.match(/rel="stylesheet"/g)||[]).length,1);
  const css=await readFile(path.join(root,html.match(/href="\/([^"]+)/)[1]),'utf8');
  assert.equal((css.match(/--npq-color-primary/g)||[]).length,2);
}));

for(const [name,source] of [['circular','@import "page.css";'],['external','@import "https://example.invalid/style.css";'],['traversal','@import "../../outside.css";']]) {
 test('rejects '+name+' CSS dependencies',async()=>fixture(async(root,put)=>{
   await put('styles/page.css',source);
   await assert.rejects(optimizeSiteAssets(root,['index.html']));
 }));
}

test('preserves inline overrides between stylesheet links in their exact cascade order',async()=>fixture(async(root,put)=>{
  await put('styles/late.css', '.menu{color:blue}');
  await put('index.html','<link rel="stylesheet" href="styles/base.css"><style id="override">.menu{color:red}</style><link rel="stylesheet" href="styles/late.css">');
  await optimizeSiteAssets(root,['index.html']);
  const html=await readFile(path.join(root,'index.html'),'utf8');
  const css=await readFile(path.join(root,html.match(/href="\/([^"]+)/)[1]),'utf8');
  assert.ok(css.indexOf('--npq-color-primary')<css.indexOf('color:red'));
  assert.ok(css.indexOf('color:red')<css.indexOf('color:blue'));
  assert.ok(!html.includes('<style'));
}));
