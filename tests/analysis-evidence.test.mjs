import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {bindEvidence, verifyEvidence} from '../src/analysis/evidence.mjs';
import {confirmAnalysis, compileAnalysis} from '../src/analysis/index.mjs';
import {newProject, createProject} from '../src/project/store.mjs';

const words = text => ({'zh-CN': text});
function scene() {
  return {id: 'evidence-example', title: words('Evidence'), start: {street: 'river', board: ['Ac', 'Kd', '7h', '2s', '3c'], button: 'hero', hero: 'hero', actor: 'hero', seats: [{id: 'hero', stack: 10, contributed: 5, hole: ['Qc', 'Qd']}, {id: 'villain', stack: 10, contributed: 5}]}, beats: [{id: 'decision', label: words('Decision'), actions: []}]};
}
const item = source => ({id: 'model', title: words('A bounded model'), node: {beatId: 'decision'}, evidence: {kind: 'derivation', source, model: words('An explicitly limited river model.')}});
async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'river-evidence-'));
  t.after(() => rm(directory, {recursive: true, force: true})); return directory;
}

test('local evidence binds exact bytes, survives portable copying and rejects replacement', async t => {
  const directory = await temporary(t), source = scene();
  const store = await createProject(join(directory, 'project'), newProject({scenes: [source]}));
  const path = join(store.directory, 'evidence', 'model.json');
  await writeFile(path, '{"model":"original"}\n');
  const draft = item('evidence/model.json'), evidenceHash = await bindEvidence(store.directory, draft);
  assert.match(evidenceHash, /^[a-f0-9]{64}$/);
  const reviewed = confirmAnalysis(source, draft, {evidenceHash});
  source.analysis = [reviewed];
  await store.update(project => { project.lesson.scenes = [source]; return {project, value: null}; });
  const evidence = compileAnalysis(source, reviewed, 'zh-CN').evidence;
  assert.equal(evidence.sha256, evidenceHash); assert.equal(evidence.authorProvided, true);
  await verifyEvidence(store.directory, evidence);
  const exported = await store.copyTo(join(directory, 'portable'));
  await verifyEvidence(exported.directory, evidence);
  await writeFile(path, '{"model":"changed"}\n');
  await assert.rejects(verifyEvidence(store.directory, evidence), {code: 'EVIDENCE_CHANGED'});
  await verifyEvidence(exported.directory, evidence);
  await rm(path);
  await assert.rejects(verifyEvidence(store.directory, evidence), {code: 'EVIDENCE_MISSING'});
});

test('local sources need binding while external attribution never accesses the filesystem', async () => {
  const source = scene(), local = confirmAnalysis(source, item('evidence/model.json'));
  assert.ok(compileAnalysis(source, local, 'zh-CN').issues.some(issue => issue.code === 'EVIDENCE_UNBOUND'));
  await assert.rejects(verifyEvidence('/missing-project', {source: 'evidence/model.json'}), {code: 'EVIDENCE_UNBOUND'});
  for (const attribution of ['https://example.invalid/model', 'Original restricted-game derivation']) {
    assert.equal(await bindEvidence('/missing-project', item(attribution)), null);
    await verifyEvidence('/missing-project', {source: attribution});
    assert.equal(compileAnalysis(source, confirmAnalysis(source, item(attribution)), 'zh-CN').issues.length, 0);
  }
});

test('local evidence rejects symbolic links at every path component', async t => {
  const directory = await temporary(t), contents = '{"model":"original"}\n';
  await mkdir(join(directory, 'evidence', 'models'), {recursive: true});
  await writeFile(join(directory, 'evidence', 'models', 'model.json'), contents);
  const sha256 = await bindEvidence(directory, item('evidence/models/model.json'));
  await symlink('models/model.json', join(directory, 'evidence', 'current.json'));
  await symlink('models', join(directory, 'evidence', 'current'));
  const aliasedRoot = join(directory, 'aliased-evidence');
  await mkdir(join(aliasedRoot, 'files'), {recursive: true});
  await writeFile(join(aliasedRoot, 'files', 'model.json'), contents);
  await symlink('files', join(aliasedRoot, 'evidence'));
  for (const [name, root, source] of [
    ['file', directory, 'evidence/current.json'],
    ['internal directory', directory, 'evidence/current/model.json'],
    ['evidence directory', aliasedRoot, 'evidence/model.json']
  ]) await t.test(name, async () => {
    await assert.rejects(bindEvidence(root, item(source)), {code: 'EVIDENCE_PATH'});
    await assert.rejects(verifyEvidence(root, {source, sha256}), {code: 'EVIDENCE_PATH'});
  });
});

test('media validation rejects a confirmed file replaced by a same-byte symbolic link', async t => {
  const directory = await temporary(t), source = 'evidence/model.json', contents = 'unchanged evidence';
  await mkdir(join(directory, 'evidence'));
  await writeFile(join(directory, source), contents);
  const sha256 = await bindEvidence(directory, item(source));
  await writeFile(join(directory, 'evidence', 'replacement.json'), contents);
  await rm(join(directory, source));
  await symlink('replacement.json', join(directory, source));
  await assert.rejects(verifyEvidence(directory, {source, sha256}), {code: 'EVIDENCE_PATH'});
});

test('the project root itself may resolve through a symbolic link', async t => {
  const directory = await temporary(t), root = join(directory, 'project'), alias = join(directory, 'alias'), source = 'evidence/model.json';
  await mkdir(join(root, 'evidence'), {recursive: true});
  await writeFile(join(root, source), 'portable evidence');
  await symlink('project', alias);
  const sha256 = await bindEvidence(root, item(source));
  assert.equal(await bindEvidence(alias, item(source)), sha256);
  await verifyEvidence(alias, {source, sha256});
});

test('missing, unreadable regular-file sources and traversal fail with structured evidence errors', async t => {
  const directory = await temporary(t); await mkdir(join(directory, 'evidence'));
  await assert.rejects(bindEvidence(directory, item('evidence/missing.json')), {code: 'EVIDENCE_MISSING'});
  await mkdir(join(directory, 'evidence', 'not-a-file'));
  await assert.rejects(bindEvidence(directory, item('evidence/not-a-file')), {code: 'EVIDENCE_MISSING'});
  for (const path of ['evidence/../outside.json', 'evidence/../../outside.json', 'evidence/sub/../model.json', 'evidence/..\\outside.json']) {
    await assert.rejects(bindEvidence(directory, item(path)), {code: 'EVIDENCE_PATH'});
    await assert.rejects(verifyEvidence(directory, {source: path, sha256: '0'.repeat(64)}), {code: 'EVIDENCE_PATH'});
  }
  const outside = join(directory, 'outside-project.json'); await writeFile(outside, 'external');
  const project = join(directory, 'project'); await mkdir(join(project, 'evidence'), {recursive: true});
  await symlink(outside, join(project, 'evidence', 'escape.json'));
  await assert.rejects(bindEvidence(project, item('evidence/escape.json')), {code: 'EVIDENCE_PATH'});
  await assert.rejects(verifyEvidence(project, {source: 'evidence/escape.json', sha256: '0'.repeat(64)}), {code: 'EVIDENCE_PATH'});
});

test('permission-denied evidence remains a structured missing-evidence error', async t => {
  const directory = await temporary(t); await mkdir(join(directory, 'evidence'));
  await writeFile(join(directory, 'evidence', 'model.json'), 'private evidence');
  const module = new URL('../src/analysis/evidence.mjs', import.meta.url).href;
  const repository = fileURLToPath(new URL('../', import.meta.url));
  // Node's filesystem permission boundary also works when the test runner is root.
  const script = `import {bindEvidence} from ${JSON.stringify(module)}; try { await bindEvidence(${JSON.stringify(directory)}, {evidence:{source:'evidence/model.json'}}); process.exitCode=1; } catch(error) { process.stdout.write(JSON.stringify({code:error.code,cause:error.detail?.cause})); }`;
  const {stdout} = await promisify(execFile)(process.execPath, ['--permission', `--allow-fs-read=${repository}`, '--input-type=module', '-e', script]);
  assert.deepEqual(JSON.parse(stdout), {code: 'EVIDENCE_MISSING', cause: 'ERR_ACCESS_DENIED'});
});
