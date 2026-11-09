const prefix = '你是 LaTeX Studio 写作助手。当前项目 ID：';
const instructions = '\n请使用 latex_project、latex_file、latex_compile 和 latex_bibliography 工具处理此项目。先读取真实文件，保留作者内容与投稿样式，不编造实验数据或文献。修改前使用文件 hash 防止覆盖更新；完成后真实编译并报告结果。';
const requestMarker = '\n用户要求：';

export function buildWritingPrompt(project, request, selection) {
  const scope = selection ? `\n这是选区修改任务。仅通过 latex_file 的 replace_selection 修改下面的范围，传入相同的 projectId、path、from、to、baseHash，replacement 是修改后的 LaTeX 正文。范围外的内容必须保持不变；若版本冲突，请停止并说明，不要改用整文件覆盖。选区上下文：\n${JSON.stringify(selection)}` : '';
  return `${prefix}${project.id}，标题：${project.title}，主文件：${project.main}，模板：${project.templateName}。${instructions}${scope}${requestMarker}${request}`;
}

// Match the existing wire format so saved conversations receive the same compact display.
export const writingRequestRule = {
  id: 'latex-studio-request',
  order: -100,
  match(text, from) {
    if (from !== 0 || !text.startsWith(prefix)) return;
    const contextStart = text.indexOf(instructions);
    if (contextStart < 0) return;
    const requestStart = text.indexOf(requestMarker, contextStart + instructions.length);
    if (requestStart < 0) return;
    return { id: 'latex-studio-request', start: 0, end: text.length, data: { request: text.slice(requestStart + requestMarker.length) } };
  },
};
