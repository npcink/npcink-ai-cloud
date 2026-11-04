# Portal 自助功能实现与交接规范

Status: active engineering standard. 2026-10-28 从旧分支经验提炼，替代同路径
2026-10-23 原稿；原稿与另外八份材料的保全及替代关系见
[历史对账](../history/engineering/2026/a02-document-reconciliation-2026-10-28.md)。
本文不新增产品范围、生产授权或验收结果；适用范围是现有 Portal 自助功能维护。

## 1. 先核交付身份，再判定缺失

先记录当前工作区、HEAD、最新 `origin/master` 和相关 PR。`[gone]`、ahead/behind
只描述引用和提交图，不能证明功能尚未合并；squash 合并后提交 ID 本就可能不同。
比较最终实现、合并记录和适用证据，不能把整条旧分支重新变基后重复发布。
原始提交与必要未提交材料先保全并验证恢复，再单独安排分支退休。

查功能要沿已挂载路由、前端消费者、领域方法和测试追踪，不能只搜猜测的名字：
个人副本实际使用 `/portal/v1/account/data-export/{code|confirm}`，不是
`account/export`。入口是否存在与当前用户是否有权限、环境是否可用分别判断。
当前交付清单见[工程队列 §1.10](../engineering-follow-up-queue-v1.md#110-portal-自助服务进阶能力2026-10-26-事实对账)。

## 2. 状态写入必须验证持久化结果

- 普通 JSON/JSONB 属性的增量更新应构造新对象并赋回，保留原有键；不依赖同一
  dict 的原地修改触发脏检查，也不把整列覆盖误当 merge。
- 先核 ORM 的真实字段及 account/site/principal 关系，再写过滤条件；解绑之前
  收集后续撤销所需的站点身份，不能解绑后再猜关联。
- 不假设所有 SQLAlchemy `Result` 都支持可靠 `rowcount`；按实际执行结果类型
  和驱动语义判断，类型转换本身不能修复运行时对象。
- 写库行为的回归应在提交后以新 session 回读关键状态与元数据，并覆盖失败回滚、
  越权及重放。接口返回计数、语法检查和类型检查不能代替持久化断言。

复用显式的领域仓储和既有调用路径；不要为了让消费者自动获得 CRUD，重新扩张
已被约束的 CommercialRepository 多继承 facade。

## 3. 通知事务按业务语义维护

公开客服回复的收件人是原工单提交人；回复、站内通知和服务审计在同一事务提交。
通知数据库写入失败时该回复事务回滚，不能恢复路由层另开 session、吞异常的旧实现。
参照[支持域](../../app/domain/commercial/mixins/_support_mixin.py)及
[事务回归](../../tests/domain/test_portal_support_notification_transaction.py)。

试用实际结束和 AI 积分执行拒绝复用
[领域通知帮助函数](../../app/domain/commercial/notifications.py)：核实唯一有效 owner、
principal 和邮箱，按各自事件范围生成确定性 ID。缺可靠身份或订阅周期则跳过；
同一周期的积分拒绝不能重复提醒。现有两类事件不是全部额度或支付通知覆盖。
参照[生命周期回归](../../tests/domain/test_commercial_lifecycle_notifications.py)。

不能笼统将通知、审计都归为“可丢失数据”，也不能用 HTTP 响应成功后的写入假装
可靠投递。新的 outbox、补偿扫描、SMTP 或通知扩张均需另行具名安排。

## 4. 复用身份与界面契约

验证码应绑定独立 purpose、当前身份和操作范围，复用适用的限流、有效期、尝试次数
与消费规则；不将其他流程的验证码或持久邮箱标志当作本次授权。
账号关闭、个人数据副本、会话撤销和 TOTP 的风险及失效条件各不相同，分别遵循
[个人副本](../portal-personal-data-copy-v1.md)、
[会话注册](../portal-session-registry-v1.md)及[TOTP](../portal-totp-v1.md)契约。
个人副本范围有限，不证明全部法律合规；会话列表不证明物理设备身份。

Portal 复用现有页面布局和状态组件，入口遵循
[Portal IA](../portal-ui-spec.md)。新文案核对现行 i18n 注册与完整性契约。
按[PC 选择检查规范](../frontend-pc-scope-and-selective-verification-v1.md)验证受影响
页面、交互和错误态；局部修改不反复跑全后台，也不削弱强制 CI。

## 5. 商业冻结、销售状态和运行开关分别判断

产品冻结是开发范围政策；既有销售例外见
[有界商业契约](commercial-development-next-stage-v1.md)，不能推导为所有购买不可用。
`Settings.commercial_emergency_stop` 是实际运行闸门，环境变量名由
`NPCINK_CLOUD_` 前缀解析；不能因为只搜到错误码就判定没有阻断。
核对[配置](../../app/core/config.py)、
[销售守卫](../../app/domain/commercial/mixins/_audit_mixin.py)和实际调用者。

默认套餐仅补缺失 Offer，已有撤销状态应保留；创建 Agency 报价时退休同账号旧报价
属于另一场景。不能把该循环推广为所有套餐的播种行为，不照抄旧 pre-seed/SQL
启用或回滚方案。积分包还需核现有 ServiceSetting 覆盖，不能把 Python 默认表当作
唯一销售真相。生产配置、部署与真实交易仍需具体动作授权。

## 6. 知识容量、积分与经济估算保持边界

知识容量配额保护持久索引规模，AI 积分计量相应执行消费，二者保留独立语义。
当前只交付文本/图片知识；WordPress 原生排除/恢复拥有用户控制，Portal 只读展示。
参照[运行契约](../site-knowledge-runtime-contract-v1.md)与
[Portal 用量契约](../portal-site-knowledge-usage-contract-v1.md)。
不把旧稿的 PDF/视频/OCR/ASR、动态配额映射或索引收费路线视为已批准任务；
新增媒体和计费必须重新核范围、跨仓契约及[Phase 1](phase-1-scope.md)。

经济估算复用[只读 Admin 契约](admin-economics-readonly-contract.md)：积分、运营
tariff、Provider 估算和供应商账单是不同口径。零记录成本不证明免费，USD 与 CNY
不直接相加，缺数据不填成零；按相同期间、币种和覆盖范围核对后才解释差异。
浏览器账单草稿不成为服务器账本，不据估算自动改价格、额度或费率。

## 7. 验收与停止条件

新增表结构必须有符合当前链路的 Alembic 迁移；运行验证走
[验证命令](verification-commands.md)及[开发/集成/发布车道](../development-validation-operating-model-v1.md)。
迁移往返测试仅在隔离测试库执行，不对共享库或生产照抄 downgrade。

先复核已有证据的源、依赖、环境和风险问题，匹配时复用；有新变化或明确缺口才补
窄验证。mock 浏览器不证明真实 API/数据库，领域调用不证明页面采用，受控邮件
不证明实际 SMTP。分别报告 local、CI、merged、M4 candidate/accepted、production
与 human；文档整理不新增运行验收结论。

交接遵循[收尾效率规范](zero-backlog-closeout-efficiency-standard-v1.md)：工程、证据、
授权分轨，一份活动台账，原封包不改。历史下一步指令、分支计数和 stash 序号
不是今天的执行授权；先核具体身份再续做，缺新线索时停止重复调查。
