import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {check} from './errors.mjs';
const directory=fileURLToPath(new URL('../locales/',import.meta.url));
export async function localePacks(dir=directory){
  const names=(await readdir(dir)).filter(x=>x.endsWith('.json')).sort(),packs={};
  for(const name of names){const pack=JSON.parse(await readFile(dir+'/'+name,'utf8'));check(pack.locale&&pack.strings&&pack.errors,'LOCALE_PACK','Invalid locale pack.',name);packs[pack.locale]=pack;}
  const required=Object.keys(packs['en-US']?.strings??{});check(required.length>0,'LOCALE_PACK','English base dictionary is required.',dir);
  for(const pack of Object.values(packs))for(const key of required)check(typeof pack.strings[key]==='string'&&pack.strings[key].trim(),'LOCALE_PACK',`Missing translation ${key}.`,`${pack.locale}/${key}`);
  return packs;
}
