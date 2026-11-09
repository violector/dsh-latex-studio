import { readFile, writeFile, mkdir, readdir, cp, stat, access, rm, rename } from 'node:fs/promises';
import { join, resolve, relative, extname, posix } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { unzipSync, zipSync } from 'fflate';
import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import { Runtime } from './runtime.mjs';
import { escapeTex } from './latex.mjs';
import { isWithinPath, remapPath } from './file-paths.mjs';

const textExtensions = new Set(['.tex', '.bib', '.sty', '.cls', '.bst', '.txt', '.md', '.csv', '.ins', '.dtx', '.json']);
const hash = content => createHash('sha256').update(content).digest('hex');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = (path, value) => writeFile(path, JSON.stringify(value, null, 2));

export class Studio {
  constructor({ root = join(homedir(), '.dsh', 'latex-studio'), templates = fileURLToPath(new URL('../templates/', import.meta.url)), download = fetch } = {}) {
    this.root = root; this.templates = templates; this.download = download;
    this.runtime = new Runtime(join(root, 'runtime'), download);
    this.jobs = new Map(); this.compilerTail = Promise.resolve();
    this.ready = this.prepareProjects();
  }

  async prepareProjects() {
    await mkdir(join(this.root, 'projects'), { recursive: true });
    const instructions = '# LaTeX Studio writing workspace\n\nEach child directory is a manuscript project. Its directory name is the projectId for the latex_* tools. Read .project.json or call latex_project project to obtain the main file and template. Use latex_file read/write to edit actual manuscript files; pass the read hash as baseHash and preserve the history. A selection-edit request must use latex_file replace_selection with the supplied from/to/baseHash and replacement; do not rewrite unselected text. Use latex_file mkdir to create folders. PNG, JPG/JPEG and PDF figures are supported. Compile with latex_compile and poll job before claiming success. Preserve research facts and official template styles; never invent results or references. For questions, answer without changing files unless requested.\n';
    try { await writeFile(join(this.root, 'projects', 'AGENTS.md'), instructions, { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }

  async execute(r) {
    await this.ready;
    switch (r.action) {
      case 'status': return this.status();
      case 'catalog': return this.catalog(r.query || '');
      case 'create': return this.create(r.templateId, r.title);
      case 'import': return this.importArchive(r.name, Buffer.from(r.archiveBase64, 'base64'), r.main);
      case 'discover': return this.discover(r.query);
      case 'download_template': {
        const response = await this.download(r.url, { signal: AbortSignal.timeout(120_000) });
        if (!response.ok) throw new Error(`Template download failed: HTTP ${response.status}`);
        return this.importArchive(r.name, Buffer.from(await response.arrayBuffer()), undefined, r.url);
      }
      case 'project': return this.project(r.projectId);
      case 'activate': await writeJson(join(this.root, 'active.json'), { projectId: r.projectId }); return this.project(r.projectId);
      case 'rename_project': {
        const project = await this.manifest(r.projectId);
        project.title = r.title;
        // updatedAt tracks source changes; renaming must not invalidate a compiled PDF.
        await this.saveManifest(project);
        return this.project(r.projectId);
      }
      case 'delete_project': return this.deleteProject(r.projectId);
      case 'configure': {
        const p = await this.manifest(r.projectId);
        await access(this.file(r.projectId, r.main));
        Object.assign(p, { main: r.main, engine: r.engine, updatedAt: new Date().toISOString() });
        await this.saveManifest(p); return this.project(r.projectId);
      }
      case 'read': return this.read(r.projectId, r.path);
      case 'mkdir': {
        await this.manifest(r.projectId);
        await mkdir(this.file(r.projectId, r.path), { recursive: true });
        return this.project(r.projectId);
      }
      case 'write': return this.write(r.projectId, r.path, r.content, r.baseHash);
      case 'rename_file': return this.renameFile(r.projectId, r.path, r.name);
      case 'delete_file': return this.deleteFile(r.projectId, r.path);
      case 'replace_selection': {
        const current = await this.read(r.projectId, r.path);
        if (current.content === undefined || r.from >= r.to || r.to > current.content.length) throw new Error('选区范围无效，请重新选择正文。');
        return this.write(r.projectId, r.path, current.content.slice(0, r.from) + r.replacement + current.content.slice(r.to), r.baseHash);
      }
      case 'upload': return this.write(r.projectId, r.path, Buffer.from(r.base64, 'base64'));
      case 'history': return this.history(r.projectId, r.path);
      case 'restore': {
        const entry = (await this.history(r.projectId, r.path)).find(e => e.id === r.revision);
        if (!entry) throw new Error('Revision not found');
        return this.write(r.projectId, r.path, await readFile(join(this.dir(r.projectId), '.history', entry.id)));
      }
      case 'runtime_install': return this.startJob('runtime', job => this.serialCompile(() => this.runtime.install(job)));
      case 'compile': return this.startJob(`compile:${r.projectId}`, job => this.serialCompile(async () => this.runtime.compile(await this.manifest(r.projectId), this.dir(r.projectId), job)));
      case 'job': return this.job(r.jobId);
      case 'cancel_job': this.jobs.get(r.jobId)?.controller.abort(); return { cancelled: true };
      case 'bibliography': return this.bibliography(r.projectId);
      case 'doi': return this.addDoi(r.projectId, r.doi, r.path);
      case 'export': return this.export(r.projectId, r.kind);
      default: throw new Error(`Unknown action: ${r.action}`);
    }
  }

  dir(id) { return join(this.root, 'projects', id); }
  file(id, path) { return join(this.dir(id), path); }
  manifest(id) { return readJson(join(this.dir(id), '.project.json')); }
  saveManifest(project) { return writeJson(join(this.dir(project.id), '.project.json'), project); }

  async status() {
    const projects = [];
    for (const entry of await readdir(join(this.root, 'projects'), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        try { projects.push(await this.manifest(entry.name)); } catch {}
      }
    }
    let activeProject = null;
    try { activeProject = (await readJson(join(this.root, 'active.json'))).projectId; } catch {}
    return { projects: projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), activeProject, runtime: await this.runtime.status(), dataDirectory: this.root, jobs: [...this.jobs.keys()].map(id => this.job(id)) };
  }

  async catalog(query) {
    const items = await readJson(join(this.templates, 'catalog.json'));
    const q = query.toLowerCase().trim();
    if (!q) return items;
    const words = q.split(/[\s，,]+/);
    return items.map(item => {
      const haystack = [item.id, item.name, item.category, ...item.aliases].join(' ').toLowerCase();
      return { ...item, score: words.reduce((n, word) => n + (haystack.includes(word) ? word.length : 0), 0) };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  }

  async create(templateId, title) {
    const template = (await this.catalog('')).find(t => t.id === templateId);
    if (!template) throw new Error('Template not found');
    const id = randomUUID(); const directory = this.dir(id);
    await mkdir(directory, { recursive: true });
    await cp(join(this.templates, template.directory), directory, { recursive: true });
    const main = await readFile(join(directory, template.main), 'utf8');
    await writeFile(join(directory, template.main), main.replaceAll('LATEX_STUDIO_TITLE', escapeTex(title)));
    const project = { id, title, templateId, templateName: template.name, source: template.source, main: template.main, engine: template.engine, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await this.saveManifest(project);
    await writeJson(join(this.root, 'active.json'), { projectId: id });
    return this.project(id);
  }

  async importArchive(title, archive, main, source = 'user-upload') {
    const files = unpackArchive(archive);
    let exported = null;
    if (files['latex-studio-project.json']) {
      exported = JSON.parse(Buffer.from(files['latex-studio-project.json']).toString('utf8'));
      if (!['pdflatex', 'xelatex', 'lualatex'].includes(exported.engine) || typeof exported.main !== 'string' || !files[exported.main]) throw new Error('Invalid LaTeX Studio project metadata');
      main ??= exported.main;
    }
    const candidates = Object.keys(files).filter(name => name.endsWith('.tex') && /\\documentclass/.test(Buffer.from(files[name]).toString('utf8')));
    main ??= candidates.find(name => /(^|\/)(main|paper|article)\.tex$/.test(name)) || candidates[0];
    if (!main || !files[main]) throw new Error('ZIP 中没有可编译的主 .tex 文件，请保留 documentclass 声明。');
    const id = randomUUID();
    await mkdir(this.dir(id), { recursive: true });
    for (const [path, content] of Object.entries(files)) {
      const target = this.file(id, path);
      if (path.endsWith('/')) await mkdir(target, { recursive: true });
      else { await mkdir(resolve(target, '..'), { recursive: true }); await writeFile(target, content); }
    }
    const project = { id, title, templateId: null, templateName: 'Imported template', source, main, engine: exported?.engine || (/(?:ctex|fontspec|xeCJK)/.test(Buffer.from(files[main]).toString()) ? 'xelatex' : 'pdflatex'), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await this.saveManifest(project);
    await writeJson(join(this.root, 'active.json'), { projectId: id });
    return this.project(id);
  }

  async project(id) {
    const project = await this.manifest(id);
    let report = null;
    try { report = await readJson(join(this.dir(id), '.build/report.json')); } catch {}
    const entries = await listFiles(this.dir(id), '', true);
    const files = entries.filter(entry => !entry.directory);
    const directories = entries.filter(entry => entry.directory).map(entry => entry.path);
    files.sort((a, b) => (a.path === project.main ? -1 : b.path === project.main ? 1 : Number(/\.(tex|bib)$/.test(b.path)) - Number(/\.(tex|bib)$/.test(a.path))));
    return { ...project, directory: this.dir(id), files, directories, report };
  }

  async deleteProject(id) {
    await this.manifest(id);
    this.requireCompileIdle(id);
    const status = await this.status();
    await rm(this.dir(id), { recursive: true });
    if (status.activeProject === id) await writeJson(join(this.root, 'active.json'), { projectId: null });
    return { deletedProjectId: id };
  }

  async renameFile(id, path, name) {
    const project = await this.manifest(id);
    const nextPath = posix.join(posix.dirname(path), name);
    await this.checkFileRename(project, path, nextPath);
    if (path === nextPath) return { project: await this.project(id), path: nextPath };
    await rename(this.file(id, path), this.file(id, nextPath));
    await this.remapHistory(id, path, nextPath);
    project.main = remapPath(project.main, path, nextPath);
    project.updatedAt = new Date().toISOString();
    await this.saveManifest(project);
    return { project: await this.project(id), path: nextPath };
  }

  async deleteFile(id, path) {
    const project = await this.manifest(id);
    this.requireCompileIdle(id);
    if (isWithinPath(project.main, path)) throw new Error('目标包含编译主文件，请先在编译设置中选择其他主文件后再删除。');
    await rm(this.file(id, path), { recursive: true });
    project.updatedAt = new Date().toISOString();
    await this.saveManifest(project);
    return this.project(id);
  }

  requireCompileIdle(id) {
    if ([...this.jobs.values()].some(job => job.kind === `compile:${id}` && job.status === 'running')) throw new Error('该文稿正在编译，请等待完成或停止编译后再操作。');
  }

  async checkFileRename(project, path, nextPath) {
    this.requireCompileIdle(project.id);
    await access(this.file(project.id, path));
    if (isWithinPath(project.main, path) && !remapPath(project.main, path, nextPath).endsWith('.tex')) throw new Error('编译主文件需保留 .tex 扩展名。');
    const names = await readdir(this.file(project.id, posix.dirname(path)));
    if (names.some(name => name !== posix.basename(path) && name.toLowerCase() === posix.basename(nextPath).toLowerCase())) throw new Error('目标名称已存在，请换一个名称。');
  }

  async remapHistory(id, from, to) {
    const directory = join(this.dir(id), '.history');
    let names;
    try { names = await readdir(directory); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const name of names.filter(name => name.endsWith('.json'))) {
      const revision = await readJson(join(directory, name));
      if (isWithinPath(revision.path, from)) await writeJson(join(directory, name), { ...revision, path: remapPath(revision.path, from, to) });
    }
  }

  async read(id, path) {
    const bytes = await readFile(this.file(id, path));
    return { path, hash: hash(bytes), size: bytes.length, ...(textExtensions.has(extname(path).toLowerCase()) ? { content: bytes.toString('utf8') } : { base64: bytes.toString('base64') }) };
  }

  async write(id, path, content, baseHash) {
    const project = await this.manifest(id); const target = this.file(id, path);
    let previous = null;
    try { previous = await readFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (baseHash && (!previous || hash(previous) !== baseHash)) throw new Error('文件已被 AI 或其他编辑器修改。请重新打开文件后再保存。');
    if (previous && !previous.equals(Buffer.from(content))) {
      const directory = join(this.dir(id), '.history'); await mkdir(directory, { recursive: true });
      const idRevision = randomUUID();
      await writeFile(join(directory, idRevision), previous);
      await writeJson(join(directory, `${idRevision}.json`), { id: idRevision, path, savedAt: new Date().toISOString(), size: previous.length });
    }
    await mkdir(resolve(target, '..'), { recursive: true }); await writeFile(target, content);
    project.updatedAt = new Date().toISOString(); await this.saveManifest(project);
    return { path, hash: hash(content), size: Buffer.byteLength(content) };
  }

  async history(id, path) {
    const directory = join(this.dir(id), '.history');
    let names;
    try { names = await readdir(directory); } catch { return []; }
    const entries = await Promise.all(names.filter(n => n.endsWith('.json')).map(n => readJson(join(directory, n))));
    return entries.filter(e => e.path === path).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  startJob(kind, operation) {
    const existing = [...this.jobs.values()].find(j => j.kind === kind && j.status === 'running');
    if (existing) return this.job(existing.id);
    const id = randomUUID(); const controller = new AbortController();
    const entry = { id, kind, status: 'running', logs: [], result: null, error: null, startedAt: new Date().toISOString(), controller };
    this.jobs.set(id, entry);
    Promise.resolve().then(() => operation({ signal: controller.signal, log: line => { entry.logs.push(line); if (entry.logs.length > 500) entry.logs.shift(); } })).then(result => { entry.result = result; entry.status = 'done'; }, error => { entry.error = error.message; entry.status = controller.signal.aborted ? 'cancelled' : 'error'; });
    return this.job(id);
  }

  job(id) {
    const job = this.jobs.get(id); if (!job) throw new Error('Job not found');
    const { controller, ...value } = job; return value;
  }

  serialCompile(operation) {
    // tlmgr mutates a shared TeX tree; compiler and package jobs must use it in order.
    const task = this.compilerTail.then(operation); this.compilerTail = task.catch(() => {}); return task;
  }

  async bibliography(id) {
    const files = await listFiles(this.dir(id)); const diagnostics = []; const keys = new Map(); let entries = 0;
    for (const file of files.filter(f => f.path.endsWith('.bib'))) {
      const content = await readFile(this.file(id, file.path), 'utf8');
      try { entries += new Cite(content, { forceType: '@bibtex/text' }).data.length; }
      catch (error) { diagnostics.push({ severity: 'error', file: file.path, message: error.message }); }
      for (const match of content.matchAll(/@(?!(?:comment|string|preamble)\b)[\w-]+\s*[{(]\s*([^,\s]+)\s*,/gi)) {
        const key = match[1];
        if (keys.has(key)) diagnostics.push({ severity: 'error', file: file.path, message: `Duplicate citation key: ${key} (also in ${keys.get(key)})` });
        else keys.set(key, file.path);
      }
    }
    for (const file of files.filter(f => f.path.endsWith('.tex'))) {
      const content = (await readFile(this.file(id, file.path), 'utf8')).replace(/(?<!\\)%[^\n]*/g, '');
      for (const match of content.matchAll(/\\(?:[a-zA-Z]*cite[a-zA-Z]*|nocite)\*?(?:\[[^\]]*\])*\{([^}]+)\}/g)) {
        for (const key of match[1].split(',').map(k => k.trim())) {
          if (key !== '*' && !keys.has(key)) diagnostics.push({ severity: 'error', file: file.path, line: content.slice(0, match.index).split('\n').length, message: `Undefined citation: ${key}` });
        }
      }
    }
    return { entries, keys: [...keys.keys()], diagnostics, valid: diagnostics.length === 0, note: 'Checks syntax, duplicate keys and citations; does not verify the truth of bibliographic claims.' };
  }

  async addDoi(id, doi, path) {
    doi = doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '').trim();
    if (!/^10\.\d{4,9}\/\S+$/i.test(doi)) throw new Error('Invalid DOI');
    const response = await this.download(`https://api.crossref.org/works/${encodeURIComponent(doi)}/transform/application/x-bibtex`, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`DOI lookup failed: HTTP ${response.status}`);
    const bibtex = await response.text(); new Cite(bibtex, { forceType: '@bibtex/text' });
    let old = ''; try { old = await readFile(this.file(id, path), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const key = bibtex.match(/@\w+\s*{\s*([^,]+)/)?.[1];
    if (key && (await this.bibliography(id)).keys.includes(key)) throw new Error(`Citation key ${key} already exists`);
    await this.write(id, path, `${old.trimEnd()}\n\n${bibtex}\n`);
    return { key, bibtex, source: `https://doi.org/${doi}`, path };
  }

  async export(id, kind) {
    const project = await this.manifest(id);
    if (kind === 'pdf') {
      const report = await readJson(join(this.dir(id), '.build/report.json'));
      if (!report.success) throw new Error('最新编译没有成功，请先修复后再导出 PDF。');
      if (project.updatedAt > (report.sourceUpdatedAt || report.compiledAt)) throw new Error('源文件已修改，请重新编译后导出 PDF。');
      return { filename: 'manuscript.pdf', mime: 'application/pdf', base64: (await readFile(report.pdf)).toString('base64') };
    }
    const files = {};
    for (const entry of await listFiles(this.dir(id), '', true)) files[entry.path + (entry.directory ? '/' : '')] = entry.directory ? new Uint8Array() : await readFile(this.file(id, entry.path));
    files['latex-studio-project.json'] = Buffer.from(JSON.stringify({ title: project.title, main: project.main, engine: project.engine, source: project.source }, null, 2));
    return { filename: 'manuscript-source.zip', mime: 'application/zip', base64: Buffer.from(zipSync(files)).toString('base64') };
  }

  async discover(query) {
    const local = await this.catalog(query);
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query + ' official LaTeX template author guidelines')}`;
    const response = await this.download(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + ' official latex template')}`, { signal: AbortSignal.timeout(25_000) });
    if (!response.ok) return { local, candidates: [], searchUrl, message: 'Online search is unavailable. Use the search link or dsh web search and import an official ZIP.' };
    const html = await response.text(); const candidates = [];
    for (const match of html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gs)) {
      const link = new URL(match[1].replaceAll('&amp;', '&'), 'https://duckduckgo.com');
      const url = link.searchParams.get('uddg') || link.href;
      if (url.startsWith('https://')) candidates.push({ title: match[2].replace(/<[^>]*>/g, '').replaceAll('&amp;', '&'), url });
      if (candidates.length === 8) break;
    }
    return { local, candidates, searchUrl, message: 'Search candidates require checking the publisher, year and license before importing; no claim that search results are official.' };
  }

  dispose() { for (const job of this.jobs.values()) if (job.status === 'running') job.controller.abort(); }
}

export async function listFiles(root, base = '', includeDirectories = false) {
  const files = [];
  for (const entry of await readdir(join(root, base), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue;
    const path = base + entry.name;
    if (entry.isDirectory()) {
      if (includeDirectories) files.push({ path, directory: true });
      files.push(...await listFiles(root, path + '/', includeDirectories));
    }
    else if (entry.isFile()) files.push({ path, size: (await stat(join(root, path))).size, editable: textExtensions.has(extname(path).toLowerCase()) });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function unpackArchive(bytes) {
  if (bytes.length > 50_000_000) throw new Error('ZIP must be smaller than 50 MB');
  const raw = unzipSync(bytes, { filter: file => file.originalSize < 50_000_000 });
  const files = {};
  let size = 0;
  for (const [name, content] of Object.entries(raw)) {
    if (name.startsWith('__MACOSX/')) continue;
    if (name.startsWith('/') || name.includes('\\') || name.includes(':') || name.split('/').some(p => p === '..' || p === '.')) throw new Error(`Unsafe ZIP entry: ${name}`);
    if (name.split('/').some(p => p.startsWith('.'))) continue;
    size += content.length; if (size > 150_000_000) throw new Error('Extracted template exceeds 150 MB');
    files[name] = content;
  }
  const names = Object.keys(files); const prefix = names[0]?.split('/')[0] + '/';
  if (names.length && names.every(name => name.startsWith(prefix))) return Object.fromEntries(Object.entries(files).map(([name, data]) => [name.slice(prefix.length), data]));
  return files;
}

