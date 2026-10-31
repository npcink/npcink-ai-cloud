# 最低配兼容表（内测）

Status: active documentation sole source of truth for recommended Cloud ↔ Addon ↔ Toolbox floors during the closed beta. **Docs only** — no runtime hard reject and no dual-phase gate.

## 决策摘要

- **一人开发、用户少**：不做运行时硬拒 / 双阶段版本门禁。
- **兼容**：以本表为单一真相源；发版手改一行；契约字符串精确匹配仍是唯一硬门。
- **排障**：从 Cloud / 门户往下，优先 `run_id`；勿用 Toolbox / Addon 本地可读 trace 直接搜 Cloud。
- **边界**：Toolbox = 能力库；ai-cloud = 编排 / 门户；Addon = 站内插件。
- **契约变更默认**：旧契约保留约 **3 个 Cloud 小版本**（约 3–6 周）——期间提示升级但功能正常，到期硬切停旧；**不做长期双契约**。
- **联调环境（Cloud）**：`m4:preview:sync` → M4 Docker；Air 隧道 `127.0.0.1:18010`。
- **联调环境（Addon / Toolbox）**：不进 M4；本机 Local `magick-ai` 插件目录 symlink → gitee 仓。
- **联调方式**：开隧道 + magick-ai Base URL 指本机隧道；纯 PHP 改动默认不同步 M4。
- **完善时机**：有真实痛再补；避免提前设计。
- **Phase 2–3 backlog（Cloud）**：master e2e 债 / orphan running 清理 / Portal 502·busy 文案；生产仍需人类授权。见 [phase-2-3-follow-on-v1.md](engineering/phase-2-3-follow-on-v1.md)。

## 规则（必读）

1. **内测阶段仅文档。** 本表记录推荐最低配与发版顺序备注；不实现、也不授权实现运行时硬拒、双阶段门禁或 `minimum_supported_connector_version`。
2. **契约字符串精确匹配仍是唯一硬门。** Cloud 与 Addon 对 `contract_version`（及同类身份字段）做精确字符串匹配；不匹配即结构化拒绝。版本号推荐不能替代契约匹配。
3. **发版必须改本表一行。** 每次 Cloud / Addon / Toolbox 联合发版（或任一仓改动活跃契约名、推荐地板），在本表**新增或更新一行**，并填写当日日期与 Cloud 发布标识（SHA 或 tag）。
4. **与 ADR-053 的关系。** [ADR-053](decisions/053-defer-bounded-contract-compatibility-until-public-ecosystem-distribution.md) 接受在公开分发前保持 `ONE_ACTIVE_CONTRACT_VERSION`，并预宣告触发后才引入有界兼容窗口与 `minimum_supported_connector_version`。本表是**文档先行**的操作台账：触发条件未满足前，不引入该机制；本表不改变 ADR-053 的决策。

## 兼容表

| Cloud 发布标识(SHA/tag) | 活跃契约名 | 推荐 Addon≥ | 推荐 Toolbox≥ | WP 地板 | 发布顺序备注 | 更新日期 |
| --- | --- | --- | --- | --- | --- | --- |
| Cloud `codex/vision-timeout-20261030` `5dd4c9d1` + local Addon detached commits `b75a944`/`4654f9b`（未合入、开发配置） | `image_context_evidence.v1` unchanged；本地开发增加 loopback-only 180s image wait opt-in | **0.4.4**；需本地 Addon timeout candidate 或后继源码，版本号本身不证明包含 | **0.6.0** | **WP ≥ 7.0** | **Cloud → Addon → Toolbox**。历史 30s 原图单/双图失败仍保留；本地开发 180s/200s HTTP 等待下，2560×1440 单图与 2560×1736 + 2560×1440 双图已成功。69 张旧图缺原文件，继续 metadata-only。该行是未合入的开发候选，不代表 clean-master、生产或自然采用接受；见[识图调查回执](history/engineering/2026/vision-timeout-investigation-2026-10-30.md)。 | 2026-10-31 |
| Cloud #1317/#1322/#1323 `fe283b66`（M4 accepted；非生产） | `site_knowledge_delivery_evidence.v1` additive `wordpress_public_text_bytes.v2`（48,000 bytes）；`ai_task_contract.v1` additive `site_knowledge_evidence` / `site_factual_evidence`；`grounded_answer_evidence.v1` | **0.4.4**；需 Addon #336 全文投递及 #337 `cc312720` 重复撤回修复或后继源码，版本号本身不证明包含 | **0.6.0**；本站内容问答需 Toolbox #344 或后继源码；Ability `npcink-toolbox/answer-site-content` | **WP ≥ 7.0** | **Cloud → Addon → Toolbox**。开发问答、引用、撤回及 PC 浏览器通过；2 张原图通过 4096D 像素检索，单图理解通过，双图/全尺寸理解仍超时。69 张旧图缺原文件，保持 metadata-only。生产、正式安装包、代表性准确率与自然采用另验；见[真实验收回执](content-evidence-loop-v1.md#actual-answer-and-image-acceptance--2026-10-30)。 | 2026-10-30 |
| Cloud `codex/media-pixel-refresh-20261029` candidate（非生产） | `site_knowledge_sync.v1` 不变；同空间 metadata-only 旧图片补齐原图后仍重建像素向量 | **0.4.4** | **0.6.0** | **WP ≥ 7.0** | #1310 的窄恢复修复；不增加端点、供应商或数据库。 | 2026-10-29 |
| Cloud #1310 `7daca608` 已合入（非生产） | `site_knowledge_sync.v1` additive `media_items[].source_artifact_id`；本地 4096D 图文同空间，Admin additive `runtime` 只读投影 | **0.4.4**；artifact 可选，旧公开 HTTPS producer 保留 | **0.6.0** | **WP ≥ 7.0** | Cloud 源码 → 小批量真实验证 → 开发索引重建与同供应商切换；生产配置及发布不变。 | 2026-10-29 |
| Cloud `codex/site-knowledge-refresh-safety` candidate（未合入、非生产） | `site_knowledge_sync.v1` additive `withdrawn_post_ids` / `withdrawn_comment_ids`；refresh 漏传保留旧索引 | **0.4.4**；需配套 explicit-withdrawal 源码，版本号本身不证明包含 | **0.6.0** | **WP ≥ 7.0** | 本次例外 **Addon → Cloud**：先迁移明确撤回 producer，再启用 preserve-on-omission；其它 producer 同样迁移；显式 delete/rebuild 保留。见 [刷新安全契约](site-knowledge-runtime-contract-v1.md#refresh-safety-and-explicit-withdrawal-2026-10-28-candidate)。 | 2026-10-28 |
| Cloud `codex/wordpress-schema-validation-closeout-20261026` candidate（未合入、非生产） | `wordpress_operation.v1`; `cloud_connector_runtime.v1`; `ai_task_contract.v1` 不变；title property enum/长度及JSON数值边界校验修复 | **0.4.4** | **0.6.0** | **WP ≥ 7.0** | Cloud返回校验修复；title-only投影与WordPress schema/写权不变；不构成Provider-native schema能力证明。见 [合同说明](ai-task-runtime-contract-v1.md#bounded-schema-validation-for-connector-results)。 | 2026-10-26 |
| Cloud #1280/#1281 开发集成 `7390fa0532b3d14de8355b1d6cdea92c5f544d35`（M4 accepted；非生产发布） | `site_knowledge_sync.v1`; `site_knowledge_status.v1` additive `source_items` / `source_presence`；pure `media_items` refresh 无需 `post_ids`，同内容 unchanged、变更精确替换旧 SQL/vector chunks | **0.4.4**；typed CAS/producer/UI 源码需 #331 `1b2d305a` 或后继（#332 `4641ec12`为补测；版本号本身不证明含该源码） | **0.6.0**（不放宽通用 refresh guard） | **WP ≥ 7.0** | **Cloud → Addon**；文本/图片原生排除/恢复已交付，Portal仅只读；保留legacy、mixed/rebuild既有边界，SQL/vector无跨库原子承诺。Cloud M4与Addon合入/CI分别记录；未证明正式安装包、生产或自然采用。见 [runtime contract](site-knowledge-runtime-contract-v1.md#bounded-typed-deletion-and-storage-presence)及[交付记录](history/engineering/2026/portal-self-service-and-knowledge-delivery-2026-10-26.md)。 | 2026-10-26 |
| `c1278c11` (`c1278c11ea2e73cd6a89ba70ea8bee013b46bc67`, `origin/master` @ 2026-10-20) | `wordpress_operation.v1`; `cloud_connector_runtime.v1`; `ai_task_contract.v1` | **0.4.4** | **0.6.0** | **WP ≥ 7.0**（取 Addon 地板；Toolbox readme 为 6.9，联合部署以 Addon 为准） | 内测推荐顺序：**Cloud → Addon → Toolbox**。契约不匹配仍失败；本行不构成运行时版本硬门。 | 2026-10-20 |

### 示例行来源（可核查）

| 字段 | 来源 |
| --- | --- |
| Cloud SHA | `origin/master` @ `c1278c11ea2e73cd6a89ba70ea8bee013b46bc67`（2026-10-20 fetch） |
| `wordpress_operation.v1` / `ai_task_contract.v1` | Cloud `app/domain/wordpress_ai_connector/contracts.py`（`WORDPRESS_OPERATION_CONTRACT` / `AI_TASK_CONTRACT`）；ADR-053 亦列举 |
| `cloud_connector_runtime.v1` | ADR-053 Context；Addon 行为测试与请求体 `contract_version` |
| Addon ≥ 0.4.4 | Addon `readme.txt` Stable tag / `npcink-cloud-addon.php` Version `0.4.4` |
| Toolbox ≥ 0.6.0 | Toolbox `readme.txt` Stable tag `0.6.0` |
| WP ≥ 7.0 | Addon `Requires at least: 7.0`（`readme.txt` 与插件头）；联合部署地板取 Addon |

## 非目标

- 不实现 `minimum_supported_connector_version` / `minimum_supported_contract_version` / `upgrade_required` 运行时路径（见 ADR-053 触发条件）。
- 不替代各仓契约测试或 pause 对照表；pause 清单仍以 [Reversible Feature Pauses](reversible-feature-pauses-v1.md) 与 Addon/Toolbox 同名文档为准。
- 不声称生产机已加载某 SHA；本表是发版推荐台账，不是部署证明。

## 相关文档

- [ADR-053: Defer Bounded Contract Compatibility Until Public Ecosystem Distribution](decisions/053-defer-bounded-contract-compatibility-until-public-ecosystem-distribution.md)
- [Reversible Feature Pauses](reversible-feature-pauses-v1.md)
- [WordPress AI 能力兼容矩阵](wordpress-ai-capability-compatibility-matrix-v1.md)（Ability/task 投影矩阵；与本表的「发布地板」不同维）
