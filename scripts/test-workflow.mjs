import assert from 'node:assert/strict';
import { Studio } from '../src/core.mjs';
import { snippet, insertSnippet } from '../src/snippets.mjs';
import { Request } from '../src/request.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { Runtime } from '../src/runtime.mjs';
const studio = new Studio({ root: join(process.cwd(), 'test-output/workflow') });
studio.runtime = new Runtime(join(homedir(), '.dsh/latex-studio/runtime'));
const call = request => studio.execute(Request.parse(request));
const project = await call({ action: 'create', templateId: 'article', title: 'LaTeX Studio - End-to-End Validation' });
const id = project.id;
await call({ action: 'upload', projectId: id, path: 'figures/layout example.png', base64: (await readFile('test/fixtures/layout-example.png')).toString('base64') });
const original = await call({ action: 'read', projectId: id, path: 'main.tex' });
let source = original.content;
for (const [kind, options] of [
  ['equation', { formula: '\\mathbb{E}[X] = \\sum_{i=1}^{n} p_i x_i' }],
  ['table', { rows: 3, columns: 3, caption: 'Synthetic test values & layout' }],
  ['algorithm', { caption: 'Optimization example' }],
  ['figure', { path: 'figures/layout example.png', caption: 'Synthetic curves for layout validation', width: '0.7' }],
]) source = insertSnippet(source, source.indexOf('\\end{document}'), snippet(kind, options));
const citation = await call({ action: 'doi', projectId: id, doi: '10.1038/s41586-021-03819-2' });
assert.ok(citation.bibtex.includes('10.1038/s41586-021-03819-2'));
source = source.replace('% \\bibliographystyle{plain}', `Example verified DOI reference: \\cite{${citation.key}}.\n\\bibliographystyle{plain}`).replace('% \\bibliography{references}', '\\bibliography{references}');
await call({ action: 'write', projectId: id, path: 'main.tex', content: source, baseHash: original.hash });
assert.equal((await call({ action: 'bibliography', projectId: id })).valid, true);
const result = { projectId: id, directory: project.directory, doi: citation.source, compilers: [] };
for (const engine of ['pdflatex', 'xelatex', 'lualatex']) {
  await call({ action: 'configure', projectId: id, main: 'main.tex', engine });
  const p = await studio.manifest(id);
  const report = await studio.runtime.compile(p, project.directory, { signal: new AbortController().signal, log: line => { if (/Compiling|Resolving/.test(line)) console.log(line); } });
  console.log(engine, report.success);
  result.compilers.push({ engine, success: report.success, diagnostics: report.diagnostics });
  assert.equal(report.success, true, report.log.slice(-3000));
}
await call({ action: 'write', projectId: id, path: 'main.tex', content: source.replace('Start writing', '\\UndefinedStudioTest Start writing') });
const broken = await studio.runtime.compile(await studio.manifest(id), project.directory, { signal: new AbortController().signal, log: () => {} });
assert.equal(broken.success, false);
assert.ok(broken.diagnostics.some(d => d.severity === 'error' && d.line));
await assert.rejects(call({ action: 'export', projectId: id, kind: 'pdf' }), /没有成功/);
await call({ action: 'write', projectId: id, path: 'main.tex', content: source });
await call({ action: 'configure', projectId: id, main: 'main.tex', engine: 'pdflatex' });
const report = await studio.runtime.compile(await studio.manifest(id), project.directory, { signal: new AbortController().signal, log: () => {} });
assert.equal(report.success, true);
const pdf = await call({ action: 'export', projectId: id, kind: 'pdf' });
const zip = await call({ action: 'export', projectId: id, kind: 'zip' });
await writeFile('test-output/validated-manuscript.pdf', Buffer.from(pdf.base64, 'base64'));
await writeFile('test-output/validated-manuscript.zip', Buffer.from(zip.base64, 'base64'));
result.bibliography = await call({ action: 'bibliography', projectId: id });
result.errorRecovery = true;
await writeFile('test-output/workflow-results.json', JSON.stringify(result, null, 2));
console.log('WORKFLOW VERIFIED', id);
