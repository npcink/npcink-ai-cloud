# 站点主投影与未知操作确认：2B · 2026-11-01

本记录是 builder 本地交付；不代表 PR/CI、M4、合并或生产验收。

## 身份、基线与范围

- 派单／integrator：`01a190f3-ab78-7763-bad1-79cc8fd7a72d`（系统检查管理后台问题）；builder：`01a1929f-2271-7550-b73e-07abd2a0a629`（执行）。
- 基线 `origin/master=e2b11a0e207babeb196409d3fa48dccbafa2cc1f`，已由 integrator 提供 2A clean-master／M4 accepted 回执；该提交和远端跟踪引用本地可用，分支从此 master 创建，无未合并分支叠加。两次 HTTPS fetch 均连接 GitHub 443 超时，按两次同签名外部传输失败规则停止自动重试；integrator 随后通过 GitHub API 独立确认远端仍为此 master。没有把失败 fetch 宣称成功或改变远端配置。
- 分支 `codex/admin-site-confirmation`；工作树 `/Users/muze/.codex/worktrees/admin-services-vector-fixes/npcink-ai-cloud`；锁 `codex:01a1929f-2271-7550-b73e-07abd2a0a629`。交付后冻结域，保留干净提交及锁，等待 integrator 接收。
- 范围：B4-03 站点主投影、B4-11 激活确认、B4-12 冷却 set/clear/reset 确认。客户 2A 不改；B4-08/09/10 和站点生命周期不改；B4-07 普通未保存草稿另排；字段冻结只交叉覆盖 B4-06，不提前核销整体。
- 不推送／PR／合并，不操作 M4／生产，不写真实客户或支付，不调用 Provider、不恢复暂停功能。测试只使用临时数据库和离线隔离浏览器。

## B4-03：校验真实站点主投影

保留 ApiClient envelope 校验，在详情归一化前另外校验 payload.site 是真实对象、site_id 精确匹配 URL、status 属于现有 provisioning/active/inactive/suspended/archived 契约。可选 account 若存在必须是对象、有效 account_id 且与站点关联一致；合法 account=null／省略、未关联站点、可选 subscription/stat 缺省保留，不新增无关硬拒。

坏主投影进入原可恢复 GET 错误壳，不用 URL／unknown／正常零值合成可写站点。主对象失效清除旧对象并冻结依赖它的新写入；原返回链、披露层级和暂停边界保持。读取请求序号隔离切换站点／卸载的迟到读取。显式详情重读已在飞行中而窄确认先返回时，较早读取不能覆盖后来确认的 site/cooldown 字段；之后新发起的明确读取仍可采用新的真实投影。

## B4-11：激活只确认当前 active

原 POST 实际返回序列化 site；现在验证目标 site_id、关联 account_id 和真实 active 状态后才接受，不本地硬设 active。成功提示只说明当前站点 active，明确未验证 Provider／WordPress 可用性；不以原 key 声称原 POST 唯一完成。

派发前在同标签页 sessionStorage 保留站点、动作、原 Idempotency-Key 与提交快照。网络丢响应、真实 12 秒超时、畸形／错目标成功、408、未知 409、replay、500 保留意图，先自动尝试一次窄 GET，之后仅 GET 确认。当前未 active、读取失败／不匹配都不释放，不重新 POST。只有白名单内明确校验、目标不存在或容量拒绝恢复编辑，新操作生成新键。

## B4-12：冷却保留原意图，核对持久审计与真实当前值

set/clear/reset 共用站点内的窄状态所有者，派发前保留原 action、key、目标、释放时间；set 保留输入精确 UTC，三种动作另保留原显示日期对应的 input_utc，刷新不把 clear/reset 的冻结输入变空。未知期间三种竞争动作和输入互斥冻结，刷新／离开重入恢复原意图；存储不可用／坏记录在写入前阻止。

原算法不改：set 用提交 UTC；clear 是服务端执行时 now；reset 是 ownership_released_at 加执行时 policy.cooldown_days，不能用浏览器 now 猜测。直接响应验证目标、action、archived、释放时间、服务端 resolved UTC 和冷却摘要；set 另核对输入 UTC。Z／+00:00／其他等价偏移按瞬间规范化比较，并保留服务端微秒，避免 JavaScript Date 毫秒截断误判；UTC 与 datetime-local 的转换沿用原实现。

新增 `GET /internal/service/admin/sites/{site_id}/operations/{operation_id}?action=activate|set|clear|reset`，浏览器同 `/api/admin/...`。代理精确 GET、沿用现有站点管理 `can_manage_accounts`；全仓无 can_manage_sites，本批不新增权限体系，audit-only 不可用，POST/PATCH 不暴露确认资源。

冷却确认查询精确匹配原 key、已认证 actor_kind/ref、原 PATCH path、event=site.relink_cooldown.update、succeeded、site/scope/action，limit 2 拒绝歧义；原审计 payload 的目标／释放时间／status／resolved UTC 与真实当前 Site 一致后才返回 confirmed 和包含 audit_event_id 的窄 receipt。当前 account 归属变化、时间冲突、无记录／错记录／歧义仍 unconfirmed，不把未查到当未执行，不重放 PATCH。set 同样使用精确审计，客户端还要求原 UTC 匹配。

## 确认链与普通详情读取边界

现有 `get_admin_site` 在有关联 subscription 时会调用 `reconcile_billing_snapshot`。HTTP GET 不是零写证明；本批未改变普通初始详情／显式页面重读语义，不能把它们算作 SELECT-only 确认。

窄确认直接 SELECT Site、ServiceAuditEvent，必要时只读 ServiceSetting 的当前冷却策略。它不调用完整详情、reconcile、upsert、激活、冷却更新或成功审计。API 测试把这些入口设为一旦调用就失败，并监测授权后重复确认的 SQL 只能 SELECT（兼容驱动 PRAGMA）；无业务实体更新／成功审计。未鉴权拒绝仍可能按既有安全策略写 guard rejection，单独验证认证，不把它混进授权确认零写范围。

前端 onConfirmed 只应用窄响应验证过的 site／cooldown 字段和本地日期，不 invalidate／自动 refetch 重型详情；账单、诊断等证据维持原快照。浏览器统计重型 GET 数量，确认链只能命中新窄 GET。pending 在主读取失败时仍常显，窄确认可独立读取；普通页面 Retry 继续属于显式重型读取。

## 异步与内容层级

上下文 revision、当前操作 ID 和匹配 key 后的存储清除共同隔离迟到请求。切换站点时旧结果不修改新站点、释放新 busy、删新意图；旧写已由 GET 确认后再次操作时，晚返回也不能覆盖新恢复记录。浏览器真实 hook 夹具直接改变同一组件 siteId，分别覆盖旧成功／旧丢响应及返回原站点；另以 remount 保留原写未返回、GET 确认后新意图，再释放旧写核对存储和 busy。

| 层级 | 处置 |
| --- | --- |
| 常显 | 当前站点／动作、未知结果或阻塞、不可重复／竞争操作、读取失败与 GET 入口；恢复独立于原 relink/advanced 折叠区，主读取失败也保留 |
| 按需 | 原立即允许确认弹窗；原冷却控件仍对已释放站点展开，未释放站点的说明继续按原披露层级 |
| 技术证据 | 具名「已提交的站点与操作证据」入口保留完整站点 ID、原 key、输入 UTC、释放 UTC；长标识有界正文滚动，不挤走恢复动作 |
| 删除重复／迁移 | 不适用；不重排原主工作区，不复制写入处理器，不更新 golden |

PC 定向验证 1440×900、1056×900；主题体系／共享布局未变，不扩全后台矩阵。既有站点 PC spec 的原窄宽／暗色用例保留执行，不扩张本批设备验收承诺。

## 验证与交接

| 门禁 | 结果与证据 |
| --- | --- |
| `NPCINK_CLOUD_PYTHON_BIN=/Users/muze/gitee/npcink-ai-cloud/.venv/bin/python pnpm run verify:local` | exit 0；changed-files 计划、Ruff／mypy（3 个源文件）、新增 API 19、Vitest 15、type-check、定向 ESLint、站点静态契约和 Admin 门禁通过；`site-confirmation-verify-local.log` |
| 新确认 API + 既有 service routes | 37 passed（19 + 18）；`site-confirmation-backend-final.log` |
| 既有 relink 隔离／策略前瞻回归 | 2 passed、130 deselected；`site-confirmation-relink-regression.log`。deselected 是定向选择，不是用例失败 |
| 前端完整静态契约 | `env PATH="/Users/muze/gitee/npcink-ai-cloud/.venv/bin:$PATH" pnpm --dir frontend run test:contracts` 通过；`site-confirmation-frontend-contracts.log` |
| 浏览器主回归 | `pnpm --dir frontend run test:e2e -- tests/e2e/admin-site-confirmation.spec.ts tests/e2e/admin-site-detail-pc-v2.spec.ts` 对应 wrapper 执行 60 passed（新增 56 + 既有 4），2.1m；`site-confirmation-browser-final.log` |
| 最新改动定向浏览器回归 | 同 wrapper 选择 `survives refresh\|late.*context\|storage failure\|primary read already\|corrupt persisted`，19 passed，25.3s；`site-confirmation-browser-final-followup.log`。覆盖原输入恢复、同组件切换、旧丢响应、在飞详情读取及损坏存储。两轮合计 66 个不同场景，不能将重叠的 60 + 19 写成 79，也未宣称最新源码一次全量 66 运行 |
| PC 视觉 | 最终 16 张截图：4 动作 × 1440/1056 × 主工作区／主读取失败恢复；builder 已查看。未知状态、目标、动作、读取入口在披露区外；技术证据展开后有界；无横向溢出。1056 clear 主工作区图记录操作后滚动位置，标题不完整，但恢复与读取动作可见；不据此宣称整页都在首屏。人工视觉验收仍未完成 |

所有日志、最终截图、初轮失败和文件 SHA-256 汇总在
`/Users/muze/.codex/visualizations/2026/11/01/01a1929f-2271-7550-b73e-07abd2a0a629/admin-site-confirmation/`，最终提交身份和逐文件 hash 以该目录 `receipt.json`／`file-hashes.json` 为准。测试所有者已结束临时 3307 服务；没有保留常驻运行时。

初轮失败均保留：浏览器中文定位器把实际「跨账号解锁时间」写成「账户」，纠正后通过；系统 Python 3.9 不支持契约脚本的 `zip(strict=True)`，改用现有项目 venv；动态 i18n action key 未通过显式词条契约，改为注册的显式映射。初次只读监视误含未鉴权 guard rejection INSERT，已按授权确认和鉴权拒绝分别断言；未禁用既有安全审计。类型收窄、Ruff 导入／行长和 mypy 时间类型问题修正后门禁通过。未更新 golden，未放松网络隔离、断言或权限门禁；既有 Starlette/httpx 弃用 warning 保留。

自审核对了目标与响应边界、原 key／actor／审计唯一性、精确微秒、存储失败关闭写入、迟到结果及新意图隔离、代理方法／权限和有界查询，未发现待修阻塞项。新增代码保持站点域，不引入依赖、迁移、共享 mutation 框架或权限体系；跨 API／客户端的内容作为同一个完整确认协议交接，由 integrator 独立审查后决定 admission。

限制：恢复只承诺同标签页 sessionStorage；不承诺跨客户端 exactly-once。激活只能证明当前 active，不能证明原 POST 唯一执行；冷却无唯一匹配持久审计就继续待确认。未做 PostgreSQL 并发证明、真实客户／交易／Provider 验证。普通重型 GET 和未鉴权 guard 写入不属于授权确认 SELECT-only 结论。

回滚由 integrator 在集成审查后 revert 本批提交，前后端窄协议一起撤回；不使用 hard reset。若仅确认接口暂不可用，既有待确认记录保留，读取失败也不会自动重放写请求。撤回恢复 UI 会失去未知结果保护，应在回滚审查时明确该影响。

独立状态：本 builder 只交付 clean committed local-ready；PR／CI、M4 candidate、merged、M4 accepted、production 全部未执行，人工视觉待验收。提交后冻结，等待 integrator 接收；2A 的既有 M4 accepted 不计作本批证明。
