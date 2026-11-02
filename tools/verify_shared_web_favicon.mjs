// Exact public favicon comparison; no App boot, authentication or API writes.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const app=path.resolve(root,'../naepopquiz_app/application');
const receipt=JSON.parse(await readFile(path.join(root,'data/app-brand.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=await readFile(path.join(app,'assets/images/topAppBar_icon.svg'));
const bundled=await readFile(path.join(root,receipt.webFavicon.svg));
assert.ok(canonical.equals(bundled));
assert.equal(sha(canonical),receipt.webFavicon.sha256);
assert.ok((await readFile(path.join(app,'web/favicon.svg'))).equals(canonical));
const ico=await readFile(path.join(root,'favicon.ico'));
assert.ok(ico.equals(await readFile(path.join(app,'web/favicon.ico'))));
assert.equal(sha(ico),receipt.webFavicon.icoSha256);
assert.equal(ico.readUInt16LE(2),1);
const sizes=[16,32,48,64,128,256],frames=new Map();
assert.equal(ico.readUInt16LE(4),sizes.length);
for(let i=0;i<sizes.length;i++){
 const offset=6+i*16,size=ico[offset]||256;
 assert.equal(size,sizes[i]);assert.equal(ico[offset+1]||256,size);
 const start=ico.readUInt32LE(offset+12),length=ico.readUInt32LE(offset+8);
 assert.ok(start>=6+16*sizes.length && start+length<=ico.length);
 const png=ico.subarray(start,start+length);
 assert.equal(png.subarray(1,4).toString(),'PNG');
 frames.set(size,png);
}
assert.ok(frames.get(16).equals(await readFile(path.join(app,'web/favicon.png'))));
const {chromium}=createRequire(process.env.NPQ_REA_ROOT+'/package.json')('playwright-core');
const browser=await chromium.launch({headless:true,executablePath:process.env.REA_FIXTURE_BROWSER});
const live=process.argv.includes('--live');
const output='/tmp/npq-shared-web-favicon-'+(live?'staging':'local');
await mkdir(output,{recursive:true});
try {
 const context=await browser.newContext(),page=await context.newPage();
 await page.route('**/*',r=>r.abort());
 let sources=[{site:'Company',bytes:bundled},{site:'App landing',bytes:canonical}];
 if(live){
  sources=[];
  for(const [site,origin] of [['Company','https://company-dev.netmelonai.com'],['App landing','https://app-dev.naepopquiz.com']]){
   const response=await context.request.get(origin+'/',{timeout:30000});
   assert.equal(response.status(),200);
   const html=await response.text();
   const href=await page.evaluate(html=>{
    const doc=new DOMParser().parseFromString(html,'text/html');
    return [...doc.querySelectorAll('link[rel="icon"]')].findLast(x=>x.type==='image/svg+xml')?.getAttribute('href');
   },html);
   assert.ok(href,site+' needs explicit SVG favicon');
   const url=new URL(href,origin);assert.equal(url.origin,origin);
   const image=await context.request.get(url.href);assert.equal(image.status(),200);
   const bytes=await image.body();assert.equal(sha(bytes),sha(canonical),site+' favicon source drift');
   sources.push({site,url:url.href,bytes});
  }
  const response=await context.request.get('https://company-dev.netmelonai.com/favicon.ico?v='+receipt.webFavicon.icoSha256.slice(0,16));
  assert.equal(response.status(),200);assert.ok((await response.body()).equals(ico));
 }
 async function raster(bytes,size,kind='svg+xml'){
  return page.evaluate(async ({base64,size,kind})=>{
   const img=new Image();img.src='data:image/'+kind+';base64,'+base64;await img.decode();
   const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
   const ctx=canvas.getContext('2d'),scale=Math.min(size/img.width,size/img.height);
   ctx.drawImage(img,(size-img.width*scale)/2,(size-img.height*scale)/2,img.width*scale,img.height*scale);
   const data=ctx.getImageData(0,0,size,size).data;
   let left=size,top=size,right=-1,bottom=-1;
   for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(data[(y*size+x)*4+3]>0){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
   return {pixels:Array.from(data),bounds:{left,top,right,bottom},cornerAlpha:[data[3],data[(size-1)*4+3],data[(size*(size-1))*4+3],data[(size*size-1)*4+3]],png:canvas.toDataURL()};
  },{base64:bytes.toString('base64'),size,kind});
 }
 const rows=[],previews=[];
 for(const size of [16,32]){
  const first=await raster(sources[0].bytes,size),second=await raster(sources[1].bytes,size),fallback=await raster(frames.get(size),size,'png');
  assert.deepEqual(first.pixels,second.pixels);assert.deepEqual(first.pixels,fallback.pixels);
  assert.deepEqual(first.cornerAlpha,[0,0,0,0]);
  rows.push({size,bounds:first.bounds,cornerAlpha:first.cornerAlpha,identicalPixels:true});
  previews.push({size,png:first.png});
 }
 const cards=sources.map(s=>'<section><h2>'+s.site+'</h2>'+previews.map(p=>'<p>'+p.size+'px <img width="'+p.size+'" height="'+p.size+'" src="'+p.png+'"></p><img class="zoom" src="'+p.png+'">').join('')+'</section>').join('');
 await page.setViewportSize({width:800,height:460});
 await page.setContent('<style>body{font:16px system-ui;margin:24px;background:#eef3fa;color:#111722}main{display:flex;gap:24px}section{background:white;padding:16px;width:320px;border-radius:16px}p{display:inline-flex;align-items:center;gap:16px;width:120px}.zoom{width:96px;height:96px;image-rendering:pixelated;vertical-align:middle}h2{font-size:20px}</style><h1>Same SVG, same favicon area</h1><main>'+cards+'</main><p>Transparent exterior; centered aspect fit.</p>');
 await page.screenshot({path:output+'/comparison.png'});
 const report={live,sourceSha256:sha(canonical),icoSha256:sha(ico),icoSizes:sizes,sources:sources.map(({site,url,bytes})=>({site,url,sha256:sha(bytes)})),rows,screenshot:output+'/comparison.png'};
 await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}finally{await browser.close();}
