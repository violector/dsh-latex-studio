import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Studio } from '../src/core.mjs';

const studio = new Studio();
const previous = (await studio.execute({ action: 'status' })).activeProject;
const originalFile = previous ? await studio.execute({ action: 'read', projectId: previous, path: 'main.tex' }) : null;
const browser = await chromium.connectOverCDP('http://127.0.0.1:9225');
const page = browser.contexts()[0].pages().find(p => p.url().startsWith('dsh-app:'));
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && message.text().includes('user-text transformation failed')) errors.push(message.text()); });
const layout = await page.evaluate(() => localStorage.getItem('latex-studio-layout:v1'));
if (!(await page.locator('.ls-shell').count())) await page.getByRole('button', { name: 'LaTeX Studio', exact: true }).click();
if (await page.locator('.ls-back').count()) await page.locator('.ls-back').click();
let legacy = [];
if (previous) {
  await page.getByRole('combobox', { name: '打开已有文稿' }).selectOption(previous);
  await page.locator('.ls-chat [contenteditable=true]').waitFor();
  await page.locator('.ls-writing-request').first().waitFor();
  legacy = await page.locator('.ls-writing-request').allTextContents();
  assert.ok(legacy.length > 0);
  assert.ok(legacy.every(text => !text.includes('当前项目 ID：') && !text.includes('选区上下文：')));
  await page.locator('.ls-shell').screenshot({ path: 'test-output/compact-chat-history.png' });
  console.log('Existing conversation now displays only user requirements.');
}

const original = 'This sentence is selected for revision.';
const replacement = 'The hidden context preserves precise editing.';
const project = await studio.execute({ action: 'create', templateId: 'article', title: 'LaTeX Studio Clean Chat Validation' });
const source = String.raw`\documentclass{article}
\title{Clean Chat Validation}
\author{LaTeX Studio Test}
\begin{document}
\maketitle
\section{Introduction}
This sentence is selected for revision.
The surrounding paragraph must stay unchanged.
\section{Methods}
This is an interface test, with no research claims.
\end{document}
`;
await studio.execute({ action: 'write', projectId: project.id, path: 'main.tex', content: source });
await writeFile('test-output/clean-chat-project.json', JSON.stringify({ id: project.id, directory: project.directory, source, previous }, null, 2));
if (await page.locator('.ls-back').count()) await page.locator('.ls-back').click();
await page.getByRole('combobox', { name: '打开已有文稿' }).selectOption(project.id);
await page.locator('.ls-chat [contenteditable=true]').waitFor();
await page.locator('.ls-root .cm-line').filter({ hasText: original }).click({ clickCount: 3 });
await page.getByRole('button', { name: '展开 AI 选区修改', exact: true }).click();
assert.equal((await page.locator('.ls-selection-editor blockquote').innerText()).trim(), original);
const selectionRequest = `请把选中的句子替换为：${replacement}\n保留末尾换行和其他正文，并编译检查。`;
await page.getByRole('textbox', { name: '选区修改要求' }).fill(selectionRequest);
const startedAt = new Date().toISOString();
await page.getByRole('button', { name: '交给 AI 修改', exact: true }).click();
await page.waitForFunction(text => [...document.querySelectorAll('.ls-writing-request')].some(node => node.textContent === text), selectionRequest);
assert.equal((await page.locator('.ls-chat').innerText()).includes('你是 LaTeX Studio 写作助手。当前项目 ID：'), false);
console.log('Selection request displays cleanly; real dsh AI is editing the fresh test document.');

let after, report;
for (let i = 0; i < 120; i++) {
  after = await readFile(join(project.directory, 'main.tex'), 'utf8');
  try { report = JSON.parse(await readFile(join(project.directory, '.build/report.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (after.includes(replacement) && report?.success && report.compiledAt > startedAt) break;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
assert.equal(after, source.replace(original, replacement));
assert.ok(report?.success && report.compiledAt > startedAt);
await page.waitForFunction(text => document.querySelector('.cm-content')?.textContent.includes(text), replacement);
await page.waitForFunction(() => document.querySelector('.ls-chat-header i')?.textContent === '写作对话');

const generalRequest = '这是显示检查，请只回答“收到”，不要修改文稿或重新编译。';
await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
await page.getByLabel('描述你需要的帮助').fill(generalRequest);
await page.getByRole('button', { name: '发送到左侧写作对话', exact: true }).click();
await page.waitForFunction(text => [...document.querySelectorAll('.ls-writing-request')].some(node => node.textContent === text), generalRequest);
await page.locator('.ls-chat').getByText('收到', { exact: true }).waitFor();
await page.waitForFunction(() => document.querySelector('.ls-chat-header i')?.textContent === '写作对话');
assert.equal(await readFile(join(project.directory, 'main.tex'), 'utf8'), after);
await page.reload();
if (!(await page.locator('.ls-shell').count())) await page.getByRole('button', { name: 'LaTeX Studio', exact: true }).click();
await page.getByRole('combobox', { name: '打开已有文稿' }).selectOption(project.id);
await page.waitForFunction(text => [...document.querySelectorAll('.ls-writing-request')].some(node => node.textContent === text), generalRequest);
assert.deepEqual(await page.locator('.ls-writing-request').allTextContents(), [selectionRequest, generalRequest]);
assert.equal(await page.evaluate(() => localStorage.getItem('latex-studio-layout:v1')), layout);
await page.locator('.ls-shell').screenshot({ path: 'test-output/compact-chat-result.png' });
if (previous) {
  await page.locator('.ls-back').click();
  await page.getByRole('combobox', { name: '打开已有文稿' }).selectOption(previous);
  await page.waitForFunction(text => [...document.querySelectorAll('.ls-writing-request')].some(node => node.textContent === text), legacy.at(-1));
  assert.equal((await studio.execute({ action: 'read', projectId: previous, path: 'main.tex' })).hash, originalFile.hash);
}
assert.deepEqual(errors, []);
await writeFile('test-output/clean-chat-results.json', JSON.stringify({ testedAt: new Date().toISOString(), version: '0.3.5', projectId: project.id, legacyMessages: legacy.length, cleanSelectionRequest: true, cleanGeneralRequest: true, restoredAfterReload: true, exactSelectionReplacement: true, automaticSourceRefresh: true, compiledAt: report.compiledAt, success: report.success, preferencesPreserved: true, originalProjectUnchanged: true, errors }, null, 2));
await browser.close();
console.log('Legacy and new messages, reload, exact AI selection edit and real PDF compilation passed.');
