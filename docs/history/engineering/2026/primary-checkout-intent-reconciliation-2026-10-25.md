# 主 checkout 九篇历史文档对账与开发经验 — 2026-10-25

状态：历史对账记录。本文记录旧意图的承接与纠偏，不是新的产品范围、运行时契约或发布授权。

## 阅读范围与证据

旧稿来自受保护的主 checkout `f3e591abfd011244470d9456e7729db7ba913df6`。
九篇全文共 2,293 行，逐段复核覆盖 127 个处置段；另按列表、表格和代码块提取
1,260 条子句索引。行覆盖不等于自然语言语义或所有关联仓库已穷尽核验。
本次入库核对基线为 `508b36aa3bebe84be1904f0b0cefa32825122aef`；下列契约和
源码的比较内容相对前轮 `39e8d434`、`2fa99694` 未变。

旧全文和独有历史已另行可恢复保全；本批只提炼仍有效的经验、明确被替代的方案和
未完成义务，不整体恢复旧计划。旧 SQL、部署、迁移、stash 恢复、交易与清理命令
都是审计数据，不作为现在的执行指令。本文未运行产品测试或进行生产/交易验收。

## 九篇文档的最终文档处置

| 旧文档（路径见末表） | 保留价值与现行承接 | 不再照搬的结论 | 未完成边界 |
| --- | --- | --- | --- |
| Portal 前端实现模式 | JSON 赋新值、独立会话回读、先收集关系再撤销、验证码用途隔离；按当前路由与验证门使用 | 默认给 CommercialRepository 加多继承、所有 Result 都有 rowcount、独立 session 通知天然安全 | 这些是实现经验，不授权统一改造所有仓储或通知 |
| 注销与通知收件箱收口 | #1227 的有界关闭/收件箱及主事务原子回复；#1236 个人数据副本、后续会话/TOTP契约 | 把导出、通知、会话管理、2FA 和工单重开一概写成缺失 | 完整法律合规、全部通知渠道与生产验收仍需单独证据 |
| 知识库配额与积分会话收口 | 存储容量与推理积分双轨，索引维护只计量；由当前 runtime/credit 契约承接 | 立即改动态 quota、把 sync/status 计作普通扣费、将旧 OCR/CLIP 推测当实现 | 新来源、套餐容量维度和索引收费需要真实消费者及明确范围 |
| 商业化评审 | 区分用户积分、shadow 估算、Provider 调用记录和供应商账单；代码存在不等于真实收款 | 固定 credit→人民币、从估算推出实账毛利、将旧支付盘点当现场事实 | 支付、退款、试用、运营合规及跨仓分发现状另核；旧营销建议不是执行授权 |
| 单位经济面板计划 | 同月查询、浏览器账单草稿、分摊守恒、未知不写零；只读经济学契约承接 | knowledge×500、混合 token/run 权重、零权重均分、自动调价和账单上云 | 浏览器草稿不是商业账本；不得据旧方案建立账单表或回填费率 |
| 单位经济经验 | 成本/收入按币种、时间窗、分母和数据来源追证 | token 与 runs×500 混算，以及旧示例 0.005＜0.0099 却称月付更贵的反向算术 | 样本不足仍为 unknown，不从单点样本得出定价结论 |
| 下一阶段计划 | 分开源码、运行版本、历史收据；本次 queue §1.10 按后继交付修订 | 按旧 HEAD/64/27 数量执行清理，恢复已退休 stash 或重复集成旧提交 | ignored 聚合“27”的成员身份仍未知，既不声称丢失也不声称恢复 |
| 知识库容量与积分边界方案 | 双轨边界已由 runtime/credit 契约承接；扩展由真实消费者触发 | 将旧动态 dict、分钟/页数、媒体费率示例或索引 consume 建议当现行合同 | 当前四种 public source、两个配额字段；video/pdf 空桶不是媒体产品完成证据 |
| 商业前台扩展方案 | #1220 承接既有月套餐/积分包/共享试用、新交易限流与可恢复停止；历史回调/退款保持可用 | pre-seed ACTIVE、24h 年龄/三人名单、每天20单、假价格、共享 ensure 熔断或恢复时自动重新上架 | 微信、BYOK、年付、Agency 等仍是未批准的未来建议；生产与真实交易另授权 |

## 可复用的开发经验

### JSON 写入与关系撤销必须回读最终状态

普通 JSON/JSONB 字段原地修改可能未触发 ORM 脏检测。未配置可靠 mutable tracking
的路径应构造新 dict 后赋回，并在提交后用新 session 断言最终 JSON 和关联状态；
不能只检查 HTTP 响应或同一对象。账号关闭路径还应在释放绑定前收集被授权的站点集合，
按真实模型归属撤销 key，不能猜测 SiteApiKey 拥有 account_id。

当前参考：[账号关闭实现](../../../../app/domain/commercial/mixins/_portal_mixin.py)、
[PostgreSQL 自助服务验证](../../../../tests/integration/test_portal_self_service_postgres.py)。
`rowcount` 也须依实际 CursorResult 等返回类型判断，不能泛化到所有 execute 结果。

### 事务边界看持久化结果，不看代码的调用顺序

当前客服公开回复、Portal 通知和服务审计在同一事务提交；任一写入或 commit 失败
应一起回滚。旧稿的独立通知 session、吞错和补偿扫描建议已被后继合同替代。
SMTP 在主事务提交后处理，不由此扩展新的通知渠道。

[事务回读测试](../../../../tests/domain/test_portal_support_notification_transaction.py)
覆盖通知、审计及 commit 失败，并从新 session 核对三类记录；
[支持域实现](../../../../app/domain/commercial/mixins/_support_mixin.py)是当前行为。
新功能应显式使用需要的仓储，不把旧多继承建议提升为默认模式。

### 成本数据先对齐来源、时间窗、币种和分母

用户 credit ledger、shadow tariff、ProviderCallRecord、usage meter 和供应商实账
分别回答不同问题。没有记录到成本不等于零成本；账单草稿仅存在浏览器，不是服务端账本。
[只读经济学契约](../../../engineering/admin-economics-readonly-contract.md)使用 UTC
半开月、实收/成功退款时点和 CNY 收入，USD Provider 证据不混加。所选 family 全有
正 token 才用 token 权重，否则统一用 run 权重；总权重为零保持未分摊。

### 容量、计量和收费分别验证

[知识库运行契约](../../../site-knowledge-runtime-contract-v1.md)与
[AI 积分契约](../../../ai-credit-charge-contract-v1.md)把容量护栏与推理消费分开。
索引维护可留下 run、Provider、token、成本和文档/chunk 证据而不扣普通 AI credits；
search 与下游生成仍按现行消费规则。旧稿不能自动启动动态 quota、新媒体 projection
或索引收费；去重、删除重建、失败退款和跨仓 schema 前置条件须分别解决。

### 历史建议先核后继，验收状态分开写

已有代码、主分支合入、CI、本地、M4 candidate、M4 accepted、production 与 human
是不同证据。旧计划和旧环境命令不能覆盖当前契约；只读审计也不等于清理/发布授权。
[工作区生命周期](../../../single-session-worktree-lifecycle-v1.md)要求先核独有内容、
消费者与恢复能力，再分别处理目录、注册和 refs。保全只证明可恢复，不证明功能交付。

## 仍保留的义务

- [Portal 队列 §1.10](../../../engineering-follow-up-queue-v1.md#110-portal-自助服务进阶能力2026-10-25-事实对账)
  保留公开 TOTP 自助开通、知识库索引自助降量及其他具体通知需求，不能因已有 T2 或收件箱而全部勾完。
- 既有销售与共享14天试用遵守[有界商业契约](../../../engineering/commercial-development-next-stage-v1.md)；
  Phase 1 自然使用、真实编辑器采用、支付/退款、试用周期、现场邮件及生产证据仍独立补齐。
- 获客、BYOK、年付、Agency、广泛风控、MRR/CAC 看板和法律/运营事项只是旧建议或待核现场，
  不因历史文档入库而获得新开发、联系他人或主机操作授权。
- ignored“27”来自目录折叠计数，缺逐项名称/哈希。该身份缺口仍开放；全文归档、代码合入和
  文档对账均不能倒推出全部资产已恢复。全仓/跨仓清零仍需最终逐项验收。

## 旧稿来源指纹

下列路径均相对于旧快照 `f3e591abfd011244470d9456e7729db7ba913df6`；
它们不是当前应恢复或执行的路径。Git blob 和 SHA-256 绑定本次实际审阅内容。

| 历史路径 | Git blob | SHA-256 |
| --- | --- | --- |
| `docs/engineering/portal-frontend-feature-implementation-patterns.md` | `2738668d86d18b38e00c028ed40d2506524035bf` | `3386cccf33e0197210c0d0327cb420c8abc62bfb4b7db2c151a3b912f04abf44` |
| `docs/history/engineering/2026/portal-account-deletion-and-notification-inbox-closeout-2026-10-23.md` | `19b55b6c83c0c2168261918aca08edabfc8e28ad` | `2480068d4656a6afd9ff8ad03f214950e5b53ec737aca14a623018b4541b5738` |
| `docs/history/engineering/2026/site-knowledge-quota-credit-boundary-session-closeout-2026-10-23.md` | `890f45fd0c7e9e2a14d0cb41d13c418dc6cbb20f` | `63cae220738f2e9bec6e588c6bc88e1ba78cb22f42b4b11e6dd15dbae3d2b549` |
| `docs/history/strategy/2026/commercialization-review-2026-10-22.md` | `449b043596bd6ceb450c02c26c0b5b516dadceac` | `56466722232055b81843037b2f9d969362547bd5a9a3cdead53d5f90cd753ede` |
| `docs/history/strategy/2026/unit-economics-admin-panel-plan-2026-10-23.md` | `164e2a685b1e5bb3f5aa92b86fb40585a2c89e2a` | `e6256802f2027872523c99430456340caf0535e71d56fcc7211b9aca6457cc2a` |
| `docs/history/strategy/2026/unit-economics-patterns-and-lessons-2026-10-23.md` | `52664023053c92ac3b1ab32057ebb51cb0e2f018` | `c6eaa87d949a89994e4f3f64966b08b20ec9f8626f9a29ce84f8e1ca507e68d7` |
| `docs/next-stage-plan-2026-10-24.md` | `4f801a3a803ce008636cd86fba0704e696e309df` | `20355d0da418abfa91aac9624eed9b9e00825d5c7c24da1bb9efc37369495412` |
| `docs/site-knowledge-capacity-quota-and-credit-boundary-v1.md` | `eefe1a40f727e60eb5c6b942eebfb7f66fe03891` | `d5bc568bab1d1e96c85ffc436f2650af154286cdf4324dc034b2799b3d34efca` |
| `docs/strategy/2026/commercialization-frontoffice-expansion.md` | `274abb1c8b25eebad48ce9142bb4be7486b36622` | `c0008e46115fce06e64069a938055a78960f7669d84e6ab1500d9a60b19d2327` |
