# 公开发布记录 · 2026-11-09

- 独立公开仓库：<https://github.com/violector/dsh-latex-studio>。
- 当前 Windows 预览版本：**v0.3.10**，Release：<https://github.com/violector/dsh-latex-studio/releases/tag/v0.3.10>。
- 发布提交：`ccb6adfa2af3e3d58a33e3545e1f5fdb9aef24fd`；标签 `v0.3.10` 固定到该提交。
- 安装包：`dsh-latex-studio-0.3.10.tgz`，20,291,664 bytes。
- SHA-256：`7897638a470428c57badf7b83bce6afb83292acdc96617981a270891024f9b94`。
- 发布时间：2026-11-09 09:27:11（Asia/Shanghai）。Release 附有安装包及校验文件。

## 验证

发布准备时 29 项自动化测试全部通过。v0.3.10 应用源码和模板与已验收的 v0.3.8 相同；此次更改是分发元数据、公开安装说明和市场索引。历史的 24 模板实际编译与原生桌面 UI 验收见 [validation.md](validation.md)。

通过本机 dsh CLI，在独立新建的 profile 中从上述公开 Git commit 实际安装 v0.3.10，安装成功且 bundle 已注册。安装目录的 285 个文件与本次 `.tgz` 逐一比较，全部一致。测试未改变已有 desktop profile 的插件来源或现有文稿。

v0.3.9 的 Git 包带有 `prepack`，公开安装检查发现它会触发 pnpm 的 Git 构建许可限制。v0.3.10 移除安装时的构建脚本，直接使用已提交的 `dist/`；没有通过放宽 profile 的构建许可来完成验收。v0.3.9 Release 已注明由 v0.3.10 替代，保留其标签和安装包供追溯。

## dsh 索引

```text
https://raw.githubusercontent.com/violector/dsh-latex-studio/main/marketplace/index.json
```

在 dsh 中启用 Custom plugin indexes，进入 Plugins → Discover 添加该地址。索引使用 format 1，版本指向上述完整 Git commit，记录实际 Release 发布时间，并经官方 `@deepseek-ai/dsh-plugin-market-index` 解析器验证。它是本项目公开托管的索引。

## 社区精选目录

收录 PR：<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/13424>。该 PR 仅新增 `data/plugins/violector__dsh-latex-studio.yml`，分类为 `docs`。

本机 `dshmarket` 使用该精选目录。按目录在 2026-11-09 的贡献规则，仓库需创建满一天，之后仍需维护者人工审核。本仓库创建于 2026-11-09 09:13:05（北京时间），于 **2026-11-10 09:13:05** 达到一天要求。

2026-11-10 15:33:59（北京时间）已核实仓库满一天，更新 PR 说明并从草稿切换为 **Ready for review**，随后同步市场主分支并重新触发检查。

**2026-11-10 22:18:38（北京时间）PR 已由社区维护者合并**；`check` 和 `Submission gate` 均通过。2026-11-11 核实官网目录已包含 `violector/dsh-latex-studio`，详情页为 <https://awesome-dsh-plugin.com/p/violector/dsh-latex-studio/>。

### 国内下载区的目录同步

2026-11-11 本机复现：中国大陆下载区精确搜索 `dsh-latex-studio` 没有结果，分类和时间范围均为全部，未被兼容性筛选或屏蔽列表隐藏。

该下载区优先读取 npm 发布的 `dsh-plugin-catalog`，当时 npm 官方源及腾讯镜像仍提供 `2026.1110.18259`（2026-11-10，9959 条），其中没有本插件；npmmirror 仍提供 `2026.1109.17642`（9714 条）。官网 `plugins.json` 已更新为 2026-11-11 的 10365 条并包含本插件。缺失来自目录包发布 / 镜像同步滞后，不能据此判断收录未通过。后续目录更新会改变这些数字。

全球下载区优先读取官网目录；中国大陆下载区需要等待目录包更新。项目公开仓库、Release、自定义索引及上述市场详情页独立可用。
