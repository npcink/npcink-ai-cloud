# Admin 工单草稿与目录 v1

Status: active implementation contract; local candidate, independent acceptance pending.

本契约覆盖 B6-01/02/07/08，延续 [工单写入恢复](admin-support-write-recovery-v1.md)。
仅维护现有 Cloud 工单，不新增历史消息编辑/清除、通知、商业或 WordPress 写入能力。

## 草稿与提交

详情公开回复、内部备注、状态、附件共用既有 hook 的串行 guard。提交准备、发送或
未知期间禁用输入与处理函数，避免把后续输入误当已发送内容。目录编辑复用同一
hook：先验证当前详情和操作者，持久保存原意图，再 PATCH；未知只允许 GET 确认，
关闭/重开或刷新仍恢复相同 actor/key/target/path/digest/values，不重新发送。

普通草稿包含未提交文字、相对于当前有效详情的状态变化和已选文件。状态改回
原值不算脏；初读回填不算草稿。既有 GET 恢复不会覆盖脏状态或其他文字。
已提交字段归原意图所有，不能被普通丢弃清除；其他尚未提交字段仍是普通草稿。

详情和目录编辑复用 `useAdminNavigationGuard`：Back、侧栏与跨路径站内链接、
浏览器历史以及刷新/关闭得到现有 SPA 或原生提示。编辑弹窗的取消、关闭和 Escape
也走同一普通草稿确认。取消保留输入；明确丢弃只清普通字段。原生离开由浏览器
处理；不承诺浏览器崩溃后的普通草稿恢复，也不新增跨 tab 存储。已发送未知意图
继续受首组 same-tab 存储规则约束。干净页面无需确认。

## 新增内部备注

目录编辑输入叫「新增内部备注」，每次新编辑初始为空；旧备注仍在 Inspect 的
「内部处理」。空备注只改状态，保留历史；非空备注按后端既有规则追加一次内部
消息，不能修改或清除旧消息。状态与新备注共同进入同一个持久意图和 digest，
拒绝保留草稿；坏成功体/丢响应保留未知，原 GET 证据确认后才完成。

目录成功只在匹配回执并成功清理原存储快照后关闭弹窗、提示成功并使目录查询
失效，后续为当前范围 GET。开启下一次编辑时只移除这张票据的上次保存toast，
避免旧成功遮住当前未知阻塞，不清除其他通知。保留首组鉴权 anti-replay、领域事务、去重与 SELECT-only
确认，不改锁序、审计或投递路径。

## 目录边界

`fetchSupportRequests` 在写入 Query 缓存前按实际 `list_admin_support_requests`
序列化结构验证：`items` 数组、完整九项非负整数摘要，以及 limit/offset/total/
has_more。分页须匹配本次请求、原始条目数量和总数；合法空页、0计数合法。
行须有非空工单/账户身份、字符串内容、有效 topic/status/priority/waiting_on；
序列化可空/可选日期允许 null 或省略。既有 critical/urgent 与 low/normal/high
在目录与详情共享读取枚举；本组没有优先级写入入口。

`attention=waiting_for_operator` 只绑定 `waiting_on=operator`；`attention=overdue`
额外绑定 `waiting_since` 可解析且不晚于固定读取时点前 48 小时，缺失、无效或未到期
行局部报 issue。`q` 使用 trim/lower 后的 substring 绑定 request_id、email、title、
account_id、site_id 五个后端 LIKE 字段；空 q 合法，非空 q 无字段命中局部报 issue。
这些规则由纯函数接收显式 `asOf`，回归不依赖可变系统时间。

null、坏字段、错筛选范围或重复工单行局部隔离，列出数量/位置并保留合法行
服务端顺序。全部坏行显示「记录未通过校验」，不能说没有工单。顶层/摘要/分页
无效则整次读取失败，不缓存伪空目录或补零。保留已有成功页并显示读取失败/旧范围；
同范围失败也禁用编辑。读取中、旧范围、错误或部分坏行均禁止依赖目录的更新，
Retry 仅重新 GET。合法页面恢复后解除；独立工单详情仍自验身份及回执。

Apply、互斥视图、Inspect、服务器排序分页、分页范围和返回上下文保持原所有者。
不改共享导航、Query provider、壳层、collector、截图基线或门禁阈值。

## 证据

- `tests/domain/test_admin_support_operations.py`：状态空备注保留历史且不追加；新备注
  复用既有 replay 回归；真实目录 serializer 与共享 JSON fixture 逐字段比对。
- `frontend/tests/vitest/admin-support-directory-evidence.test.ts`：真实 fixture、合法空、
  可空日期、坏 envelope/summary/pagination、坏行/重复/范围及既有优先级。
- `frontend/tests/e2e/admin-support-drafts-directory.spec.ts`：普通草稿导航、原生刷新取消、
  未知原快照保护、目录备注语义、pending 输入、错误/旧范围/GET 恢复和双宽 PC 图。
- 原队列与 closure specs 保留行为断言；首组 late-response fixture 改为真实目录结构。
  [本地回执与失败记录](history/admin/2026/records/admin-support-drafts-directory-local-2026-11-02.md)。

local、CI、M4 candidate、merged、M4 accepted、人工验收及 production 分开报告。
