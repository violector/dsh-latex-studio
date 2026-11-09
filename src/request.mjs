import { z } from 'zod';
import { createTypertRemoteInfo } from '@deepseek-ai/dsh-typert-protocol/remote-info';

const text = z.string();
const projectId = text.regex(/^[a-z0-9-]+$/);
const path = text.min(1).max(240).refine(p => !p.includes('\\') && !p.includes(':') && !p.startsWith('/') && !p.split('/').some(s => s === '..' || s === '.' || s.startsWith('.')), 'Use a relative project path without hidden directories');
const entryPath = path.refine(p => p.split('/').every(part => part.length > 0 && part === part.trim() && !part.endsWith('.') && !/[<>"|?*\x00-\x1f]/.test(part)), '请选择有效的项目文件或文件夹路径');
const entryName = text.trim().min(1, '名称不能为空').max(200).refine(name => !/[\\/<>:"|?*\x00-\x1f]/.test(name) && !name.startsWith('.') && !name.endsWith('.'), '名称不能包含路径分隔符、隐藏文件前缀或特殊字符');
const engine = z.enum(['pdflatex', 'xelatex', 'lualatex']);
const action = (name, fields = {}) => z.strictObject({ action: z.literal(name), ...fields });
export const Request = z.discriminatedUnion('action', [
  action('status'), action('catalog', { query: text.optional() }),
  action('create', { templateId: text, title: text.min(1).max(200) }),
  action('import', { name: text.min(1).max(200), archiveBase64: text, main: path.optional() }),
  action('discover', { query: text.min(1).max(200) }),
  action('download_template', { name: text.min(1).max(200), url: z.url().startsWith('https://') }),
  action('project', { projectId }), action('activate', { projectId }),
  action('rename_project', { projectId, title: text.trim().min(1).max(200) }),
  action('delete_project', { projectId }),
  action('configure', { projectId, main: path, engine }),
  action('read', { projectId, path }),
  action('mkdir', { projectId, path }),
  action('rename_file', { projectId, path: entryPath, name: entryName }),
  action('delete_file', { projectId, path: entryPath }),
  action('write', { projectId, path, content: text.max(4_000_000), baseHash: text.optional() }),
  action('replace_selection', { projectId, path, from: z.number().int().nonnegative(), to: z.number().int().positive(), baseHash: text.min(1), replacement: text.max(4_000_000) }),
  action('upload', { projectId, path, base64: text.max(70_000_000) }),
  action('history', { projectId, path }),
  action('restore', { projectId, path, revision: text.regex(/^[a-z0-9-]+$/) }),
  action('compile', { projectId }), action('job', { jobId: text }), action('cancel_job', { jobId: text }),
  action('runtime_install'),
  action('bibliography', { projectId }),
  action('doi', { projectId, doi: text.min(3).max(300), path: path.default('references.bib') }),
  action('export', { projectId, kind: z.enum(['pdf', 'zip']) }),
]);

const codec = (schema, name) => ({ mode: 'strict', typeSymbol: `dsh-latex-studio#${name}`, create: () => schema, jsonSchema: z.toJSONSchema(schema, { unrepresentable: 'any' }) });
const input = codec(Request, 'request');
export const REMOTE = createTypertRemoteInfo({
  package: 'dsh-latex-studio',
  methods: {
    'latexStudio/run': {
      service: 'latexStudio', description: 'Manage local LaTeX projects, templates, files and compiler jobs.',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'request', source: 'json', codec: input, strictCodec: input }],
      result: codec(z.json(), 'result'),
    },
  },
}, z);
