# Admin 工单写入恢复 v1

Status: implementation contract；开发候选证据见
[2026-11-02 本地记录](history/admin/2026/records/admin-support-write-recovery-local-2026-11-02.md)。
仅覆盖 B6-03/04/05/06。Cloud 工单既有写入的正确性维护；不增加通知产品、
WordPress 写入、草稿导航保护或目录能力。

## 提交与未知结果

详情的公开消息、内部备注、状态和附件共用一个串行 guard。按钮禁用和处理函数
防重入同时生效。每次提交先取得当前操作者身份，确认当前工单读取有效，再把
原 key、actor、目标、动作、method/path、规范 digest、提交值和 revision 保存到
同 tab `sessionStorage`，读回一致后才发送。消息保存必要的正文/visibility；
附件仅保存 filename/type/visibility/message_id、byte_size、内容 SHA256 和 digest，
不保存文件字节或 `content_base64`。文件最大 5 MiB，字节仅供当次 POST。

正文与文件名使用既有 Python `str.strip/split` 空白语义，包括 U+001C–001F、
U+0085；BOM、零宽空格不属于该空白集，必须保留。正文 values/body/digest、
提交后草稿比较、最小长度与恢复意图验证使用同一规范；长度按 Unicode 码点，
正文为 2–4000 码点。文件名折叠空白、去路径并按码点限制为191；截断后若暴露
空白边缘，发送前再去边缘，确保后端处理不再改变提交值。后端规范保持原样，
回执仍须精确匹配本地原意图；不能以采纳 server digest 来掩盖不一致。
旧版已经保存的不规范未知意图仍保守阻塞，不迁移原 key/digest、不清空或重发。

网络失败、泛化 5xx、`auth.replay_blocked`、冲突和坏/错目标成功体均是未知结果，
保留意图与草稿，阻止全部后续写入。刷新恢复同一意图；确认动作只 GET，
绝不自动 POST/PATCH 或换 key 重发。存储读/写/清除失败、意图损坏或 actor 变化
均 fail closed，不能通过清除未知意图开放写入。

只有明确的请求校验或已回滚域拒绝可以解除未提交意图，并保留普通草稿供修正。
消息持久成功与邮件投递独立：邮件失败不能变成“消息未保存”。确认无法追溯
邮件投递时仅报告持久成功，不推断已送达，也不补发。

## 业务去重与事务

复用 `ServiceAuditEvent` 与既有工单/消息/附件，不新增表或迁移。PG 的每次 Admin
写入都在同一个 Session、连接、事务内，依次：

1. 取得固定 namespace `npcink.admin.support.v1` 与 authenticated actor kind/ref、
   原 key 的 SHA256 前 64 位有符号值对应的 `pg_advisory_xact_lock`。
2. 取得目标工单 `FOR UPDATE` 行锁。
3. 查询同 actor/key 的成功工单审计，最多两条；有唯一且精确匹配的审计和
   持久子记录时返回原回执。歧义、跨目标/动作/路径或不同 digest 返回
   `409 service.support_operation_conflict`。
4. 没有旧证据时写入领域记录、站内通知（仅公开消息）和成功审计，一次提交。
   新消息的邮件仍在该事务成功后发送；业务 replay 不再发邮件。

actor-key 锁先于工单行锁，使同 key 跨工单/动作也串行；不同 key 的同工单写入
由工单行锁串行。哈希碰撞只会多串行，不改变匹配条件。无 audit context 的旧内部
调用保留兼容并取得工单行锁；没有 key 时不声称业务去重。SQLite 不能证明 PG 锁。
现有鉴权 anti-replay 保持原样，鉴权窗口内同 key 仍可能返回 `auth.replay_blocked`；
窗口过期后的领域去重与只读确认是独立层。

## 接口与证据

既有 `POST /admin/support-requests/{id}/messages`、`/attachments` 与
`PATCH /admin/support-requests/{id}` 成功体增加 `operation_receipt`。回执包含
operation_id/request_id/action/digest、actor kind/ref、method、内部 path、event kind、
event ID、时间和适用的 message/attachment ID。原有业务数据字段保持；状态 PATCH
顶层回执便于消费，request 投影保留原字段。

新增浏览器 GET：

`/api/admin/support-requests/{id}/operations/{operation_id}?action=message|attachment|status&digest=<64 hex>`

由 BFF 精确 allowlist 路由到同名 `/internal/service/admin/...`，沿用
`can_manage_accounts`；仅 GET 放行该路径，无新权限。内部鉴权保持。

返回 `request_id/operation_id/action/digest/state/result`。`state=confirmed` 的
`result` 是当前工单、持久子记录与原回执；否则 `state=unconfirmed,result=null`。
判定依据为同 actor/key 唯一成功审计、精确目标/动作/method/path/digest 以及：

- 消息：持久 ID、工单/account/site、operator、正文与 visibility 重建 digest。
- 附件：持久 ID、归属、operator、文件名/类型/visibility/message 关联、字节数及
  内容 SHA256 重建 digest；有 message 关联时核实同目标及可见性。
- 状态：审计的原提交状态及适用内部 note child 重建 digest。审计只存状态与
  child ID，不复制备注正文。状态成功是历史转移证据，当前状态可已被别人改变。

当前值相同不是本次提交证据。缺失、改坏、重复、跨 actor/目标/动作的证据不确认。
新去重依赖保留的成功审计及子记录；未来变更清理/保留策略必须保持此证据寿命，
不能以清理审计为由允许未知操作重发。旧版本没有 digest 的历史记录不能猜测确认。

## SELECT-only 调用链与前端采纳

`BFF GET → requireAdminSessionData/can_manage_accounts → internal GET auth
(require_idempotency=False) → confirm_admin_support_operation → get_session →
工单 SELECT + 同 actor/key 审计 SELECT + 适用 child SELECT → 序列化`。
该成功/未确认领域链不 commit、flush、repair、补审计、建通知或发邮件。已有鉴权拒绝
安全审计边界保留，因此不宣称所有鉴权错误路径都数据库零写。

前端确认后先校验回执、目标和提交值，再核对 target/epoch/key；逐字比对原存储快照并成功清除同一
意图后，仅清对应提交草稿。之后只 GET 当前工单详情，不直接应用历史 response
快照，也不读账户 ledger、重型站点详情或执行 invalidation 写入。
普通 GET 恢复保留脏状态和其他普通草稿；旧 GET/写响应不得采纳到另一目标/epoch。

详情按实际 serializer 校验身份与必需字段，合法空集合可读；null、重复、坏字段和
跨目标子记录局部隔离并明确提示。初读失败或错目标时所有依赖写入关闭，保留
显式 GET 重试；坏成功体保留未知意图。下载校验目标、附件 ID/元数据和字节数。
本组不承诺第二组的普通草稿导航/刷新保护。

## 验证入口

- `tests/domain/test_admin_support_operations.py`：去重、冲突、证据损坏/歧义、状态
  历史与 note-only 兼容、5 MiB/超限及附件关联；既有通知事务测试保留。
- `tests/api/test_admin_support_operation_confirmation.py`：真实内部鉴权、窗口内拒绝、
  人工过期合成 guard 后正常鉴权回放、不重复邮件、确认 SQL 全 SELECT。
- `tests/integration/test_admin_support_operations_postgres.py`：两个实际 PG 事务，
  同 key、改 payload、跨目标及不同 key 跨动作的锁等待与提交后结果。使用既有
  disposable PG fixture；无测试数据库则显式 skip，必须在 M4 补验。
- `frontend/tests/vitest/admin-support-detail-evidence.test.ts`、
  `admin-support-confirmation-proxy.test.ts` 与 `admin-support-write-recovery.spec.ts`：
  校验、权限、未知恢复、storage、串行、迟到响应、初读恢复与 PC 双宽。
- `frontend/tests/fixtures/admin-support-unicode.json`：一次性合成数据库的实际
  领域 serializer 正文/附件输出；后端同文件回归验证其字段、digest 和原确认，
  `admin-support-unicode.test.ts`及定向浏览器验证两端空白规范、BOM保留、
  码点长度、正常及丢响应恢复。SQLite仅证明规范/序列化，不证明PG锁。

浏览器仅合成 mock，未匹配 API fail closed；原始事件逐条保留，沿用现有 collector，
未放宽错误分类或截图 golden。PG、CI、M4、合并、生产与人工验收必须单独报告。
