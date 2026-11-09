import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { Studio } from '../src/core.mjs';

const studio = new Studio();
const before = await studio.execute({ action: 'status' });
const original = before.activeProject ? await studio.execute({ action: 'project', projectId: before.activeProject }) : null;
const originalHash = original?.report?.pdf ? createHash('sha256').update(await readFile(original.report.pdf)).digest('hex') : null;
const browser = await chromium.connectOverCDP('http://127.0.0.1:9225');
const page = browser.contexts()[0].pages().find(p => p.url().startsWith('dsh-app:'));
page.setDefaultTimeout(20000);
const layout = await page.evaluate(() => localStorage.getItem('latex-studio-layout:v1'));
const cdp = await page.context().newCDPSession(page);
const errors = [], scenarios = [];
page.on('pageerror', error => errors.push(error.message));
const project = await studio.execute({ action: 'create', templateId: 'article', title: 'PDF Resolution Validation' });
assert.equal(resolve(project.directory, '..'), resolve(studio.root, 'projects'));
await writeFile('test-output/pdf-resolution-project.json', JSON.stringify({ project, previous: before.activeProject, layout, originalHash }, null, 2));
await studio.execute({ action: 'write', projectId: project.id, path: 'main.tex', content: String.raw`\documentclass{article}
\usepackage{amsmath}
\title{PDF Preview Resolution}
\author{LaTeX Studio Validation}
\begin{document}
\maketitle
\section{Text and equations}
Clear text preserves small details: Scientific writing, 0123456789.
\begin{equation} y = \frac{1}{2} + \alpha x^2 \end{equation}
{\footnotesize Small text should be rendered at the display's pixel density.}
\par\bigskip\noindent\rule{\linewidth}{0.2pt}
\newpage
\section{Second page}
This page verifies the aspect ratio and sharpness of every rendered page.
\begin{equation} \sum_{i=1}^{n} x_i = \int_0^1 f(x)\,dx \end{equation}
\end{document}
` });
await studio.execute({ action: 'upload', projectId: project.id, path: 'figures/vector.pdf', base64: (await readFile('test/fixtures/vector.pdf')).toString('base64') });
let pdfHash;
try {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 2048, height: 1152, deviceScaleFactor: 1, mobile: false });
  await page.reload();
  if (!(await page.locator('.ls-shell').count())) await page.getByRole('button', { name: 'LaTeX Studio', exact: true }).click();
  await page.getByRole('combobox', { name: '打开已有文稿' }).selectOption(project.id);
  await page.waitForFunction(title => document.querySelector('.ls-project-title strong')?.textContent === title, project.title);
  await page.getByRole('button', { name: '编译 PDF', exact: true }).click();
  for (let i = 0; i < 60; i++) {
    const p = await studio.execute({ action: 'project', projectId: project.id });
    if (p.report?.success) { pdfHash = createHash('sha256').update(await readFile(p.report.pdf)).digest('hex'); break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(pdfHash);
  for (const zoom of [1, .6, 1.2, 2]) {
    await page.keyboard.press('Control+0');
    for (let i = 0; i < Math.round(Math.abs(zoom - 1) * 10); i++) await page.keyboard.press(zoom > 1 ? 'Control+=' : 'Control+-');
    await page.waitForFunction(value => Number(document.querySelector('.ls-shell').style.zoom) === value, zoom);
    await measure(`interface-${zoom}`);
  }
  await page.keyboard.press('Control+0');
  await page.keyboard.press('Control+=');
  await page.keyboard.press('Control+=');
  for (const density of [2, 3, 1]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 2048, height: 1152, deviceScaleFactor: density, mobile: false });
    // Electron's CDP override does not consistently dispatch resolution media-query changes.
    await page.reload();
    if (!(await page.locator('.ls-shell').count())) await page.getByRole('button', { name: 'LaTeX Studio', exact: true }).click();
    await page.getByRole('combobox', { name: '打开已有文稿' }).selectOption(project.id);
    await page.waitForFunction(title => document.querySelector('.ls-project-title strong')?.textContent === title, project.title);
    await page.waitForFunction(value => devicePixelRatio === value, density);
    await measure(`display-density-${density}`);
  }
  const beforePdfZoom = scenarios.at(-1).pages[0].displayWidth;
  for (let i = 0; i < 2; i++) await page.locator('.ls-preview-column').getByRole('button', { name: '放大 PDF', exact: true }).click();
  const enlarged = await measure('pdf-zoom');
  assert.ok(enlarged.pages[0].displayWidth > beforePdfZoom * 1.15);
  const divider = page.getByRole('separator', { name: '正文与 PDF 宽度', exact: true });
  await divider.focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(previous => Math.abs((document.querySelector('.ls-preview-column canvas')?.getBoundingClientRect().width || previous) - previous) > 5, enlarged.pages[0].displayWidth);
  const resized = await measure('resized-column');
  assert.ok(Math.abs(resized.pages[0].displayWidth - enlarged.pages[0].displayWidth) > 5);
  const previewImage = await page.locator('.ls-preview-column canvas').first().evaluate(canvas => canvas.toDataURL('image/png').split(',')[1]);
  await writeFile('test-output/pdf-resolution-validation.png', Buffer.from(previewImage, 'base64'));
  await page.locator('.ls-file-list button[data-path="figures/vector.pdf"]').click();
  await page.waitForFunction(() => document.querySelector('.ls-editor-heading>span')?.textContent === 'figures/vector.pdf');
  await measure('pdf-asset', '.ls-asset-preview .ls-pdf-pages canvas', 1);
  const latest = await studio.execute({ action: 'project', projectId: project.id });
  assert.equal(createHash('sha256').update(await readFile(latest.report.pdf)).digest('hex'), pdfHash);
  console.log('Multi-page PDF and PDF asset previews stayed sharp through UI zoom, PDF zoom, pane resize and DPR 1/2/3.');
  await page.locator('.ls-project-bar summary').click();
  await page.locator('.ls-project-bar').getByRole('button', { name: '删除文稿', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.locator('.ls-library').waitFor();
  await assert.rejects(access(project.directory), { code: 'ENOENT' });
  assert.deepEqual((await studio.execute({ action: 'status' })).projects.map(p => p.id).sort(), before.projects.map(p => p.id).sort());
  if (originalHash) assert.equal(createHash('sha256').update(await readFile(original.report.pdf)).digest('hex'), originalHash);
  assert.deepEqual(errors, []);
  await writeFile('test-output/pdf-resolution-results.json', JSON.stringify({ testedAt: new Date().toISOString(), version: '0.3.8', scenarios, compiledPdfUnchanged: true, originalPdfUnchanged: true, originalHash, originalProjectsPreserved: before.projects.length, testProjectDeleted: project.id, errors }, null, 2));
} catch (error) {
  await writeFile('test-output/pdf-resolution-failure.json', JSON.stringify({ error: error.stack, scenarios, errors }, null, 2));
  throw error;
} finally {
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  if (before.activeProject) await studio.execute({ action: 'activate', projectId: before.activeProject });
  await page.evaluate(value => localStorage.setItem('latex-studio-layout:v1', value), layout);
  await page.reload();
  if (!(await page.locator('.ls-shell').count())) await page.getByRole('button', { name: 'LaTeX Studio', exact: true }).click();
  if (before.activeProject) {
    await page.getByRole('combobox', { name: '打开已有文稿' }).selectOption(before.activeProject);
    await page.locator('.ls-file-list').waitFor();
  }
  await cdp.detach();
  await browser.close();
}

async function measure(label, selector = '.ls-preview-column .ls-pdf-pages canvas', count = 2) {
  await page.waitForFunction(({ selector, count }) => {
    const canvases = [...document.querySelectorAll(selector)];
    return canvases.length === count && canvases.every(canvas => {
      const box = canvas.getBoundingClientRect();
      const coverage = canvas.width / box.width;
      if (box.width <= 0 || coverage < Math.max(2, devicePixelRatio) - .01 || coverage > Math.max(2, devicePixelRatio) + .03) return false;
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 0; i < data.length; i += 40) if (data[i + 3] === 255 && data[i] < 180) return true;
      return false;
    });
  }, { selector, count });
  const value = await page.evaluate(selector => ({ density: devicePixelRatio, zoom: Number(document.querySelector('.ls-shell').style.zoom), pages: [...document.querySelectorAll(selector)].map(canvas => { const box = canvas.getBoundingClientRect(); return { width: canvas.width, height: canvas.height, displayWidth: box.width, displayHeight: box.height, cssWidth: parseFloat(canvas.style.width), cssHeight: parseFloat(canvas.style.height) }; }) }), selector);
  for (const p of value.pages) {
    assert.ok(p.width >= p.displayWidth * value.density - 1);
    assert.ok(p.height >= p.displayHeight * value.density - 1);
    assert.ok(Math.abs(p.displayWidth / p.displayHeight - p.cssWidth / p.cssHeight) < .001);
  }
  const record = { label, ...value };
  scenarios.push(record);
  console.log(`${label}: ${JSON.stringify(value)}`);
  return record;
}
