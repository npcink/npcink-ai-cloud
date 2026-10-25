# Provider-model 历史方案原件与当前处置 — 2026-10-26

状态：历史原件入库与处置说明。用于 SELF-09 文档义务，不恢复 active plan，
不新增产品范围，也不声明全历史清零或生产验收。

## 原件与来源

[完整历史原件](sources/provider-model-management-remediation-plan-v1.original.txt)
按原始字节保留为 `.txt`；其中 Markdown 相对链接、旧执行命令与“待执行”措辞均为
历史文本，不是当前导航或执行指令。当前导航从本说明进入。

- 原历史路径：`docs/engineering/provider-model-management-remediation-plan-v1.md`。
- 来源：既有 stash-retirement 私有归档的 `historical-documents-index.json`，
  对应历史 stash `5ed0ccb41341426202ed75c1ab834786369936ce` 的 untracked parent。
- 原件长度：7,889 bytes。
- Git blob：`b7cf4a96f3a1273c2ae447e69fbc12f6feb0b2be`。
- SHA-256：`6b67618392184b64c16bb0b2d8653fc7a9731078020f8c4952bbecf7a1d3bb7b`。

原件只是恢复历史来源，不将旧风险判断、参数或验证命令提升为现行真相。

## P0 已由后继交付

原方案 §2/§3 的 kind 保存校验与 model_ids 读取收口，已由
`364787b5ea779178b5f7153848db0440c4c5e77b`（PR #1206）交付。
本次静态核对基线 `6295deafce3b794b72f7b6c51e1be84fc8796df3` 中，
原五个实现/测试文件相对该提交没有差异：registry、model_allowlist、service，
以及 provider connection registry/projection 两份 domain 测试。
这证明后继源码承接；不是本次重新运行测试或生产现场验证。

当前实现优先读取 config model_ids，保留 metadata fallback。原文“待执行”不再用于
描述这些 P0；本次不得重复实施 P0，也不得删除 metadata fallback。

## §6 后续建议分项保留

原方案 §6 明示“不含实施”，本次入库不授予执行授权。

| 原建议 | 当前处置与边界 |
| --- | --- |
| 存量 metadata-only model_ids 核查 | 本次未查询生产库，不能声称存量为零；即使数量为零也不自动授权删除 fallback。 |
| namespace prefix 收口 | 作为原有后续建议保留，本次不实施、不称已交付。 |
| catalog 工具模块抽离 | 作为原有后续建议保留，不凭旧稿推断循环导入事故或自动重构。 |
| 动态发现与 fetch_catalog 回填 | 当前 service 已有 catalog preview 与 fetch_catalog 调用，不能写成完全没有模型发现；“连接测试成功后自动回填可选模型”的完整流程本次未验，不标完成。 |
| adapter 分发表重构 | 原后续建议，本次不实施。 |
| preset 后端化 | 原后续建议，不改变现行 prompt/router/preset 归属。 |
| deprecated 模型通知 | 原后续建议，不因已有 deprecated 字段或 Portal inbox 就认定通知流程完成，不自动扩展通知。 |

## 当前依据与验证边界

当前行为以 [registry](../../../../app/adapters/providers/registry.py)、
[model_ids 读取](../../../../app/domain/provider_connections/model_allowlist.py)、
[service](../../../../app/domain/provider_connections/service.py) 和当前测试为准。
历史方案与原 stash 均不作为恢复代码、查询数据库、调用 Provider 或部署的指令。

本次交付仅包含原件、说明与索引；原件字节校验和文档门不等于产品测试、
DB/M4/Provider/生产验证。完整现场与价值验收仍须独立证据。
