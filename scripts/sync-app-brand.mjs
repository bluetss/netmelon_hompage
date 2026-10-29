// Company product assets consume the actual App brand, never the company logo.
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const app=path.resolve(root,'../naepopquiz_app/application');
const check=process.argv.includes('--check');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// Standalone CI/committed deployment input has no App sibling. Validate the
// pinned bundled receipt there; never fetch another checkout or invent a logo.
if(!await stat(app).then(()=>true).catch(()=>false)){
  const receipt=JSON.parse(await readFile(path.join(root,'data/app-brand.json'),'utf8'));
  for(const item of receipt.assets){
    if(!/^images\/[a-zA-Z0-9_./-]+$/.test(item.target)||item.target.includes('..'))throw Error('Invalid brand target');
    if(hash(await readFile(path.join(root,item.target)))!==item.sha256)throw Error('Bundled App brand drift');
  }
  console.log('Company App brand: bundled pinned hashes match (App sibling absent)');
  process.exit(0);
}
const logo=await readFile(path.join(app,'assets/images/topAppBar_icon.svg'));
const launcher=await readFile(path.join(app,'assets/images/ic_launcher.png'));
const svgPath=`images/shared-icons/npq-brand.${hash(logo).slice(0,16)}.svg`;
const assets=[{source:'assets/images/topAppBar_icon.svg',target:svgPath,bytes:logo},
  {source:'assets/images/ic_launcher.png',target:'images/app_icon.png',bytes:launcher}];
for(const {target,bytes} of assets){
  const destination=path.join(root,target);
  if(check){if(!(await readFile(destination)).equals(bytes))throw Error('App brand drift: '+target);}
  else{await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,bytes);}
}
const manifest=JSON.stringify({sourceRepository:'naepopquiz_app',
  usage:'App product brand only; Netmelon company brand is independent',
  headerLogo:svgPath,assets:assets.map(({source,target,bytes})=>({source,target,sha256:hash(bytes)}))},null,2)+'\n';
const target=path.join(root,'data/app-brand.json');
if(check){if(await readFile(target,'utf8')!==manifest)throw Error('App brand manifest drift');}
else await writeFile(target,manifest);
console.log('Company App brand: actual App SVG/launcher hashes match');
