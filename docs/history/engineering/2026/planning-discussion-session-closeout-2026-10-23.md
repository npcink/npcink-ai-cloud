# 规划讨论会话收口 — 2026-10-23

状态：时间盒证据 / 会话交接。已写入仓库以免关会话丢失；**不等于**第一阶段产品闭环完成，也**不授权**生产 Deploy。

本文记录 Cloud「规划讨论」会话的目标、已合入成果、未完成待办、关键决策，以及交给「执行」会话的发布前系统联调任务书摘要。规范入口仍以根目录 [`AGENTS.md`](../../../../AGENTS.md) 为准。

## 1. 会话目标

- 在无用户/无历史兼容包袱前提下，用最高效率方式规划第一阶段闭环。
- 约束放进仓库文档，对 Codex / Claude / OpenCode / Grok 普适，不绑某一 Bot。
- 明确分工：**本会话只规划**；落地执行交给「执行」会话（用户侧 @执行）。
- 关规划会话前：只清理**本会话**分支/worktree；归纳与待办入库，避免丢失。

## 2. 已完成（开发侧 / 文档侧）

| 项 | 证据 |
| --- | --- |
| 暂停口径与 Portal 用量筛选项文档 | PR [#1163](https://github.com/npcink/npcink-ai-cloud/pull/1163) 已合 `master` |
| 工具无关代理入口与最短工程细则 | PR [#1164](https://github.com/npcink/npcink-ai-cloud/pull/1164) 已合 `master`（`ac4a1b8d` 一带）；根目录 `AGENTS.md` + `docs/engineering/`（DoD、verification-commands、phase-1-scope、pr-contract 指针等） |
| 长规程搬迁 | 原长文 → `docs/engineering/agents-session-protocol-detail.md`（入口变薄） |
| Addon 配对收口（他会话） | 规划期曾确认 **0.4.3** 合入 Addon `origin/master`（约 `f59e206` / PR #298）并有配对 zip；**收口日实测**插件头与常量为 **0.4.4**（以 Addon 仓实测为准，试用站须装约定包） |
| 本批文档 | 本文件 + [`phase-1-closed-loop-runbook-2026-10-19.md`](../../../engineering/phase-1-closed-loop-runbook-2026-10-19.md) 入库（原 closeout 分支未合部分） |

本会话相关已删远程分支（历史）：`docs/pause-status-and-usage-filter-20261019`、`docs/agents-conventions-20261019`（均已 squash 进 master）。

## 3. 未完成待办（交给「执行」/人工窗口）

**关规划会话 ≠ 第一阶段完成。** 下列 P0 未做完前，不得宣称「第一阶段跑通」或「系统联调通过」。

1. **联调任务书正式移交「执行」** — 见下文 §5；规划草案已定，执行落地未开始。
2. **选定 Cloud Deploy 目标 SHA** — 是否把 live 对齐到 `origin/production` tip（含 SEO 暂停等），是否一并 promote #1155 族广义暂停。
3. **生产 Deploy** — 须人工精确授权句 + `expected_sha`；本收口**不** Deploy。
4. **Deploy 后自动验收** — health revision 对齐 + 正式/受控 release-smoke + 可脚本化的 connector / live-site-stage1；产出单一时间戳收据。
5. **受控真生成** — 至少一次文字 `execute` 成功（消灭或如实记录 `provider.upstream_unavailable`）。
6. **编辑器闭环收据** — 标题生成 → 采用 → 保存草稿；Cloud 有对应 `run_id` + feedback/journey。
7. **live vs production tip** — 收口日只读：live `source_revision=b8cc6049da7d`；`origin/production` tip 仍为 `16747c40`（SEO pause）且**新于 live**。以 Deploy 当日 `/health/live` 为准刷新。

明确非目标（本轮仍不做）：第二 CMS、恢复 specialist、支付宝真支付、OTLP 外挂、24h soak、商店大规模分发。

## 4. 关键决策（规划结论）

| 决策 | 含义 |
| --- | --- |
| 规划 / 执行分工 | 本会话只定标准与任务书；实现、Deploy 操作、脚本跑通归「执行」与人工门禁 |
| 成功标准 | 配对 Cloud + Addon + 官方 WP AI → 建议采用保存 → 有 `run_id` + feedback；无收据不算完成 |
| 文档约束优先 | `AGENTS.md` 工具无关；细则链到 `docs/engineering/*`；聊天约定不生效 |
| 可恢复暂停 | 硬拒绝 + 藏入口；历史只读保留；恢复须再评审源码变更 |
| 成对发版 | Cloud↔Addon 版本门禁；试用站装约定 zip，不假设商店分发 == git master |
| Deploy 后自动验收 | 插入部署窗口与真生成之间；失败则不宣称联调通过 |
| 无历史包袱 | 允许破坏性清理歧义 API；少写无测试兼容层 |
| 清理范围 | 仅本会话 closeout worktree/分支；不碰主脏仓未提交改动；不 prune 其它 ~29 worktree |

## 5. 给「执行」的联调任务书摘要

**目标：** 产品发布前系统联调，证明各段正常、主流程可用。

**通过标准：** 下表 P0 全绿 + 归档收据（时间、Cloud revision、Addon 版本、关键 `run_id`、自动验收结果）。

**工作包顺序：**

1. 读 `AGENTS.md` 与 phase-1 / pause / deploy / smoke / WP connector runbook  
2. 与 Npc 锁定 Deploy 目标 SHA；Addon 固定约定版本（收口日实测 **0.4.4**）  
3. **仅在人工授权后**按 `deploy/PRODUCTION_GITHUB_DEPLOY.md` Deploy  
4. **Deploy 后必跑自动验收**（IT-AUTO-*）  
5. 受控真生成（IT-RUN-01）  
6. 编辑器闭环 IT-ED-01～04（摘要/slug 为 P1）  
7. 按 live 是否含暂停集抽检 IT-PAUSE-*  
8. 出联调报告回报 Npc / 规划归档

**人工门禁：** Deploy 按钮、站点 HMAC / 邮箱 OTP / 付费额度、编辑器「采用」若无法全自动。

**逐步命令与勾选表：** 见 [`docs/engineering/phase-1-closed-loop-runbook-2026-10-19.md`](../../../engineering/phase-1-closed-loop-runbook-2026-10-19.md)（不授权 Deploy）。

### 5.1 用例编号压缩表

| ID | 层 | P | 要点 |
| --- | --- | --- | --- |
| IT-ENV-01～04 | 环境 | P0 | live revision=目标 SHA；Addon 约定版本；WP≥7.0+官方 AI；范围不漂（无第二 CMS/不恢复 specialist） |
| IT-AUTO-01～04 | 部署后自动验收 | P0 | `/health/live`；ready 按 runbook；smoke；单一收据 |
| IT-CONN-01～03 | 连接授权 | P0 | Portal 授权；Checks text configured+fresh；错误可恢复 |
| IT-CONN-04 | 连接 | P1 | 换钥/吊销 |
| IT-RUN-01～02 | Runtime | P0 | 文字 execute 成功；目录健康≠虚绿 |
| IT-RUN-03～04 | Runtime | P1 | 失败可诊断；用量可对 |
| IT-ED-01～04 | 编辑器 | P0 | 入口→生成→采用→保存；Cloud 不直写 WP 帖 |
| IT-ED-05 | 编辑器 | P1 | 摘要或 slug 一条 |
| IT-ED-06 | 编辑器 | P2 | 图片/ALT 不阻断文字通过 |
| IT-FB-01～02 | Feedback | P0 | 有事件；无正文/密钥泄漏 |
| IT-FB-03 | Feedback | P1 | 未 opt-in 不上传 |
| IT-PAUSE-01～03 | 暂停 | 视 SHA | specialist / #1155 族入口与拒绝符合预期 |

排除：支付宝真支付、OTLP、soak、Agency 报价、Typecho/Hexo/Astro、恢复已暂停专业包。

## 6. 本会话清理动作（收口日）

- 从最新 `origin/master` 开分支 `docs/planning-session-closeout-20261023` 入库本文与 runbook。  
- PR 合入前/后：仅移除 worktree `npcink-ai-cloud-master-closeout`；删除本会话本地分支（已合或已推送后）。  
- **未**改动主仓 `/Users/muze/gitee/npcink-ai-cloud` 工作区；**未** Deploy Production；**未** `worktree remove` 其它路径。

## 7. 经验沉淀（给后续代理）

1. 一人多 AI：按仓/面切片，统一部署窗口合并；脏工作区禁止叠需求。  
2. AI 交付默认四件套：实现 → 文档一句 → 自动测试 → 可粘贴验证收据。  
3. 规范变更走 PR；入口半页 + 链细则，避免双源（`AGENTS.md` 为准）。  
4. 「工程已齐」≠「飞轮已转」；第一阶段只认采用收据。  
5. 关会话前必须把待办写入 `docs/history/...`，否则下一会话会丢上下文。
