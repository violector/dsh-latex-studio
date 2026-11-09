import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Studio } from '../src/core.mjs';

const studio = new Studio();
const before = await studio.execute({ action: 'status' });
const originalFiles = await Promise.all(before.projects.map(async p => ({ id: p.id, title: p.title, main: p.main, hash: (await studio.execute({ action: 'read', projectId: p.id, path: p.main })).hash })));
const first = await studio.execute({ action: 'create', templateId: 'article', title: 'Project Management Validation' });
const second = await studio.execute({ action: 'create', templateId: 'article', title: 'Inactive Deletion Validation' });
for (const p of [first, second]) assert.equal(resolve(p.directory, '..'), resolve(studio.root, 'projects'));
const source = String.raw`\documentclass{article}
\title{Project Management Validation}
\author{LaTeX Studio Test}
\begin{document}
\maketitle
\section{Introduction}
Renaming this project should preserve the manuscript and PDF.
\end{document}
`;
await studio.execute({ action: 'write', projectId: first.id, path: 'main.tex', content: source });
await studio.execute({ action: 'upload', projectId: first.id, path: 'figures/test.png', base64: (await readFile('test/fixtures/layout-example.png')).toString('base64') });
if (before.activeProject) await studio.execute({ action: 'activate', projectId: before.activeProject });
await writeFile('test-output/project-management-projects.json', JSON.stringify({ first, second, previous: before.activeProject }, null, 2));

const browser = await chromium.connectOverCDP('http://127.0.0.1:9225');
const page = browser.contexts()[0].pages().find(p => p.url().startsWith('dsh-app:'));
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const layout = await page.evaluate(() => localStorage.getItem('latex-studio-layout:v1'));
await page.reload();
if (!(await page.locator('.ls-shell').count())) await page.getByRole('button', { name: 'LaTeX Studio', exact: true }).click();
const firstRow = page.locator(`.ls-project-row[data-project-id="${first.id}"]`);
await firstRow.locator('summary').click();
await page.locator('.ls-projects').screenshot({ path: 'test-output/project-actions-menu.png' });
await firstRow.getByRole('button', { name: '重命名', exact: true }).click();
await page.getByLabel('文稿名称', { exact: true }).fill('   ');
assert.equal(await page.getByRole('button', { name: '保存名称', exact: true }).isDisabled(), true);
const libraryTitle = '文稿管理验收 <草稿> & 中文';
await page.getByLabel('文稿名称', { exact: true }).fill(libraryTitle);
await page.getByRole('button', { name: '保存名称', exact: true }).click();
await page.waitForFunction(({id,title}) => document.querySelector(`.ls-project-row[data-project-id="${id}"] strong`)?.textContent === title, { id: first.id, title: libraryTitle });
assert.equal(await page.locator(`option[value="${first.id}"]`).textContent(), libraryTitle);
assert.equal(await readFile(join(first.directory, 'main.tex'), 'utf8'), source);
await firstRow.locator('.ls-project-item').click();
await page.waitForFunction(title => document.querySelector('.ls-project-title strong')?.textContent === title, libraryTitle);
await page.waitForFunction(id => localStorage.getItem(`latex-studio-session:${id}`), first.id);
await page.locator('.ls-chat [contenteditable=true]').waitFor();
const session = await page.evaluate(id => localStorage.getItem(`latex-studio-session:${id}`), first.id);
assert.ok(session);
await page.getByRole('button', { name: '编译 PDF', exact: true }).click();
let report;
for (let i = 0; i < 60; i++) {
  try { report = JSON.parse(await readFile(join(first.directory, '.build/report.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (report) break;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
assert.ok(report?.success);
await page.locator('.ls-preview-column canvas').first().waitFor();
await page.locator('.ls-project-bar summary').click();
await page.locator('.ls-project-bar').getByRole('button', { name: '重命名', exact: true }).click();
const editorTitle = '文稿管理验收 · 已改名';
await page.getByLabel('文稿名称', { exact: true }).fill(editorTitle);
await page.getByRole('button', { name: '保存名称', exact: true }).click();
await page.waitForFunction(title => document.querySelector('.ls-chat-header small')?.textContent === title, editorTitle);
assert.equal(await page.locator('.ls-project-title strong').textContent(), editorTitle);
assert.equal(await page.evaluate(id => localStorage.getItem(`latex-studio-session:${id}`), first.id), session);
assert.equal(await page.getByRole('button', { name: '下载 PDF', exact: true }).isEnabled(), true);
assert.equal((await studio.execute({ action: 'export', projectId: first.id, kind: 'pdf' })).base64, (await readFile(report.pdf)).toString('base64'));
assert.equal((await studio.execute({ action: 'project', projectId: first.id })).report.compiledAt, report.compiledAt);
assert.equal(await readFile(join(first.directory, 'main.tex'), 'utf8'), source);

await page.locator('.ls-project-bar summary').click();
await page.locator('.ls-project-bar').getByRole('button', { name: '删除文稿', exact: true }).click();
await page.locator('.ls-dialog').screenshot({ path: 'test-output/delete-project-confirmation.png' });
assert.ok((await page.locator('.ls-dialog').innerText()).includes(editorTitle));
await page.getByRole('button', { name: '取消', exact: true }).click();
assert.equal((await studio.execute({ action: 'project', projectId: first.id })).title, editorTitle);
await page.reload();
if (!(await page.locator('.ls-shell').count())) await page.getByRole('button', { name: 'LaTeX Studio', exact: true }).click();
await firstRow.locator('strong').waitFor();
assert.equal(await firstRow.locator('strong').textContent(), editorTitle);
await page.locator('.ls-chat [contenteditable=true]').waitFor();
const secondRow = page.locator(`.ls-project-row[data-project-id="${second.id}"]`);
await secondRow.locator('summary').click();
await secondRow.getByRole('button', { name: '删除文稿', exact: true }).click();
await page.getByRole('button', { name: '确认删除', exact: true }).click();
await secondRow.waitFor({ state: 'detached' });
await assert.rejects(access(second.directory), { code: 'ENOENT' });
assert.equal((await studio.execute({ action: 'status' })).activeProject, first.id);
assert.equal(await page.locator('.ls-chat-header small').textContent(), editorTitle);
assert.equal(await page.evaluate(id => localStorage.getItem(`latex-studio-session:${id}`), first.id), session);

await firstRow.locator('.ls-project-item').click();
await page.waitForFunction(title => document.querySelector('.ls-project-title strong')?.textContent === title, editorTitle);
await page.locator('.ls-chat [contenteditable=true]').waitFor();
await page.locator('.cm-content').click();
await page.keyboard.press('Control+End');
await page.keyboard.insertText('\n% Unsaved deletion validation');
await page.waitForFunction(id => localStorage.getItem(`latex-studio-draft:${id}:main.tex`)?.includes('Unsaved deletion validation'), first.id);
await page.locator('.ls-project-bar summary').click();
await page.locator('.ls-project-bar').getByRole('button', { name: '删除文稿', exact: true }).click();
await page.getByRole('button', { name: '确认删除', exact: true }).click();
await page.locator('.ls-library').waitFor();
await page.locator('.ls-chat-empty').waitFor();
await assert.rejects(access(first.directory), { code: 'ENOENT' });
assert.equal(await page.locator('.cm-editor').count(), 0);
assert.equal(await page.evaluate(id => Object.keys(localStorage).some(key => key === `latex-studio-session:${id}` || key.startsWith(`latex-studio-draft:${id}:`)), first.id), false);
assert.equal((await studio.execute({ action: 'status' })).activeProject, null);
console.log('Library/editor rename, PDF preservation, cancel, inactive/current deletion and draft cleanup passed.');

const after = await studio.execute({ action: 'status' });
assert.deepEqual(after.projects.map(p => p.id).sort(), before.projects.map(p => p.id).sort());
for (const p of originalFiles) {
  assert.equal(after.projects.find(item => item.id === p.id).title, p.title);
  assert.equal((await studio.execute({ action: 'read', projectId: p.id, path: p.main })).hash, p.hash);
}
if (before.activeProject) await studio.execute({ action: 'activate', projectId: before.activeProject });
await page.reload();
if (!(await page.locator('.ls-shell').count())) await page.getByRole('button', { name: 'LaTeX Studio', exact: true }).click();
await page.locator('.ls-library').waitFor();
assert.equal(await page.locator('.ls-project-row').count(), before.projects.length);
assert.equal(await page.evaluate(() => localStorage.getItem('latex-studio-layout:v1')), layout);
assert.deepEqual(errors, []);
await writeFile('test-output/project-management-results.json', JSON.stringify({ testedAt: new Date().toISOString(), version: '0.3.6', libraryRename: true, editorRename: true, sameChatSession: true, sourceAndPdfPreserved: true, persistedAfterReload: true, deleteCancelled: true, inactiveDelete: true, activeDelete: true, deletedProjects: [first.id, second.id], draftsCleared: true, originalProjectsPreserved: before.projects.length, preferencesPreserved: true, compiledAt: report.compiledAt, errors }, null, 2));
await browser.close();
console.log('All original manuscripts and preferences are unchanged; only fresh validation projects were deleted.');
