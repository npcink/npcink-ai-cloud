# 客户主投影与未知写结果确认：2A · 2026-11-01

本记录是 builder 本地交付；不代表集成、CI、M4 或生产验收。

## 范围与身份

- 派单／integrator：`01a190f3-ab78-7763-bad1-79cc8fd7a72d`（系统检查管理后台问题）；builder：`01a1929f-2271-7550-b73e-07abd2a0a629`（执行）。
- fetch 后基线 `origin/master=79adf441a80c3908e02e28996feee3c2deb26106`；分支 `codex/admin-customer-confirmation`。
- 工作树 `/Users/muze/.codex/worktrees/admin-services-vector-fixes/npcink-ai-cloud`；锁 `codex:01a1929f-2271-7550-b73e-07abd2a0a629`；交付后冻结并保留干净工作树与锁。
- 本批：B4-03 客户目录／客户详情主投影、B4-04 运营资料未知结果、B4-05 创建客户未知结果。
- 站点 B4-03、B4-11/12 留给后续 2B；B4-07/08/09/10 不在范围；输入冻结交叉覆盖 B4-06 的部分路径，但不宣称 B4-06 完成。
- 不改变价格、权益、销售／试用资格、支付、Provider、WordPress 写入或暂停功能；无 PR/push/merge、M4 操作、生产操作、真实客户或交易测试。

## B4-03：校验实际投影，拒绝显示默认值冒充成功

客户目录在归一化前要求真实 items 数组、非负安全整数 total（不少于当前 items 数量），每行必须有 account；主客户对象要求非空字符串 account_id/status、字符串 name、非数组 metadata 对象。详情还要求 account_id 与目标 URL 完全一致。合法空列表、越界空页、空客户名称保留兼容；不把可选 sites/stats 一并收紧。

畸形目录保留原错误与 Refresh 入口，禁用新建入口；详情坏主投影清除客户，不开放运营资料写入。详情读取使用请求序号，客户切换／卸载后旧读取不能覆盖新客户。校验在组件默认值之前，不通过 URL 补造客户对象。

## B4-04：资料保存先保留意图，恢复只读取

沿用 B4-01 专用 PATCH，只提交 trim 后的显示名／备注。派发前在同一标签页 sessionStorage 保存客户 ID、原 Idempotency-Key 和两字段快照；存储不可用或损坏时阻止新写入。保存／待确认期间字段及再次提交冻结，刷新恢复原意图。

成功响应要求真实目标 account、name/status/metadata 结构，且实际服务端 metadata 两字段与原提交值一致；空字段可由缺省键表示，null 不冒充已清除。不用旧 metadata 合成成功。网络丢响应、实际 12 秒超时、畸形成功、replay、408、未知 409、500 均保留意图，自动尝试一次原客户 GET，之后只提供 GET 确认。读失败／字段不匹配仍冻结；GET 匹配只证明当前值已保存，不声称唯一证明原 PATCH 完成。

恢复提示放在六个详情页签上方，含未知结果、原字段快照、原操作 ID、读取失败与 GET 入口；不会因编辑器折叠或切换页签隐藏。完整字段快照放在具名、可键盘聚焦的最多 96px 正文滚动区，长备注不推走状态和读取动作。既有编辑器仍在 Overview。明确校验／客户不存在等窄错误码才释放意图供修正；不以所有 4xx 推断未写。

上下文 revision、当前操作 ID 与回调隔离旧结果；旧返回不能修改另一客户、释放新 busy、覆盖新字段或删除较新的持久意图。浏览器真实 hook 夹具覆盖切换客户、旧成功、旧丢响应和旧操作被 GET 确认后又开始新意图的重叠。

## B4-05：创建只核对原操作的持久审计，不猜客户

创建请求在派发前保留原操作 ID 和完整归一化提交快照；POST 使用该键。未知结果不生成新键、不重发 POST，关闭／重开、刷新仍恢复冻结快照。关闭弹窗后目录常显姓名／邮箱、未知结果、操作 ID、GET 入口。明确邮箱归属冲突／身份不可用使用安全中英文具体原因，保留可修正字段；修正后才生成新意图。

既有 upsert 仅在“未提供 account_id、确实创建 owner identity 且有审计上下文”时，把 creation_operation_id 写入同事务成功审计；直接响应附 creation_receipt（原键、生成 account_id、audit_event_id）。不新增表、迁移、幂等框架，也不改变通用 upsert／既有 replay 语义。

新增 GET `/internal/service/admin/accounts/creation-operations/{operation_id}?primary_email=...`，浏览器对应 `/api/admin/...`。代理仅 GET、仅 can_manage_accounts；不能用 audit capability 替代。后端沿用 internal/admin 鉴权，精确匹配原 key、已认证 actor_kind/ref、account.upsert succeeded、原 POST 路径、account scope，并用 limit 2 拒绝歧义。再核对审计内创建标记、生成 ID、原 owner email、真实 Account/Principal/AccountUserMembership 及 active owner 关系。

无唯一证据返回 unconfirmed/null，不泄露其他 actor/customer ID、不按最近列表／邮箱同名／默认账号猜测，也不开放再创建。确认只读 SELECT，不调用 reconcile/upsert、不写成功审计或订阅。API 反复 GET 的五类实体计数不变。长备注不拿被截断审计文本当唯一关联依据。

前端直接成功还要求真实 primary identity、owner membership、所需 Free subscription 的 ID 为非空字符串，核对状态、姓名、邮箱、运营字段、原操作和持久审计回执。对象／数组／数字等畸形 ID 仍走原 key 的 GET-only 确认。确认响应必须准确匹配原 key、account_id 和正整数 audit_event_id。旧 POST 不得重复导航或清除新意图。

同一标签页恢复不是跨客户端幂等保证；清空存储、另一独立标签页、其他管理员发起的新意图不在保证范围。新创建标记不会追溯补写旧版本审计；未匹配证据仍待运营核对，不能从“未找到”推断未执行。部署时先提供后端确认契约再接入前端；旧后端／无标记记录只会保持待确认，不自动重复写。

## 信息层级与 PC 证据

| 层级 | 处置 |
| --- | --- |
| 常显 | 坏主投影错误与读取动作；未知写结果、冻结快照、阻塞原因和 GET 恢复；资料提示在详情页签外，创建提示在关闭弹窗后仍可见 |
| 按需 | 原资料编辑 disclosure、原创建弹窗；没有新 drawer/TAB 或布局重构 |
| 技术证据 | 原操作 ID、服务端生成客户 ID 与同事务 audit_event_id；不展示敏感原始后端报错 |
| 删除重复／迁移 | 资料动态恢复从 disclosure 内移到页签上方；编辑入口不迁移；不恢复既有去重内容，不改 golden |

本批仅 PC 1440×900、1056×900 定向检查；沿用原主题，没有扩大颜色／全后台矩阵。既有回归包含原有窄屏场景，不将其额外宣称移动端验收。

## 验证与交接

- API：新增创建确认 8 项、B4-01/02 6 项、既有 service routes 18 项，共 32 passed；临时数据库，无真实客户或付费 Provider。现有 Starlette/httpx 弃用警告 1 条，与本批无关。
- 前端 unit：四个目标文件 31 passed，含 ID 类型、原 key／receipt、一致性、空／坏投影和代理 capability／GET 限定。
- 离线隔离浏览器：新 35 项 + 既有写安全／客户目录／客户详情 42 项，共 77 passed（2.1m）；未匹配 API、外网及 pageerror 断言保留。随后补充关闭创建弹窗的存储阻塞提示，5 项定向回归通过（11.7s），同时明确覆盖资料提示在切换页签后可见、两种 PC 宽度和创建快照恢复。主会话复核要求长备注不抢主位后，增加 2500 字符真实表单快照、切换页签、滚动区上限和 GET 按钮首屏可见断言，1440／1056 两项通过（9.0s）。77 项是不同场景数，后续 5+2 为针对最新改动的复查，不重复累计。
- 类型、定向 ESLint、Python 改动源码 Ruff/mypy、全部四个改动 Python 文件 Ruff 与 Admin 门禁通过；最终 verify:local exit 0（含 release-policy、改动 Python 质量、API 子集 8 项、类型、改动文件 ESLint、目标 unit/proxy 26 项及 Admin 结构门禁），详见本地收据。
- 1440／1056 PC 创建冻结弹窗、资料待确认截图逐张检查；原操作／冻结值／读取按钮可读，未发现水平溢出。切换至积分页签后的截图另存 browser-visibility；2500 字符长备注最新截图另存 browser-long-note。没有更新 golden。

首次浏览器运行因目录误用 Retry 而失败／中断，已改用真实 Refresh；第二次 30 passed／5 failed 的原因是 Next 路由播报器也带 role=alert，断言已排除该节点，保留真正页面错误检查。原日志保留。第一次 Admin 静态门禁命中旧 handler 代码顺序断言，更新为新专用 hook 的 toast／导航契约，其他断言保留。第一次 verify:local 命中 Next 构建自动增加 next-env.d.ts 的忽略文件 warning，构建后只移除自动生成行再跑；不更改 lint 阈值。最初测试长行／导入 Ruff 修正已完成。上述是本地开发纠正，不是生产故障。

已按 code-review-and-quality 自审：输入边界与合法缺省、异步旧结果隔离、同键存储清除、最窄权限、精确持久审计关联、只读 GET 与有界查询；无新增依赖／schema／运行时通用框架。integrator 预审要求的核心 ID 严格类型和具体邮箱冲突原因均已落实并回归。

日志／截图在 `.runtime/customer-confirmation-evidence/` 及执行会话产物目录 `admin-customer-confirmation/`，最终提交 SHA 与文件清单以 receipt.json 为准。local-ready 由干净提交确认；PR/CI 未发生；M4 candidate 未发生；merged 未发生；M4 accepted 未发生；production 未发生／未核实；人工视觉待验收。后续由 integrator 在自身权限与隔离 lane 继续，不以本地绿灯替代。
