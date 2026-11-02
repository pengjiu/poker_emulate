import {createHash,randomUUID} from 'node:crypto';
export const clone = value => structuredClone(value);
export function canonical(value) {
  if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if(value && typeof value==='object') return '{'+Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export const hash = value => createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:canonical(value)).digest('hex');
export const id = () => randomUUID();
