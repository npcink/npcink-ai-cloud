# 资源与总规划收尾 — 2026-10-27

状态：授权范围内的源码、文档与资源处置记录。后继于
[七会话历史义务与资源处置检查点](seven-chat-historical-obligations-and-resource-disposition-2026-10-26.md)，
保留前序封存回执，不改写旧计数。本文不表示全仓资源清空、生产验收或自然使用完成。

## 已完成的工程处置

| 项目 | 本次核实结果 | 证据边界 |
| --- | --- | --- |
| 白天功能 #1293、规范 #1295 | 已分别合入 `574fe5e5`、`06b6d3f8`；原 breadcrumb/CVE 例外阻塞已被后继修复取代 | 功能 M4 签收和文档 CI 见[白天闭环收尾](../../engineering/2026/model-provider-flow-closeout-and-lessons-2026-10-27.md)；不重跑旧红 CI |
| Cloud [#1288](https://github.com/npcink/npcink-ai-cloud/pull/1288) | 更新旧基线后，精确 head `e91c39176f85684d51bd68bccce85dfba3e1ab6d` 必需检查通过；合入 `69fbddfcbe3f7b6a5d07a0cbe15341267c5d8fd1` | CI action 引用升级，无新增模型或运行验收 |
| Core [#191](https://github.com/npcink/npcink-governance-core/pull/191) | head `92a194ddcd895d88fcbd769d853e910dfbec0cc9` 必需 Static contracts、PR body contract 通过；合入 `2b5183dc39a0b7f8d4c4b14cdf2830f4e7b3babe` | advisory code-review HTTP 400，未交付外部审查；按既有政策在 PR 记录缺口及精确 head 的范围审查，不称全绿 |
| 总规划冻结文档 `3a377c09` | 从当前 master 承接[收尾效率规范](../../../engineering/zero-backlog-closeout-efficiency-standard-v1.md)，原文件字节不变，补活动索引 | 原冻结工作区、提交与六文件外置快照保持原样；本文所在 PR 的最终合入身份另存外置回执 |

两个依赖 PR 均只改 OCR action 的 `uses:` SHA。v1.13.3 tag 解引用到
`375f64cd6f67a48a135da83cfcf59c52669a09cb`；新旧三个 `action.yml` 均为
55,520 bytes，SHA-256 为
`b9a685738e6ab6f1c5b654d519713600b41dcf5206c06cf0f6e719bbd64450ac`。
这支持本次引用审查，不证明外部 HTTP 400 已恢复，也不等于完整上游代码相同。
未变更凭据、必需检查、Cloud 固定 CLI 或 Core 原有 CLI 选择机制。

冻结规范文件为 6,232 bytes，SHA-256 为
`13c9719604e33dd2ef959cbc3d468447b48f632f099a3551040b1b90fcf75d80`。
它只用于已授权的收尾，不恢复冻结产品方向或解除生产授权要求。

## 资源退休与保留

本轮只退休下列两个已证明可退休的引用，未删除工作区目录：

- Cloud 本地 `codex/phase1-value-focus-20261027`，原 head `25d40c11`：
  #1295 已合并、树等价、无工作区和开放 PR 使用后，校验既有 archive ref 与
  35,245,808-byte full bundle，按旧 OID 精确删除引用；分支配置先外置保全再移除。
- Addon 远端 `dependabot/github_actions/alibaba/open-code-review-1.13.3`，
  原 head `3b9d0739`：#334 已合并、树等价且无消费者，先建立 archive ref，验证
  14,805,872-byte bundle 后，用预期 OID 租约删除并核对远端不存在。
  删除后的首次 Git 网络复核及随后 API 读取失败，后继显式代理 Git 复核确认不存在，没有重复删除。

Cloud #1288、Core #191 的远端任务引用已由 API 确认不存在；本轮其他开放 PR 的 bot
分支保留。archive 与 bundle 是恢复材料，不作为活动 topic 计数，不自动到期删除。

Cloud 七处工作区在本轮读取窗口中均有保留理由；各仓快照不是原子全局快照：

| 资源 | 接续 owner / 保留理由 | 下一触发或释放条件 |
| --- | --- | --- |
| 主 checkout `codex/admin-ia-v2-workspaces` | 原任务 / primary 保护 | 原 owner 明确交还，App 支持的生命周期释放后再核消费者与数据 |
| 总规划 `admin-provider-recovery-closeout` | 总规划 / 冻结 `3a377c09`、锁与快照 | 规范交付完成不等于原目录可删；原 owner 交还并重新核归属、忽略产物 |
| `admin-quiet-tabs-header-on-master-20261026` | 原 quiet-tabs 任务 / owner 释放证据不足 | 即使 clean、已合并、无 ignored，也须确认任务/App 角色已释放 |
| `customer-operations-clarity` | 独立客户记录审查任务 / 活动工作区 | 原任务完成并交还，重新核当前 head、忽略产物及消费者 |
| 当前 `daytime-development-20261026` | 当前收尾 / App task primary 保护 | 应用曾明确拒绝 `The task's primary checkout cannot be removed.`；不重复尝试或 CLI 绕过，角色可释放后再退休 |
| `eng08-heartbeat-read` | B03 原 owner / detached、锁、App 和忽略证据保护 | 支持的 App 角色释放及完整保全后，分别处理目录、锁与注册 |
| `npcink-ai-cloud-m4-ops` | 稳定运维 owner / master、锁、运行职责 | 运维窗口明确交还；本轮不切换源码或变更 M4 |

其他六仓的 installed/primary checkout 保留。Toolbox、Eval 有独立活动任务，
Eval 在读取期间产生分支及未提交状态变化，不能用旧计数删除。Toolkit、Adapter、Core、
Addon 主源码不顺手追平远端。Adapter H03 的远端 fetch 保留合同继续有效。

Addon 本地 `master` 和 `docs/playground-bootstrap-flake-note` 存在祖先差异，继续保留：
后者提交 `46b11d80` 已 patch 等价；前者的 docs 提交 `0813da8d` 虽 patch-id 不同，
但本轮逐一核实其四个文件新增的非空行均已在当前 master 中。没有发现需要重复提交的
规范义务，不据非祖先关系重放旧提交，也不把这些引用当作已退休。

## 更正旧安装源待办与缺证

两处 Local 站点的 Addon symlink 当前都指向固定源码 checkout，其 head
`3e35df4b38dbcf304b0ca969b178b6b9ef615f49` 包含旧目标 `4641ec12`。
因此旧“仍在 `46b11d80`，需切到 `4641ec12`”步骤已过时，无需回滚换源。
这是文件与提交谱系证据，不证明暂停站点的 PHP 已加载该源码。本轮未启动站点；
前次受控验收后恢复暂停的结论沿用前次回执，两处 MU cron guard 文件及
`DISABLE_WP_CRON=true` 声明本轮只读核实。

Cloud live `tmp_pack` 本轮一次元数据读取为 231 files / 2,205,286,400 bytes，
writer 仍未知，并有并发 Git 活动；旧 153 项是历史切面。标记 `EVIDENCE_PENDING`，
由 Cloud 资源 owner 在具名静止窗口或新 writer 线索出现后接续；未删除、重 hash payload、
GC/repack 或再开 Trace2。旧 vault、capsules、完整 bundles 和保留合同保持原样。

## 仍保留的待办及停止条件

| 待办 | owner | 状态 / 下一触发 |
| --- | --- | --- |
| Cloud #1289/#1290/#1291 依赖更新 | 各 PR 维护者 / 后续独立任务 | `DEFERRED_BY_SCOPE`；本批仅承接 #1288/#191，不自动扩大到运行/测试依赖及 M4 验证 |
| Core OCR HTTP 400 | Core CI 维护者 | 外部审查缺口保留；有服务恢复证据或实际需要审查的新改动时再验证，不反复重跑制造交付 |
| 中文改写保留不确定语气、标题/摘要自然实用性 | 编辑体验任务 / 人类验收 | `WAITING_EXTERNAL_EVENT`；在自然编辑样本中审阅，不以自动通过代替质量判断 |
| 三名 Free 自然用户、自然标题样本、真实省时/返工/成本 | 产品验证 owner | `WAITING_EXTERNAL_EVENT`；自然使用及人类采纳发生后补证，不付费制造数据 |
| 生产、真实 OAuth/SMTP/交易、stale-running 现场与根因 | 各运维/验证 owner | 原触发和授权继续适用；本文不授权查询现场、发布、配置、晋升或真实交易 |
| July22 operator 原件等历史缺证 | 原收据 owner / 总规划保管 | `NOT_LOCATED`；已有有界搜索结论封存，仅在新具名来源出现后重开 |

## 交接与复盘

本轮唯一活动台账和私有证据在本机
`task-receipts/npcink-ai-cloud/2026-10-27-resource-closeout/`；包含逐仓读取窗口、
精确 PR/CI 身份、引用退休结果、bundle 校验、安装源谱系及最终交接。
本文是仓库内可发现的历史入口；最终文档 PR 合并、当前工作区状态和 SHA-256 清单
写入外置后继回执，避免为记录自身合并号反复提交。关闭聊天不会删除 Git 文档和这些回执。

本轮没有新增产品、M4、生产、模型、站点或 cron 操作，也未唤醒或发消息给其他会话。
检查选择文档可达性、改动路由、diff 和正常必需 CI；不为文档重复界面/设备/主题矩阵。

经验：按工程、证据、授权分别销账；先核当前安装源再执行旧换源计划；patch-id 不同仍需
核原意图；网络复核失败不等于删除失败；clean/merged 不等于 owner 已释放。
可执行收尾完成后，剩余项按表中 owner/触发等待，不把等待伪装成工程未提交，也不宣称
全历史零待办。跨摘要累计活动时长未可靠采集，因此不编造执行效率数字。
