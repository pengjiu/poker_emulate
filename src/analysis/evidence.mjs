import {realpath, lstat, open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {check, fail, RiverError} from '../errors.mjs';

const local = source => typeof source === 'string' && source.startsWith('evidence/');

async function fingerprint(directory, source) {
  // Evidence paths are portable project paths. Never interpret traversal or a URL.
  const parts = source.split('/');
  check(!source.includes('\\') && !source.includes('\0') && parts.every(part => part && part !== '.' && part !== '..'), 'EVIDENCE_PATH', 'Use a project-relative evidence/ file without traversal.', source);
  const linkMessage = 'Evidence paths must use real directories and regular files; symbolic links are not portable.';
  let handle;
  try {
    // Resolve the project root once, then inspect each component without following
    // links. Even an internal link can point outside after a portable copy.
    let target = await realpath(directory);
    for (const [index, part] of parts.entries()) {
      target = join(target, part);
      const entry = await lstat(target);
      check(!entry.isSymbolicLink(), 'EVIDENCE_PATH', linkMessage, source);
      check(index === parts.length - 1 ? entry.isFile() : entry.isDirectory(), 'EVIDENCE_MISSING', 'Evidence must resolve through directories to a readable regular file.', source);
    }
    handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    check((await handle.stat()).isFile(), 'EVIDENCE_MISSING', 'Evidence must be a readable regular file.', source);
    const digest = createHash('sha256');
    for await (const chunk of handle.createReadStream({autoClose: false})) digest.update(chunk);
    return digest.digest('hex');
  } catch (error) {
    if (error instanceof RiverError) throw error;
    if (error.code === 'ELOOP') fail('EVIDENCE_PATH', linkMessage, source);
    fail('EVIDENCE_MISSING', 'Cannot read the referenced local evidence file.', source, {cause: error.code ?? 'READ_ERROR'});
  } finally {
    await handle?.close();
  }
}

/** Bind bytes, not truth. Descriptive attribution and URLs are never fetched. */
export async function bindEvidence(directory, item) {
  const source = item?.evidence?.source;
  return local(source) ? fingerprint(directory, source) : null;
}

/** Recheck the exact file at media validation/export, including cached renders. */
export async function verifyEvidence(directory, evidence) {
  if (!local(evidence?.source)) return;
  check(typeof evidence.sha256 === 'string' && /^[a-f0-9]{64}$/.test(evidence.sha256), 'EVIDENCE_UNBOUND', 'Confirm analysis to bind the local evidence file before export.', evidence.source);
  const actual = await fingerprint(directory, evidence.source);
  check(actual === evidence.sha256, 'EVIDENCE_CHANGED', 'Local evidence changed after analysis confirmation; review it and confirm again.', evidence.source);
}
