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

## 规则（必读）

1. **内测阶段仅文档。** 本表记录推荐最低配与发版顺序备注；不实现、也不授权实现运行时硬拒、双阶段门禁或 `minimum_supported_connector_version`。
2. **契约字符串精确匹配仍是唯一硬门。** Cloud 与 Addon 对 `contract_version`（及同类身份字段）做精确字符串匹配；不匹配即结构化拒绝。版本号推荐不能替代契约匹配。
3. **发版必须改本表一行。** 每次 Cloud / Addon / Toolbox 联合发版（或任一仓改动活跃契约名、推荐地板），在本表**新增或更新一行**，并填写当日日期与 Cloud 发布标识（SHA 或 tag）。
4. **与 ADR-053 的关系。** [ADR-053](decisions/053-defer-bounded-contract-compatibility-until-public-ecosystem-distribution.md) 接受在公开分发前保持 `ONE_ACTIVE_CONTRACT_VERSION`，并预宣告触发后才引入有界兼容窗口与 `minimum_supported_connector_version`。本表是**文档先行**的操作台账：触发条件未满足前，不引入该机制；本表不改变 ADR-053 的决策。

## 兼容表

| Cloud 发布标识(SHA/tag) | 活跃契约名 | 推荐 Addon≥ | 推荐 Toolbox≥ | WP 地板 | 发布顺序备注 | 更新日期 |
| --- | --- | --- | --- | --- | --- | --- |
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
