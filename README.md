# LaTeX Studio for DeepSeek Harness

本机 dsh 桌面版的 LaTeX 写作插件。内置 24 个模板入口，提供源码编辑、公式输入、图表与算法插入、独立编译环境、PDF 预览和 dsh AI 工具。

当前版本：0.3.10 Preview。面向 **Windows 本机 dsh 桌面版**，已在 dsh Desktop 0.2.2-rc.1 验证；macOS / Linux 的受管编译器尚未实现。

## 本机安装与使用

在 **dsh 桌面版附带的终端 / CLI** 中从 GitHub 安装固定版本：

```powershell
dsh plugin --profile desktop add 'git+https://github.com/violector/dsh-latex-studio.git#v0.3.10'
```

也可以从 [GitHub Releases](https://github.com/violector/dsh-latex-studio/releases) 下载 `.tgz`，在下载目录安装：

```powershell
dsh plugin --profile desktop add ./dsh-latex-studio-0.3.10.tgz
```

安装后重新启动 dsh，在左侧打开 **LaTeX Studio**。

模板首页的「我的文稿」与右侧模板区也可拖动分隔线调整宽度，自动记忆；双击分隔线恢复默认，方向键可微调。窄窗口下仍保留这两个区域。

每篇文稿右侧的「···」菜单支持 **重命名 / 删除文稿**，编辑页面顶部也有相同入口。重命名同步更新列表、工作区和对话栏名称，保留论文正文及编译结果。删除需在确认窗口确认，会永久移除此文稿的本机文件、图片、历史版本和编译结果；dsh 对话记录保留。正在编译或当前 AI 正在处理的文稿需等待任务结束后再删除。

项目文件和文件夹旁也有「···」菜单，支持 **重命名 / 删除文件或文件夹**。重命名会同步当前编辑文件、目录、草稿路径、历史版本及主文件的编译入口；同名目标不会被覆盖。删除当前文件后会回到主文件。若目标包含编译主文件，需先在编译设置中更换主文件。文件操作后需要重新编译；正文中的图片、子文件和参考文献引用路径保留原样，需自行检查或交给 AI 调整。

「AI 助手」和选区修改发送的消息只展示用户填写的要求，已有聊天记录同样生效。插件附加的项目、工具和选区上下文仍完整发送给 AI；原生聊天的复制 / 编辑保留原始请求。

PDF 预览会同时适配界面缩放和屏幕像素密度，并在普通屏幕使用更高分辨率渲染。调整栏宽、界面缩放、PDF 缩放或切换不同像素密度的屏幕后都会重新渲染；编译预览和上传的 PDF 图片共用这一显示方式，导出的 PDF 文件不受影响。

1. 选择内置期刊 / 会议模板，填写文稿标题；也可导入自己的 ZIP 或官方 HTTPS ZIP 链接。
2. 首次点击「安装编译环境」。插件下载官方 TinyTeX，并校验 GitHub Release 的 SHA-256。后续缺少宏包时自动从 TeX Live 仓库安装。
3. 编辑 `.tex`、`.bib` 等文件，或使用公式、图片、表格、伪代码插入工具。Ctrl+S 保存；切换面板时保留未保存草稿。
4. **左侧常驻 dsh 原生对话**，每篇文稿保留独立会话。直接提问、要求补写正文，或点击「AI 助手」发送需求；AI 使用 dsh 已配置的模型，通过插件工具读取、修改、编译，已保存的编辑器内容自动同步。未保存草稿会保留，不被自动刷新覆盖。
5. **选中文字修改**：在 `.tex` 正文中划词、划句或选定段落，默认仅显示小型「AI 修改」按钮，不抢走编辑焦点，仍可直接复制、删除。点击按钮再展开完整卡片，输入要求后点击「交给 AI 修改」。选区包含文件版本和精确范围，AI 仅替换该选区，范围外正文保持不变；版本变化时拒绝覆盖，可从文件历史恢复。
6. 点击「新建文件夹」整理资源，可使用 `figures/results` 创建多级目录。选择文件夹后，「添加文件」会上传到该目录。支持 **PNG、JPG / JPEG、PDF** 的上传、预览和图片插入，PDF 可直接作为矢量图编译；连续插入图表会自动使用不同的引用标签。
7. 点击「编译 PDF」，查看预览、诊断与完整日志。默认同时显示对话、目录、正文、PDF 四栏，拖动三条分隔线调整宽度；双击分隔线恢复默认，选中分隔线后可用左右方向键微调。宽度自动记忆。顶部「工作区视图」也可切换为仅源码或仅 PDF，左侧对话保持显示。
8. **界面缩放**：`Ctrl +` / `Ctrl -` 放大和缩小，`Ctrl 0` 恢复 100%（macOS 键位使用 `⌘`）；也可使用右上角缩放按钮。范围 60%–200%，缩放设置自动记忆，不影响导出 PDF 的实际版式。PDF 预览自身保留独立缩放按钮。
9. **TeX 折叠与高亮**：点击行号旁的箭头折叠 / 展开 section、subsection 等章节或 `begin / end` 环境，也可用工具栏「折叠 / 展开」操作全部模块。章节、环境、宏包、引用、数学命令、注释与括号使用不同颜色，支持深浅主题。折叠只改变显示，完整源码仍会保存和编译。

可以下载 PDF、导出包含空文件夹的项目 ZIP、恢复历史版本、校验 BibTeX 或通过 DOI 导入真实文献。

也可以直接在 dsh 中说：

> 我要向 NeurIPS 2026 投稿，请使用 LaTeX Studio 查找本地模板并创建文稿，题目是……

> 使用 LaTeX Studio 把当前项目的训练流程排成伪代码，再编译检查。

> 检查当前文稿的 BibTeX、引用键和编译错误，保留原有研究结论。

## 内置模板

| 领域 | 模板入口 |
| --- | --- |
| 计算机 | IEEE conference / journal；ACM SIGCONF / manuscript；NeurIPS 2026；ICML 2026；ICLR 2027 与 2026；ACL / EMNLP / NAACL 公共样式；CVPR 官方快照；Springer LNCS |
| 生物与医学 | PLOS ONE、PLOS Biology / Genetics、PLOS Computational Biology；Bioinformatics、Bioinformatics Advances、NAR Genomics and Bioinformatics、OUP 生物医学基础格式；Springer Nature、BMC / Genome Biology、Nature Methods / Biotechnology 起稿 |
| 综合与通用 | Elsevier elsarticle、英文 article / arXiv 起稿、中文 CTeX |

这些是 **24 个模板入口**，部分共享出版社的同一个官方样式；不是 24 套独立的官方期刊专版。每个模板包含真实样式文件、可编辑起始稿、来源、下载摘要和使用说明。原始作者包保存在 `templates/upstream/`。对应年份与模板覆盖范围见 `templates/catalog.json`。

会议年份、匿名要求、页数、声明、checklist 和参考文献规则仍须按目标投稿指南填写。PLOS 要求图片单独上传；Springer Nature 是投稿稿件模板，不是出版后的页面排版。没有匹配模板时，在线搜索返回候选链接，由用户或 dsh AI 核实官方来源后导入。

## 数据与编译

- 默认项目位置：`~/.dsh/latex-studio/projects/<project-id>/`。普通 `.tex` / `.bib` / 图片文件，可直接复制或用其他编辑器打开。
- 私有编译器：`~/.dsh/latex-studio/runtime/TinyTeX/`。不调用或修改系统中的 MiKTeX、TeX Live、PATH。
- 支持 pdfLaTeX、XeLaTeX、LuaLaTeX；latexmk 处理多轮编译及 BibTeX / Biber。编译超时或失败会返回日志，不伪造 PDF 成功状态。
- 不读取项目的 `.latexmkrc`，禁用 TeX shell escape。需要 `minted` 等外部执行功能的稿件目前需改为 `listings` 或在其他环境编译。
- 字体、PDF.js Worker、编辑器资源随插件分发。首次安装编译器和缺失宏包需要网络；依赖已缓存的项目可离线编译。
- 修改前保留 `.history/` 版本。AI 和界面通过相同文件接口操作；基于文件 hash 检查是否有新的修改，防止覆盖。
- BibTeX 校验使用 Citation.js，并检查重复键和未定义引用。DOI 导入访问 Crossref；语法通过不代表文献事实已核验。
- 使用 AI 时，相关文件内容会由 dsh 发送到用户当前选择的模型服务。插件不额外保存模型 API Key，也不上传文稿到第三方编译站。

## 开发与验证

需要 Node.js 24.9+。

```powershell
npm ci --legacy-peer-deps
npm run build
npm test
npm run test:compile
npm pack --pack-destination ..\dsh-latex-releases
```

`test:compile` 需要先安装插件管理的 TinyTeX，逐个创建项目、启用参考文献并真实编译全部内置起始稿，检查生成的 BibTeX 结果，结果写入 `test-output/compile-results.json`。它不使用系统 TeX。

源码结构：

```text
src/host.mjs       Cordis Host 服务、AI 工具、静态资源
src/request.mjs    请求 schema 与 Typert Remote 元数据
src/core.mjs       模板、文件、历史、BibTeX、DOI、导入导出
src/runtime.mjs    私有 TinyTeX 安装、依赖安装、编译与日志
src/client.jsx    dsh 原生主面板、CodeMirror、MathLive、PDF.js
src/snippets.mjs  公式、图表、伪代码与宏包补全
templates/        模板起始稿与未经修改的官方作者包
```

开发与发布测试均使用 `.tgz` 包，并把发布包放到源码目录之外。此版本 dsh / pnpm 在 Windows 上从目录链接切换为压缩包安装时，曾清理链接指向的开发目录，因此不要通过 `plugin add` 安装源码目录。每个新安装候选递增版本，避免同版本压缩包缓存。

UI 测试脚本使用 Playwright 连接测试启动的 Electron CDP 端口 9225；这些脚本不会包含在插件包里。`scripts/test-features-ui.mjs` 和 `scripts/test-images-chat-ui.mjs` 在 `test-output/feature-project.json` 指定的专用验收文稿上运行，会实际调用 dsh 当前模型。测试覆盖常驻对话、选区写入、自动刷新、文件夹、三种图片的预览与编译；不要将项目 ID 替换为正式文稿。`docs/validation.md` 保存本机验证结果。

模板维护流程：`python scripts/fetch-templates.py` 下载官方源文件，`node scripts/prepare-template-sources.mjs` 使用受管 TeX 生成 acmart / elsarticle 的 `.cls`，然后执行 `python scripts/build-templates.py`。执行 `npm run test:compile`、`node scripts/record-validation.mjs` 后再次生成模板，写入验证记录。不要手改官方样式或生成后的模板；编辑构建脚本后重新生成，再运行真实编译验证。

## 发布到插件市场

在 dsh 的插件页面启用 **Custom plugin indexes / 自定义插件索引**，进入 **Discover / 发现**，添加以下索引源，即可浏览并安装 LaTeX Studio：

```text
https://raw.githubusercontent.com/violector/dsh-latex-studio/main/marketplace/index.json
```

索引按 dsh 官方 format-1 规范生成，固定到已发布版本的完整 Git commit，并用官方解析器校验。GitHub 标签和 Release 提供同一版本的源码与构建包，仓库中的 `dist/` 由构建脚本生成，供 Git 安装直接使用。发布维护流程见 [marketplace/README.md](marketplace/README.md)。社区精选市场有独立的收录和审核流程；公开索引可用不代表已获社区精选收录。

插件自有代码采用 MIT。第三方模板保留各自许可和版权；不继承本插件的 MIT。某些会议作者包没有独立 SPDX 授权声明，公开再分发前需要确认这些上游文件的许可，见 `THIRD_PARTY_NOTICES.md`。

界面参考 MotionSites、React Bits、Aceternity UI、Uiverse / Galaxy，采用本地实现的卡片、标签页、焦点和加载动效。详细映射见源码的 `docs/design.md`。
