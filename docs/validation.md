# 本机验收记录 · 0.3.8 Preview

验证日期：2026-11-07（Asia/Shanghai）。环境：Windows、DeepSeek Harness Desktop 0.2.2-rc.1、插件独立管理的 TinyTeX v2026.11 / TeX Live 2026。

## 验证结果

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| PDF 预览清晰度 | 0.3.8 原生桌面 10 种场景通过 | `test-output/pdf-resolution-results.json`：两页 PDF 在界面 60% / 100% / 120% / 200%、屏幕 DPR 1 / 2 / 3、PDF 自身放大、栏宽调整及上传 PDF 预览下均有足够画布像素，页面比例正常且实际绘制了内容，无 pageerror |
| PDF 文件与原有状态 | 原文稿及布局保留 | 原 PDF 包含嵌入式矢量字体，无低分辨率整页图片；本轮只改变预览，原 PDF 与新编译测试 PDF 的 hash 均未改变，既有 7 篇文稿保留，测试文稿已删除，原活跃文稿与布局已恢复 |
| 项目文件 / 文件夹管理 | 0.3.7 原生桌面通过 | `test-output/file-management-results.json`：文件与目录重命名、同名拒绝、删除取消 / 确认、PNG / JPG / PDF 操作、递归删除、草稿清理、刷新后持久化均通过；目录缩至 100 CSS px 后菜单仍完整显示，无 pageerror |
| 主文件与编辑状态联动 | 真实编译通过 | 带未保存草稿的主文件改名后保持完整正文并成功编译；目录改名同步当前文件与历史版本；删除当前文件回到主文件；选择备用主文件后可删除旧主文件，再次实际编译成功 |
| 文稿重命名 / 删除 | 0.3.6 原生桌面通过 | `test-output/project-management-results.json`：文稿列表与工作区均可重命名，取消删除、删除其他文稿和当前文稿、清理草稿、刷新持久化均通过；既有 7 篇文稿名称 / 正文 hash 和布局设置未变，无 pageerror |
| 重命名后继续写作 | 正文 / PDF / 会话保留 | 独立文稿真实编译后重命名，正文逐字不变、原 PDF 仍可导出、编译时间不变、对话 sessionId 不变；两篇本轮验收文稿均已通过界面删除 |
| 简洁对话气泡 | 0.3.5 真实 dsh 会话通过 | `test-output/clean-chat-results.json`：2 条既有消息、AI 助手新消息和选区新消息都仅展示用户要求；重新加载后保持；插件上下文仍发送给模型 |
| 内置选区上下文 | 真实 AI 修改与编译通过 | 独立文稿 `47f1abc3-48b7-48ea-9385-30dec9e9b182`，仅用自然语言要求替换选区；实际源码与预期逐字一致，自动刷新且生成 PDF；编译时间 `2026-11-07T11:46:00.669Z` |
| 会话切换 | 修复并验证通过 | 切换文稿时先卸载旧 SessionProvider 再释放引用；切回原文稿未出现 pageerror；原正文 hash、栏宽和缩放设置保持不变 |
| 模板首页两栏 | 0.3.2 实际拖动、持久化和窄窗口通过 | `test-output/library-resize-results.json`：120% 缩放下「我的文稿」从 252 调整至 336 px，右侧模板区相应从 770.22 缩至 686.22 px；重载恢复、双击重置、方向键微调及窄窗口先缩后放均通过，无 pageerror |
| 自动化测试 | 0.3.7 的 29 项通过记录保留 | 原 22 项测试全部通过；新增 7 项文件管理测试，覆盖主文件与大小写改名、目录与历史路径迁移、同名冲突、递归删除的范围、主文件保护、编译期间限制与入口校验；0.3.8 仅修改预览渲染，采用下述原生 UI 专项回归 |
| 四栏宽度 | 实际拖动和重新加载后恢复通过 | `test-output/editor-ui-results.json`：对话 / 目录 / 正文 / PDF 从 280 / 145 / 452.91 / 418.08 px 调整为 350 / 185 / 460.72 / 300.27 px，重新加载后保持一致 |
| 缩略选区与缩放 | 实际键盘鼠标操作通过 | 缩略按钮宽度小于 140 px，不抢编辑焦点；删除、撤销、展开 / 收起正常；Ctrl +、Ctrl -、Ctrl 0 生效，缩放后的卡片位置在视口内 |
| TeX 编辑体验 | 原生行号栏折叠与工具栏折叠通过 | 折叠 Introduction 后隐藏下级小节，Methods 仍可见；源码逐字不变；章节、环境、引用、宏包、数学命令和注释呈现不同样式 |
| 新选区流程 AI 集成 | 真实模型写入、自动刷新、编译通过 | `test-output/compact-ai-results.json`；专用验收文稿 `dd7725b2-fbf5-4ce1-a438-a3ef590b32ac`，只改变选区句子，保留换行及全部周围内容 |
| 内置模板编译 | 24 / 24 通过，沿用 0.1.1 验证 | 本次未修改模板或编译器；`templates/validation.json`，原始结果在 `test-output/compile-results.json`；ACL / PLOS 修正后的结果在 `compile-selected-results.json` |
| 参考文献样式 | 24 / 24 生成包含引用键的 `.bbl` | 编译测试实际启用各模板的 bibliography，使用同一条 TeXbook 参考文献检查样式 |
| 综合写作流程 | 三种引擎均通过 | `test-output/workflow-results.json`：pdfLaTeX、XeLaTeX、LuaLaTeX；公式、表格、伪代码、图片与 Crossref DOI |
| 编译错误与恢复 | 通过 | 同一流程中故意加入未定义命令，捕获行号、拒绝导出旧 PDF，再恢复并编译 |
| 原生桌面 UI | 通过，未记录 pageerror | `test-output/ui-results.json`：24 个模板、10 个生物方向入口、公式控件、实际插入 / 保存 / 编译 / PDF 预览、减少动效 |
| 常驻原生 AI 对话 | 真实调用通过 | 新验收文稿 `279b2656-e54e-4d2d-9afb-0e5c5829615d`；原生输入框要求修改 Discussion，实际文件仅改变目标句，三张图和周围正文保留，并真实编译；`test-output/images-chat-results.json` |
| 选区 AI 编辑 | 真实调用通过 | 鼠标 / 键盘选区弹窗发送精确范围和 hash；AI 调用 `replace_selection`，文件与预期逐字一致，正文自动同步；`test-output/feature-ui-results.json` |
| 嵌套文件夹和图片 | 上传、预览、插入、真实编译通过 | `figures/results` 内 PNG、JPG、PDF 三个实际文件，通过界面插入后编译为两页 PDF；`test-output/all-image-formats.pdf` |
| 最终安装包 UI | 0.2.3 通过，无 pageerror | `test-output/final-ui-results.json`：恢复项目原生会话、选区弹窗、无空弹窗残留、图片引用标签自动编号、PDF 实际像素渲染；修复预览滚动条使宽度反复变化的问题 |
| 在线模板查找 | 实际返回 8 个候选 | 以 eLife 为例访问搜索服务；结果仍需要核实发布机构和模板适用范围 |
| 安装包完整性 | 285 个文件逐一一致 | `test-output/installation-results.json`：独立 `.tgz` 安装后与实际插件目录逐文件比较 |
| 深色 / 窄窗口 | 已检查 | 编辑器深色高亮调亮；820 CSS px 插件宽度下主要操作按钮可见 |

## 交付物

- 安装包：`D:\dsh-latex-releases\dsh-latex-studio-0.3.8.tgz`，20,290,361 bytes。
- SHA-256：`d22a70abb205a698a6919d60fb5539e205504a6c6bc89650883af0c0d0cc20da`。
- 源码：`D:\dsh-latex-assistant`；独立源码备份位于 `D:\dsh-latex-releases`。
- 示例文稿：`test-output/validated-manuscript.pdf` 与 `.zip`。
- 原生界面截图：`test-output/dsh-template-library.png`、`dsh-biology-templates.png`、`dsh-editor-pdf.png`、`dsh-equation-dialog.png`、`dsh-editor-dark.png`。
- 本次新增截图：`selection-ai-popup.png`、`folder-pdf-preview.png`、`native-chat-writing.png`、`all-image-formats-pdf.png`；独立页面截图 `images-pdf-page-1.png`、`images-pdf-page-2.png` 均已检查。

0.3.0 新增截图：`compact-selection.png`、`expanded-selection.png`、`section-folded.png`、`resizable-workspace.png`、`compact-ai-result.png`。本次真实 AI 请求从缩略按钮展开卡片后提交，文件修改与预期逐字一致，并成功编译；没有使用模拟 AI。此前 0.2.3 的验收文稿未设置作者，其历史报告中的作者缺失警告仍保留在对应证据中。

0.3.2 首页截图：`test-output/resizable-template-library.png`。复用现有分隔线组件，新增独立的文稿列表宽度设置；宽度不足时保留两栏并允许横向滚动，放大界面后仍能将文稿栏缩窄、重新拉宽。验收结束后保留用户原有对话栏、编辑区和缩放设置。

0.3.5 对话截图：`test-output/compact-chat-history.png`、`compact-chat-result.png`。使用 dsh 原生 `uiConversation.userText` 规则与 keyed Slot 显示用户要求，不修改聊天历史或削减实际模型输入。原生复制 / 编辑仍保留完整请求。`node scripts/test-writing-request-ui.mjs` 每次创建独立验收文稿，真实调用当前 dsh 模型完成选区修改与编译、检查 AI 助手入口、重新加载，并恢复原来打开的文稿；测试捕获页面异常和文本转换错误，本轮均为空。既有验收文稿可能已有用户修改，不应重置它们进行测试。

0.3.6 文稿管理截图：`test-output/project-actions-menu.png`、`delete-project-confirmation.png`。每篇文稿及工作区顶部均有「···」菜单；重命名只更新文稿名称，删除前显示名称与永久删除范围，dsh 对话记录保留。删除当前文稿后关闭其编辑器与会话面板，移除关联草稿并回到模板首页。通过 `node scripts/test-project-management-ui.mjs` 创建两篇独立文稿，实际编译、重命名、取消删除、删除并重新加载验证；退出前恢复原活跃文稿，校验既有文稿和布局未变。没有对既有文稿执行删除。

0.3.7 文件管理截图：`test-output/file-actions-menu.png`、`delete-folder-confirmation.png`。文件与目录均有「···」菜单，使用原生 popover，窄目录栏不会裁切菜单。重命名同步编译入口、历史路径、选中文件 / 目录及草稿键；正文中的图片、子文件、参考文献引用路径保留原样，界面提示检查后重新编译。目标包含主文件时须先更换主文件；编译和当前 AI 操作期间暂停文件管理操作。`node scripts/test-file-management-ui.mjs` 每次创建独立验收文稿，完成上述实际操作并两次编译，之后删除测试项目，恢复原活跃文稿和布局。原有 7 篇文稿的名称及正文 hash 保持一致。

0.3.8 预览画布：`test-output/pdf-resolution-validation.png`。旧版在 120% 界面缩放下将 617 px 宽的画布显示为约 741 px，造成插值模糊；`pdf-preview-before.json` 保存了现场尺寸。新版按 `max(2, devicePixelRatio) × 界面缩放` 生成画布，普通屏幕采用双倍采样；120% 界面下实测 891 px 画布显示为约 445 px，DPR 3 下同样宽度使用 1337 px。两组记录的窗口尺寸不同，不能直接用截图尺寸比较画质。专项脚本 `node scripts/test-pdf-resolution-ui.mjs` 每次创建独立文稿并真实编译两页内容，检查公式、小字号正文、页面比例及预览动作前后的 PDF hash；多种 DPR 使用 CDP 模拟后重载页面验证，不等同于实际跨显示器拖动测试。画布 PNG 已目视检查。安装目录的 285 个文件与 0.3.8 发布包逐一一致。

重现本轮测试：先执行 `node scripts/setup-editor-validation.mjs` 创建独立文稿并编译，再运行 `node scripts/test-editor-ui.mjs`，最后运行 `node scripts/test-compact-ai-ui.mjs`。最后一步实际调用 dsh 当前配置的模型。UI 脚本连接本机测试 Electron 的 CDP 9225 端口。全部脚本只修改各自验收文稿。

## 使用与发布边界

当前完成 Windows 本机预览版验收。尚未公开发布到 npm 或 dsh 插件市场，macOS / Linux 的受管编译器未实现。内置项中有共享出版社样式的期刊预设，编译成功不代表满足每个期刊的所有投稿细则。

作者包原始文件、来源和许可保留在插件内；公开分发前仍需确认没有明确再分发声明的会议 / 出版社作者包的授权。

本机 dsh / pnpm 测试发现两个安装行为：Windows 目录链接切换到压缩包可能清理开发目录；同一路径同版本的本地压缩包会被缓存。后续开发统一使用源码目录外的 `.tgz`，每个新安装候选递增版本，再核对安装内容。本次开发目录已从修改记录完整恢复，并留下独立源码备份；原有文稿和私有编译环境不受影响。
