import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { Studio } from './core.mjs';
import { Request, REMOTE } from './request.mjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const toolGroups = [
  ['latex_templates', ['catalog', 'discover', 'create', 'download_template', 'import'], 'Find journal/conference templates locally FIRST: catalog {query}. create {templateId,title}. When no match, discover {query} finds web candidates; verify publisher/year before download_template {name,url} (HTTPS ZIP). import {name,archiveBase64,main?} imports a user ZIP. Do not imply older conference templates match a newer year.'],
  ['latex_project', ['status', 'project', 'activate', 'configure', 'export'], 'status {} lists projects and activeProject. project/activate {projectId} inspects/chooses one. configure {projectId,main,engine} selects pdflatex/xelatex/lualatex. export {projectId,kind:"pdf"|"zip"} returns a download. Ask for manuscript content instead of inventing scientific results.'],
  ['latex_file', ['read', 'write', 'replace_selection', 'mkdir', 'upload', 'history', 'restore'], 'read {projectId,path} before editing. write {projectId,path,content,baseHash?} saves actual UTF-8 manuscript text and keeps history; pass read.hash as baseHash. For a selected-text request ONLY use replace_selection {projectId,path,from,to,baseHash,replacement}; UTF-16 offsets are zero-based, to is exclusive; preserve the supplied range and hash, never rewrite surrounding content. mkdir {projectId,path} creates a folder. upload {projectId,path,base64} adds PNG/JPG/JPEG/PDF figures at the chosen relative path. history {projectId,path}; restore {projectId,path,revision}. Relative slash paths only. Preserve official style files, author facts, equations and citations. Use proper packages for figures, tables, formulas and algorithmicx pseudocode.'],
  ['latex_compile', ['compile', 'job', 'cancel_job'], 'compile {projectId} starts a real managed TeX compilation, returns job id. job {jobId} reads completion, PDF path, diagnostics and full log. Only report success when result.success is true. Read diagnostics, make minimal source fixes via latex_file and recompile. Never change margins/fonts to evade submission limits. cancel_job {jobId} stops work.'],
  ['latex_bibliography', ['bibliography', 'doi'], 'bibliography {projectId} validates actual BibTeX syntax, duplicate keys and unresolved citations. doi {projectId,doi,path?} retrieves REAL Crossref BibTeX and appends it; default references.bib. Never fabricate references, DOI identifiers or claim syntax checks verify scientific facts.'],
  ['latex_runtime', ['runtime_install', 'job'], 'runtime_install {} installs an independent official TinyTeX runtime; job {jobId} reads progress. Requires network on first use and when missing packages are installed. Does not use or modify the user system TeX installation.'],
];

export default class LatexStudio extends TypertRemoteService {
  static inject = ['tools', 'typert', 'webServer'];

  constructor(ctx) {
    super(ctx, 'latexStudio');
    this.studio = new Studio();
    ctx.typert.register({ package: 'dsh-latex-studio', face: 'host', schemas: [], invocations: REMOTE.descriptors });
    ctx.effect(() => () => this.studio.dispose());
    for (const [name, actions, description] of toolGroups) {
      ctx.tools.register(defineTool({
        name, description,
        parameters: {
          action: { type: 'string', required: true, description: `One of: ${actions.join(', ')}` },
          input: { type: 'json', required: true, description: 'Arguments object for the chosen action; use {} when no arguments are needed.' },
        },
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
        execute: async ({ action, input }) => {
          if (!actions.includes(action)) throw new Error(`Supported actions: ${actions.join(', ')}`);
          const request = Request.parse({ ...input, action });
          return JSON.stringify(await this.studio.execute(request));
        },
      }));
    }
    const assets = fileURLToPath(new URL('./assets/', import.meta.url));
    ctx.effect(() => ctx.webServer.register({
      path: '/latex-studio/assets', kind: 'prefix',
      resource: async request => {
        const file = decodeURIComponent(new URL(request.url).pathname.slice('/latex-studio/assets/'.length));
        if (!/^[a-zA-Z0-9_.-]+$/.test(file)) return new Response('Not found', { status: 404 });
        try {
          const data = await readFile(join(assets, file));
          const mime = /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
          return new Response(data, { headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400' } });
        } catch { return new Response('Not found', { status: 404 }); }
      },
    }));
  }

  async run(request) { return this.studio.execute(request); }
}
