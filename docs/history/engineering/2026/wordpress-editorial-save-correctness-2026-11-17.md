# 编辑更新保存正确性 — 2026-11-17

Status: 本地候选，已安装到 `magick-ai.local`；未提交、未合并、未同步 M4、未部署生产。
这是[功能审计](wordpress-editor-feature-audit-2026-11-17.md)的第二批。

## 范围与所有权

聚焦 `ai/editorial-updates` 的原生编辑器消费端：应用区块、保存文章、完成 Notes。
Cloud 后端和 Addon 连接器不获得文章写入、审批或第二编辑器控制面的所有权。
本批不改 Cloud runtime，不新增应用前预览，不恢复暂停功能。Addon 仅新增九条
固定 UI 中文映射及对应测试；其他未提交修改属于首批，应分别审阅。

上游源码：WordPress/ai **1.5.0**，tag commit
`769a5171889182ecaa03e1f4474df3708138a1bb`。
本机独立源码仓库 `/Users/muze/gitee/wordpress-ai`，分支
`codex/editorial-save-confirmation`。这是本地补丁，不是官方已发布修复。

## 已确认问题和处置

| 问题 | 本批行为 |
| --- | --- |
| Notes 在文章保存前就完成，保存失败仍可能显示 AI 成功 | 原生保存结束后检查失败状态、文章身份、已保存正文；确认一致后才完成 Notes |
| 原生 savePost 成功和部分失败均 resolve undefined | 不依赖 Promise 返回值；已保存原始正文必须等于应用快照 |
| 有未保存草稿时自动保存整篇 | 先要求用户完成保存，显示右上角保存位置 |
| 生成期间继续编辑，晚到结果覆盖新修改 | 暂存结果；应用前复查文章、正文、dirty/saving 状态，变化则不应用、不自动保存 |
| 部分区块失败却只有成功提示 | 仅保存成功区块；常显成功/失败数量、首个失败原因和待处理状态 |
| Notes 状态更新失败被吞掉 | 与文章保存结果分开显示警告；提供“打开编辑建议”和修订入口 |
| Notes 分页失败返回半份指令，快速点击重复运行 | 此调用要求完整分页，失败即停止；同步 ref 阻止重复批次，finally 释放保存/自动保存锁 |

常显：保存副作用、失败原因、保存/待处理状态、失败数量及恢复动作。
按需：原生修订详情和 Notes 详情。技术证据：源码 diff、资产 hash、请求顺序和数据库断言。
删除重复：部分失败不再发 AI 全部成功通知；下次批次清除之前的警告。
WordPress 核心“草稿已保存”通知仍表示保存动作成功，与 AI 部分失败警告各自有事实范围。
本批修改的是 WordPress 编辑器，未改变 Cloud Admin 页面或其落实台账。

## 验证

- 最初九个回归在原版上全部失败；修复后增加“Promise 已结束但未落库”和空输出，
  **11/11** 通过。测试运行真实 hook 和 Notes/blocks utility，模拟存储与传输。
- 干净 tag checkout 可应用所附 patch，重跑 **11/11**，证明补丁可重建。
- 上游 TypeScript 检查通过；三文件 ESLint 无 error，保留三条原有 JSDoc warning。
  `build:legacy` 成功，三条既有包体积 warning；没有更改依赖。
- 本机真实 WordPress 六个浏览器场景通过：正常保存、保存失败、部分失败、生成期间
  编辑、已有未保存草稿、Notes 完成失败。使用真实原生保存、Notes REST 和数据库；
  仅 Ability 返回值合成，不冒充 hosted model 质量证据。
- 正常场景验证保存请求先于 Notes 完成、创建修订；点击原生修订入口可打开界面，
  原生 `wp_restore_post_revision` 恢复测试文章原文。恢复是原生 API 验证，未声称
  点击“恢复”按钮完成了 UI 验收。
- 1440×1100 全场景截图；1280×960 点击“打开编辑建议”成功并可读待处理内容。
  每个场景重新读取浏览器实际 JS 响应，SHA-256 与本地安装的补丁资产相同。
- 测试专属 cookie 限定的临时 MU helper 阻断服务端外部 HTTP，浏览器也拦截意外
  Ability/外部请求；无付费 Provider 请求。所有六篇最终轮测试草稿、对应 Notes、
  专属登录会话及 MU helper 已清理；原文章 279790 指纹不变。
- Addon `test:all`、PHPStan、38 项 JS 回归和 POT freshness 通过。
  **完整 `ai:i18n:check` 未通过**：原版资产和补丁资产各有 180 项 UI 缺口
  （164 fixed UI、14 default-domain、2 ability error）；新增固定提示有中文回归。
  不扩大本批翻译范围，不把旧版本全绿记录套用于 AI 1.5 全量翻译。
- 跨仓矩阵单列 Addon 本地通过和 Cloud dirty exact-SHA CI 待验证；未运行新一轮
  Cloud runtime suite（本批无 runtime 改动），不把首批结果冒充本轮新执行。

## 可重建补丁与本地安装

源码与测试 diff：
[wordpress-ai-1.5.0-editorial-save.patch](../../../upstream-patches/wordpress-ai-1.5.0-editorial-save.patch)。
在干净的 WordPress/ai 1.5.0 checkout 中先检查再应用：

```sh
git apply --check /path/to/wordpress-ai-1.5.0-editorial-save.patch
git apply /path/to/wordpress-ai-1.5.0-editorial-save.patch
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/unit/editorial-updates.test.cjs
npm run typecheck
npm run build:legacy
```

使用满足该 tag engines 的 Node/npm（本轮为 Node 24.22.1、npm 12.1.0）。
复制构建后的 `build-scripts/experiments/editorial-updates.js` 及同名 `.asset.php`
到 **本地** WordPress 的 AI 插件对应目录；先备份这两个文件，保留其余资产。
Addon 中文映射通过既有 symlink 即时加载。刷新有未保存内容的页面前先保存草稿。
本轮未刷新或保存用户原先的编辑器标签页。

证据目录：
`/Users/muze/.codex/visualizations/2026/11/16/01a1e282-815d-7332-b08c-71217440e6c6/editorial-updates-20261117`。
其中 `installed-assets.json` 记录原始/补丁 SHA-256；`original-assets/` 保存安装前字节，
`browser-report.json`、截图、`editorial-browser.cjs`、各 gate 日志保留验证过程。
这些是本机证据，不是跨机器部署包或生产授权。

回滚：关闭本批测试页面；确认当前两个资产仍匹配 manifest 的 patched hash 后，
恢复 `original-assets/` 对应文件；仅撤销 Addon 本批九条映射与测试、独立源码的本批
diff。无数据库迁移；不回滚用户文章。上游更新会覆盖本地补丁，升级前应重新比较
源码并验收；禁止对其他版本盲目套补丁，也不把补丁加载器加进连接器运行时。

## 经验与下一批

之前缺的是写入消费端的失败反例：建议 Ability 的成功测试不能证明编辑器保存成功，
`await` 结束也不能证明正文落库；Notes 完成是依赖保存证据的后续副作用。
以上规则已写入[开发标准 §11](../../../wordpress-ai-recommendation-development-standard-v1.md#11-native-editor-saves-and-follow-up-completion)。

下一批仍按功能族验证总结、翻译、别名和分类。已发现 Cloud 对中文输入补充的
“用简体中文输出”可能与翻译目标语言冲突，记录为下一批定向复现入口；本批未修复，
不将其记为已验收。AI 1.5 其余翻译缺口、未映射 Ability 和模型语义质量仍待处理。

本地 / 浏览器候选已验证；GitHub CI / 合并 / M4 / 生产未执行；人工效果验收待用户。
