import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { unzipSync } from 'fflate';
import { Runtime, run } from '../src/runtime.mjs';
const runtime = new Runtime(join(homedir(), '.dsh/latex-studio/runtime'));
if (!(await runtime.status()).ready) throw new Error('Install the managed TinyTeX runtime in LaTeX Studio first.');
for (const [family, source] of [['acm', 'acmart'], ['elsevier', 'elsarticle']]) {
  const files = unzipSync(await readFile(`.dev/downloads/${family}.zip`));
  const directory = join(process.cwd(), '.dev/generated', family);
  await mkdir(directory, { recursive: true });
  for (const [path, data] of Object.entries(files)) if (/\.(dtx|ins)$/.test(path)) await writeFile(join(directory, path.split('/').pop()), data);
  await run(join(runtime.home, 'bin/windows/latex.exe'), ['-interaction=nonstopmode', `${source}.ins`], { cwd: directory, env: runtime.environment() });
  console.log(`Generated ${source}.cls with upstream docstrip sources`);
}
