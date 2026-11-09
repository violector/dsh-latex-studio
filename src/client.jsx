import React, { useState, useEffect, useRef, useMemo } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { foldAll, unfoldAll } from '@codemirror/language';
import * as pdfjs from 'pdfjs-dist';
import { REMOTE } from './request.mjs';
import { snippet, insertSnippet, addPackages } from './snippets.mjs';
import { latexExtensions } from './latex-editor.mjs';
import { buildWritingPrompt, writingRequestRule } from './writing-request.mjs';
import { isWithinPath, remapPath } from './file-paths.mjs';
import styles from './style.css';

const ASSETS = new URL('/latex-studio/assets/', location.href).href;
pdfjs.GlobalWorkerOptions.workerSrc = ASSETS + 'pdf.worker.min.mjs';
const labels = { all: '全部模板', computer: '计算机科学', biology: '生物与医学', multidisciplinary: '综合期刊', general: '通用写作' };
const defaultLayout = { chat: 280, projects: 210, files: 145, editor: .52, zoom: 1 };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const unwrap = result => { if (!result.ok) throw new Error(result.error?.message || JSON.stringify(result.error)); return result.value; };
const fromBase64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const toBase64 = bytes => { let out = ''; for (let i = 0; i < bytes.length; i += 32768) out += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(out); };

export const inject = ['slots', 'remote', 'remote.session', 'sessions', 'uiConversation'];
export async function apply(ctx) {
  ctx.uiConversation.userText.register(writingRequestRule);
  ctx.slots.inject('conversation.user.text.node', () => ctx.slots.register({ name: 'conversation.user.text.node', key: writingRequestRule.id }, ({ node }) => <span className="ls-writing-request" style={{ whiteSpace: 'pre-wrap' }}>{node.data.request}</span>));
  await ctx.remote.$mount(REMOTE);
  ctx.inject(['remote.latexStudio'], ctx => {
  const api = async request => unwrap(await ctx.remote.latexStudio.run(request));
  const connectChat = async project => {
    const storageKey = `latex-studio-session:${project.id}`;
    let sessionId = localStorage.getItem(storageKey);
    if (!sessionId) {
      sessionId = unwrap(await ctx.remote.session.create({ cwd: project.directory })).sessionId;
      localStorage.setItem(storageKey, sessionId);
    }
    const reference = ctx.sessions.retain(sessionId, { source: 'latex-studio' });
    try { await reference.ready; return reference; }
    catch (error) { reference.release(); throw error; }
  };
  const assist = async (sessionId, project, request, selection) => {
    const text = buildWritingPrompt(project, request, selection);
    unwrap(await ctx.remote.session.prompt({ requestId: crypto.randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text }], clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
  };
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'latex-studio', children: { 'latex-studio.chat': { kind: 'single', scope: 'session' } } }, props => <StudioApp {...props} api={api} assist={assist} connectChat={connectChat} />));
  ctx.slots.inject('latex-studio.chat', () => ctx.slots.register({ name: 'latex-studio.chat' }, NativeConversation));
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'latex-studio', order: 15, label: () => 'LaTeX Studio' }, () => <Icon name="book" />));
  });
}

function Icon({ name = 'book', size = 20 }) {
  const paths = { book: 'M4 3h11l5 5v13H4z M14 3v6h6 M8 12h8 M12 12v6 M9 18h6', play: 'm8 5 11 7-11 7z', plus: 'M12 5v14 M5 12h14', search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0', arrow: 'M19 12H5 M11 6l-6 6 6 6', spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z', folder: 'M3 7h7l2 2h9v11H3z M3 7V4h7l2 3h7v2', file: 'M5 3h10l4 4v14H5z M9 12h6 M9 16h6', download: 'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5', check: 'm5 12 4 4L19 6', close: 'm6 6 12 12 M18 6 6 18' };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.file} /></svg>;
}

function NativeConversation({ useSession, renderFactorySlot, onRunning }) {
  const running = useSession(session => session.running);
  const opening = useSession(session => session.openState);
  useEffect(() => { onRunning(running); return () => onRunning(false); }, [running, onRunning]);
  return renderFactorySlot('conversation.content', { variant: 'embedded', phase: opening === 'loading' ? 'settling' : 'active', hero: false });
}

function StudioApp({ api, assist, connectChat, SessionProvider, renderSlot }) {
  const [status, setStatus] = useState(null), [templates, setTemplates] = useState([]), [project, setProject] = useState(null);
  const [file, setFile] = useState(null), [text, setText] = useState(''), [savedText, setSavedText] = useState('');
  const [query, setQuery] = useState(''), [category, setCategory] = useState('all');
  const [modal, setModal] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), [job, setJob] = useState(null), [pdf, setPdf] = useState(null), [tab, setTab] = useState('pdf');
  const [bib, setBib] = useState(null), [discover, setDiscover] = useState(null);
  const [chatProject, setChatProject] = useState(null), [chatReference, setChatReference] = useState(null), [aiRunning, setAiRunning] = useState(false);
  const [selection, setSelection] = useState(null), [selectedDirectory, setSelectedDirectory] = useState(''), [viewMode, setViewMode] = useState('split');
  const [layout, setLayout] = useState(readLayout);
  const shell = useRef(null), chatPane = useRef(null), projectsPane = useRef(null), filesPane = useRef(null), editorPane = useRef(null), previewPane = useRef(null), workbench = useRef(null);
  const editor = useRef(null), uploadInput = useRef(null), zipInput = useRef(null);
  const dirty = text !== savedText;
  const assetPdf = useMemo(() => /\.pdf$/i.test(file?.path || '') && file?.base64 ? fromBase64(file.base64) : null, [file?.path, file?.hash]);
  const perform = async fn => { setError(''); setBusy(true); try { return await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const refreshStatus = async () => { const value = await api({ action: 'status' }); setStatus(value); return value; };
  useEffect(() => { localStorage.setItem('latex-studio-layout:v1', JSON.stringify(layout)); }, [layout]);
  useEffect(() => {
    const zoom = event => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || !['+', '=', '-', '0'].includes(event.key)) return;
      event.preventDefault(); event.stopImmediatePropagation(); setSelection(null);
      setLayout(value => ({ ...value, zoom: event.key === '0' ? 1 : clamp(Math.round((value.zoom + (event.key === '-' ? -.1 : .1)) * 10) / 10, .6, 2) }));
    };
    window.addEventListener('keydown', zoom, true);
    return () => window.removeEventListener('keydown', zoom, true);
  }, []);
  useEffect(() => { perform(async () => { const value = await refreshStatus(); setTemplates(await api({ action: 'catalog' })); if (value.activeProject) setChatProject(await api({ action: 'project', projectId: value.activeProject })); }); }, []);
  useEffect(() => {
    if (!chatProject) return;
    let disposed = false, reference;
    setChatReference(null);
    connectChat(chatProject).then(value => { reference = value; if (disposed) value.release(); else setChatReference(value); }, error => { if (!disposed) setError(error.message); });
    return () => { disposed = true; reference?.release(); };
  }, [chatProject?.id]);
  useEffect(() => {
    if (!project || !file || dirty || file.projectId !== project.id) return;
    let disposed = false, timer;
    const refresh = async () => {
      try {
        const [nextProject, nextFile] = await Promise.all([api({ action: 'project', projectId: project.id }), api({ action: 'read', projectId: project.id, path: file.path })]);
        if (disposed) return;
        if (nextFile.hash !== file.hash) { setFile({ ...nextFile, projectId: project.id }); setText(nextFile.content || ''); setSavedText(nextFile.content || ''); setSelection(null); setNotice('AI 修改已同步到正文'); }
        setProject(nextProject);
        if (nextProject.report?.compiledAt !== project.report?.compiledAt && nextProject.report?.success && nextProject.updatedAt <= (nextProject.report.sourceUpdatedAt || nextProject.report.compiledAt)) { await loadPdf(project.id); setTab('pdf'); }
      } catch (error) { if (!disposed) setError(error.message); }
      if (!disposed && aiRunning) timer = setTimeout(refresh, 1500);
    };
    refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, [project?.id, file?.path, file?.hash, dirty, aiRunning, project?.report?.compiledAt]);
  useEffect(() => {
    if (!project || !file || file.projectId !== project.id || file.content === undefined) return;
    const key = `latex-studio-draft:${project.id}:${file.path}`;
    if (dirty) localStorage.setItem(key, JSON.stringify({ content: text, baseHash: file.hash }));
    else localStorage.removeItem(key);
  }, [text, savedText, file, project?.id]);
  useEffect(() => {
    if (!dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const timer = setTimeout(() => perform(async () => {
      const next = await api({ action: 'job', jobId: job.id }); setJob(next);
      if (next.status === 'error') setError(next.error);
      if (next.status === 'done') {
        await refreshStatus();
        if (next.kind.startsWith('compile:') && project && next.kind === `compile:${project.id}`) {
          setProject(await api({ action: 'project', projectId: project.id }));
          if (next.result.success) { await loadPdf(project.id); setNotice('编译成功 · PDF 已更新'); setTab('pdf'); }
          else { setPdf(null); setTab('diagnostics'); setNotice('编译未通过，请查看诊断或交给 AI 修复。'); }
        }
      }
    }), 1200);
    return () => clearTimeout(timer);
  }, [job]);

  async function loadPdf(id) { const value = await api({ action: 'export', projectId: id, kind: 'pdf' }); setPdf(fromBase64(value.base64)); }
  async function save() {
    if (!dirty || !file || file.content === undefined) return file;
    const result = await api({ action: 'write', projectId: project.id, path: file.path, content: text, baseHash: file.hash });
    localStorage.removeItem(`latex-studio-draft:${project.id}:${file.path}`);
    setFile({ ...file, ...result, content: text }); setSavedText(text); setNotice('已保存 · 重新编译以更新 PDF');
    return { ...file, ...result, content: text };
  }
  async function openFile(path, id = project.id, saveBefore = true) {
    if (saveBefore && project?.id === id) await save();
    const result = await api({ action: 'read', projectId: id, path });
    setSelection(null); setSelectedDirectory(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
    const draft = JSON.parse(localStorage.getItem(`latex-studio-draft:${id}:${path}`) || 'null');
    setFile({ ...result, projectId: id, hash: draft?.baseHash || result.hash }); setText(draft?.content ?? result.content ?? ''); setSavedText(result.content || '');
    if (draft && draft.baseHash !== result.hash) setError('存在未保存草稿，磁盘文件已更新。请复制需要保留的内容，再通过刷新选择重新载入。');
  }
  async function openProject(id) {
    await save();
    const value = await api({ action: 'activate', projectId: id });
    // Unmount the previous SessionProvider before the effect releases its reference.
    if (chatProject?.id !== id) setChatReference(null);
    setProject(value); setChatProject(value); setPdf(null); setBib(null); setJob(null); setNotice(''); setViewMode('split');
    await openFile(value.main, id, false);
    if (value.report?.success && value.updatedAt <= (value.report.sourceUpdatedAt || value.report.compiledAt)) await loadPdf(id);
  }
  async function renameProject(target, title) {
    const value = await api({ action: 'rename_project', projectId: target.id, title });
    if (project?.id === target.id) setProject(value);
    if (chatProject?.id === target.id) setChatProject(value);
    setModal(null);
    await refreshStatus();
  }
  async function deleteProject(target) {
    await api({ action: 'delete_project', projectId: target.id });
    if (project?.id === target.id) {
      setProject(null); setFile(null); setText(''); setSavedText(''); setPdf(null); setBib(null); setSelection(null); setJob(null); setNotice(''); setSelectedDirectory('');
    }
    if (chatProject?.id === target.id) { setChatReference(null); setChatProject(null); setAiRunning(false); }
    for (const key of Object.keys(localStorage)) {
      if (key === `latex-studio-session:${target.id}` || key.startsWith(`latex-studio-draft:${target.id}:`)) localStorage.removeItem(key);
    }
    setModal(null);
    await refreshStatus();
  }
  async function renameEntry(entry, name) {
    if (file && isWithinPath(file.path, entry.path)) await save();
    const result = await api({ action: 'rename_file', projectId: project.id, path: entry.path, name });
    const prefix = `latex-studio-draft:${project.id}:`;
    for (const key of Object.keys(localStorage).filter(key => key.startsWith(prefix))) {
      const next = prefix + remapPath(key.slice(prefix.length), entry.path, result.path);
      if (next !== key) { localStorage.setItem(next, localStorage.getItem(key)); localStorage.removeItem(key); }
    }
    setProject(result.project); setSelection(null); setPdf(null); setBib(null);
    if (file && isWithinPath(file.path, entry.path)) await openFile(remapPath(file.path, entry.path, result.path), project.id, false);
    setSelectedDirectory(remapPath(selectedDirectory, entry.path, result.path));
    setNotice(`已重命名为 ${result.path}，请检查引用路径并重新编译`);
    setModal(null);
  }
  async function deleteEntry(entry) {
    const value = await api({ action: 'delete_file', projectId: project.id, path: entry.path });
    const prefix = `latex-studio-draft:${project.id}:`;
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(prefix) && isWithinPath(key.slice(prefix.length), entry.path)) localStorage.removeItem(key);
    }
    setProject(value); setSelection(null); setPdf(null); setBib(null);
    if (file && isWithinPath(file.path, entry.path)) {
      setFile(null); setText(''); setSavedText('');
      await openFile(value.main, project.id, false);
    }
    if (isWithinPath(selectedDirectory, entry.path)) setSelectedDirectory(entry.path.split('/').slice(0, -1).join('/'));
    setNotice(`已删除 ${entry.path}，请检查引用并重新编译`);
    setModal(null);
  }
  async function reloadFile(discard = false) {
    if (dirty && !discard) { setModal({ type: 'discard' }); return; }
    localStorage.removeItem(`latex-studio-draft:${project.id}:${file.path}`);
    setProject(await api({ action: 'project', projectId: project.id }));
    await openFile(file.path, project.id, false); setModal(null);
  }
  async function compile() {
    await save();
    setJob(await api({ action: 'compile', projectId: project.id })); setTab('log');
  }
  async function download(kind) {
    await save();
    const result = await api({ action: 'export', projectId: project.id, kind });
    const blob = new Blob([fromBase64(result.base64)], { type: result.mime });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = result.filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  async function importZip(input) {
    if (!input) return;
    const value = await api({ action: 'import', name: input.name.replace(/\.zip$/i, ''), archiveBase64: toBase64(new Uint8Array(await input.arrayBuffer())) });
    await openProject(value.id); await refreshStatus();
  }
  async function upload(files) {
    await save();
    for (const input of files) {
      const path = selectedDirectory ? `${selectedDirectory}/${input.name}` : input.name;
      await api({ action: 'upload', projectId: project.id, path, base64: toBase64(new Uint8Array(await input.arrayBuffer())) });
    }
    setProject(await api({ action: 'project', projectId: project.id })); setNotice('文件已添加');
  }
  async function editSelection(request) {
    const current = await save();
    await assist(chatReference.sessionId, project, request, { projectId: project.id, path: file.path, from: selection.from, to: selection.to, baseHash: current.hash, selectedText: selection.text });
    setSelection(null); setNotice('已交给左侧 dsh AI 修改选区');
  }
  async function insert(kind, options) {
    if (!file?.path.endsWith('.tex')) throw new Error('请先打开一个 .tex 文件。');
    const source = editor.current?.state.doc.toString() ?? text;
    const position = editor.current?.state.selection.main.head ?? source.indexOf('\\end{document}');
    const generated = snippet(kind, { ...options, legacy: /\\usepackage(?:\[[^\]]*\])?\{[^}]*\balgorithmic\b/.test(source) });
    if (file.path !== project.main) {
      const main = await api({ action: 'read', projectId: project.id, path: project.main });
      const content = addPackages(main.content, generated.packages);
      if (content !== main.content) await api({ action: 'write', projectId: project.id, path: project.main, content, baseHash: main.hash });
    }
    setText(insertSnippet(source, position, generated)); setModal(null); setNotice('已插入 LaTeX，并补充所需宏包');
  }
  function beginResize(pane) {
    setSelection(null);
    const width = ref => ref.current.getBoundingClientRect().width / layout.zoom;
    if (pane === 'chat') {
      const start = width(chatPane), max = width(shell) - (project ? width(filesPane) + 464 : width(projectsPane) + 336);
      return delta => setLayout(value => ({ ...value, chat: clamp(start + delta, 200, max) }));
    }
    if (pane === 'projects') {
      const start = width(projectsPane);
      return delta => setLayout(value => ({ ...value, projects: Math.max(140, start + delta) }));
    }
    if (pane === 'files') {
      const start = width(filesPane), max = width(workbench) - (viewMode === 'split' ? 456 : 240);
      return delta => setLayout(value => ({ ...value, files: clamp(start + delta, 100, max) }));
    }
    const start = width(editorPane), total = start + width(previewPane);
    return delta => setLayout(value => ({ ...value, editor: clamp(start + delta, 220, total - 220) / total }));
  }
  function zoomTo(value) { setSelection(null); setLayout(current => ({ ...current, zoom: clamp(Math.round(value * 10) / 10, .6, 2) })); }
  const projectWorking = id => (chatProject?.id === id && aiRunning) || (job?.kind === `compile:${id}` && job.status === 'running');
  const filtered = templates.filter(t => (category === 'all' || t.category === category) && [t.name, t.id, ...t.aliases].join(' ').toLowerCase().includes(query.toLowerCase().trim()));

  return <div className="ls-viewport"><div className="ls-shell" ref={shell} style={{ zoom: layout.zoom, minWidth: layout.chat + (project ? layout.files + (viewMode === 'split' ? 464 : 244) : layout.projects + 336) }}>
    <style>{styles}</style>
    <aside className="ls-chat" ref={chatPane} style={{ width: layout.chat }} aria-label="dsh AI 写作对话"><header className="ls-chat-header"><span><Icon name="spark" size={17} /><strong>dsh AI</strong><i className={aiRunning ? 'running' : ''}>{aiRunning ? '正在处理' : '写作对话'}</i></span><small title={chatProject?.title}>{chatProject?.title || '你的论文写作助手'}</small></header><div className="ls-native-chat">{chatReference ? <SessionProvider session={chatReference}>{renderSlot('latex-studio.chat', { onRunning: setAiRunning })}</SessionProvider> : <div className="ls-chat-empty"><Icon name="spark" size={30}/><strong>{chatProject ? '正在连接写作会话…' : '随时与 AI 一起写作'}</strong><p>打开或创建文稿后，在这里提问、补写正文，或选中文字提出修改要求。</p></div>}</div></aside>
    <ResizeHandle label="对话栏宽度" value={layout.chat} zoom={layout.zoom} onStart={() => beginResize('chat')} onReset={() => setLayout(value => ({ ...value, chat: defaultLayout.chat }))} />
    <div className="ls-root">
    <input ref={zipInput} type="file" accept=".zip" hidden onChange={e => { perform(() => importZip(e.target.files[0])); e.target.value = ''; }} />
    <input ref={uploadInput} type="file" multiple hidden onChange={e => { perform(() => upload([...e.target.files])); e.target.value = ''; }} />
    <header className="ls-topbar">
      <div className="ls-brand"><span className="ls-brand-icon"><Icon /></span><strong>LaTeX Studio</strong><span className="ls-beta">PREVIEW</span></div>
      <div className="ls-top-actions"><span className={`ls-runtime ${status?.runtime.ready ? 'ready' : ''}`}><i />{status?.runtime.ready ? '独立编译环境已就绪' : '编译环境待安装'}</span>{!status?.runtime.ready && <button onClick={() => perform(async () => { setJob(await api({ action: 'runtime_install' })); })} disabled={busy || job?.status === 'running'}>安装编译环境</button>}<div className="ls-zoom-controls" aria-label="界面缩放"><button aria-label="缩小界面" title="Ctrl / ⌘ −" onClick={() => zoomTo(layout.zoom - .1)}>−</button><button aria-label="恢复界面缩放" title="Ctrl / ⌘ 0：恢复 100%" onClick={() => zoomTo(1)}>{Math.round(layout.zoom * 100)}%</button><button aria-label="放大界面" title="Ctrl / ⌘ +" onClick={() => zoomTo(layout.zoom + .1)}>＋</button></div><button onClick={() => setModal({ type: 'about' })}>使用说明</button></div>
    </header>
    {error && <div className="ls-banner error" role="alert"><span>{error}</span><button aria-label="关闭错误" onClick={() => setError('')}><Icon name="close" size={16} /></button></div>}
    {!project ? <div className="ls-library">
      <aside className="ls-projects" ref={projectsPane} style={{ width: layout.projects }}><div className="ls-section-label">我的文稿 <span>{status?.projects.length || 0}</span></div>{status?.projects.length ? status.projects.map(p => <div key={p.id} className="ls-project-row" data-project-id={p.id}><button className="ls-project-item" title={p.title} disabled={busy} onClick={() => perform(() => openProject(p.id))}><Icon name="file" /><span><strong>{p.title}</strong><small>{p.templateName}</small></span></button><ProjectMenu project={p} busy={busy} working={projectWorking(p.id)} onAction={type => setModal({ type, project: p })} /></div>) : <div className="ls-empty-small">从一个模板开始，<br />文稿会保存在这里。</div>}<button className="ls-import" onClick={() => zipInput.current.click()}><Icon name="plus" size={16} /> 导入模板 / 项目 ZIP</button></aside>
      <ResizeHandle label="我的文稿与模板区宽度" value={layout.projects} zoom={layout.zoom} onStart={() => beginResize('projects')} onReset={() => setLayout(value => ({ ...value, projects: defaultLayout.projects }))} />
      <main className="ls-template-main">{status?.projects.length > 0 && <label className="ls-project-picker">继续写作<select aria-label="打开已有文稿" value="" onChange={event => { if (event.target.value) perform(() => openProject(event.target.value)); }}><option value="">选择已有文稿…</option>{status.projects.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}<div className="ls-hero"><div className="ls-hero-copy"><div className="ls-eyebrow"><span /> YOUR RESEARCH, BEAUTIFULLY WRITTEN</div><h1>把时间留给研究。</h1><p>从一个好想法，到一篇好论文。<br />选择投稿模板，开启你的 AI 写作工作台。</p><div className="ls-hero-details"><span><strong>{templates.length}</strong> 个内置模板</span><span>计算机 · 生命科学</span><span><Icon name="spark" size={13} /> dsh AI 协作</span></div></div><div className="ls-hero-art" aria-hidden="true"><div className="ls-orbit"/><div className="ls-manuscript-back"/><div className="ls-manuscript"><div className="ls-manuscript-kicker">RESEARCH / MANUSCRIPT</div><div className="ls-manuscript-title">Ideas into<br /><em>discovery.</em></div><div className="ls-manuscript-rule"/><div className="ls-manuscript-equation">ℒ(θ) = ⅟ₙ ∑ (ŷᵢ − yᵢ)²</div><div className="ls-manuscript-columns"><i/><i/></div></div><span className="ls-art-note"><Icon name="spark" size={13} /> 灵感，正在成稿</span></div></div>
      <div className="ls-search-row"><div className="ls-search"><Icon name="search" size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索期刊、会议或学科，如 NeurIPS、Bioinformatics" aria-label="搜索模板" />{query && <button onClick={() => setQuery('')} aria-label="清除搜索">×</button>}</div><button onClick={() => perform(async () => { setDiscover(await api({ action: 'discover', query: query || 'latex journal template' })); setModal({ type: 'discover' }); })}>在线查找</button><button onClick={() => setModal({ type: 'download' })}>导入官方链接</button></div>
      <div className="ls-filters">{Object.entries(labels).map(([key, label]) => <button key={key} aria-pressed={category === key} className={category === key ? 'active' : ''} onClick={() => setCategory(key)}>{label}</button>)}<span aria-live="polite">{filtered.length} 个内置模板</span></div>
      <div className="ls-template-grid" key={category + query}>{filtered.map((t, index) => <TemplateCard template={t} index={index} key={t.id} onSelect={() => setModal({ type: 'create', template: t })} />)}</div>
      {!filtered.length && <div className="ls-empty">没有找到匹配模板。可以在线查找官方模板，或直接导入 ZIP。</div>}
      <p className="ls-library-note">内置真实样式文件，可直接建稿。首次编译会下载缺失宏包；投稿前请核对年份、匿名要求和期刊专属说明。</p></main>
    </div> : <>
      <div className="ls-project-bar"><button className="ls-back" onClick={() => perform(async () => { await save(); setProject(null); setFile(null); await refreshStatus(); })}><Icon name="arrow" size={17} /> 模板与文稿</button><div className="ls-project-title"><strong title={project.title}>{project.title}</strong><small>{project.templateName}</small></div><ProjectMenu project={project} busy={busy} working={projectWorking(project.id)} onAction={type => setModal({ type, project })} /><div className="ls-project-controls"><select className="ls-view-mode" aria-label="工作区视图" value={viewMode} onChange={event => { setViewMode(event.target.value); setSelection(null); }}><option value="split">源码与 PDF</option><option value="source">仅源码</option><option value="pdf">仅 PDF</option></select><button onClick={() => setModal({ type: 'settings' })}>{project.engine} ▾</button><button onClick={() => perform(save)} disabled={!dirty || busy}>{dirty ? '保存修改' : '已保存'}</button><button className="ls-ai" onClick={() => setModal({ type: 'assist' })}><Icon name="spark" size={16} /> AI 助手</button><button className="ls-primary ls-compile-button" aria-busy={job?.status === 'running'} disabled={job?.status === 'running' || busy || !status?.runtime.ready} onClick={() => perform(compile)}>{job?.status === 'running' ? <span className="ls-spinner" /> : <Icon name="play" size={15} />}{job?.status === 'running' ? '编译中…' : '编译 PDF'}</button></div></div>
      <div className="ls-workbench" ref={workbench} data-view={viewMode}><aside className="ls-files" ref={filesPane} style={{ width: layout.files }}><div className="ls-section-label">项目文件<button title="添加文件" aria-label="添加文件" onClick={() => uploadInput.current.click()}><Icon name="plus" size={17} /></button></div><FileTree project={project} currentFile={file?.path} selectedDirectory={selectedDirectory} onDirectory={setSelectedDirectory} onFile={path => perform(() => openFile(path))} zoom={layout.zoom} busy={busy} working={projectWorking(project.id)} onAction={(type, entry) => { setError(''); setModal({ type, entry }); }} /><div className="ls-upload-location" title={selectedDirectory || '根目录'}>上传到：{selectedDirectory || '根目录'}<small>PNG · JPG · JPEG · PDF</small></div><div className="ls-file-tools"><button onClick={() => setModal({ type: 'newfolder' })}><Icon name="folder" size={14}/> 新建文件夹</button><button onClick={() => setModal({ type: 'newfile' })}>＋ 新建源文件</button><button onClick={() => perform(async () => { await save(); setBib(await api({ action: 'bibliography', projectId: project.id })); setTab('bib'); })}>校验参考文献</button><button onClick={() => setModal({ type: 'doi' })}>通过 DOI 添加文献</button><button onClick={() => perform(() => download('zip'))}><Icon name="download" size={14} /> 导出源文件</button></div></aside>
      <ResizeHandle label="目录栏宽度" value={layout.files} zoom={layout.zoom} onStart={() => beginResize('files')} onReset={() => setLayout(value => ({ ...value, files: defaultLayout.files }))} />
      <section className="ls-editor-column" ref={editorPane} style={{ flex: `${layout.editor} 1 0` }}><div className="ls-editor-heading"><span>{file?.path || '选择文件'}{dirty ? ' ●' : ''}</span><div><button title="刷新 AI 修改后的文件" onClick={() => perform(() => reloadFile())}>刷新</button><button onClick={() => perform(async () => setModal({ type: 'history', revisions: await api({ action: 'history', projectId: project.id, path: file.path }) }))}>历史</button></div></div>
      <div className="ls-insertbar"><span>插入</span>{[['equation', '公式'], ['figure', '图片'], ['table', '表格'], ['algorithm', '伪代码']].map(([kind, label]) => <button key={kind} disabled={!file?.path.endsWith('.tex')} onClick={() => setModal({ type: 'insert', kind })}>{label}</button>)}<div className="ls-fold-controls"><button title="折叠全部模块 · Ctrl / ⌘ Alt [" disabled={!file?.path.endsWith('.tex')} onClick={() => editor.current && foldAll(editor.current)}>折叠</button><button title="展开全部模块 · Ctrl / ⌘ Alt ]" disabled={!file?.path.endsWith('.tex')} onClick={() => editor.current && unfoldAll(editor.current)}>展开</button></div></div>
      {file?.content !== undefined ? <Editor value={text} onChange={setText} editorRef={editor} fileKey={`${project.id}:${file.path}`} onSelection={file.path.endsWith('.tex') ? setSelection : undefined} onSave={() => perform(save)} /> : <div className={`ls-asset-preview ${/\.pdf$/i.test(file?.path || '') ? 'is-pdf' : ''}`}>{file && /\.pdf$/i.test(file.path) ? <PdfPreview bytes={assetPdf} zoom={layout.zoom} /> : file && /\.(png|jpe?g)$/i.test(file.path) ? <img src={`data:image/${/png$/i.test(file.path) ? 'png' : 'jpeg'};base64,${file.base64}`} alt={file.path} /> : <><Icon name="file" size={48} /><p>{file?.path}</p><p>资源文件 · 可用于 LaTeX 引用</p></>}</div>}
      {selection && <SelectionEditor key={`${file.path}:${selection.from}:${selection.to}`} selection={selection} zoom={layout.zoom} busy={busy || !chatReference} onClose={() => setSelection(null)} onSubmit={request => perform(() => editSelection(request))} />}<div className="ls-editor-status"><span>UTF-8 · {text.split('\n').length} 行</span><span>{dirty ? '修改尚未保存' : notice || '文稿存储在本机'}</span></div></section>
      {viewMode === 'split' && <ResizeHandle label="正文与 PDF 宽度" value={layout.editor * 100} unit="%" zoom={layout.zoom} onStart={() => beginResize('editor')} onReset={() => setLayout(value => ({ ...value, editor: defaultLayout.editor }))} />}
      <section className="ls-preview-column" ref={previewPane} style={{ flex: `${1 - layout.editor} 1 0` }}><div className="ls-preview-tabs">{[['pdf', 'PDF 预览'], ['diagnostics', `诊断 ${project.report?.diagnostics.length || ''}`], ['log', '编译日志'], ['bib', '参考文献']].map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={key === tab ? 'active' : ''}>{label}</button>)}<button className="ls-download-pdf" disabled={!pdf} title="下载 PDF" aria-label="下载 PDF" onClick={() => perform(() => download('pdf'))}><Icon name="download" size={16} /></button></div>
      {tab === 'pdf' && (pdf ? <PdfPreview bytes={pdf} zoom={layout.zoom} /> : <div className="ls-preview-placeholder"><div className="ls-paper"><div className="ls-paper-title"/><div/><div/><div className="short"/><div className="ls-paper-columns"><section/><section/></div></div><h3>论文，从这里成形</h3><p>点击「编译 PDF」预览你的文稿</p></div>)}
      {tab === 'diagnostics' && <div className="ls-diagnostics">{project.report ? <><div className={`ls-build-result ${project.report.success ? 'success' : ''}`}>{project.report.success ? '✓ 编译成功' : '编译未通过'}<small>{new Date(project.report.compiledAt).toLocaleString()}</small></div>{project.report.diagnostics.map((d, i) => <button key={i} className={`ls-diagnostic ${d.severity}`} onClick={() => perform(async () => { const path = d.file?.replace(/^\.\//, ''); if (path && project.files.some(f => f.path === path)) await openFile(path); if (d.line && editor.current) { const at = editor.current.state.doc.line(Math.min(d.line, editor.current.state.doc.lines)).from; editor.current.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at) }); editor.current.focus(); } })}><strong>{d.file || 'LaTeX'}{d.line ? `:${d.line}` : ''}</strong><span>{d.message}</span>{d.hint && <small>{d.hint}</small>}</button>)}{!project.report.success && <button className="ls-ai" onClick={() => setModal({ type: 'assist', prompt: '请分析最新编译日志，修复编译问题并重新编译。' })}>让 AI 修复编译问题</button>}</> : <p>编译后会显示错误、警告及源码位置。</p>}</div>}
      {tab === 'log' && <div className="ls-log-area">{job?.status === 'running' && <button onClick={() => perform(() => api({ action: 'cancel_job', jobId: job.id }))}>停止编译</button>}<pre>{job?.logs.join('\n') || project.report?.log || '尚未开始编译。'}</pre></div>}
      {tab === 'bib' && <div className="ls-diagnostics">{bib ? <><div className={`ls-build-result ${bib.valid ? 'success' : ''}`}>{bib.valid ? '✓ BibTeX 校验通过' : '发现引用问题'}<small>{bib.entries} 条记录 · {bib.keys.length} 个引用键</small></div>{bib.diagnostics.map((d, i) => <div className="ls-diagnostic error" key={i}><strong>{d.file}</strong><span>{d.message}</span></div>)}<p className="ls-muted">校验语法、重复键与缺失引用，不核验文献内容的真实性。</p></> : <p>点击左侧「校验参考文献」检查整个项目。</p>}</div>}
      </section></div>
    </>}
    {!project && job && <div className="ls-job-banner"><strong>{job.status === 'running' ? '正在准备编译环境…' : job.status === 'done' ? '编译环境已就绪' : '安装未完成'}</strong><span>{job.error || job.logs.at(-1)?.slice(-220)}</span>{job.status === 'running' && <button onClick={() => perform(() => api({ action: 'cancel_job', jobId: job.id }))}>取消</button>}</div>}
    {modal && <Modal title={{ rename_file: modal.entry?.directory ? '重命名文件夹' : '重命名文件', delete_file: modal.entry?.directory ? '删除文件夹' : '删除文件', rename: '重命名文稿', delete: '删除文稿', discard: '重新载入文件', create: '创建文稿', insert: '插入 ' + ({ equation: '公式', figure: '图片', table: '表格', algorithm: '伪代码' }[modal.kind] || ''), assist: '与 dsh AI 一起写作', settings: '编译设置', history: '文件历史', newfolder: '新建文件夹', newfile: '新建文件', doi: '通过 DOI 添加文献', download: '导入官方模板', discover: '在线模板搜索', about: '关于 LaTeX Studio' }[modal.type]} onClose={() => setModal(null)}>
      {['rename_file', 'delete_file'].includes(modal.type) && error && <p className="ls-dialog-action-error" role="alert">{error}</p>}
      {modal.type === 'rename_file' && <TextForm label="新名称" initial={modal.entry.path.split('/').pop()} maxLength={200} button="保存名称" busy={busy || projectWorking(project.id)} onSubmit={name => perform(() => renameEntry(modal.entry, name))}><p className="ls-muted">文件请保留需要的扩展名。主文件的编译入口会同步更新；正文中的图片、子文件和参考文献路径需在重命名后检查。</p></TextForm>}
      {modal.type === 'delete_file' && <div className="ls-delete-project"><p>确定删除{modal.entry.directory ? '文件夹' : '文件'}「<strong>{modal.entry.path}</strong>」？</p><p className="ls-muted">{modal.entry.directory ? '文件夹及其中的所有文件都会被删除。' : '该文件及其未保存草稿将被删除。'}请检查正文中是否仍在引用这些文件。</p>{isWithinPath(project.main, modal.entry.path) && <p role="status">目标包含编译主文件，请先在编译设置中选择其他主文件；如果还没有，请先新建或上传一个 .tex 主文件。</p>}<footer><button autoFocus disabled={busy} onClick={() => setModal(null)}>取消</button>{isWithinPath(project.main, modal.entry.path) ? <button className="ls-primary" onClick={() => setModal({ type: 'settings' })}>打开编译设置</button> : <button className="ls-danger" disabled={busy || projectWorking(project.id)} onClick={() => perform(() => deleteEntry(modal.entry))}>{busy ? '删除中…' : '确认删除'}</button>}</footer></div>}
      {modal.type === 'rename' && <TextForm label="文稿名称" initial={modal.project.title} maxLength={200} button="保存名称" busy={busy} onSubmit={title => perform(() => renameProject(modal.project, title))}><p className="ls-muted">更新文稿列表和工作区中的名称。论文标题可在 LaTeX 正文中编辑。</p></TextForm>}
      {modal.type === 'delete' && <div className="ls-delete-project"><p>确定删除「<strong>{modal.project.title}</strong>」？</p><p className="ls-muted">将永久删除此文稿的源文件、图片、历史版本和编译结果，无法撤销。dsh 对话记录会保留。</p>{projectWorking(modal.project.id) && <p role="status">请等待 AI 处理或编译结束后再删除。</p>}<footer><button autoFocus disabled={busy} onClick={() => setModal(null)}>取消</button><button className="ls-danger" disabled={busy || projectWorking(modal.project.id)} onClick={() => perform(() => deleteProject(modal.project))}>{busy ? '删除中…' : '确认删除'}</button></footer></div>}
      {modal.type === 'create' && <CreateForm template={modal.template} busy={busy} onCreate={title => perform(async () => { const value = await api({ action: 'create', templateId: modal.template.id, title }); await openProject(value.id); setModal(null); await refreshStatus(); })} />}
      {modal.type === 'insert' && <InsertForm kind={modal.kind} project={project} onInsert={options => perform(() => insert(modal.kind, options))} />}
      {modal.type === 'assist' && <TextForm label="描述你需要的帮助" multiline initial={modal.prompt || ''} placeholder="例如：将方法部分整理为学术英语，并添加训练流程伪代码；不要改动实验结论。" button="发送到左侧写作对话" busy={busy || !chatReference} onSubmit={request => perform(async () => { await save(); await assist(chatReference.sessionId, project, request); setModal(null); })}><p className="ls-muted">使用 dsh 当前配置的模型。AI 会在左侧对话中读取此项目、修改源文件并编译；每次修改保留历史，正文自动同步。</p><div className="ls-prompt-examples">可请求：内容润色 · 双栏图片 · 公式推导排版 · 算法伪代码 · 编译修复</div></TextForm>}
      {modal.type === 'doi' && <TextForm label="DOI" placeholder="10.1038/s41586-021-03819-2" button="检索并添加真实文献" busy={busy} onSubmit={doi => perform(async () => { await save(); const result = await api({ action: 'doi', projectId: project.id, doi }); setProject(await api({ action: 'project', projectId: project.id })); setNotice(`已添加文献 ${result.key}`); setModal(null); await openFile('references.bib', project.id, false); })}><p className="ls-muted">通过 Crossref 查询，写入 references.bib。请核对返回的作者、题名和年份。</p></TextForm>}
      {modal.type === 'newfile' && <TextForm label="相对文件路径" initial={selectedDirectory ? selectedDirectory + '/' : ''} placeholder="sections/methods.tex" button="创建文件" busy={busy} onSubmit={path => perform(async () => { if (project.files.some(f => f.path === path)) throw new Error('文件已存在，请直接打开。'); await save(); await api({ action: 'write', projectId: project.id, path, content: '' }); setProject(await api({ action: 'project', projectId: project.id })); await openFile(path); setModal(null); })} />}
      {modal.type === 'newfolder' && <TextForm label="文件夹路径" initial={selectedDirectory ? selectedDirectory + '/' : ''} placeholder="figures 或 figures/results" button="创建文件夹" busy={busy} onSubmit={path => perform(async () => { setProject(await api({ action: 'mkdir', projectId: project.id, path })); setSelectedDirectory(path); setModal(null); setNotice(`已创建文件夹 ${path}，添加文件会上传到这里`); })} />}
      {modal.type === 'settings' && <SettingsForm project={project} busy={busy} onSave={value => perform(async () => { await save(); setProject(await api({ action: 'configure', projectId: project.id, ...value })); setModal(null); })} />}
      {modal.type === 'history' && <div className="ls-history">{modal.revisions.length ? modal.revisions.map(r => <div key={r.id}><span>{new Date(r.savedAt).toLocaleString()}<small>{r.size} bytes</small></span><button onClick={() => perform(async () => { await save(); await api({ action: 'restore', projectId: project.id, path: file.path, revision: r.id }); localStorage.removeItem(`latex-studio-draft:${project.id}:${file.path}`); await openFile(file.path, project.id, false); setModal(null); })}>恢复此版本</button></div>) : <p>尚无历史版本。保存修改后，旧内容会自动保留。</p>}</div>}
      {modal.type === 'discard' && <><p>当前文件有未保存的草稿。重新载入会放弃这份草稿，显示磁盘上的最新内容。</p><footer><button onClick={() => setModal(null)}>继续编辑</button><button className="ls-primary" onClick={() => perform(() => reloadFile(true))}>放弃草稿并重新载入</button></footer></>}
      {modal.type === 'download' && <TextForm label="官方 ZIP 下载地址（HTTPS）" placeholder="https://publisher.example/template.zip" button="下载并导入" busy={busy} onSubmit={url => perform(async () => { const value = await api({ action: 'download_template', name: '在线导入模板', url }); await openProject(value.id); setModal(null); await refreshStatus(); })}><p className="ls-muted">请使用出版社或会议提供的 ZIP 直链。网页链接可以先通过「在线查找」定位下载入口。</p></TextForm>}
      {modal.type === 'discover' && <div className="ls-search-results"><p>检查发布机构、年份与授权后，再导入 ZIP。</p>{discover?.candidates.map(c => <a key={c.url} href={c.url} target="_blank" rel="noreferrer">{c.title}<small>{new URL(c.url).hostname}</small></a>)}{!discover?.candidates.length && <p>搜索服务未返回结果。</p>}<a href={discover?.searchUrl} target="_blank" rel="noreferrer">在浏览器继续搜索 ↗</a><button onClick={() => setModal({ type: 'download' })}>已有官方 ZIP 链接</button></div>}
      {modal.type === 'about' && <div className="ls-about"><p>LaTeX Studio 0.3 · dsh 桌面写作插件</p><ol><li>选择内置模板或导入自己的 ZIP。</li><li>拖动分隔线调整四栏宽度，双击恢复。Ctrl / ⌘ +、−、0 调整界面缩放。</li><li>在左侧与 dsh AI 对话。选中文字后，点击小型「AI 修改」按钮再输入要求。</li><li>点击行号旁箭头折叠章节和环境；工具栏可折叠 / 展开全部模块。</li><li>新建文件夹整理 PNG、JPG / JPEG 和 PDF 图片，插入公式、图表和算法，编译预览并导出文稿。</li></ol><p>项目存储：<code>{status?.dataDirectory}</code></p><p>首次安装独立编译环境需要网络，目前支持 Windows。内置模板按来源快照维护，投稿前请核对具体细则。</p></div>}
    </Modal>}
    </div>
  </div></div>;
}

function ProjectMenu({ project, busy, working, onAction }) {
  const menu = useRef(null);
  return <details className="ls-project-menu" name="latex-studio-project-menu" ref={menu}>
    <summary aria-label={`文稿操作：${project.title}`} title="文稿操作">···</summary>
    <div className="ls-project-menu-items">
      <button disabled={busy} onClick={() => { menu.current.open = false; onAction('rename'); }}>重命名</button>
      <button className="ls-delete-action" disabled={busy || working} title={working ? '请等待 AI 处理或编译结束' : undefined} onClick={() => { menu.current.open = false; onAction('delete'); }}>删除文稿</button>
    </div>
  </details>;
}

function readLayout() {
  try {
    const stored = JSON.parse(localStorage.getItem('latex-studio-layout:v1'));
    const ranges = { chat: [200, 1200], projects: [140, 10000], files: [100, 800], editor: [.1, .9], zoom: [.6, 2] };
    return Object.fromEntries(Object.entries(defaultLayout).map(([key, value]) => [key, Number.isFinite(stored?.[key]) ? clamp(stored[key], ...ranges[key]) : value]));
  } catch { return defaultLayout; }
}

function ResizeHandle({ label, value, unit = 'px', zoom, onStart, onReset }) {
  const drag = useRef(null);
  const end = () => { drag.current = null; document.body.classList.remove('ls-resizing'); };
  useEffect(() => end, []);
  return <div className="ls-resize-handle" role="separator" tabIndex={0} aria-orientation="vertical" aria-label={label} aria-valuenow={Math.round(value)} aria-valuetext={`${Math.round(value)}${unit}`} title="拖动调整宽度 · 双击恢复 · 方向键微调" onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, resize: onStart() }; document.body.classList.add('ls-resizing'); }} onPointerMove={event => { if (drag.current) drag.current.resize((event.clientX - drag.current.x) / zoom); }} onPointerUp={end} onLostPointerCapture={end} onDoubleClick={onReset} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); onStart()((event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 50 : 20)); } else if (event.key === 'Home') { event.preventDefault(); onReset(); } }}><span /></div>;
}

function FileTree({ project, currentFile, selectedDirectory, onDirectory, onFile, zoom, busy, working, onAction }) {
  const [collapsed, setCollapsed] = useState(new Set());
  useEffect(() => { setCollapsed(previous => new Set([...previous].filter(path => !selectedDirectory.startsWith(path + '/')))); }, [selectedDirectory]);
  const entries = [...project.directories.map(path => ({ path, directory: true })), ...project.files].sort((a, b) => a.path.localeCompare(b.path));
  return <div className="ls-file-list" aria-label="文稿文件与文件夹"><button className={!selectedDirectory ? 'ls-folder active' : 'ls-folder'} onClick={() => onDirectory('')}><Icon name="folder" size={14}/><span>根目录</span></button>{entries.filter(entry => ![...collapsed].some(path => entry.path.startsWith(path + '/'))).map(entry => {
    const depth = entry.path.split('/').length - 1;
    return <div key={entry.path} className="ls-file-row"><button data-path={entry.path} data-kind={entry.directory ? 'directory' : 'file'} disabled={busy} className={`${entry.directory ? 'ls-folder' : ''} ${(entry.directory ? selectedDirectory === entry.path : currentFile === entry.path) ? 'active' : ''}`} style={{ paddingLeft: `${9 + depth * 12}px` }} title={entry.path} aria-expanded={entry.directory ? !collapsed.has(entry.path) : undefined} onClick={() => {
      if (!entry.directory) { onFile(entry.path); return; }
      onDirectory(entry.path); setCollapsed(previous => { const next = new Set(previous); if (next.has(entry.path)) next.delete(entry.path); else next.add(entry.path); return next; });
    }}><Icon name={entry.directory ? 'folder' : 'file'} size={14}/><span>{entry.path.split('/').pop()}</span>{entry.directory ? <i>{collapsed.has(entry.path) ? '▸' : '▾'}</i> : entry.path === project.main && <i>主</i>}</button><FileMenu entry={entry} zoom={zoom} disabled={busy || working} onAction={onAction} /></div>;
  })}</div>;
}

function FileMenu({ entry, zoom, disabled, onAction }) {
  const menu = useRef(null), [position, setPosition] = useState({ left: 0, top: 0 });
  return <><button className="ls-file-menu-trigger" aria-label={`${entry.directory ? '文件夹' : '文件'}操作：${entry.path}`} title="重命名 / 删除" disabled={disabled} onClick={event => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(bounds.right - 132 * zoom, window.innerWidth - 132 * zoom - 8)) / zoom, top: Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - 100 * zoom - 8)) / zoom });
    menu.current.showPopover();
  }}>···</button><div ref={menu} popover="auto" className="ls-file-menu" style={position}>
    <button onClick={() => { menu.current.hidePopover(); onAction('rename_file', entry); }}>重命名</button>
    <button className="ls-delete-action" onClick={() => { menu.current.hidePopover(); onAction('delete_file', entry); }}>删除{entry.directory ? '文件夹' : '文件'}</button>
  </div></>;
}

function publishSelection(view, notify) {
  if (!notify) return;
  view.requestMeasure({ key: notify, read: current => {
    const range = current.state.selection.main;
    const rect = range.empty ? null : current.coordsAtPos(range.head);
    return rect ? { from: range.from, to: range.to, text: current.state.sliceDoc(range.from, range.to), left: rect.left, bottom: rect.bottom } : null;
  }, write: notify });
}

function SelectionEditor({ selection, zoom, busy, onClose, onSubmit }) {
  const container = useRef(null), [request, setRequest] = useState(''), [expanded, setExpanded] = useState(false);
  useEffect(() => { container.current.showPopover(); return () => container.current?.hidePopover(); }, []);
  const left = Math.max(12, Math.min(selection.left, window.innerWidth - (expanded ? 360 : 125) * zoom)) / zoom;
  const top = Math.max(12, Math.min(selection.bottom + 8, window.innerHeight - (expanded ? 270 : 45) * zoom)) / zoom;
  return <div ref={container} popover="manual" className={`ls-selection-editor ${expanded ? 'is-expanded' : 'is-compact'}`} style={{ left, top }} role={expanded ? 'dialog' : 'toolbar'} aria-label={expanded ? '修改选中文字' : '选区 AI 工具'}>
    {expanded ? <><header><span><Icon name="spark" size={15}/> AI 修改选区 <small>{selection.text.length} 字符</small></span><div><button aria-label="收起选区修改" onClick={() => setExpanded(false)}>−</button><button aria-label="关闭选区修改" onClick={onClose}><Icon name="close" size={14}/></button></div></header><blockquote>{selection.text.slice(0, 130)}{selection.text.length > 130 ? '…' : ''}</blockquote><form onSubmit={event => { event.preventDefault(); if (request.trim()) onSubmit(request.trim()); }}><textarea autoFocus rows={3} aria-label="选区修改要求" placeholder="例如：改为学术英语，保留公式和原意" value={request} onChange={event => setRequest(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setExpanded(false); }}/><footer><span>仅修改选中内容</span><button className="ls-primary" disabled={busy || !request.trim()}>{busy ? '处理中…' : '交给 AI 修改'}</button></footer></form></> : <><button className="ls-selection-trigger" onMouseDown={event => event.preventDefault()} onClick={() => setExpanded(true)} aria-label="展开 AI 选区修改"><Icon name="spark" size={14}/> AI 修改</button><button className="ls-selection-dismiss" aria-label="关闭选区修改" onMouseDown={event => event.preventDefault()} onClick={onClose}><Icon name="close" size={12}/></button></>}
  </div>;
}

function TemplateCard({ template: t, index, onSelect }) {
  const mark = { article: t.id === 'chinese' ? '中文' : 'Aa', ieee: 'IEEE', acm: 'ACM', neurips: 'NeurIPS', iclr: 'ICLR', icml: 'ICML', acl: 'ACL', cvpr: 'CVPR', lncs: 'LNCS', elsevier: 'Elsevier', springer: 'Springer', plos: 'PLOS', oup: 'Oxford' }[t.family];
  const single = ['article', 'chinese', 'acm-journal', 'neurips-2026', 'iclr-2027', 'iclr-2026', 'lncs', 'elsevier', 'springer-nature', 'bmc', 'nature-methods', 'plos-one', 'plos-biology', 'plos-computational-biology'].includes(t.id);
  return <button className={`ls-template-card ${t.category}`} style={{ '--ls-delay': `${Math.min(index, 7) * 25}ms` }} onPointerMove={event => { const card = event.currentTarget, bounds = card.getBoundingClientRect(); card.style.setProperty('--ls-pointer-x', `${event.clientX - bounds.left}px`); card.style.setProperty('--ls-pointer-y', `${event.clientY - bounds.top}px`); }} onClick={onSelect}>
    <div className="ls-card-preview" aria-hidden="true"><span className="ls-card-mark">{mark}</span><span className="ls-preview-label">版式示意</span><div className={`ls-card-paper ${single ? 'single' : ''}`}><b/><i/><div><span/><span/></div></div></div>
    <div className="ls-card-heading"><span className="ls-card-category">{labels[t.category]}</span><span className="ls-tag">{t.year || t.engine}</span></div>
    <h3>{t.name}</h3><p>{t.aliases.slice(0, 5).join(' · ')}</p>
    <div className="ls-card-footer"><span>{t.validation === 'compiled-on-windows' ? <><Icon name="check" size={12} /> 已验证编译</> : '官方样式起稿'}</span><span>开始写作 <span className="ls-card-arrow">↗</span></span></div>
  </button>;
}

function Editor({ value, onChange, editorRef, fileKey, onSave, onSelection }) {
  const container = useRef(null), change = useRef(onChange), saving = useRef(onSave), selecting = useRef(onSelection);
  change.current = onChange; saving.current = onSave; selecting.current = onSelection;
  useEffect(() => {
    const view = new EditorView({ parent: container.current, state: EditorState.create({ doc: value, extensions: [basicSetup, latexExtensions, EditorView.lineWrapping, EditorView.updateListener.of(update => { if (update.docChanged) { change.current(update.state.doc.toString()); selecting.current?.(null); } else if (update.selectionSet) publishSelection(update.view, selecting.current); }), EditorView.domEventHandlers({ keydown(event) { if (event.key === 'Escape') selecting.current?.(null); if ((event.ctrlKey || event.metaKey) && event.key === 's') { event.preventDefault(); saving.current(); return true; } }, scroll() { selecting.current?.(null); } })] }) });
    editorRef.current = view;
    return () => { view.destroy(); editorRef.current = null; };
  }, [fileKey]);
  useEffect(() => { const view = editorRef.current; if (view && value !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } }); }, [value]);
  return <div className="ls-codemirror" ref={container} />;
}

function PdfPreview({ bytes, zoom = 1 }) {
  const host = useRef(null), [scale, setScale] = useState(1), [width, setWidth] = useState(0), [pages, setPages] = useState(0), [error, setError] = useState('');
  const [density, setDensity] = useState(() => window.devicePixelRatio);
  useEffect(() => { const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width)); observer.observe(host.current); return () => observer.disconnect(); }, []);
  useEffect(() => {
    const screen = window.matchMedia(`(resolution: ${density}dppx)`);
    const update = () => setDensity(window.devicePixelRatio);
    screen.addEventListener('change', update);
    return () => screen.removeEventListener('change', update);
  }, [density]);
  useEffect(() => {
    if (!width) return;
    let cancelled = false; const tasks = [];
    const task = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true, isEvalSupported: false });
    setError(''); host.current.replaceChildren();
    (async () => {
      const document = await task.promise; if (cancelled) return; setPages(document.numPages);
      for (let n = 1; n <= document.numPages; n++) {
        const page = await document.getPage(n); if (cancelled) return;
        const fit = width / page.getViewport({ scale: 1 }).width;
        const viewport = page.getViewport({ scale: fit * scale });
        // CSS zoom scales the displayed canvas after layout; include it in the raster resolution.
        const ratio = Math.max(2, density) * zoom;
        const canvas = window.document.createElement('canvas'); canvas.width = Math.ceil(viewport.width * ratio); canvas.height = Math.ceil(viewport.height * ratio); canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`; canvas.setAttribute('aria-label', `PDF 第 ${n} 页`); host.current.append(canvas);
        canvas.style.alignSelf = scale > 1 ? 'flex-start' : 'center';
        const render = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: [ratio, 0, 0, ratio, 0, 0] }); tasks.push(render); await render.promise;
      }
    })().catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; tasks.forEach(t => t.cancel()); task.destroy(); };
  }, [bytes, scale, width, zoom, density]);
  return <><div className="ls-pdf-controls"><span>{pages} 页</span><button aria-label="缩小 PDF" onClick={() => setScale(s => Math.max(.4, s - .1))}>−</button><span>{Math.round(scale * 100)}%</span><button aria-label="放大 PDF" onClick={() => setScale(s => Math.min(2, s + .1))}>＋</button></div>{error && <p role="alert">{error}</p>}<div className="ls-pdf-pages" ref={host} /></>;
}

function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => { ref.current.showModal(); }, []);
  return <dialog className="ls-dialog" ref={ref} onCancel={e => { e.preventDefault(); onClose(); }}><header><h2>{title}</h2><button aria-label="关闭对话框" onClick={onClose}><Icon name="close" /></button></header><div className="ls-dialog-body">{children}</div></dialog>;
}
function TextForm({ label, placeholder, button, onSubmit, multiline, children, busy, initial = '', maxLength }) {
  const [value, setValue] = useState(initial);
  return <form onSubmit={e => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()); }}><label>{label}{multiline ? <textarea required rows={5} value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} autoFocus /> : <input required value={value} maxLength={maxLength} onChange={e => setValue(e.target.value)} placeholder={placeholder} autoFocus />}</label>{children}<footer><button className="ls-primary" disabled={busy || !value.trim()}>{busy ? '处理中…' : button}</button></footer></form>;
}
function CreateForm({ template, onCreate, busy }) {
  return <><div className="ls-selected-template"><Icon name="file" size={30} /><div><strong>{template.name}</strong><span>{template.year || '通用期刊格式'} · {template.engine}</span></div></div><p>{template.note}</p><TextForm label="文稿标题" placeholder="Your manuscript title" button="创建并开始写作" busy={busy} onSubmit={onCreate}><p className="ls-muted">英文模板请使用英文标题；中文稿请选择 CTeX。<a href={template.source} target="_blank" rel="noreferrer">查看官方来源 ↗</a></p></TextForm></>;
}
function SettingsForm({ project, onSave, busy }) {
  const [main, setMain] = useState(project.main), [engine, setEngine] = useState(project.engine);
  return <form onSubmit={e => { e.preventDefault(); onSave({ main, engine }); }}><label>主文件<select value={main} onChange={e => setMain(e.target.value)}>{project.files.filter(f => f.path.endsWith('.tex')).map(f => <option key={f.path}>{f.path}</option>)}</select></label><label>编译引擎<select value={engine} onChange={e => setEngine(e.target.value)}>{['pdflatex', 'xelatex', 'lualatex'].map(e => <option key={e}>{e}</option>)}</select></label><p className="ls-muted">中文与 fontspec 文稿通常使用 XeLaTeX；期刊模板优先遵守官方引擎设置。</p><footer><button className="ls-primary" disabled={busy}>保存设置</button></footer></form>;
}
function InsertForm({ kind, project, onInsert }) {
  const [options, setOptions] = useState({ formula: 'E = mc^2', path: project.files.find(f => /\.(png|jpe?g|pdf)$/i.test(f.path))?.path || '', width: '0.9', caption: '', columns: 3, rows: 3, wide: false });
  const math = useRef(null);
  const change = (key, value) => setOptions(o => ({ ...o, [key]: value }));
  useEffect(() => {
    if (kind !== 'equation') return;
    const mf = math.current;
    let disposed = false;
    const input = () => change('formula', mf.value);
    (async () => {
      if (!customElements.get('math-field')) await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = ASSETS + 'mathlive.min.js'; script.onload = resolve; script.onerror = reject; document.head.append(script); });
      const Field = customElements.get('math-field'); Field.fontsDirectory = ASSETS; Field.soundsDirectory = null;
      if (disposed) return;
      mf.value = options.formula; mf.mathVirtualKeyboardPolicy = 'manual'; mf.addEventListener('input', input);
    })().catch(() => { if (!disposed) mf.textContent = '可视化控件未加载，请在下方直接输入 LaTeX。'; });
    return () => { disposed = true; mf.removeEventListener('input', input); };
  }, []);
  return <form onSubmit={e => { e.preventDefault(); onInsert(options); }}>
    {kind === 'equation' && <><label>可视化公式输入<math-field ref={math} virtual-keyboard-mode="manual" /></label><label>LaTeX 代码<textarea value={options.formula} rows={3} onChange={e => { change('formula', e.target.value); math.current.value = e.target.value; }} /></label></>}
    {kind === 'figure' && <><label>图片文件<select required value={options.path} onChange={e => change('path', e.target.value)}><option value="">请先从左侧添加图片文件</option>{project.files.filter(f => /\.(png|jpe?g|pdf|eps)$/i.test(f.path)).map(f => <option key={f.path}>{f.path}</option>)}</select></label><label>宽度（相对于当前栏）<input type="number" min="0.1" max="1" step="0.05" value={options.width} onChange={e => change('width', e.target.value)} /></label><label className="ls-checkbox"><input type="checkbox" checked={options.wide} onChange={e => change('wide', e.target.checked)} /> 跨双栏显示（figure*）</label>{project.templateId?.startsWith('plos') && <p className="ls-muted">PLOS 投稿要求图片单独上传。正文图形仅适合内部草稿，投稿稿应保留图注并移除图形。</p>}</>}
    {kind === 'table' && <div className="ls-form-row"><label>列数<input type="number" min="2" max="8" value={options.columns} onChange={e => change('columns', e.target.value)} /></label><label>数据行<input type="number" min="1" max="20" value={options.rows} onChange={e => change('rows', e.target.value)} /></label></div>}
    {kind !== 'equation' && <label>{kind === 'algorithm' ? '算法名称' : '图表标题'}<input value={options.caption} onChange={e => change('caption', e.target.value)} placeholder={kind === 'algorithm' ? 'Iterative optimization' : 'Describe the result'} /></label>}
    {kind === 'algorithm' && <p className="ls-muted">插入可编译的迭代优化示例，并添加 algorithm / algpseudocode 宏包。可以继续让 AI 根据你的方法改写步骤。</p>}
    <footer><button className="ls-primary">插入到光标位置</button></footer>
  </form>;
}
