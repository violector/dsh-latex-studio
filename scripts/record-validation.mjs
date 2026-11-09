import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const catalog = JSON.parse(await readFile('templates/catalog.json', 'utf8'));
const results = JSON.parse(await readFile('test-output/compile-results.json', 'utf8'));
let selected = [];
try { selected = JSON.parse(await readFile('test-output/compile-selected-results.json', 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const result of selected) { const index = results.findIndex(r => r.template === result.template); if (index >= 0) results[index] = result; }
if (results.length !== catalog.length || results.some(r => !r.success)) throw new Error('All bundled templates must pass real compilation before recording validation.');
const validation = [];
for (const template of catalog) {
  const result = results.find(r => r.template === template.id);
  if (!result?.success) throw new Error(`No successful compile for ${template.id}`);
  const starter = await readFile(`templates/${template.directory}/${template.main}`);
  const report = JSON.parse(await readFile(`${result.directory}/.build/report.json`, 'utf8'));
  validation.push({ id: template.id, success: true, engine: template.engine, upstreamSha256: template.sha256, starterSha256: createHash('sha256').update(starter).digest('hex'), testedAt: report.compiledAt, runtime: 'TinyTeX v2026.11 / TeX Live 2026', platform: 'win32' });
}
await writeFile('templates/validation.json', JSON.stringify(validation, null, 2));
console.log(`Recorded ${validation.length} real compilation results.`);
