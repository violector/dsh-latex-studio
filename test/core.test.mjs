import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, unzipSync } from 'fflate';
import { Studio, unpackArchive } from '../src/core.mjs';
import { Request, REMOTE } from '../src/request.mjs';
import { snippet, insertSnippet } from '../src/snippets.mjs';
import { parseDiagnostics } from '../src/runtime.mjs';

const root = await mkdtemp(join(tmpdir(), 'latex-studio-test-'));
const studio = new Studio({ root });
const call = request => studio.execute(Request.parse(request));
await studio.ready;

test('24 real template starters and upstream sources are bundled and searchable', async () => {
  const catalog = await call({ action: 'catalog' });
  assert.equal(catalog.length, 24);
  for (const item of catalog) {
    const source = await readFile(join(studio.templates, item.directory, item.main), 'utf8');
    assert.match(source, /\\documentclass/);
    assert.match(source, /\\end\{document\}/);
  }
  assert.equal((await call({ action: 'catalog', query: 'Bioinformatics' })).some(t => t.id === 'bioinformatics'), true);
  assert.equal((await call({ action: 'catalog', query: 'PLOS Computational Biology' }))[0].id, 'plos-computational-biology');
});

test('save checks the actual file version and keeps a restorable persistent history', async () => {
  const p = await call({ action: 'create', templateId: 'article', title: 'A & B_1' });
  const original = await call({ action: 'read', projectId: p.id, path: 'main.tex' });
  assert.match(original.content, /A \\& B\\_1/);
  await call({ action: 'write', projectId: p.id, path: 'main.tex', content: original.content.replace('Start writing', 'Revised writing'), baseHash: original.hash });
  await assert.rejects(call({ action: 'write', projectId: p.id, path: 'main.tex', content: 'overwrite', baseHash: original.hash }), /修改/);
  const restoredStudio = new Studio({ root });
  const history = await restoredStudio.execute({ action: 'history', projectId: p.id, path: 'main.tex' });
  assert.equal(history.length, 1);
  await restoredStudio.execute({ action: 'restore', projectId: p.id, path: 'main.tex', revision: history[0].id });
  assert.equal((await call({ action: 'read', projectId: p.id, path: 'main.tex' })).content, original.content);
});

test('ZIP export/import preserves configured main file, engine and binary images', async () => {
  const p = await call({ action: 'create', templateId: 'article', title: 'Round trip' });
  const main = await call({ action: 'read', projectId: p.id, path: 'main.tex' });
  await call({ action: 'write', projectId: p.id, path: 'paper.tex', content: main.content });
  const bytes = Buffer.from([0, 5, 190, 255]);
  await call({ action: 'upload', projectId: p.id, path: 'figures/raw.dat', base64: bytes.toString('base64') });
  await call({ action: 'configure', projectId: p.id, main: 'paper.tex', engine: 'lualatex' });
  const zip = await call({ action: 'export', projectId: p.id, kind: 'zip' });
  const names = Object.keys(unzipSync(Buffer.from(zip.base64, 'base64')));
  assert.equal(names.some(n => n.startsWith('.history/')), false);
  const imported = await call({ action: 'import', name: 'Imported', archiveBase64: zip.base64 });
  assert.equal(imported.main, 'paper.tex'); assert.equal(imported.engine, 'lualatex');
  assert.equal((await call({ action: 'read', projectId: imported.id, path: 'figures/raw.dat' })).base64, bytes.toString('base64'));
});

test('request and ZIP boundaries reject paths outside the project', () => {
  for (const path of ['../secret.tex', '/absolute.tex', 'C:/outside.tex', '.project.json']) assert.equal(Request.safeParse({ action: 'read', projectId: 'valid-id', path }).success, false);
  assert.throws(() => unpackArchive(zipSync({ '../outside.tex': Buffer.from('x') })), /Unsafe ZIP/);
  const files = unpackArchive(zipSync({ 'template/main.tex': Buffer.from('hello'), 'template/styles/class.cls': Buffer.from('world') }));
  assert.deepEqual(Object.keys(files), ['main.tex', 'styles/class.cls']);
});

test('real Citation.js parser reports malformed BibTeX, duplicates and missing citation keys', async () => {
  const p = await call({ action: 'create', templateId: 'article', title: 'Bibliography' });
  const entry = '@article{known, title={A real parser test}, author={Smith, Jane}, year={2025}}';
  await call({ action: 'write', projectId: p.id, path: 'references.bib', content: entry });
  await call({ action: 'write', projectId: p.id, path: 'section.tex', content: '\\cite{known,missing}\n% \\cite{ignored}\n' });
  let report = await call({ action: 'bibliography', projectId: p.id });
  assert.equal(report.entries, 1);
  assert.deepEqual(report.diagnostics.map(d => d.message), ['Undefined citation: missing']);
  await call({ action: 'write', projectId: p.id, path: 'other.bib', content: entry });
  report = await call({ action: 'bibliography', projectId: p.id });
  assert.ok(report.diagnostics.some(d => /Duplicate/.test(d.message)));
  await call({ action: 'write', projectId: p.id, path: 'other.bib', content: '@article{broken,title={unclosed' });
  report = await call({ action: 'bibliography', projectId: p.id });
  assert.ok(report.diagnostics.some(d => d.file === 'other.bib'));
});

test('PDF export rejects an old PDF after source edits', async () => {
  const p = await call({ action: 'create', templateId: 'article', title: 'Stale PDF' });
  await mkdir(join(p.directory, '.build'));
  await writeFile(join(p.directory, '.build/report.json'), JSON.stringify({ success: true, sourceUpdatedAt: '2000-01-01T00:00:00.000Z', pdf: 'unused.pdf' }));
  await assert.rejects(call({ action: 'export', projectId: p.id, kind: 'pdf' }), /重新编译/);
});

test('snippet insertion stays inside document and loads each required package once', () => {
  const source = '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nText\n\\end{document}';
  let generated = insertSnippet(source, 0, snippet('equation', { formula: 'x^2 + y^2 = z^2' }));
  assert.ok(generated.indexOf('\\begin{equation}') > generated.indexOf('\\begin{document}'));
  assert.equal((generated.match(/usepackage\{amsmath\}/g) || []).length, 1);
  generated = insertSnippet(generated, generated.indexOf('\\end{document}'), snippet('table', { rows: 2, columns: 3 }));
  assert.match(generated, /\\usepackage\{booktabs\}/);
  assert.match(generated, /\\begin\{tabular\}\{lrr\}/);
  for (const path of ['figures/plot.png', 'figures/photo.jpg', 'figures/vector.pdf']) generated = insertSnippet(generated, generated.indexOf('\\end{document}'), snippet('figure', { path }));
  assert.deepEqual([...generated.matchAll(/\\label\{(fig:[^}]+)\}/g)].map(match => match[1]), ['fig:result', 'fig:result-2', 'fig:result-3']);
});

test('native Typert metadata validates the same request shape', () => {
  const endpoint = REMOTE.methods['latexStudio/run'];
  assert.equal(endpoint.namespace, 'latexStudio');
  assert.equal(endpoint.input({ strict: true }).create().parse({ request: { action: 'status' } }).request.action, 'status');
  assert.throws(() => endpoint.input({ strict: true }).create().parse({ request: { action: 'invented' } }));
});

test('BibTeX and Biber failures are visible as compilation errors', () => {
  const report = parseDiagnostics("This is BibTeX, Version 0.99e (TeX Live 2026)\nIllegal, another \\bibstyle command---line 6 of file main.aux\n[42] Utils.pm:480> ERROR - Cannot find 'references.bib'!");
  assert.equal(report.length, 2);
  assert.ok(report.every(d => d.severity === 'error' && d.hint));
});

test('AI selection replacement changes exactly its UTF-16 range and rejects stale versions', async () => {
  const p = await call({ action: 'create', templateId: 'article', title: 'Selection editing' });
  const content = 'Before α\n原始段落 🧬 with an equation $x^2$.\nAfter β';
  await call({ action: 'write', projectId: p.id, path: 'section.tex', content });
  const file = await call({ action: 'read', projectId: p.id, path: 'section.tex' });
  const from = content.indexOf('原始'), to = content.indexOf('\nAfter');
  const request = { action: 'replace_selection', projectId: p.id, path: 'section.tex', from, to, baseHash: file.hash, replacement: 'Revised paragraph with $x^2$.' };
  await call(request);
  assert.equal((await call({ action: 'read', projectId: p.id, path: 'section.tex' })).content, 'Before α\nRevised paragraph with $x^2$.\nAfter β');
  await assert.rejects(call({ ...request, replacement: 'stale overwrite' }), /修改/);
  await assert.rejects(call({ ...request, to: 9999 }), /选区/);
  const history = await call({ action: 'history', projectId: p.id, path: 'section.tex' });
  await call({ action: 'restore', projectId: p.id, path: 'section.tex', revision: history[0].id });
  assert.equal((await call({ action: 'read', projectId: p.id, path: 'section.tex' })).content, content);
});

test('folders including empty folders and PNG/JPEG/PDF assets survive a ZIP round trip', async () => {
  const p = await call({ action: 'create', templateId: 'article', title: 'Folders and image assets' });
  const after = await call({ action: 'mkdir', projectId: p.id, path: 'figures/empty' });
  assert.deepEqual(after.directories, ['figures', 'figures/empty']);
  for (const [name, bytes] of [['plot.png', Buffer.from([137,80,78,71,13,10,26,10])], ['photo.jpg', Buffer.from([255,216,255,217])], ['vector.pdf', Buffer.from('%PDF-1.7\nfixture\n%%EOF')]]) await call({ action: 'upload', projectId: p.id, path: `figures/results/${name}`, base64: bytes.toString('base64') });
  const archive = await call({ action: 'export', projectId: p.id, kind: 'zip' });
  const imported = await call({ action: 'import', name: 'Imported folders', archiveBase64: archive.base64 });
  assert.deepEqual(imported.directories, ['figures', 'figures/empty', 'figures/results']);
  for (const name of ['plot.png', 'photo.jpg', 'vector.pdf']) assert.equal((await call({ action: 'read', projectId: imported.id, path: `figures/results/${name}` })).base64, (await call({ action: 'read', projectId: p.id, path: `figures/results/${name}` })).base64);
});
