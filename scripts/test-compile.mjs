import { Studio } from '../src/core.mjs';
import { Runtime } from '../src/runtime.mjs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const studio = new Studio({ root: join(process.cwd(), 'test-output/compile') });
studio.runtime = new Runtime(join(homedir(), '.dsh/latex-studio/runtime'));
await studio.ready;
const results = [];
const output = process.argv[2] ? 'test-output/compile-selected-results.json' : 'test-output/compile-results.json';
await mkdir('test-output', { recursive: true });
for (const template of await studio.catalog('')) {
  if (process.argv[2] && !process.argv[2].split(',').includes(template.id)) continue;
  console.log('START', template.id);
  const project = await studio.create(template.id, template.id === 'chinese' ? '科研写作与公式测试' : 'A Reproducible Research Manuscript');
  try {
    const main = await studio.read(project.id, project.main);
    await studio.write(project.id, 'references.bib', '@book{knuth1984, author={Donald E. Knuth}, title={The TeXbook}, publisher={Addison-Wesley}, year={1984}}\n');
    await studio.write(project.id, project.main, main.content.replace(/^% (\\bibliograph(?:y|ystyle)\{[^}]+\})/gm, '$1').replace('\\end{document}', '\\nocite{knuth1984}\n\\end{document}'), main.hash);
    const report = await studio.runtime.compile(project, project.directory, { signal: new AbortController().signal, log: line => { if (/Resolving|Compiling|install:|error|not found/i.test(line)) console.log(line.slice(0, 300)); } });
    const bibliography = report.success && (await readFile(join(project.directory, '.build/main.bbl'), 'utf8')).includes('knuth1984');
    results.push({ template: template.id, success: report.success && bibliography, bibliography, directory: project.directory, pdf: report.pdf, errors: report.diagnostics.filter(d => d.severity === 'error'), lastLog: report.success ? null : report.log.slice(-5000) });
  } catch (error) { results.push({ template: template.id, success: false, error: error.message }); }
  console.log('RESULT', template.id, results.at(-1).success);
  await writeFile(output, JSON.stringify(results, null, 2));
}
console.log(JSON.stringify(results.map(({ template, success }) => ({ template, success }))));
if (results.some(r => !r.success)) process.exitCode = 1;
