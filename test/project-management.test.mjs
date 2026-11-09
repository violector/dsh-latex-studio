import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { Studio } from '../src/core.mjs';
import { Request } from '../src/request.mjs';

const root = await mkdtemp(join(tmpdir(), 'latex-project-management-'));
const studio = new Studio({ root });
const call = request => studio.execute(Request.parse(request));

test('renaming persists the project name without changing source, history or PDF freshness', async () => {
  const project = await call({ action: 'create', templateId: 'article', title: 'Original name' });
  const source = await call({ action: 'read', projectId: project.id, path: 'main.tex' });
  const pdf = await readFile(new URL('./fixtures/vector.pdf', import.meta.url));
  await mkdir(join(project.directory, '.build'));
  const pdfPath = join(project.directory, '.build/main.pdf');
  await writeFile(pdfPath, pdf);
  await writeFile(join(project.directory, '.build/report.json'), JSON.stringify({ success: true, sourceUpdatedAt: project.updatedAt, compiledAt: new Date().toISOString(), pdf: pdfPath }));
  const renamed = await call({ action: 'rename_project', projectId: project.id, title: '  新名称 & Draft  ' });
  assert.equal(renamed.title, '新名称 & Draft');
  assert.equal(renamed.id, project.id);
  assert.equal(renamed.updatedAt, project.updatedAt);
  assert.deepEqual(await call({ action: 'read', projectId: project.id, path: 'main.tex' }), source);
  assert.deepEqual(await call({ action: 'history', projectId: project.id, path: 'main.tex' }), []);
  assert.equal((await call({ action: 'export', projectId: project.id, kind: 'pdf' })).base64, pdf.toString('base64'));
  const zip = unzipSync(Buffer.from((await call({ action: 'export', projectId: project.id, kind: 'zip' })).base64, 'base64'));
  assert.equal(JSON.parse(Buffer.from(zip['latex-studio-project.json']).toString()).title, renamed.title);
  const reopened = new Studio({ root });
  assert.equal((await reopened.execute({ action: 'project', projectId: project.id })).title, renamed.title);
});

test('deleting removes the selected project and clears active state only for that project', async () => {
  const inactive = await call({ action: 'create', templateId: 'article', title: 'Delete inactive' });
  const active = await call({ action: 'create', templateId: 'article', title: 'Keep active' });
  const source = await call({ action: 'read', projectId: active.id, path: 'main.tex' });
  await call({ action: 'write', projectId: inactive.id, path: 'main.tex', content: 'Archived source' });
  await call({ action: 'upload', projectId: inactive.id, path: 'figures/test.png', base64: Buffer.from([1,2,3]).toString('base64') });
  assert.equal(resolve(inactive.directory, '..'), resolve(root, 'projects'));
  assert.equal(resolve(active.directory, '..'), resolve(root, 'projects'));
  await call({ action: 'delete_project', projectId: inactive.id });
  await assert.rejects(access(inactive.directory), { code: 'ENOENT' });
  const status = await call({ action: 'status' });
  assert.equal(status.activeProject, active.id);
  assert.equal(status.projects.some(p => p.id === inactive.id), false);
  assert.deepEqual(await call({ action: 'read', projectId: active.id, path: 'main.tex' }), source);
  await call({ action: 'delete_project', projectId: active.id });
  const restarted = new Studio({ root });
  assert.equal((await restarted.execute({ action: 'status' })).activeProject, null);
  await assert.rejects(access(active.directory), { code: 'ENOENT' });
});

test('a project with a running compile job cannot be deleted until the job finishes', async () => {
  const project = await call({ action: 'create', templateId: 'article', title: 'Running compile' });
  let finish;
  const operation = new Promise(resolve => { finish = resolve; });
  const job = studio.startJob(`compile:${project.id}`, () => operation);
  await assert.rejects(call({ action: 'delete_project', projectId: project.id }), /正在编译/);
  await access(project.directory);
  finish({ success: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(studio.job(job.id).status, 'done');
  assert.equal(resolve(project.directory, '..'), resolve(root, 'projects'));
  await call({ action: 'delete_project', projectId: project.id });
  await assert.rejects(access(project.directory), { code: 'ENOENT' });
});

test('management requests reject empty names and invalid project paths at the boundary', () => {
  for (const title of ['', '   ', 'x'.repeat(201)]) assert.equal(Request.safeParse({ action: 'rename_project', projectId: 'test-project', title }).success, false);
  for (const projectId of ['', '.', '..', '../outside', 'C:/outside']) assert.equal(Request.safeParse({ action: 'delete_project', projectId }).success, false);
});
