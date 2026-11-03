# A02 旧分支九份文档保全与替代对账 — 2026-10-28

Status: dated documentation reconciliation. 记录本次原件保全及经验提炼，
不证明新的运行验收、生产发布或所有历史事项清零。

## 身份和处置

核对基线为 master `1bc9435b5ce3de2b2094c7b8f1c27adfba0aa8ee`；
原件取自旧分支 `codex/admin-ia-v2-workspaces` 的
`5b2303a1152a99243bd4121fbb38a81a09d7f1ef`。当次分歧为旧分支领先12、落后95，
不作为未来库存，也不作为“12个提交未交付”的证明。

九个原路径在该 master 均不存在；此前 #1296/#1301 已合并的是其他收尾经验，
没有覆盖这九份原件。旧分支部分产品能力已有后续 PR 承接，不能整体重放旧提交。
本批只提炼仍适用的方法、建立替代索引；不把过期提案原样提升为现行规范。

## 九份原件与当前入口

下表路径为原提交内的历史位置，不意味着这些文件已按原貌导入 master。
只有 Portal 实现规范在原路径重建为经过校准的后继；原始字节另行保全。

| 原路径 | 生命周期与当前入口 |
| --- | --- |
| `docs/engineering/portal-frontend-feature-implementation-patterns.md` | 原稿 superseded；[校准后的实现规范](../../../engineering/portal-frontend-feature-implementation-patterns.md)保留 ORM、身份、事务和证据方法，移除独立吞异常及 facade 扩张建议 |
| `docs/strategy/2026/commercialization-frontoffice-expansion.md` | 旧执行计划 superseded；[有界商业契约](../../../engineering/commercial-development-next-stage-v1.md)替代 pre-seed、SQL 启用及“没有运行开关”的假设 |
| `docs/history/engineering/2026/portal-account-deletion-and-notification-inbox-closeout-2026-10-23.md` | 历史实现记录保全；当前状态转[队列 §1.10](../../../engineering-follow-up-queue-v1.md#110-portal-自助服务进阶能力2026-10-26-事实对账)，不再执行旧“下一步提交/通知判定” |
| `docs/history/strategy/2026/commercialization-review-2026-10-22.md` | 历史评估保全；范围以[Phase 1](../../../engineering/phase-1-scope.md)、商业契约和[只读经济口径](../../../engineering/admin-economics-readonly-contract.md)为准，旧价差与毛利推断不升为事实 |
| `docs/next-stage-plan-2026-10-24.md` | 六任务交接已被后继交付分解；当前用工程队列、[Provider 交付记录](model-provider-flow-closeout-and-lessons-2026-10-27.md)及[资源收尾记录](../../repository-hygiene/2026/resource-and-planning-closeout-2026-10-27.md)，不照抄变基、stash 序号或整库运行指令 |
| `docs/history/engineering/2026/site-knowledge-quota-credit-boundary-session-closeout-2026-10-23.md` | 历史决策背景保全；保留容量/积分独立、无消费者不提前重构的方法；[当前知识交付](portal-self-service-and-knowledge-delivery-2026-10-26.md)和范围政策决定下一步 |
| `docs/site-knowledge-capacity-quota-and-credit-boundary-v1.md` | 旧设计快照 superseded；以[知识运行契约](../../../site-knowledge-runtime-contract-v1.md)、[积分契约](../../../ai-credit-charge-contract-v1.md)及[Portal 用量契约](../../../portal-site-knowledge-usage-contract-v1.md)为准，不激活旧媒体/收费路线 |
| `docs/history/strategy/2026/unit-economics-admin-panel-plan-2026-10-23.md` | 历史规划/实施自述保全；实际 API、分摊、数据范围与权限由只读 Admin 经济契约限定，不复刻旧示例响应或平均分摊方案 |
| `docs/history/strategy/2026/unit-economics-patterns-and-lessons-2026-10-23.md` | 历史方法原稿保全；不同成本来源、币种、分母与期间分别核对，采纳部分进入实现规范；不据旧估算改 tariff/价格 |

## 更正旧遗漏结论

| 原判断 | 此次核对的源码范围；不是本批新交付 |
| --- | --- |
| 注销和通知只有本地提交 | #1227 已合入账号关闭和按工单提交人隔离的通知；客服回复、通知、审计同事务，失败回滚 |
| 没有数据导出 | #1236 已交付邮箱再验证的有界个人副本，路由为 `account/data-export/code`、`confirm`；不证明完整法律合规 |
| 没有知识库降量 | Cloud #1280/#1281、Addon #331/#332 已承接文本/图片排除恢复；用户操作在 WordPress，Portal 保持只读 |
| 没有超量通知 | #1246 已含 `runtime.ai_credits_denied` 和 `subscription.trial_expired`；周期/事件去重，非全部额度或邮件覆盖 |
| 没有会话/TOTP、迁移停在0089 | 会话和 TOTP 已有后继交付；本次源码链至0091，既有证据见工程队列及知识交付记录 |
| 没有商业停止闸门 | #1220 已有 `commercial_emergency_stop`；检查配置、守卫及调用者，不能只按错误码搜索 |
| 默认 Offer 一律自动退休 | 旧 ACTIVE 退休循环属于同账号 Agency 报价替换；标准套餐只补缺失默认 Offer，现有销售状态保留 |

这些结果来自当前源码和已有交付记录，本批不重新宣称它们完成新的用户、SMTP、
真实交易或生产验收。其他通知及商业扩张仍受现行范围约束。

## 原件、恢复与保留条件

本机私有保全包逻辑名称：`2026-10-28-a02-document-reconciliation`，位于该项目
task-receipts 下；不是公开下载地址，也不是仓库相对链接。
包含九份 `originals/` 原件、逐文件 SHA-256/blob 清单 `preservation.json`、
完整 `primary-full.bundle`、独立 bare 恢复库及源工作区未提交差异快照。
源工作区的前端生成文件改动保留原样；这些私有材料不进入本 PR。

归档引用为 `refs/archive/20261028-a02-documents/primary`，绑定上述5b提交。
bundle 的 SHA-256 为
`62ecef87009167b27186e1d3f7c6c67ee4a1c9b50494f93a12372c8d521141f2`。
已实际在空 bare 仓恢复：HEAD 一致、九份原件逐字节一致、strict/full fsck 通过。
这证明恢复材料可用，不代表源工作区所有 ignored/运行数据都已保全或允许删除。

跨机器恢复先校验私有 manifest，再在隔离空仓 `git bundle verify` 并导入 bundle
中的精确归档 ref；核 HEAD 和九份哈希后只读查看。不得覆盖当前主源码或自动恢复
Local/cron。需要实际安装/执行时重新核消费者、依赖和环境授权。

旧源工作区及其分支继续保留：仍有 primary 角色、其他会话与未提交改动。
本批不删除、变基或修改它，也不据备份成功解除 App 保护。后续只有 owner 交还、
App 支持角色释放、全部必要材料保全且新鲜消费者检查通过，才评审精确退休。
原件及 bundle 无自动过期删除；后继记录不能改写本包原件。

## 本批完成口径

完成目标是九份原件可恢复、有用经验入库、旧指令有明确替代入口。
本地只跑文档可达性、链接/路径、选择门禁及差异检查；CI、合并结果由 PR 单独记录。
不触碰产品源码、迁移、价格、配置、共享 M4、生产或真实交易。
真人使用、缺失历史原件和受保护资源按各自台账保留，不因本批文档完成而核销。
