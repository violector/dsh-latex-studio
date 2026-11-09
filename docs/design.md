# 界面设计参考

本版采用纸张白、墨绿和低饱和学科色，保持编辑器与 PDF 的阅读空间。下列网站用于设计参考，组件由本项目实现，没有引入付费模板或远程运行时资源。

| 参考 | 在插件中的应用 |
| --- | --- |
| [MotionSites](https://motionsites.org/free) | 明确的标题层级、留白和原创论文纸张插画，入口集中在模板选择与继续写作 |
| [React Bits Spotlight Card](https://reactbits.dev/components/spotlight-card) 与 [Animated Content](https://reactbits.dev/animations/animated-content) | 模板卡片低强度指针光照，分组切换时短暂交错入场 |
| [Aceternity UI Hover Effect](https://ui.aceternity.com/components/card-hover-effect) 与 [Tabs](https://ui.aceternity.com/components/tabs) | 卡片悬停层次、胶囊筛选与预览标签的选中反馈 |
| [Uiverse](https://uiverse.io/) 与 [Galaxy](https://github.com/uiverse-io/galaxy) | 按钮按压、输入焦点、编译旋转指示、弹窗过渡等 CSS 微交互 |

模板卡片的小纸张标明“版式示意”，实际输出以编译 PDF 为准。动效只服务于导航与反馈，不在论文编辑区持续播放。所有动画响应 `prefers-reduced-motion`，控件保留键盘焦点和原生语义。

实现见 `src/client.jsx` 的 `TemplateCard`、`Modal` 和 `src/style.css`。浏览器脚本、字体与渲染资源随包分发。

0.2 版本将 dsh 原生对话固定在插件最左侧，通过官方 SessionProvider 和 conversation.content 插槽绑定每篇文稿的独立会话。右侧保留文件树、正文与 PDF；较窄窗口切换源码 / 预览时，对话保持可用。正文选择使用轻量浮窗提交修改意图；文件树显示可折叠目录，并明确当前上传目录。PDF 预览预留滚动条宽度，避免页面渲染后触发反复缩放。

0.3 默认同时显示四栏，通过三条分隔线调整，保留最小可用宽度；过窄视口可横向滚动或手动切换仅源码 / PDF。缩放和栏宽保存在本机。选区先显示不抢焦点的简短 AI 按钮，主动点击才展开指令卡片。TeX 行号旁显示章节和环境的折叠箭头，标题、宏包、引用、数学命令等采用不同语义色。折叠和高亮实现位于 `src/latex-editor.mjs`，直接使用 CodeMirror 的 foldService 和流式解析器扩展。
