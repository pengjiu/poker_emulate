import {stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ProjectStore} from '../src/project/store.mjs';
import {migrateLegacy} from '../src/project/migrate.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export async function setupDemo(destination=resolve(root,'projects/demo')){
  const directory=resolve(destination);
  let exists=false;
  try{await stat(directory);exists=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  if(exists){const project=await new ProjectStore(directory).read();return {created:false,directory,projectId:project.projectId};}
  const store=await migrateLegacy(resolve(root,'examples/legacy/lesson.json'),directory);
  return {created:true,directory,projectId:(await store.read()).projectId};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{console.log(JSON.stringify(await setupDemo()));}
  catch(error){console.error(JSON.stringify({ok:false,code:error.code,message:error.message}));process.exitCode=1;}
}
