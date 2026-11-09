import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWritingPrompt, writingRequestRule } from '../src/writing-request.mjs';

const project = { id: 'test-project', title: 'A manuscript', main: 'main.tex', templateName: 'article' };

test('writing requests display only the requirement while retaining model context', () => {
  const request = '帮我补充介绍。\n保留公式 $x + y$、<sample> 和 emoji 📝。\n用户要求：这是正文中的示例。';
  const prompt = buildWritingPrompt(project, request);
  assert.equal(writingRequestRule.match(prompt, 0).data.request, request);
  assert.ok(prompt.includes(project.id) && prompt.includes(project.main) && prompt.includes(project.templateName));
  assert.ok(prompt.includes('latex_compile') && prompt.includes('完成后真实编译并报告结果'));
  assert.equal(writingRequestRule.match(prompt, 1), undefined);
});

test('selection instructions, exact offsets and hash remain in the submitted prompt', () => {
  const selection = { projectId: project.id, path: 'sections/intro.tex', from: 12, to: 42, baseHash: 'file-hash', selectedText: 'Before\n用户要求：这也是选区内容\nAfter' };
  const request = '只改这个选区。';
  const prompt = buildWritingPrompt({ ...project, title: 'Title\n用户要求：标题' }, request, selection);
  const node = writingRequestRule.match(prompt, 0);
  assert.equal(node.data.request, request);
  assert.equal(node.start, 0);
  assert.equal(node.end, prompt.length);
  assert.ok(prompt.includes(JSON.stringify(selection)));
  assert.ok(prompt.includes('仅通过 latex_file 的 replace_selection'));
});

test('existing 0.3.2 conversation text receives compact display without migration', () => {
  const legacy = '你是 LaTeX Studio 写作助手。当前项目 ID：old-project，标题：旧文稿，主文件：main.tex，模板：通用英文论文 / arXiv 起稿。\n请使用 latex_project、latex_file、latex_compile 和 latex_bibliography 工具处理此项目。先读取真实文件，保留作者内容与投稿样式，不编造实验数据或文献。修改前使用文件 hash 防止覆盖更新；完成后真实编译并报告结果。\n这是选区修改任务。选区上下文：\n{"path":"main.tex","selectedText":"Old text"}\n用户要求：添加Agent的发展路线';
  assert.equal(writingRequestRule.match(legacy, 0).data.request, '添加Agent的发展路线');
});

test('ordinary questions and incomplete or quoted prompt examples are left untouched', () => {
  const generated = buildWritingPrompt(project, '帮我写公式。');
  for (const text of ['用户要求：解释 LaTeX', '你是 LaTeX Studio 写作助手。当前项目 ID：hello\n用户要求：不要隐藏', `请分析这个提示词：\n${generated}`, generated.slice(0, generated.indexOf('\n用户要求：'))]) {
    assert.equal(writingRequestRule.match(text, 0), undefined);
  }
});
