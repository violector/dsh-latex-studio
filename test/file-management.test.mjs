import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, readdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Studio } from '../src/core.mjs';
import { Request } from '../src/request.mjs';

const root = await mkdtemp(join(tmpdir(), 'latex-file-management-'));
const studio = new Studio({ root });
const call = request => studio.execute(Request.parse(request));

test('main file rename and a case-only rename preserve contents and move history and the compile entry', async () => {
  const p = await call({ action: 'create', templateId: 'article', title: 'Rename main' });
  const before = await call({ action: 'read', projectId: p.id, path: p.main });
  await call({ action: 'write', projectId: p.id, path: p.main, content: before.content + '\n% Revised\n' });
  const current = await call({ action: 'project', projectId: p.id });
  await mkdir(join(p.directory, '.build'));
  await writeFile(join(p.directory, '.build/report.json'), JSON.stringify({ success: true, sourceUpdatedAt: current.updatedAt, pdf: 'unused.pdf' }));
  const result = await call({ action: 'rename_file', projectId: p.id, path: p.main, name: 'paper.tex' });
  assert.equal(result.project.main, 'paper.tex');
  assert.equal(result.path, 'paper.tex');
  await assert.rejects(access(join(p.directory, 'main.tex')), { code: 'ENOENT' });
  assert.equal((await call({ action: 'read', projectId: p.id, path: 'paper.tex' })).content, before.content + '\n% Revised\n');
  await assert.rejects(call({ action: 'export', projectId: p.id, kind: 'pdf' }), /重新编译/);
  await call({ action: 'rename_file', projectId: p.id, path: 'paper.tex', name: 'Paper.tex' });
  assert.ok((await readdir(p.directory)).includes('Paper.tex'));
  assert.equal((await call({ action: 'project', projectId: p.id })).main, 'Paper.tex');
  const revisions = await call({ action: 'history', projectId: p.id, path: 'Paper.tex' });
  assert.equal(revisions.length, 1);
  await call({ action: 'restore', projectId: p.id, path: 'Paper.tex', revision: revisions[0].id });
  assert.equal((await call({ action: 'read', projectId: p.id, path: 'Paper.tex' })).content, before.content);
});

test('folder rename moves nested files and histories, preserving sibling prefixes and updating a nested main', async () => {
  const p = await call({ action: 'create', templateId: 'article', title: 'Rename folder' });
  const source = (await call({ action: 'read', projectId: p.id, path: p.main })).content;
  await call({ action: 'write', projectId: p.id, path: 'chapters/sub/paper.tex', content: source });
  await call({ action: 'write', projectId: p.id, path: 'chapters/sub/paper.tex', content: source + '\n% Next version' });
  await call({ action: 'write', projectId: p.id, path: 'chapters-old/keep.tex', content: 'Unrelated sibling' });
  await call({ action: 'mkdir', projectId: p.id, path: 'chapters/empty' });
  const pdf = await readFile(new URL('./fixtures/vector.pdf', import.meta.url));
  await call({ action: 'upload', projectId: p.id, path: 'chapters/sub/vector.pdf', base64: pdf.toString('base64') });
  await call({ action: 'configure', projectId: p.id, main: 'chapters/sub/paper.tex', engine: p.engine });
  const result = await call({ action: 'rename_file', projectId: p.id, path: 'chapters', name: 'sections' });
  assert.equal(result.project.main, 'sections/sub/paper.tex');
  assert.ok(result.project.directories.includes('sections/empty'));
  assert.equal((await call({ action: 'read', projectId: p.id, path: 'sections/sub/vector.pdf' })).base64, pdf.toString('base64'));
  assert.equal((await call({ action: 'read', projectId: p.id, path: 'chapters-old/keep.tex' })).content, 'Unrelated sibling');
  const revisions = await call({ action: 'history', projectId: p.id, path: 'sections/sub/paper.tex' });
  assert.equal(revisions.length, 1);
  assert.equal((await call({ action: 'history', projectId: p.id, path: 'chapters/sub/paper.tex' })).length, 0);
  assert.equal((await call({ action: 'read', projectId: p.id, path: 'sections/sub/paper.tex' })).content, source + '\n% Next version');
});

test('rename collisions and a non-tex main name fail without changing either file', async () => {
  const p = await call({ action: 'create', templateId: 'article', title: 'Collision' });
  const before = await call({ action: 'read', projectId: p.id, path: p.main });
  await call({ action: 'write', projectId: p.id, path: 'taken.tex', content: 'Keep this file' });
  await assert.rejects(call({ action: 'rename_file', projectId: p.id, path: p.main, name: 'TAKEN.tex' }), /已存在/);
  await assert.rejects(call({ action: 'rename_file', projectId: p.id, path: p.main, name: 'paper.txt' }), /\.tex/);
  assert.deepEqual(await call({ action: 'read', projectId: p.id, path: p.main }), before);
  assert.equal((await call({ action: 'read', projectId: p.id, path: 'taken.tex' })).content, 'Keep this file');
});

test('file and recursive folder deletion remove only the requested entries and retain the main file', async () => {
  const p = await call({ action: 'create', templateId: 'article', title: 'Delete entries' });
  const main = await call({ action: 'read', projectId: p.id, path: p.main });
  await call({ action: 'mkdir', projectId: p.id, path: 'figures/empty' });
  await call({ action: 'write', projectId: p.id, path: 'figures/nested/notes.tex', content: 'Delete this' });
  await call({ action: 'write', projectId: p.id, path: 'figures-other/keep.tex', content: 'Keep this' });
  for (const [name, fixture] of [['plot.png', 'layout-example.png'], ['photo.jpg', 'photo.jpg'], ['vector.pdf', 'vector.pdf']]) {
    await call({ action: 'upload', projectId: p.id, path: `figures/${name}`, base64: (await readFile(new URL(`./fixtures/${fixture}`, import.meta.url))).toString('base64') });
  }
  assert.ok(resolve(p.directory, 'figures').startsWith(resolve(p.directory) + sep));
  await call({ action: 'delete_file', projectId: p.id, path: 'figures/photo.jpg' });
  await assert.rejects(access(join(p.directory, 'figures/photo.jpg')), { code: 'ENOENT' });
  await access(join(p.directory, 'figures/plot.png'));
  const after = await call({ action: 'delete_file', projectId: p.id, path: 'figures' });
  assert.ok(!after.files.some(f => f.path.startsWith('figures/')));
  await assert.rejects(access(join(p.directory, 'figures')), { code: 'ENOENT' });
  assert.equal((await call({ action: 'read', projectId: p.id, path: 'figures-other/keep.tex' })).content, 'Keep this');
  assert.deepEqual(await call({ action: 'read', projectId: p.id, path: p.main }), main);
  assert.equal((await call({ action: 'status' })).activeProject, p.id);
});

test('deleting a main file or its folder requires selecting another compile entry first', async () => {
  const p = await call({ action: 'create', templateId: 'article', title: 'Main protection' });
  const source = (await call({ action: 'read', projectId: p.id, path: p.main })).content;
  await call({ action: 'write', projectId: p.id, path: 'manuscript/main.tex', content: source });
  await call({ action: 'configure', projectId: p.id, main: 'manuscript/main.tex', engine: p.engine });
  for (const path of ['manuscript/main.tex', 'manuscript']) await assert.rejects(call({ action: 'delete_file', projectId: p.id, path }), /编译主文件/);
  await access(join(p.directory, 'manuscript/main.tex'));
  await call({ action: 'configure', projectId: p.id, main: 'main.tex', engine: p.engine });
  assert.ok(resolve(p.directory, 'manuscript').startsWith(resolve(p.directory) + sep));
  await call({ action: 'delete_file', projectId: p.id, path: 'manuscript' });
  assert.equal((await call({ action: 'project', projectId: p.id })).main, 'main.tex');
});

test('file management waits for an active compiler job', async () => {
  const p = await call({ action: 'create', templateId: 'article', title: 'Compile in progress' });
  await call({ action: 'write', projectId: p.id, path: 'notes.tex', content: 'Notes' });
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  studio.startJob(`compile:${p.id}`, () => pending);
  await assert.rejects(call({ action: 'rename_file', projectId: p.id, path: 'notes.tex', name: 'revised.tex' }), /正在编译/);
  await assert.rejects(call({ action: 'delete_file', projectId: p.id, path: 'notes.tex' }), /正在编译/);
  finish({ success: true });
  await new Promise(resolve => setImmediate(resolve));
  await call({ action: 'rename_file', projectId: p.id, path: 'notes.tex', name: 'revised.tex' });
  assert.equal((await call({ action: 'read', projectId: p.id, path: 'revised.tex' })).content, 'Notes');
});

test('file management validates names and destructive paths once at the request boundary', () => {
  for (const path of ['', '/', '.', '..', 'dir/..', 'dir/', 'dir//file', 'dir/ ', '.history', 'C:/outside']) assert.equal(Request.safeParse({ action: 'delete_file', projectId: 'test-project', path }).success, false);
  for (const name of ['', '  ', '../moved.tex', 'dir/file.tex', '.project.json', 'trailing.', 'a:b', 'a\\b']) assert.equal(Request.safeParse({ action: 'rename_file', projectId: 'test-project', path: 'main.tex', name }).success, false);
  assert.equal(Request.parse({ action: 'rename_file', projectId: 'test-project', path: 'dir/my file.tex', name: '  中文名称.tex  ' }).name, '中文名称.tex');
});
