# 客户服务通知 v1

Status: bounded implementation contract, authorized by the operator on 2026-11-03.
Source implementation, validation, merge and production remain separate evidence states.

## 范围与入口

操作者明确要求落实临时客户通知。此批为通知扩张冻结的具名例外：手动立即
发送纯文本服务消息到已有 Portal 收件箱，并修复既有通知的说明、分类和链接。
Cloud 自有客户服务消息不改变 WordPress 能力、审批、提示词或最终写入所有权。
不含邮件群发、营销分组、定时发布、自动撤回、推送、WordPress 通知或新基础设施。

- Admin 客户工作区的「客户通知」：`/admin/customer-notifications`。
- 客户详情「发送通知」：进入同一页面，预选该账户。
- Portal 右上角铃铛：`/portal/notifications`。
- 临时消息在正文写明生效/结束时间，发送后记录继续保留。
- 门户访问才会展示站内消息；该渠道不保证即时触达，不用于替代紧急直接联系。

## 收件与发送

1. 指定客户，或全部当前活跃账户。每账户仅面向唯一 active owner、active
   principal 且可规范化邮箱；账户缺失/停用、收件人缺失/歧义均明确跳过。
2. 预览保存不可变标题、正文、链接、操作者及账户/收件人快照。最多 1,000
   个账户，超过则拒绝，不静默截断。新增账户不会加入旧预览。
3. 预览有效期 30 分钟。只有生成该预览的操作者可确认发送；修改内容须新建
   预览。发送再次复核原身份、邮箱和有效性；变化时跳过，不改发给新负责人。
4. 使用已有 `portal_notifications` 逐收件人写入。发送、批次终态、审计同事务；
   任一持久化失败整批回滚。没有部分成功或后台自动重试。
5. 批次 ID 不变时重复发送只返回既有结果；PostgreSQL 事务锁保证并发去重。
   收件人资源按固定顺序锁定，避免不同批次反向锁序。
6. 本地草稿与待确认批次仅保留在按管理员/预选账户区分的 sessionStorage。
   无法保留时阻止发送；页面离开有保护。未知结果先 GET 查询原批次。
   GET 看到 preview 不证明并发发送失败，重试也只能发送原批次。
7. 历史显示发送人、时间、内容、固定范围、已入收件箱/跳过/已读数量。
   「已入收件箱」不是「客户已看到」。事务失败不记作发送成功，原批次可回读。

## API 与数据

均使用现有 internal 鉴权；浏览器代理额外要求 `can_manage_accounts`。
写请求要求 Idempotency-Key。浏览器不能把任意 internal 路由透传为通知动作。

| Method | `/internal/service/admin` 下路径 | 行为 |
| --- | --- | --- |
| POST | `/customer-notifications` | 保存/重放不可变预览，客户端生成 `notice_` + 32 hex 批次 ID |
| GET | `/customer-notifications?limit=20&offset=0` | 服务端分页记录，limit 最大 50 |
| GET | `/customer-notifications/{dispatch_id}` | 只读查询预览或最终结果，禁止隐式发送 |
| POST | `/customer-notifications/{dispatch_id}/send` | 确认同一批次，重复调用不重复投递 |

预览输入：dispatch_id、title（1–255）、body（1–4000）、audience（selected/all）、
account_ids（selected 必填，最多 1,000）、link_href。链接仅允许无链接或既有
Portal 首页、账号、套餐、用量、支持入口。全部范围不能混带指定账户。

新增 `customer_notification_dispatches` 保存批次真值；通知及个人已读状态复用
已有收件箱。正文只存业务记录，不复制到审计 payload 或日志。审计保留批次、
范围、数量与操作者，不引入分析平台。

Portal 按服务通知、工单回复、试用结束、积分不足显示分类。静态站内链接及
有效工单链接可见，外链、协议相对路径、路径穿越等不显示可点击入口。

## 验证与回退

定向 domain/API 验证名单、权限、重放、时间、事务回滚；真实 PostgreSQL
隔离 schema 验证并发发送/预览及 0091→0092→0091 迁移。PC 浏览器验证指定/全部、
预览确认、草稿刷新、丢响应回读、历史及 Portal 链接；不发送真实客户消息。

回退应用源码时保留既有通知和审计。降级 0092 会移除新增批次记录，因此常规
回退优先保留新增表；确需降级必须在相应环境授权下先保全批次记录。
隔离 schema 降级测试只证明旧收件箱不被删除，不代表生产数据回退授权。
