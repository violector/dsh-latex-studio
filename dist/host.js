// src/host.mjs
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { defineTool } from "@deepseek-ai/dsh-tools";

// src/core.mjs
import { readFile as readFile2, writeFile as writeFile2, mkdir as mkdir2, readdir, cp, stat, access as access2, rm, rename } from "node:fs/promises";
import { join as join2, resolve, relative, extname, posix } from "node:path";
import { homedir } from "node:os";
import { randomUUID, createHash as createHash2 } from "node:crypto";
import { fileURLToPath } from "node:url";
import { unzipSync, zipSync } from "fflate";
import { Cite } from "@citation-js/core";
import "@citation-js/plugin-bibtex";

// src/runtime.mjs
import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, delimiter } from "node:path";
import { createHash } from "node:crypto";
var RUNTIME_VERSION = "v2026.11";
var RUNTIME_URL = `https://github.com/rstudio/tinytex-releases/releases/download/${RUNTIME_VERSION}/TinyTeX-1-windows-${RUNTIME_VERSION}.exe`;
var Runtime = class {
  constructor(root, download = fetch) {
    this.root = root;
    this.home = join(root, "TinyTeX");
    this.download = download;
  }
  async status() {
    try {
      await access(join(this.home, "bin/windows/pdflatex.exe"));
      return { ready: true, version: RUNTIME_VERSION, home: this.home, platform: process.platform };
    } catch {
      return { ready: false, version: RUNTIME_VERSION, home: this.home, platform: process.platform };
    }
  }
  async install(job) {
    if (process.platform !== "win32") throw new Error("This release manages TinyTeX on Windows. macOS/Linux runtime support is not yet available.");
    if ((await this.status()).ready) return this.status();
    await mkdir(this.root, { recursive: true });
    const archive = join(this.root, `TinyTeX-1-windows-${RUNTIME_VERSION}.exe`);
    job.log("Downloading the official TinyTeX runtime (about 74 MB)\u2026");
    const release = await this.download(`https://api.github.com/repos/rstudio/tinytex-releases/releases/tags/${RUNTIME_VERSION}`, { signal: job.signal });
    if (!release.ok) throw new Error(`Cannot read TinyTeX release: HTTP ${release.status}`);
    const metadata = await release.json();
    const asset = metadata.assets.find((a) => a.browser_download_url === RUNTIME_URL);
    if (!asset?.digest?.startsWith("sha256:")) throw new Error("Official TinyTeX checksum is unavailable. Please retry later.");
    let bytes;
    try {
      bytes = await readFile(archive);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (!bytes || `sha256:${createHash("sha256").update(bytes).digest("hex")}` !== asset.digest) {
      const response = await this.download(RUNTIME_URL, { signal: job.signal });
      if (!response.ok) throw new Error(`TinyTeX download failed: HTTP ${response.status}`);
      const chunks = [];
      let received = 0;
      let lastPercent = -10;
      for await (const chunk of response.body) {
        chunks.push(chunk);
        received += chunk.length;
        const percent = Math.floor(received / asset.size * 100);
        if (percent >= lastPercent + 10) {
          job.log(`Download ${percent}%`);
          lastPercent = percent;
        }
      }
      bytes = Buffer.concat(chunks);
    }
    if (`sha256:${createHash("sha256").update(bytes).digest("hex")}` !== asset.digest) throw new Error("TinyTeX download checksum mismatch.");
    await writeFile(archive, bytes);
    job.log("Extracting the private runtime. System PATH and existing TeX installations are not changed.");
    await run(archive, ["-y"], { cwd: this.root, signal: job.signal, log: job.log });
    await writeFile(join(this.root, "runtime.json"), JSON.stringify({ version: RUNTIME_VERSION, source: RUNTIME_URL, sha256: asset.digest, installedAt: (/* @__PURE__ */ new Date()).toISOString() }, null, 2));
    await this.tlmgr(["option", "repository", "https://mirror.ctan.org/systems/texlive/tlnet"], job);
    return this.status();
  }
  environment() {
    return { ...process.env, LC_ALL: "C", LC_CTYPE: "C", LANG: "C", PATH: [join(this.home, "bin/windows"), join(this.home, "tlpkg/tlperl/bin"), process.env.PATH].join(delimiter), TEXMFHOME: join(this.root, "texmf"), openin_any: "p", openout_any: "p" };
  }
  async tlmgr(args, job) {
    const command = process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe";
    const launcher = join(this.home, "bin/windows/tlmgr.bat");
    const commandArgs = (values) => ["/d", "/s", "/c", `"${[launcher, ...values].map((v) => `"${v}"`).join(" ")}"`];
    const options = { cwd: this.home, env: this.environment(), signal: job.signal, log: job.log, timeout: 6e5 };
    try {
      return await run(command, commandArgs(args), options);
    } catch (error) {
      if (!error.message.includes("tlmgr itself needs to be updated") || args[0] === "update") throw error;
      job.log("Updating the private TeX package manager before installing dependencies.");
      await run(command, commandArgs(["update", "--self"]), options);
      return run(command, commandArgs(args), options);
    }
  }
  async compile(project, directory, job) {
    if (!(await this.status()).ready) throw new Error("\u8BF7\u5148\u5728 LaTeX Studio \u5B89\u88C5\u7F16\u8BD1\u73AF\u5883\uFF0C\u6216\u8C03\u7528 latex_runtime \u7684 runtime_install\u3002");
    await this.prepareDocumentPackages(await readFile(join(directory, project.main), "utf8"), job);
    const build = join(directory, ".build");
    await mkdir(build, { recursive: true });
    const flag = { pdflatex: "-pdf", xelatex: "-xelatex", lualatex: "-lualatex" }[project.engine];
    let result;
    for (let attempt = 0; attempt < 20; attempt++) {
      job.log(`Compiling ${project.main} with ${project.engine} (pass ${attempt + 1})`);
      result = await run(join(this.home, "tlpkg/tlperl/bin/perl.exe"), [join(this.home, "texmf-dist/scripts/latexmk/latexmk.pl"), "-norc", "-g", flag, "-interaction=nonstopmode", "-halt-on-error", "-file-line-error", "-no-shell-escape", "-outdir=.build", project.main], { cwd: directory, env: this.environment(), signal: job.signal, log: job.log, allowFailure: true, timeout: 18e4 });
      if (result.code === 0) break;
      const missing = result.output.match(/(?:LaTeX Error: File|I can't find file)\s*[`']([a-zA-Z0-9_.-]+\.(?:sty|cls|bst|def|fd))[`']/)?.[1];
      if (!missing) break;
      job.log(`Resolving missing TeX dependency: ${missing}`);
      const search = await this.tlmgr(["search", "--global", "--file", `/${missing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`], job);
      const pkg = search.output.match(/^([a-zA-Z0-9][\w.-]*):\s*$/m)?.[1];
      if (!pkg) break;
      await this.tlmgr(["install", pkg], job);
    }
    const base = project.main.split("/").pop().replace(/\.tex$/i, "");
    let log = result.output;
    try {
      log += "\n" + await readFile(join(build, `${base}.log`), "utf8");
    } catch {
    }
    if (result.code !== 0) {
      try {
        log += "\n" + await readFile(join(build, `${base}.blg`), "utf8");
      } catch {
      }
    }
    const diagnostics = parseDiagnostics(log);
    const pdf = join(build, `${base}.pdf`);
    const success = result.code === 0;
    if (success) {
      await access(pdf);
      await writeFile(join(build, "last-success.pdf"), await readFile(pdf));
    }
    const report = { success, engine: project.engine, sourceUpdatedAt: project.updatedAt, compiledAt: (/* @__PURE__ */ new Date()).toISOString(), diagnostics, log: log.slice(-1e5), pdf: success ? pdf : null };
    await writeFile(join(build, "report.json"), JSON.stringify(report));
    return report;
  }
  async prepareDocumentPackages(source, job) {
    const packages = [];
    if (/\\documentclass(?:\[[^\]]*\])?\{acmart\}/.test(source)) packages.push("libertine", "inconsolata", "newtx");
    if (/\\(?:usepackage(?:\[[^\]]*\])?\{[^}]*biblatex|addbibresource)/.test(source)) packages.push("biber");
    const missing = [];
    for (const pkg of packages) {
      try {
        await access(join(this.home, "tlpkg/tlpobj", `${pkg}.tlpobj`));
      } catch {
        missing.push(pkg);
      }
    }
    if (missing.length) {
      job.log(`Installing required document dependencies: ${missing.join(", ")}`);
      await this.tlmgr(["install", ...missing], job);
    }
  }
};
function run(command, args, { cwd, env, signal, log = () => {
}, timeout = 3e5, allowFailure = false } = {}) {
  return new Promise((resolve2, reject) => {
    const child = spawn(command, args, { cwd, env, windowsHide: true, windowsVerbatimArguments: command.toLowerCase().endsWith("cmd.exe"), stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let reason;
    const stop = () => {
      reason = new Error("Operation cancelled");
      kill();
    };
    const kill = () => {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
      else child.kill("SIGTERM");
    };
    const timer = setTimeout(() => {
      reason = new Error(`Process timed out after ${timeout / 1e3}s`);
      kill();
    }, timeout);
    signal?.addEventListener("abort", stop, { once: true });
    if (signal?.aborted) stop();
    const receive = (data) => {
      const value = data.toString();
      output = (output + value).slice(-25e4);
      log(value.trimEnd());
    };
    child.stdout.on("data", receive);
    child.stderr.on("data", receive);
    child.on("error", (error) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      if (reason) reject(reason);
      else if (code && !allowFailure) reject(new Error(`${command.split(/[\\/]/).pop()} exited with ${code}: ${output.slice(-3e3)}`));
      else resolve2({ code, output });
    });
  });
}
function parseDiagnostics(log) {
  const diagnostics = [];
  const seen = /* @__PURE__ */ new Set();
  for (const line of log.split(/\r?\n/)) {
    const at = line.match(/^(.+?\.tex):(\d+):\s*(.+)/);
    const missing = line.match(/Citation [`']([^`']+)' .*undefined/);
    const bibliographyError = /^(?:Illegal,|I couldn't open|I found no|You're missing|Too many commas)|\bERROR - /.test(line);
    const problem = at || bibliographyError || /^!|LaTeX (?:Error|Warning)|(?:Package|Class) .+ Warning|Overfull \\[hv]box|Underfull \\[hv]box/.test(line);
    if (!problem || seen.has(line)) continue;
    seen.add(line);
    diagnostics.push({ severity: at || bibliographyError || /^!/.test(line) ? "error" : "warning", message: at ? at[3] : line, file: at ? at[1].replace(/^\.\//, "") : null, line: at ? Number(at[2]) : null, hint: bibliographyError ? "\u68C0\u67E5\u53C2\u8003\u6587\u732E\u6837\u5F0F\u662F\u5426\u91CD\u590D\u58F0\u660E\uFF0C\u4EE5\u53CA .bib \u6587\u4EF6\u548C\u5F15\u7528\u952E\u3002" : missing ? `Check BibTeX key ${missing[1]}` : /Overfull/.test(line) ? "\u68C0\u67E5\u8FC7\u5BBD\u516C\u5F0F\u3001\u8868\u683C\u6216\u56FE\u7247\uFF1B\u53CC\u680F\u56FE\u7247\u4F7F\u7528 figure*\u3002" : /undefined control sequence/i.test(line) ? "\u68C0\u67E5\u547D\u4EE4\u62FC\u5199\u4E0E\u6240\u9700\u7684 usepackage\u3002" : null });
  }
  return diagnostics;
}

// src/latex.mjs
function escapeTex(text2) {
  return text2.replace(/[\\{}$&#%_^~]/g, (c) => ({ "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "$": "\\$", "&": "\\&", "#": "\\#", "%": "\\%", "_": "\\_", "^": "\\textasciicircum{}", "~": "\\textasciitilde{}" })[c]);
}

// src/file-paths.mjs
var isWithinPath = (path2, parent) => path2 === parent || path2.startsWith(parent + "/");
var remapPath = (path2, from, to) => isWithinPath(path2, from) ? to + path2.slice(from.length) : path2;

// src/core.mjs
var textExtensions = /* @__PURE__ */ new Set([".tex", ".bib", ".sty", ".cls", ".bst", ".txt", ".md", ".csv", ".ins", ".dtx", ".json"]);
var hash = (content) => createHash2("sha256").update(content).digest("hex");
var readJson = async (path2) => JSON.parse(await readFile2(path2, "utf8"));
var writeJson = (path2, value) => writeFile2(path2, JSON.stringify(value, null, 2));
var Studio = class {
  constructor({ root = join2(homedir(), ".dsh", "latex-studio"), templates = fileURLToPath(new URL("../templates/", import.meta.url)), download = fetch } = {}) {
    this.root = root;
    this.templates = templates;
    this.download = download;
    this.runtime = new Runtime(join2(root, "runtime"), download);
    this.jobs = /* @__PURE__ */ new Map();
    this.compilerTail = Promise.resolve();
    this.ready = this.prepareProjects();
  }
  async prepareProjects() {
    await mkdir2(join2(this.root, "projects"), { recursive: true });
    const instructions = "# LaTeX Studio writing workspace\n\nEach child directory is a manuscript project. Its directory name is the projectId for the latex_* tools. Read .project.json or call latex_project project to obtain the main file and template. Use latex_file read/write to edit actual manuscript files; pass the read hash as baseHash and preserve the history. A selection-edit request must use latex_file replace_selection with the supplied from/to/baseHash and replacement; do not rewrite unselected text. Use latex_file mkdir to create folders. PNG, JPG/JPEG and PDF figures are supported. Compile with latex_compile and poll job before claiming success. Preserve research facts and official template styles; never invent results or references. For questions, answer without changing files unless requested.\n";
    try {
      await writeFile2(join2(this.root, "projects", "AGENTS.md"), instructions, { flag: "wx" });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  async execute(r) {
    await this.ready;
    switch (r.action) {
      case "status":
        return this.status();
      case "catalog":
        return this.catalog(r.query || "");
      case "create":
        return this.create(r.templateId, r.title);
      case "import":
        return this.importArchive(r.name, Buffer.from(r.archiveBase64, "base64"), r.main);
      case "discover":
        return this.discover(r.query);
      case "download_template": {
        const response = await this.download(r.url, { signal: AbortSignal.timeout(12e4) });
        if (!response.ok) throw new Error(`Template download failed: HTTP ${response.status}`);
        return this.importArchive(r.name, Buffer.from(await response.arrayBuffer()), void 0, r.url);
      }
      case "project":
        return this.project(r.projectId);
      case "activate":
        await writeJson(join2(this.root, "active.json"), { projectId: r.projectId });
        return this.project(r.projectId);
      case "rename_project": {
        const project = await this.manifest(r.projectId);
        project.title = r.title;
        await this.saveManifest(project);
        return this.project(r.projectId);
      }
      case "delete_project":
        return this.deleteProject(r.projectId);
      case "configure": {
        const p = await this.manifest(r.projectId);
        await access2(this.file(r.projectId, r.main));
        Object.assign(p, { main: r.main, engine: r.engine, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
        await this.saveManifest(p);
        return this.project(r.projectId);
      }
      case "read":
        return this.read(r.projectId, r.path);
      case "mkdir": {
        await this.manifest(r.projectId);
        await mkdir2(this.file(r.projectId, r.path), { recursive: true });
        return this.project(r.projectId);
      }
      case "write":
        return this.write(r.projectId, r.path, r.content, r.baseHash);
      case "rename_file":
        return this.renameFile(r.projectId, r.path, r.name);
      case "delete_file":
        return this.deleteFile(r.projectId, r.path);
      case "replace_selection": {
        const current = await this.read(r.projectId, r.path);
        if (current.content === void 0 || r.from >= r.to || r.to > current.content.length) throw new Error("\u9009\u533A\u8303\u56F4\u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u6B63\u6587\u3002");
        return this.write(r.projectId, r.path, current.content.slice(0, r.from) + r.replacement + current.content.slice(r.to), r.baseHash);
      }
      case "upload":
        return this.write(r.projectId, r.path, Buffer.from(r.base64, "base64"));
      case "history":
        return this.history(r.projectId, r.path);
      case "restore": {
        const entry = (await this.history(r.projectId, r.path)).find((e) => e.id === r.revision);
        if (!entry) throw new Error("Revision not found");
        return this.write(r.projectId, r.path, await readFile2(join2(this.dir(r.projectId), ".history", entry.id)));
      }
      case "runtime_install":
        return this.startJob("runtime", (job) => this.serialCompile(() => this.runtime.install(job)));
      case "compile":
        return this.startJob(`compile:${r.projectId}`, (job) => this.serialCompile(async () => this.runtime.compile(await this.manifest(r.projectId), this.dir(r.projectId), job)));
      case "job":
        return this.job(r.jobId);
      case "cancel_job":
        this.jobs.get(r.jobId)?.controller.abort();
        return { cancelled: true };
      case "bibliography":
        return this.bibliography(r.projectId);
      case "doi":
        return this.addDoi(r.projectId, r.doi, r.path);
      case "export":
        return this.export(r.projectId, r.kind);
      default:
        throw new Error(`Unknown action: ${r.action}`);
    }
  }
  dir(id) {
    return join2(this.root, "projects", id);
  }
  file(id, path2) {
    return join2(this.dir(id), path2);
  }
  manifest(id) {
    return readJson(join2(this.dir(id), ".project.json"));
  }
  saveManifest(project) {
    return writeJson(join2(this.dir(project.id), ".project.json"), project);
  }
  async status() {
    const projects = [];
    for (const entry of await readdir(join2(this.root, "projects"), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        try {
          projects.push(await this.manifest(entry.name));
        } catch {
        }
      }
    }
    let activeProject = null;
    try {
      activeProject = (await readJson(join2(this.root, "active.json"))).projectId;
    } catch {
    }
    return { projects: projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), activeProject, runtime: await this.runtime.status(), dataDirectory: this.root, jobs: [...this.jobs.keys()].map((id) => this.job(id)) };
  }
  async catalog(query) {
    const items = await readJson(join2(this.templates, "catalog.json"));
    const q = query.toLowerCase().trim();
    if (!q) return items;
    const words = q.split(/[\s，,]+/);
    return items.map((item) => {
      const haystack = [item.id, item.name, item.category, ...item.aliases].join(" ").toLowerCase();
      return { ...item, score: words.reduce((n, word) => n + (haystack.includes(word) ? word.length : 0), 0) };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  }
  async create(templateId, title) {
    const template = (await this.catalog("")).find((t) => t.id === templateId);
    if (!template) throw new Error("Template not found");
    const id = randomUUID();
    const directory = this.dir(id);
    await mkdir2(directory, { recursive: true });
    await cp(join2(this.templates, template.directory), directory, { recursive: true });
    const main = await readFile2(join2(directory, template.main), "utf8");
    await writeFile2(join2(directory, template.main), main.replaceAll("LATEX_STUDIO_TITLE", escapeTex(title)));
    const project = { id, title, templateId, templateName: template.name, source: template.source, main: template.main, engine: template.engine, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    await this.saveManifest(project);
    await writeJson(join2(this.root, "active.json"), { projectId: id });
    return this.project(id);
  }
  async importArchive(title, archive, main, source = "user-upload") {
    const files = unpackArchive(archive);
    let exported = null;
    if (files["latex-studio-project.json"]) {
      exported = JSON.parse(Buffer.from(files["latex-studio-project.json"]).toString("utf8"));
      if (!["pdflatex", "xelatex", "lualatex"].includes(exported.engine) || typeof exported.main !== "string" || !files[exported.main]) throw new Error("Invalid LaTeX Studio project metadata");
      main ??= exported.main;
    }
    const candidates = Object.keys(files).filter((name) => name.endsWith(".tex") && /\\documentclass/.test(Buffer.from(files[name]).toString("utf8")));
    main ??= candidates.find((name) => /(^|\/)(main|paper|article)\.tex$/.test(name)) || candidates[0];
    if (!main || !files[main]) throw new Error("ZIP \u4E2D\u6CA1\u6709\u53EF\u7F16\u8BD1\u7684\u4E3B .tex \u6587\u4EF6\uFF0C\u8BF7\u4FDD\u7559 documentclass \u58F0\u660E\u3002");
    const id = randomUUID();
    await mkdir2(this.dir(id), { recursive: true });
    for (const [path2, content] of Object.entries(files)) {
      const target = this.file(id, path2);
      if (path2.endsWith("/")) await mkdir2(target, { recursive: true });
      else {
        await mkdir2(resolve(target, ".."), { recursive: true });
        await writeFile2(target, content);
      }
    }
    const project = { id, title, templateId: null, templateName: "Imported template", source, main, engine: exported?.engine || (/(?:ctex|fontspec|xeCJK)/.test(Buffer.from(files[main]).toString()) ? "xelatex" : "pdflatex"), createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    await this.saveManifest(project);
    await writeJson(join2(this.root, "active.json"), { projectId: id });
    return this.project(id);
  }
  async project(id) {
    const project = await this.manifest(id);
    let report = null;
    try {
      report = await readJson(join2(this.dir(id), ".build/report.json"));
    } catch {
    }
    const entries = await listFiles(this.dir(id), "", true);
    const files = entries.filter((entry) => !entry.directory);
    const directories = entries.filter((entry) => entry.directory).map((entry) => entry.path);
    files.sort((a, b) => a.path === project.main ? -1 : b.path === project.main ? 1 : Number(/\.(tex|bib)$/.test(b.path)) - Number(/\.(tex|bib)$/.test(a.path)));
    return { ...project, directory: this.dir(id), files, directories, report };
  }
  async deleteProject(id) {
    await this.manifest(id);
    this.requireCompileIdle(id);
    const status = await this.status();
    await rm(this.dir(id), { recursive: true });
    if (status.activeProject === id) await writeJson(join2(this.root, "active.json"), { projectId: null });
    return { deletedProjectId: id };
  }
  async renameFile(id, path2, name) {
    const project = await this.manifest(id);
    const nextPath = posix.join(posix.dirname(path2), name);
    await this.checkFileRename(project, path2, nextPath);
    if (path2 === nextPath) return { project: await this.project(id), path: nextPath };
    await rename(this.file(id, path2), this.file(id, nextPath));
    await this.remapHistory(id, path2, nextPath);
    project.main = remapPath(project.main, path2, nextPath);
    project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await this.saveManifest(project);
    return { project: await this.project(id), path: nextPath };
  }
  async deleteFile(id, path2) {
    const project = await this.manifest(id);
    this.requireCompileIdle(id);
    if (isWithinPath(project.main, path2)) throw new Error("\u76EE\u6807\u5305\u542B\u7F16\u8BD1\u4E3B\u6587\u4EF6\uFF0C\u8BF7\u5148\u5728\u7F16\u8BD1\u8BBE\u7F6E\u4E2D\u9009\u62E9\u5176\u4ED6\u4E3B\u6587\u4EF6\u540E\u518D\u5220\u9664\u3002");
    await rm(this.file(id, path2), { recursive: true });
    project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await this.saveManifest(project);
    return this.project(id);
  }
  requireCompileIdle(id) {
    if ([...this.jobs.values()].some((job) => job.kind === `compile:${id}` && job.status === "running")) throw new Error("\u8BE5\u6587\u7A3F\u6B63\u5728\u7F16\u8BD1\uFF0C\u8BF7\u7B49\u5F85\u5B8C\u6210\u6216\u505C\u6B62\u7F16\u8BD1\u540E\u518D\u64CD\u4F5C\u3002");
  }
  async checkFileRename(project, path2, nextPath) {
    this.requireCompileIdle(project.id);
    await access2(this.file(project.id, path2));
    if (isWithinPath(project.main, path2) && !remapPath(project.main, path2, nextPath).endsWith(".tex")) throw new Error("\u7F16\u8BD1\u4E3B\u6587\u4EF6\u9700\u4FDD\u7559 .tex \u6269\u5C55\u540D\u3002");
    const names = await readdir(this.file(project.id, posix.dirname(path2)));
    if (names.some((name) => name !== posix.basename(path2) && name.toLowerCase() === posix.basename(nextPath).toLowerCase())) throw new Error("\u76EE\u6807\u540D\u79F0\u5DF2\u5B58\u5728\uFF0C\u8BF7\u6362\u4E00\u4E2A\u540D\u79F0\u3002");
  }
  async remapHistory(id, from, to) {
    const directory = join2(this.dir(id), ".history");
    let names;
    try {
      names = await readdir(directory);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const name of names.filter((name2) => name2.endsWith(".json"))) {
      const revision = await readJson(join2(directory, name));
      if (isWithinPath(revision.path, from)) await writeJson(join2(directory, name), { ...revision, path: remapPath(revision.path, from, to) });
    }
  }
  async read(id, path2) {
    const bytes = await readFile2(this.file(id, path2));
    return { path: path2, hash: hash(bytes), size: bytes.length, ...textExtensions.has(extname(path2).toLowerCase()) ? { content: bytes.toString("utf8") } : { base64: bytes.toString("base64") } };
  }
  async write(id, path2, content, baseHash) {
    const project = await this.manifest(id);
    const target = this.file(id, path2);
    let previous = null;
    try {
      previous = await readFile2(target);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (baseHash && (!previous || hash(previous) !== baseHash)) throw new Error("\u6587\u4EF6\u5DF2\u88AB AI \u6216\u5176\u4ED6\u7F16\u8F91\u5668\u4FEE\u6539\u3002\u8BF7\u91CD\u65B0\u6253\u5F00\u6587\u4EF6\u540E\u518D\u4FDD\u5B58\u3002");
    if (previous && !previous.equals(Buffer.from(content))) {
      const directory = join2(this.dir(id), ".history");
      await mkdir2(directory, { recursive: true });
      const idRevision = randomUUID();
      await writeFile2(join2(directory, idRevision), previous);
      await writeJson(join2(directory, `${idRevision}.json`), { id: idRevision, path: path2, savedAt: (/* @__PURE__ */ new Date()).toISOString(), size: previous.length });
    }
    await mkdir2(resolve(target, ".."), { recursive: true });
    await writeFile2(target, content);
    project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    await this.saveManifest(project);
    return { path: path2, hash: hash(content), size: Buffer.byteLength(content) };
  }
  async history(id, path2) {
    const directory = join2(this.dir(id), ".history");
    let names;
    try {
      names = await readdir(directory);
    } catch {
      return [];
    }
    const entries = await Promise.all(names.filter((n) => n.endsWith(".json")).map((n) => readJson(join2(directory, n))));
    return entries.filter((e) => e.path === path2).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }
  startJob(kind, operation) {
    const existing = [...this.jobs.values()].find((j) => j.kind === kind && j.status === "running");
    if (existing) return this.job(existing.id);
    const id = randomUUID();
    const controller = new AbortController();
    const entry = { id, kind, status: "running", logs: [], result: null, error: null, startedAt: (/* @__PURE__ */ new Date()).toISOString(), controller };
    this.jobs.set(id, entry);
    Promise.resolve().then(() => operation({ signal: controller.signal, log: (line) => {
      entry.logs.push(line);
      if (entry.logs.length > 500) entry.logs.shift();
    } })).then((result) => {
      entry.result = result;
      entry.status = "done";
    }, (error) => {
      entry.error = error.message;
      entry.status = controller.signal.aborted ? "cancelled" : "error";
    });
    return this.job(id);
  }
  job(id) {
    const job = this.jobs.get(id);
    if (!job) throw new Error("Job not found");
    const { controller, ...value } = job;
    return value;
  }
  serialCompile(operation) {
    const task = this.compilerTail.then(operation);
    this.compilerTail = task.catch(() => {
    });
    return task;
  }
  async bibliography(id) {
    const files = await listFiles(this.dir(id));
    const diagnostics = [];
    const keys = /* @__PURE__ */ new Map();
    let entries = 0;
    for (const file of files.filter((f) => f.path.endsWith(".bib"))) {
      const content = await readFile2(this.file(id, file.path), "utf8");
      try {
        entries += new Cite(content, { forceType: "@bibtex/text" }).data.length;
      } catch (error) {
        diagnostics.push({ severity: "error", file: file.path, message: error.message });
      }
      for (const match of content.matchAll(/@(?!(?:comment|string|preamble)\b)[\w-]+\s*[{(]\s*([^,\s]+)\s*,/gi)) {
        const key = match[1];
        if (keys.has(key)) diagnostics.push({ severity: "error", file: file.path, message: `Duplicate citation key: ${key} (also in ${keys.get(key)})` });
        else keys.set(key, file.path);
      }
    }
    for (const file of files.filter((f) => f.path.endsWith(".tex"))) {
      const content = (await readFile2(this.file(id, file.path), "utf8")).replace(/(?<!\\)%[^\n]*/g, "");
      for (const match of content.matchAll(/\\(?:[a-zA-Z]*cite[a-zA-Z]*|nocite)\*?(?:\[[^\]]*\])*\{([^}]+)\}/g)) {
        for (const key of match[1].split(",").map((k) => k.trim())) {
          if (key !== "*" && !keys.has(key)) diagnostics.push({ severity: "error", file: file.path, line: content.slice(0, match.index).split("\n").length, message: `Undefined citation: ${key}` });
        }
      }
    }
    return { entries, keys: [...keys.keys()], diagnostics, valid: diagnostics.length === 0, note: "Checks syntax, duplicate keys and citations; does not verify the truth of bibliographic claims." };
  }
  async addDoi(id, doi, path2) {
    doi = doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "").trim();
    if (!/^10\.\d{4,9}\/\S+$/i.test(doi)) throw new Error("Invalid DOI");
    const response = await this.download(`https://api.crossref.org/works/${encodeURIComponent(doi)}/transform/application/x-bibtex`, { signal: AbortSignal.timeout(3e4) });
    if (!response.ok) throw new Error(`DOI lookup failed: HTTP ${response.status}`);
    const bibtex = await response.text();
    new Cite(bibtex, { forceType: "@bibtex/text" });
    let old = "";
    try {
      old = await readFile2(this.file(id, path2), "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const key = bibtex.match(/@\w+\s*{\s*([^,]+)/)?.[1];
    if (key && (await this.bibliography(id)).keys.includes(key)) throw new Error(`Citation key ${key} already exists`);
    await this.write(id, path2, `${old.trimEnd()}

${bibtex}
`);
    return { key, bibtex, source: `https://doi.org/${doi}`, path: path2 };
  }
  async export(id, kind) {
    const project = await this.manifest(id);
    if (kind === "pdf") {
      const report = await readJson(join2(this.dir(id), ".build/report.json"));
      if (!report.success) throw new Error("\u6700\u65B0\u7F16\u8BD1\u6CA1\u6709\u6210\u529F\uFF0C\u8BF7\u5148\u4FEE\u590D\u540E\u518D\u5BFC\u51FA PDF\u3002");
      if (project.updatedAt > (report.sourceUpdatedAt || report.compiledAt)) throw new Error("\u6E90\u6587\u4EF6\u5DF2\u4FEE\u6539\uFF0C\u8BF7\u91CD\u65B0\u7F16\u8BD1\u540E\u5BFC\u51FA PDF\u3002");
      return { filename: "manuscript.pdf", mime: "application/pdf", base64: (await readFile2(report.pdf)).toString("base64") };
    }
    const files = {};
    for (const entry of await listFiles(this.dir(id), "", true)) files[entry.path + (entry.directory ? "/" : "")] = entry.directory ? new Uint8Array() : await readFile2(this.file(id, entry.path));
    files["latex-studio-project.json"] = Buffer.from(JSON.stringify({ title: project.title, main: project.main, engine: project.engine, source: project.source }, null, 2));
    return { filename: "manuscript-source.zip", mime: "application/zip", base64: Buffer.from(zipSync(files)).toString("base64") };
  }
  async discover(query) {
    const local = await this.catalog(query);
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query + " official LaTeX template author guidelines")}`;
    const response = await this.download(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + " official latex template")}`, { signal: AbortSignal.timeout(25e3) });
    if (!response.ok) return { local, candidates: [], searchUrl, message: "Online search is unavailable. Use the search link or dsh web search and import an official ZIP." };
    const html = await response.text();
    const candidates = [];
    for (const match of html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gs)) {
      const link = new URL(match[1].replaceAll("&amp;", "&"), "https://duckduckgo.com");
      const url = link.searchParams.get("uddg") || link.href;
      if (url.startsWith("https://")) candidates.push({ title: match[2].replace(/<[^>]*>/g, "").replaceAll("&amp;", "&"), url });
      if (candidates.length === 8) break;
    }
    return { local, candidates, searchUrl, message: "Search candidates require checking the publisher, year and license before importing; no claim that search results are official." };
  }
  dispose() {
    for (const job of this.jobs.values()) if (job.status === "running") job.controller.abort();
  }
};
async function listFiles(root, base = "", includeDirectories = false) {
  const files = [];
  for (const entry of await readdir(join2(root, base), { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "__MACOSX") continue;
    const path2 = base + entry.name;
    if (entry.isDirectory()) {
      if (includeDirectories) files.push({ path: path2, directory: true });
      files.push(...await listFiles(root, path2 + "/", includeDirectories));
    } else if (entry.isFile()) files.push({ path: path2, size: (await stat(join2(root, path2))).size, editable: textExtensions.has(extname(path2).toLowerCase()) });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
function unpackArchive(bytes) {
  if (bytes.length > 5e7) throw new Error("ZIP must be smaller than 50 MB");
  const raw = unzipSync(bytes, { filter: (file) => file.originalSize < 5e7 });
  const files = {};
  let size = 0;
  for (const [name, content] of Object.entries(raw)) {
    if (name.startsWith("__MACOSX/")) continue;
    if (name.startsWith("/") || name.includes("\\") || name.includes(":") || name.split("/").some((p) => p === ".." || p === ".")) throw new Error(`Unsafe ZIP entry: ${name}`);
    if (name.split("/").some((p) => p.startsWith("."))) continue;
    size += content.length;
    if (size > 15e7) throw new Error("Extracted template exceeds 150 MB");
    files[name] = content;
  }
  const names = Object.keys(files);
  const prefix = names[0]?.split("/")[0] + "/";
  if (names.length && names.every((name) => name.startsWith(prefix))) return Object.fromEntries(Object.entries(files).map(([name, data]) => [name.slice(prefix.length), data]));
  return files;
}

// src/request.mjs
import { z } from "zod";
import { createTypertRemoteInfo } from "@deepseek-ai/dsh-typert-protocol/remote-info";
var text = z.string();
var projectId = text.regex(/^[a-z0-9-]+$/);
var path = text.min(1).max(240).refine((p) => !p.includes("\\") && !p.includes(":") && !p.startsWith("/") && !p.split("/").some((s) => s === ".." || s === "." || s.startsWith(".")), "Use a relative project path without hidden directories");
var entryPath = path.refine((p) => p.split("/").every((part) => part.length > 0 && part === part.trim() && !part.endsWith(".") && !/[<>"|?*\x00-\x1f]/.test(part)), "\u8BF7\u9009\u62E9\u6709\u6548\u7684\u9879\u76EE\u6587\u4EF6\u6216\u6587\u4EF6\u5939\u8DEF\u5F84");
var entryName = text.trim().min(1, "\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A").max(200).refine((name) => !/[\\/<>:"|?*\x00-\x1f]/.test(name) && !name.startsWith(".") && !name.endsWith("."), "\u540D\u79F0\u4E0D\u80FD\u5305\u542B\u8DEF\u5F84\u5206\u9694\u7B26\u3001\u9690\u85CF\u6587\u4EF6\u524D\u7F00\u6216\u7279\u6B8A\u5B57\u7B26");
var engine = z.enum(["pdflatex", "xelatex", "lualatex"]);
var action = (name, fields = {}) => z.strictObject({ action: z.literal(name), ...fields });
var Request = z.discriminatedUnion("action", [
  action("status"),
  action("catalog", { query: text.optional() }),
  action("create", { templateId: text, title: text.min(1).max(200) }),
  action("import", { name: text.min(1).max(200), archiveBase64: text, main: path.optional() }),
  action("discover", { query: text.min(1).max(200) }),
  action("download_template", { name: text.min(1).max(200), url: z.url().startsWith("https://") }),
  action("project", { projectId }),
  action("activate", { projectId }),
  action("rename_project", { projectId, title: text.trim().min(1).max(200) }),
  action("delete_project", { projectId }),
  action("configure", { projectId, main: path, engine }),
  action("read", { projectId, path }),
  action("mkdir", { projectId, path }),
  action("rename_file", { projectId, path: entryPath, name: entryName }),
  action("delete_file", { projectId, path: entryPath }),
  action("write", { projectId, path, content: text.max(4e6), baseHash: text.optional() }),
  action("replace_selection", { projectId, path, from: z.number().int().nonnegative(), to: z.number().int().positive(), baseHash: text.min(1), replacement: text.max(4e6) }),
  action("upload", { projectId, path, base64: text.max(7e7) }),
  action("history", { projectId, path }),
  action("restore", { projectId, path, revision: text.regex(/^[a-z0-9-]+$/) }),
  action("compile", { projectId }),
  action("job", { jobId: text }),
  action("cancel_job", { jobId: text }),
  action("runtime_install"),
  action("bibliography", { projectId }),
  action("doi", { projectId, doi: text.min(3).max(300), path: path.default("references.bib") }),
  action("export", { projectId, kind: z.enum(["pdf", "zip"]) })
]);
var codec = (schema, name) => ({ mode: "strict", typeSymbol: `dsh-latex-studio#${name}`, create: () => schema, jsonSchema: z.toJSONSchema(schema, { unrepresentable: "any" }) });
var input = codec(Request, "request");
var REMOTE = createTypertRemoteInfo({
  package: "dsh-latex-studio",
  methods: {
    "latexStudio/run": {
      service: "latexStudio",
      description: "Manage local LaTeX projects, templates, files and compiler jobs.",
      invocation: { kind: "direct" },
      parameters: [{ name: "request", source: "json", codec: input, strictCodec: input }],
      result: codec(z.json(), "result")
    }
  }
}, z);

// src/host.mjs
import { readFile as readFile3 } from "node:fs/promises";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { join as join3 } from "node:path";
var toolGroups = [
  ["latex_templates", ["catalog", "discover", "create", "download_template", "import"], "Find journal/conference templates locally FIRST: catalog {query}. create {templateId,title}. When no match, discover {query} finds web candidates; verify publisher/year before download_template {name,url} (HTTPS ZIP). import {name,archiveBase64,main?} imports a user ZIP. Do not imply older conference templates match a newer year."],
  ["latex_project", ["status", "project", "activate", "configure", "export"], 'status {} lists projects and activeProject. project/activate {projectId} inspects/chooses one. configure {projectId,main,engine} selects pdflatex/xelatex/lualatex. export {projectId,kind:"pdf"|"zip"} returns a download. Ask for manuscript content instead of inventing scientific results.'],
  ["latex_file", ["read", "write", "replace_selection", "mkdir", "upload", "history", "restore"], "read {projectId,path} before editing. write {projectId,path,content,baseHash?} saves actual UTF-8 manuscript text and keeps history; pass read.hash as baseHash. For a selected-text request ONLY use replace_selection {projectId,path,from,to,baseHash,replacement}; UTF-16 offsets are zero-based, to is exclusive; preserve the supplied range and hash, never rewrite surrounding content. mkdir {projectId,path} creates a folder. upload {projectId,path,base64} adds PNG/JPG/JPEG/PDF figures at the chosen relative path. history {projectId,path}; restore {projectId,path,revision}. Relative slash paths only. Preserve official style files, author facts, equations and citations. Use proper packages for figures, tables, formulas and algorithmicx pseudocode."],
  ["latex_compile", ["compile", "job", "cancel_job"], "compile {projectId} starts a real managed TeX compilation, returns job id. job {jobId} reads completion, PDF path, diagnostics and full log. Only report success when result.success is true. Read diagnostics, make minimal source fixes via latex_file and recompile. Never change margins/fonts to evade submission limits. cancel_job {jobId} stops work."],
  ["latex_bibliography", ["bibliography", "doi"], "bibliography {projectId} validates actual BibTeX syntax, duplicate keys and unresolved citations. doi {projectId,doi,path?} retrieves REAL Crossref BibTeX and appends it; default references.bib. Never fabricate references, DOI identifiers or claim syntax checks verify scientific facts."],
  ["latex_runtime", ["runtime_install", "job"], "runtime_install {} installs an independent official TinyTeX runtime; job {jobId} reads progress. Requires network on first use and when missing packages are installed. Does not use or modify the user system TeX installation."]
];
var LatexStudio = class extends TypertRemoteService {
  static inject = ["tools", "typert", "webServer"];
  constructor(ctx) {
    super(ctx, "latexStudio");
    this.studio = new Studio();
    ctx.typert.register({ package: "dsh-latex-studio", face: "host", schemas: [], invocations: REMOTE.descriptors });
    ctx.effect(() => () => this.studio.dispose());
    for (const [name, actions, description] of toolGroups) {
      ctx.tools.register(defineTool({
        name,
        description,
        parameters: {
          action: { type: "string", required: true, description: `One of: ${actions.join(", ")}` },
          input: { type: "json", required: true, description: "Arguments object for the chosen action; use {} when no arguments are needed." }
        },
        output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
        execute: async ({ action: action2, input: input2 }) => {
          if (!actions.includes(action2)) throw new Error(`Supported actions: ${actions.join(", ")}`);
          const request = Request.parse({ ...input2, action: action2 });
          return JSON.stringify(await this.studio.execute(request));
        }
      }));
    }
    const assets = fileURLToPath2(new URL("./assets/", import.meta.url));
    ctx.effect(() => ctx.webServer.register({
      path: "/latex-studio/assets",
      kind: "prefix",
      resource: async (request) => {
        const file = decodeURIComponent(new URL(request.url).pathname.slice("/latex-studio/assets/".length));
        if (!/^[a-zA-Z0-9_.-]+$/.test(file)) return new Response("Not found", { status: 404 });
        try {
          const data = await readFile3(join3(assets, file));
          const mime = /\.m?js$/.test(file) ? "text/javascript" : file.endsWith(".woff2") ? "font/woff2" : "application/octet-stream";
          return new Response(data, { headers: { "Content-Type": mime, "Cache-Control": "public, max-age=86400" } });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      }
    }));
  }
  async run(request) {
    return this.studio.execute(request);
  }
};
export {
  LatexStudio as default
};
