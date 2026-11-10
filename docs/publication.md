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

2026-11-10 15:33:59（北京时间）已核实仓库满一天，更新 PR 说明并从草稿切换为 **Ready for review**。当前等待社区维护者评审，尚未宣称已在精选市场上架。项目公开仓库、Release 和自定义索引独立可用。
