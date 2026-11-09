import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const project = JSON.parse(await readFile('test-output/feature-project.json', 'utf8'));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9225');
const page = browser.contexts()[0].pages().find(p => p.url().startsWith('dsh-app:'));
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const root = page.locator('.ls-root');
if (!(await root.count())) await page.getByRole('button', { name: 'LaTeX Studio', exact: true }).click();
if (await page.locator('.ls-back').count()) await page.locator('.ls-back').click();
await page.getByRole('combobox', { name: '打开已有文稿' }).selectOption(project.id);
await page.waitForSelector('.ls-chat [contenteditable=true]');
await root.locator('.cm-content').waitFor();
if (await page.locator('.ls-selection-editor').count()) await page.getByRole('button', { name: '关闭选区修改' }).click();

for (const name of ['layout-example.png', 'photo.jpg', 'vector.pdf']) {
  await root.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await root.getByRole('button', { name: '图片', exact: true }).click();
  await page.getByRole('combobox', { name: '图片文件' }).selectOption(`figures/results/${name}`);
  await page.getByRole('spinbutton', { name: '宽度（相对于当前栏）' }).fill('0.3');
  await page.getByRole('textbox', { name: '图表标题' }).fill(`Embedded ${name}`);
  await page.getByRole('button', { name: '插入到光标位置' }).click();
}
const startedAt = new Date().toISOString();
await root.getByRole('button', { name: '编译 PDF', exact: true }).click();
const reportPath = join(project.directory, '.build/report.json');
let report;
for (let i = 0; i < 60; i++) {
  report = JSON.parse(await readFile(reportPath, 'utf8'));
  if (report.compiledAt > startedAt) break;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
assert.ok(report.compiledAt > startedAt, 'Image compilation did not complete');
assert.equal(report.success, true, report.log.slice(-2500));
for (const name of ['layout-example.png', 'photo.jpg', 'vector.pdf']) assert.ok(report.log.includes(name), `${name} was not used by TeX`);
console.log('PNG, JPG and PDF graphics inserted through UI and compiled by private TinyTeX.');
await root.getByRole('combobox', { name: '工作区视图' }).selectOption('pdf');
await root.locator('.ls-preview-column .ls-pdf-pages canvas').first().waitFor();
await page.locator('.ls-shell').screenshot({ path: 'test-output/all-image-formats-pdf.png' });
await root.getByRole('combobox', { name: '工作区视图' }).selectOption('source');

const before = await readFile(join(project.directory, 'main.tex'), 'utf8');
const replacement = 'This discussion was written from the persistent dsh conversation.';
const nativeInput = page.locator('.ls-chat [contenteditable=true]');
await nativeInput.fill(`请将当前文稿 Discussion 中的 This draft needs a discussion. 替换为 ${replacement}，只改这一句，保留其他正文和全部图片，实际保存并编译。最后用一句中文报告结果。`);
const chatStartedAt = new Date().toISOString();
await page.locator('.ls-chat').getByRole('button', { name: '发送消息', exact: true }).click();
assert.equal(await root.locator('.cm-editor').count(), 1);
let after;
for (let i = 0; i < 90; i++) {
  after = await readFile(join(project.directory, 'main.tex'), 'utf8');
  report = JSON.parse(await readFile(reportPath, 'utf8'));
  if (after.includes(replacement) && report.success && report.compiledAt > chatStartedAt) break;
  await new Promise(resolve => setTimeout(resolve, 1500));
}
assert.equal(after, before.replace('This draft needs a discussion.', replacement));
assert.ok(report.success && report.compiledAt > chatStartedAt, 'Native chat did not finish compilation');
await page.waitForFunction(text => document.querySelector('.cm-content')?.textContent.includes(text), replacement);
await page.waitForFunction(() => document.querySelector('.ls-chat-header i')?.textContent === '写作对话', { timeout: 60000 });
console.log('Native composer edited the manuscript; source and PDF refreshed without leaving the plugin.');
await page.locator('.ls-shell').screenshot({ path: 'test-output/native-chat-writing.png' });
await copyFile(report.pdf, 'test-output/all-image-formats.pdf');
await writeFile('test-output/images-chat-results.json', JSON.stringify({ testedAt: new Date().toISOString(), projectId: project.id, imageFormatsCompiled: ['png', 'jpg', 'pdf'], nativeComposerEdits: true, exactReplacement: true, sourceRefresh: true, report: { success: report.success, compiledAt: report.compiledAt, diagnostics: report.diagnostics }, errors }, null, 2));
await browser.close();
assert.deepEqual(errors, []);
