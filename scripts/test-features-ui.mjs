import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const project = JSON.parse(await readFile('test-output/feature-project.json', 'utf8'));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9225');
const page = browser.contexts()[0].pages().find(p => p.url().startsWith('dsh-app:'));
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
if (!(await page.locator('.ls-shell').count())) await page.getByRole('button', { name: 'LaTeX Studio', exact: true }).click();
if (await page.locator('.ls-back').count()) await page.locator('.ls-back').click();
await page.getByRole('combobox', { name: '打开已有文稿' }).selectOption(project.id);
const root = page.locator('.ls-root');
await page.waitForSelector('.ls-chat [contenteditable=true]');
await root.locator('.cm-editor').waitFor();
assert.ok((await page.locator('.ls-chat').boundingBox()).x < (await root.boundingBox()).x);
console.log('Resident native chat and source editor are mounted together.');
await root.getByRole('button', { name: '新建文件夹', exact: true }).click();
await page.getByRole('textbox', { name: '文件夹路径', exact: true }).fill('figures/results');
await page.getByRole('button', { name: '创建文件夹', exact: true }).click();
await root.locator('[data-kind=directory][data-path="figures/results"]').waitFor();
const jpeg = await page.evaluate(() => {
  const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 250;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#edf4ed'; ctx.fillRect(0, 0, 480, 250); ctx.fillStyle = '#2b6c50'; ctx.fillRect(40, 60, 110, 130); ctx.fillRect(180, 95, 110, 95); ctx.font = '24px sans-serif'; ctx.fillText('JPEG figure', 40, 35);
  return canvas.toDataURL('image/jpeg').split(',')[1];
});
await writeFile('test/fixtures/photo.jpg', Buffer.from(jpeg, 'base64'));
await root.locator('input[type=file][multiple]').setInputFiles(['test/fixtures/layout-example.png', 'test/fixtures/photo.jpg', 'test/fixtures/vector.pdf']);
await root.locator('[data-path="figures/results/vector.pdf"]').waitFor();
for (const name of ['layout-example.png', 'photo.jpg', 'vector.pdf']) {
  await root.locator(`[data-kind=file][data-path="figures/results/${name}"]`).click();
  if (name.endsWith('.pdf')) await root.locator('.ls-editor-column .ls-pdf-pages canvas').first().waitFor();
  else await page.waitForFunction(() => document.querySelector('.ls-asset-preview img')?.naturalWidth > 0);
  console.log('Previewed', name);
}
await page.locator('.ls-shell').screenshot({ path: 'test-output/folder-pdf-preview.png' });
await root.locator('[data-kind=file][data-path="main.tex"]').click();
await root.locator('.cm-content').click();
await page.keyboard.press('Control+Home');
for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
await page.keyboard.press('Home');
await page.keyboard.press('Shift+End');
await page.getByRole('button', { name: '展开 AI 选区修改', exact: true }).click();
await page.getByRole('dialog', { name: '修改选中文字', exact: true }).waitFor();
assert.equal((await page.locator('.ls-selection-editor blockquote').innerText()).trim(), 'This sentence should be revised.');
await page.getByRole('textbox', { name: '选区修改要求' }).fill('请把选中的句子替换为：This paragraph was revised through the embedded dsh assistant. 只修改选区，保留其他内容。调用 replace_selection 后真实编译。');
await page.locator('.ls-shell').screenshot({ path: 'test-output/selection-ai-popup.png' });
await page.getByRole('button', { name: '交给 AI 修改', exact: true }).click();
assert.equal(await root.locator('.cm-editor').count(), 1);
console.log('Selection request sent; editor remains visible.');
const replacement = 'This paragraph was revised through the embedded dsh assistant.';
let result;
for (let i = 0; i < 90; i++) {
  result = await readFile(join(project.directory, 'main.tex'), 'utf8');
  if (result.includes(replacement)) break;
  await new Promise(resolve => setTimeout(resolve, 1500));
}
assert.equal(result, project.source.replace('This sentence should be revised.', replacement));
await page.waitForFunction(text => document.querySelector('.cm-content')?.textContent.includes(text), replacement);
console.log('AI changed exactly the selected range and source refreshed automatically.');
for (let i = 0; i < 90; i++) {
  let report; try { report = JSON.parse(await readFile(join(project.directory, '.build/report.json'), 'utf8')); } catch {}
  if (report?.success && report.compiledAt > new Date(Date.now() - 180000).toISOString()) break;
  if (i === 89) throw new Error('AI did not finish successful compilation');
  await new Promise(resolve => setTimeout(resolve, 1500));
}
await page.locator('.ls-shell').screenshot({ path: 'test-output/resident-chat-selection-result.png' });
await writeFile('test-output/feature-ui-results.json', JSON.stringify({ testedAt: new Date().toISOString(), projectId: project.id, residentNativeChat: true, selectionPopup: true, exactAiReplacement: true, automaticSourceRefresh: true, nestedFolders: true, imagePreviews: ['png', 'jpg', 'pdf'], errors }, null, 2));
await browser.close();
assert.deepEqual(errors, []);
