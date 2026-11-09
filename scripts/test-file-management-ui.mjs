import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { Studio } from '../src/core.mjs';

const studio = new Studio();
const before = await studio.execute({ action: 'status' });
const originalFiles = await Promise.all(before.projects.map(async p => ({ id: p.id, title: p.title, main: p.main, hash: (await studio.execute({ action: 'read', projectId: p.id, path: p.main })).hash })));
const project = await studio.execute({ action: 'create', templateId: 'article', title: 'File Management Validation' });
assert.equal(resolve(project.directory, '..'), resolve(studio.root, 'projects'));
const source = String.raw`\documentclass{article}
\title{File Management Validation}
\author{LaTeX Studio Test}
\begin{document}
\maketitle
\section{Introduction}
The manuscript remains intact when file names change.
\end{document}
`;
await studio.execute({ action: 'write', projectId: project.id, path: 'main.tex', content: source });
await studio.execute({ action: 'write', projectId: project.id, path: 'alternate.tex', content: source });
await studio.execute({ action: 'write', projectId: project.id, path: 'chapters/notes.tex', content: 'Notes version one.\n' });
await studio.execute({ action: 'write', projectId: project.id, path: 'chapters/notes.tex', content: 'Notes version two.\n' });
await studio.execute({ action: 'write', projectId: project.id, path: 'chapters/sub/extra.tex', content: 'Nested file.\n' });
await studio.execute({ action: 'write', projectId: project.id, path: 'chapters-other/keep.tex', content: 'Unrelated sibling.\n' });
for (const [name, fixture] of [['plot.png', 'layout-example.png'], ['photo.jpg', 'photo.jpg'], ['vector.pdf', 'vector.pdf']]) await studio.execute({ action: 'upload', projectId: project.id, path: `assets/${name}`, base64: (await readFile(`test/fixtures/${fixture}`)).toString('base64') });
await writeFile('test-output/file-management-project.json', JSON.stringify({ project, previous: before.activeProject, source }, null, 2));

const browser = await chromium.connectOverCDP('http://127.0.0.1:9225');
const page = browser.contexts()[0].pages().find(p => p.url().startsWith('dsh-app:'));
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const layout = await page.evaluate(() => localStorage.getItem('latex-studio-layout:v1'));
await writeFile('test-output/file-management-project.json', JSON.stringify({ project, previous: before.activeProject, source, layout }, null, 2));
await page.reload();
if (!(await page.locator('.ls-shell').count())) await page.getByRole('button', { name: 'LaTeX Studio', exact: true }).click();
await page.getByRole('combobox', { name: '打开已有文稿' }).selectOption(project.id);
await page.waitForFunction(title => document.querySelector('.ls-project-title strong')?.textContent === title, project.title);
await page.locator('.ls-chat [contenteditable=true]').waitFor();
const separator = page.getByRole('separator', { name: '目录栏宽度', exact: true });
await separator.focus();
await page.keyboard.press('Home');
for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
await page.locator('.cm-content').click();
await page.keyboard.press('Control+End');
await page.keyboard.insertText('\n% Saved during rename');
await page.waitForFunction(id => localStorage.getItem(`latex-studio-draft:${id}:main.tex`)?.includes('Saved during rename'), project.id);
const mainDraft = await page.evaluate(id => JSON.parse(localStorage.getItem(`latex-studio-draft:${id}:main.tex`)).content, project.id);
await renameEntry('main.tex', 'paper.tex');
await page.waitForFunction(() => document.querySelector('.ls-editor-heading>span')?.textContent === 'paper.tex');
assert.equal((await studio.execute({ action: 'project', projectId: project.id })).main, 'paper.tex');
assert.equal(await readFile(join(project.directory, 'paper.tex'), 'utf8'), mainDraft);
await assert.rejects(access(join(project.directory, 'main.tex')), { code: 'ENOENT' });
assert.equal(await page.evaluate(id => localStorage.getItem(`latex-studio-draft:${id}:main.tex`), project.id), null);
const firstReport = await compile();
console.log('Renamed the main file with an unsaved draft and compiled the new entry successfully.');

await entryAction('paper.tex', '重命名');
await page.getByLabel('新名称', { exact: true }).fill('alternate.tex');
await page.getByRole('button', { name: '保存名称', exact: true }).click();
await page.locator('.ls-dialog [role=alert]').waitFor();
assert.ok((await page.locator('.ls-dialog [role=alert]').innerText()).includes('已存在'));
await page.getByRole('button', { name: '关闭对话框', exact: true }).click();
await page.getByRole('button', { name: '关闭错误', exact: true }).click();
await entryAction('paper.tex', '删除文件');
assert.equal(await page.getByRole('button', { name: '确认删除', exact: true }).count(), 0);
await page.getByRole('button', { name: '打开编译设置', exact: true }).waitFor();
await page.getByRole('button', { name: '取消', exact: true }).click();
await access(join(project.directory, 'paper.tex'));

await openFile('chapters/notes.tex');
await page.locator('.cm-content').click();
await page.keyboard.press('Control+End');
await page.keyboard.insertText('Saved with folder rename.\n');
await page.waitForFunction(id => localStorage.getItem(`latex-studio-draft:${id}:chapters/notes.tex`)?.includes('Saved with folder rename'), project.id);
const notesDraft = await page.evaluate(id => JSON.parse(localStorage.getItem(`latex-studio-draft:${id}:chapters/notes.tex`)).content, project.id);
await renameEntry('chapters', 'sections', true);
await page.waitForFunction(() => document.querySelector('.ls-editor-heading>span')?.textContent === 'sections/notes.tex');
assert.equal(await readFile(join(project.directory, 'sections/notes.tex'), 'utf8'), notesDraft);
assert.ok((await page.locator('.ls-upload-location').innerText()).includes('sections'));
assert.ok((await studio.execute({ action: 'history', projectId: project.id, path: 'sections/notes.tex' })).length >= 2);
assert.equal(await readFile(join(project.directory, 'chapters-other/keep.tex'), 'utf8'), 'Unrelated sibling.\n');
assert.equal(await page.getByRole('button', { name: '下载 PDF', exact: true }).isDisabled(), true);

await openFile('assets/plot.png');
await page.locator('.ls-asset-preview img').waitFor();
await renameEntry('assets/plot.png', 'renamed.png');
assert.equal(await page.locator('.ls-asset-preview img').getAttribute('alt'), 'assets/renamed.png');
assert.deepEqual(await readFile(join(project.directory, 'assets/renamed.png')), await readFile('test/fixtures/layout-example.png'));
await entryAction('assets/photo.jpg', '删除文件');
await page.getByRole('button', { name: '取消', exact: true }).click();
await access(join(project.directory, 'assets/photo.jpg'));
await deleteEntry('assets/photo.jpg');
await openFile('assets/vector.pdf');
await page.locator('.ls-asset-preview canvas').first().waitFor();
await deleteEntry('assets/vector.pdf');
await page.waitForFunction(() => document.querySelector('.ls-editor-heading>span')?.textContent === 'paper.tex');
await openFile('assets/renamed.png');
await deleteEntry('assets', true);
await page.waitForFunction(() => document.querySelector('.ls-editor-heading>span')?.textContent === 'paper.tex');
await assert.rejects(access(join(project.directory, 'assets')), { code: 'ENOENT' });

await openFile('sections/notes.tex');
await page.locator('.cm-content').click();
await page.keyboard.press('Control+End');
await page.keyboard.insertText('Discard this unsaved draft on deletion.');
await page.waitForFunction(id => localStorage.getItem(`latex-studio-draft:${id}:sections/notes.tex`)?.includes('Discard this'), project.id);
await deleteEntry('sections/notes.tex');
await page.waitForFunction(() => document.querySelector('.ls-editor-heading>span')?.textContent === 'paper.tex');
assert.equal(await page.evaluate(id => localStorage.getItem(`latex-studio-draft:${id}:sections/notes.tex`), project.id), null);
await deleteEntry('sections', true);
await assert.rejects(access(join(project.directory, 'sections')), { code: 'ENOENT' });
await entryAction('paper.tex', '删除文件');
await page.getByRole('button', { name: '打开编译设置', exact: true }).click();
await page.getByRole('combobox', { name: '主文件', exact: true }).selectOption('alternate.tex');
await page.getByRole('button', { name: '保存设置', exact: true }).click();
await page.locator('.ls-dialog').waitFor({ state: 'detached' });
await deleteEntry('paper.tex');
await page.waitForFunction(() => document.querySelector('.ls-editor-heading>span')?.textContent === 'alternate.tex');
const secondReport = await compile();
assert.ok(firstReport.success && secondReport.success);
console.log('File/folder rename, collision, image/PDF deletion, draft cleanup and changing the main file passed.');

await page.reload();
if (!(await page.locator('.ls-shell').count())) await page.getByRole('button', { name: 'LaTeX Studio', exact: true }).click();
await page.getByRole('combobox', { name: '打开已有文稿' }).selectOption(project.id);
await page.waitForFunction(() => document.querySelector('.ls-editor-heading>span')?.textContent === 'alternate.tex');
assert.equal(await page.locator('[data-path="paper.tex"], [data-path="assets"], [data-path="sections"]').count(), 0);
assert.equal((await studio.execute({ action: 'project', projectId: project.id })).main, 'alternate.tex');
await page.locator('.ls-project-bar summary').click();
await page.locator('.ls-project-bar').getByRole('button', { name: '删除文稿', exact: true }).click();
await page.getByRole('button', { name: '确认删除', exact: true }).click();
await page.locator('.ls-library').waitFor();
await assert.rejects(access(project.directory), { code: 'ENOENT' });
for (const p of originalFiles) {
  assert.equal((await studio.execute({ action: 'project', projectId: p.id })).title, p.title);
  assert.equal((await studio.execute({ action: 'read', projectId: p.id, path: p.main })).hash, p.hash);
}
if (before.activeProject) await studio.execute({ action: 'activate', projectId: before.activeProject });
await page.evaluate(value => localStorage.setItem('latex-studio-layout:v1', value), layout);
await page.reload();
if (!(await page.locator('.ls-shell').count())) await page.getByRole('button', { name: 'LaTeX Studio', exact: true }).click();
await page.locator('.ls-library').waitFor();
assert.equal(await page.evaluate(() => localStorage.getItem('latex-studio-layout:v1')), layout);
assert.equal((await studio.execute({ action: 'status' })).projects.length, before.projects.length);
assert.deepEqual(errors, []);
await writeFile('test-output/file-management-results.json', JSON.stringify({ testedAt: new Date().toISOString(), version: '0.3.7', mainRenameWithDraft: true, folderRenameWithDraftAndHistory: true, collisionRejected: true, mainDeleteProtected: true, cancelDelete: true, imageAndPdfOperations: true, recursiveFolderDelete: true, currentFileFallback: true, draftRemoved: true, changedMainThenDeleted: true, compiledAt: [firstReport.compiledAt, secondReport.compiledAt], persistedAfterReload: true, narrowMenuVisible: true, originalProjectsPreserved: before.projects.length, preferencesPreserved: true, testProjectDeleted: project.id, errors }, null, 2));
await browser.close();
console.log('Packaged file-management UI passed; original manuscripts and layout restored.');

async function entryAction(path, action, directory = false) {
  assert.ok(resolve(project.directory, path).startsWith(resolve(project.directory) + sep));
  await page.getByRole('button', { name: `${directory ? '文件夹' : '文件'}操作：${path}`, exact: true }).click();
  const menu = page.locator('.ls-file-menu:popover-open');
  const box = await menu.boundingBox();
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1);
  if (path === 'main.tex') await menu.screenshot({ path: 'test-output/file-actions-menu.png' });
  await menu.getByRole('button', { name: action, exact: true }).click();
}

async function renameEntry(path, name, directory = false) {
  await entryAction(path, '重命名', directory);
  await page.getByLabel('新名称', { exact: true }).fill(name);
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
  await page.locator('.ls-dialog').waitFor({ state: 'detached' });
}

async function deleteEntry(path, directory = false) {
  await entryAction(path, directory ? '删除文件夹' : '删除文件', directory);
  if (directory) await page.locator('.ls-dialog').screenshot({ path: 'test-output/delete-folder-confirmation.png' });
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.locator('.ls-dialog').waitFor({ state: 'detached' });
  await assert.rejects(access(join(project.directory, path)), { code: 'ENOENT' });
}

async function openFile(path) {
  await page.locator(`.ls-file-list button[data-kind="file"][data-path="${path}"]`).click();
  await page.waitForFunction(value => document.querySelector('.ls-editor-heading>span')?.textContent === value, path);
}

async function compile() {
  const startedAt = new Date().toISOString();
  await page.getByRole('button', { name: '编译 PDF', exact: true }).click();
  let report;
  for (let i = 0; i < 60; i++) {
    try { report = JSON.parse(await readFile(join(project.directory, '.build/report.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (report?.compiledAt >= startedAt) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(report?.success && report.compiledAt >= startedAt);
  await page.locator('.ls-preview-column canvas').first().waitFor();
  return report;
}
