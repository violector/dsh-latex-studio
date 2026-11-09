import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, delimiter } from 'node:path';
import { createHash } from 'node:crypto';

export const RUNTIME_VERSION = 'v2026.11';
export const RUNTIME_URL = `https://github.com/rstudio/tinytex-releases/releases/download/${RUNTIME_VERSION}/TinyTeX-1-windows-${RUNTIME_VERSION}.exe`;

export class Runtime {
  constructor(root, download = fetch) { this.root = root; this.home = join(root, 'TinyTeX'); this.download = download; }

  async status() {
    try {
      await access(join(this.home, 'bin/windows/pdflatex.exe'));
      return { ready: true, version: RUNTIME_VERSION, home: this.home, platform: process.platform };
    } catch { return { ready: false, version: RUNTIME_VERSION, home: this.home, platform: process.platform }; }
  }

  async install(job) {
    if (process.platform !== 'win32') throw new Error('This release manages TinyTeX on Windows. macOS/Linux runtime support is not yet available.');
    if ((await this.status()).ready) return this.status();
    await mkdir(this.root, { recursive: true });
    const archive = join(this.root, `TinyTeX-1-windows-${RUNTIME_VERSION}.exe`);
    job.log('Downloading the official TinyTeX runtime (about 74 MB)…');
    const release = await this.download(`https://api.github.com/repos/rstudio/tinytex-releases/releases/tags/${RUNTIME_VERSION}`, { signal: job.signal });
    if (!release.ok) throw new Error(`Cannot read TinyTeX release: HTTP ${release.status}`);
    const metadata = await release.json();
    const asset = metadata.assets.find(a => a.browser_download_url === RUNTIME_URL);
    if (!asset?.digest?.startsWith('sha256:')) throw new Error('Official TinyTeX checksum is unavailable. Please retry later.');
    let bytes;
    try { bytes = await readFile(archive); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!bytes || `sha256:${createHash('sha256').update(bytes).digest('hex')}` !== asset.digest) {
      const response = await this.download(RUNTIME_URL, { signal: job.signal });
      if (!response.ok) throw new Error(`TinyTeX download failed: HTTP ${response.status}`);
      const chunks = []; let received = 0; let lastPercent = -10;
      for await (const chunk of response.body) {
        chunks.push(chunk); received += chunk.length;
        const percent = Math.floor(received / asset.size * 100);
        if (percent >= lastPercent + 10) { job.log(`Download ${percent}%`); lastPercent = percent; }
      }
      bytes = Buffer.concat(chunks);
    }
    if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== asset.digest) throw new Error('TinyTeX download checksum mismatch.');
    await writeFile(archive, bytes);
    job.log('Extracting the private runtime. System PATH and existing TeX installations are not changed.');
    await run(archive, ['-y'], { cwd: this.root, signal: job.signal, log: job.log });
    await writeFile(join(this.root, 'runtime.json'), JSON.stringify({ version: RUNTIME_VERSION, source: RUNTIME_URL, sha256: asset.digest, installedAt: new Date().toISOString() }, null, 2));
    await this.tlmgr(['option', 'repository', 'https://mirror.ctan.org/systems/texlive/tlnet'], job);
    return this.status();
  }

  environment() {
    return { ...process.env, LC_ALL: 'C', LC_CTYPE: 'C', LANG: 'C', PATH: [join(this.home, 'bin/windows'), join(this.home, 'tlpkg/tlperl/bin'), process.env.PATH].join(delimiter), TEXMFHOME: join(this.root, 'texmf'), openin_any: 'p', openout_any: 'p' };
  }

  async tlmgr(args, job) {
    // The official Windows launcher completes infrastructure updates after Perl exits.
    const command = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    const launcher = join(this.home, 'bin/windows/tlmgr.bat');
    const commandArgs = values => ['/d', '/s', '/c', `"${[launcher, ...values].map(v => `"${v}"`).join(' ')}"`];
    const options = { cwd: this.home, env: this.environment(), signal: job.signal, log: job.log, timeout: 600_000 };
    try { return await run(command, commandArgs(args), options); }
    catch (error) {
      if (!error.message.includes('tlmgr itself needs to be updated') || args[0] === 'update') throw error;
      job.log('Updating the private TeX package manager before installing dependencies.');
      await run(command, commandArgs(['update', '--self']), options);
      return run(command, commandArgs(args), options);
    }
  }

  async compile(project, directory, job) {
    if (!(await this.status()).ready) throw new Error('请先在 LaTeX Studio 安装编译环境，或调用 latex_runtime 的 runtime_install。');
    await this.prepareDocumentPackages(await readFile(join(directory, project.main), 'utf8'), job);
    const build = join(directory, '.build');
    await mkdir(build, { recursive: true });
    const flag = { pdflatex: '-pdf', xelatex: '-xelatex', lualatex: '-lualatex' }[project.engine];
    let result;
    for (let attempt = 0; attempt < 20; attempt++) {
      job.log(`Compiling ${project.main} with ${project.engine} (pass ${attempt + 1})`);
      result = await run(join(this.home, 'tlpkg/tlperl/bin/perl.exe'), [join(this.home, 'texmf-dist/scripts/latexmk/latexmk.pl'), '-norc', '-g', flag, '-interaction=nonstopmode', '-halt-on-error', '-file-line-error', '-no-shell-escape', '-outdir=.build', project.main], { cwd: directory, env: this.environment(), signal: job.signal, log: job.log, allowFailure: true, timeout: 180_000 });
      if (result.code === 0) break;
      const missing = result.output.match(/(?:LaTeX Error: File|I can't find file)\s*[`']([a-zA-Z0-9_.-]+\.(?:sty|cls|bst|def|fd))[`']/)?.[1];
      if (!missing) break;
      job.log(`Resolving missing TeX dependency: ${missing}`);
      const search = await this.tlmgr(['search', '--global', '--file', `/${missing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`], job);
      const pkg = search.output.match(/^([a-zA-Z0-9][\w.-]*):\s*$/m)?.[1];
      if (!pkg) break;
      await this.tlmgr(['install', pkg], job);
    }
    const base = project.main.split('/').pop().replace(/\.tex$/i, '');
    let log = result.output;
    try { log += '\n' + await readFile(join(build, `${base}.log`), 'utf8'); } catch {}
    if (result.code !== 0) {
      try { log += '\n' + await readFile(join(build, `${base}.blg`), 'utf8'); } catch {}
    }
    const diagnostics = parseDiagnostics(log);
    const pdf = join(build, `${base}.pdf`);
    const success = result.code === 0;
    if (success) {
      await access(pdf);
      await writeFile(join(build, 'last-success.pdf'), await readFile(pdf));
    }
    const report = { success, engine: project.engine, sourceUpdatedAt: project.updatedAt, compiledAt: new Date().toISOString(), diagnostics, log: log.slice(-100_000), pdf: success ? pdf : null };
    await writeFile(join(build, 'report.json'), JSON.stringify(report));
    return report;
  }

  async prepareDocumentPackages(source, job) {
    const packages = [];
    if (/\\documentclass(?:\[[^\]]*\])?\{acmart\}/.test(source)) packages.push('libertine', 'inconsolata', 'newtx');
    if (/\\(?:usepackage(?:\[[^\]]*\])?\{[^}]*biblatex|addbibresource)/.test(source)) packages.push('biber');
    const missing = [];
    for (const pkg of packages) {
      try { await access(join(this.home, 'tlpkg/tlpobj', `${pkg}.tlpobj`)); }
      catch { missing.push(pkg); }
    }
    if (missing.length) { job.log(`Installing required document dependencies: ${missing.join(', ')}`); await this.tlmgr(['install', ...missing], job); }
  }
}

export function run(command, args, { cwd, env, signal, log = () => {}, timeout = 300_000, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, windowsHide: true, windowsVerbatimArguments: command.toLowerCase().endsWith('cmd.exe'), stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; let reason;
    const stop = () => { reason = new Error('Operation cancelled'); kill(); };
    const kill = () => {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
      else child.kill('SIGTERM');
    };
    const timer = setTimeout(() => { reason = new Error(`Process timed out after ${timeout / 1000}s`); kill(); }, timeout);
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    const receive = data => { const value = data.toString(); output = (output + value).slice(-250_000); log(value.trimEnd()); };
    child.stdout.on('data', receive); child.stderr.on('data', receive);
    child.on('error', error => { clearTimeout(timer); signal?.removeEventListener('abort', stop); reject(error); });
    child.on('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', stop);
      if (reason) reject(reason);
      else if (code && !allowFailure) reject(new Error(`${command.split(/[\\/]/).pop()} exited with ${code}: ${output.slice(-3000)}`));
      else resolve({ code, output });
    });
  });
}

export function parseDiagnostics(log) {
  const diagnostics = []; const seen = new Set();
  for (const line of log.split(/\r?\n/)) {
    const at = line.match(/^(.+?\.tex):(\d+):\s*(.+)/);
    const missing = line.match(/Citation [`']([^`']+)' .*undefined/);
    const bibliographyError = /^(?:Illegal,|I couldn't open|I found no|You're missing|Too many commas)|\bERROR - /.test(line);
    const problem = at || bibliographyError || /^!|LaTeX (?:Error|Warning)|(?:Package|Class) .+ Warning|Overfull \\[hv]box|Underfull \\[hv]box/.test(line);
    if (!problem || seen.has(line)) continue;
    seen.add(line);
    diagnostics.push({ severity: at || bibliographyError || /^!/.test(line) ? 'error' : 'warning', message: at ? at[3] : line, file: at ? at[1].replace(/^\.\//, '') : null, line: at ? Number(at[2]) : null, hint: bibliographyError ? '检查参考文献样式是否重复声明，以及 .bib 文件和引用键。' : missing ? `Check BibTeX key ${missing[1]}` : /Overfull/.test(line) ? '检查过宽公式、表格或图片；双栏图片使用 figure*。' : /undefined control sequence/i.test(line) ? '检查命令拼写与所需的 usepackage。' : null });
  }
  return diagnostics;
}
