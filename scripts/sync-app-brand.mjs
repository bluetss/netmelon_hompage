// Product assets and the shared web favicon consume App sources; company wordmark stays independent.
import {readFile,writeFile,mkdir,stat,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const app=path.resolve(root,'../naepopquiz_app/application');
const check=process.argv.includes('--check');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// Every public page uses the same SVG and ICO derivative; no per-page padding.
async function syncFaviconLinks(favicon){
  if(!favicon?.svg || !favicon?.icoSha256)throw Error('Shared web favicon receipt missing');
  const links='  <link rel="icon" type="image/x-icon" sizes="16x16 32x32 48x48 64x64 128x128 256x256" href="/favicon.ico?v='+favicon.icoSha256.slice(0,16)+'">\n'+
    '  <link rel="icon" type="image/svg+xml" sizes="any" href="/'+favicon.svg+'">\n';
  async function directory(folder,descend){
    for(const item of await readdir(folder,{withFileTypes:true})){
      const file=path.join(folder,item.name);
      if(item.isDirectory() && descend)await directory(file,true);
      if(!item.isFile()||!item.name.endsWith('.html'))continue;
      const before=await readFile(file,'utf8');let first=true;
      const after=before.replace(/^[ \t]*<link\b(?=[^>]*\brel=["'](?:shortcut\s+)?icon["'])[^>]*>[ \t]*\r?\n?/gmi,()=>{
        if(!first)return '';first=false;return links;
      });
      if(check){if(after!==before)throw Error('Shared favicon link drift: '+path.relative(root,file));}
      else if(after!==before)await writeFile(file,after);
    }
  }
  await directory(root,false);
  for(const folder of ['en','announcements','problems'])await directory(path.join(root,folder),true);
}
// Standalone CI/committed deployment input has no App sibling. Validate the
// pinned bundled receipt there; never fetch another checkout or invent a logo.
if(!await stat(app).then(()=>true).catch(()=>false)){
  const receipt=JSON.parse(await readFile(path.join(root,'data/app-brand.json'),'utf8'));
  for(const item of receipt.assets){
    if(!(item.target==='favicon.ico'||/^images\/[a-zA-Z0-9_./-]+$/.test(item.target))||item.target.includes('..'))throw Error('Invalid brand target');
    if(hash(await readFile(path.join(root,item.target)))!==item.sha256)throw Error('Bundled App brand drift');
  }
  await syncFaviconLinks(receipt.webFavicon);
  console.log('Company App brand: bundled pinned hashes match (App sibling absent)');
  process.exit(0);
}
const logo=await readFile(path.join(app,'tool/app_icon/brand_mark.svg'));
const launcher=await readFile(path.join(app,'assets/images/ic_launcher.png'));
const svgPath=`images/shared-icons/npq-brand.${hash(logo).slice(0,16)}.svg`;
const favicon=await readFile(path.join(app,'assets/images/topAppBar_icon.svg'));
if(!(await readFile(path.join(app,'web/favicon.svg'))).equals(favicon))throw Error('App web favicon differs from shared SVG');
const faviconIco=await readFile(path.join(app,'web/favicon.ico'));
const faviconPath='images/shared-icons/app-favicon.'+hash(favicon).slice(0,16)+'.svg';
const assets=[{source:'tool/app_icon/brand_mark.svg',target:svgPath,bytes:logo},
  {source:'assets/images/ic_launcher.png',target:'images/app_icon.png',bytes:launcher},
  {source:'assets/images/topAppBar_icon.svg',target:faviconPath,bytes:favicon},
  {source:'web/favicon.ico',target:'favicon.ico',bytes:faviconIco}];
for(const {target,bytes} of assets){
  const destination=path.join(root,target);
  if(check){if(!(await readFile(destination)).equals(bytes))throw Error('App brand drift: '+target);}
  else{await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,bytes);}
}
const manifest=JSON.stringify({sourceRepository:'naepopquiz_app',
  usage:'App product brand and shared web favicon; Netmelon wordmark is independent',
  webFavicon:{svg:faviconPath,ico:'favicon.ico',sha256:hash(favicon),icoSha256:hash(faviconIco),fit:'contain center'},
  headerLogo:svgPath,assets:assets.map(({source,target,bytes})=>({source,target,sha256:hash(bytes)}))},null,2)+'\n';
const target=path.join(root,'data/app-brand.json');
if(check){if(await readFile(target,'utf8')!==manifest)throw Error('App brand manifest drift');}
else await writeFile(target,manifest);
await syncFaviconLinks(JSON.parse(manifest).webFavicon);
console.log('Company App brand: actual App SVG/launcher and shared web favicon hashes match');
