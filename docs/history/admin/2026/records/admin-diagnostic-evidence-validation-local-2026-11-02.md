# 诊断读取证据本地候选 — 2026-11-02

范围仅 B6-09/10/11/12；builder「执行」，integrator「系统检查管理后台问题」。
基线 `a26307734547f5855c543c78516eb30c23ab2783`，tree
`e5044c9d9f625526ad9750f5bf8a460b58d80a53`；来自派单时最新 origin/master。
分支 `codex/admin-diagnostic-evidence-validation`；复用现有工作树与锁
`codex:01a1929f-2271-7550-b73e-07abd2a0a629`。

外置证据根：
`/Users/muze/.codex/visualizations/2026/11/02/01a1929f-2271-7550-b73e-07abd2a0a629/admin-diagnostic-evidence-validation/`。
每个正式检查有 `*.command.json`（argv/cwd/time/exitCode）及原始 `*.log`。
最终 head/tree/完整 base..head 清单与 SHA256 见外置 local-ready/changed-files；
浏览器截图记录测试时实际源文件指纹，文档后补不冒称同一提交已被浏览器运行。

## 逐项行为

| 项 | 行为与可执行反例 |
| --- | --- |
| B6-09 | 校验必需队列/摘要/分页与范围内空页矛盾；null、坏 account/evidence、本行不允许或错对象 action_href 局部隔离。动作按后端真实分支构造，保留合法行及源计数。 |
| B6-10 | 校验元数据、diagnostics、精确分页与11项筛选；坏行/跨目标有常显提示；unknown outcome与精确RFC3339保持，payload字段剥离。 |
| B6-11 | 缺 totals/alerts/window 等必需证据不再补0或空告警；验证有限数值、分母和窗口请求身份；合法0、nonAI、pending、optional null和截断事实保持。坏provider/group行局部隔离，结论不可核实。 |
| B6-12 | 普通及精确run均校验site；capability严格按family/name/profile OR；坏行不显示、不替换目标，有局部Retry；原请求隔离保持。 |

实现、内容分层和限制见[当前契约](../../../../admin-diagnostic-evidence-validation-v1.md)。
不改后端业务/serializer、路由鉴权、工单写入/草稿、数据库结构、共享壳或暂停功能。

## 验证与失败历史

- `parser-initial`40通过；最终`parser-pagination-warning-final`三文件57通过（新43项＋既有catalog/pagination）。覆盖真实serializer、必需字段、坏行、精确筛选、合法0/nonAI/pending、动作分支、能力OR、范围内空页及非空短页不完整提示。
- `serializer-initial`失败：账户创建/更新时间受真实时钟影响。隔离测试固定数据库时间后，`serializer-final`及`serializer-and-ruff-final`各1通过。查询耗时固定0，仅使观察字段确定；真实服务serializer未更改。
- `domain-seams-final`：coverage/audit repository/runtime evidence领域13通过。全部临时SQLite功能检查，不声称PG锁或真实生产数据证明。
- `admin-static`失败：移走inline类型后旧源码正则仍依赖其语法；调整读取新的validator源，保留身份/动作约束并增补校验入口断言。`admin-static-final`的完整`check:admin-ui`通过。
- `types-page-slice-final`、`lint-all-changed-final`、`python-quality-final`、`ruff-full-final`、`visual-governance-final`通过。仅测试Python变更，targeted质量门禁按既有规则不运行app mypy。
- `browser-existing-initial`在导入JSON时失败，未执行场景；添加原生ESM JSON import attribute。
- `browser-existing-second`51通过/7失败（总58）：1项审计测试返回请求外offset/元数据；6项runtime正常样本的日期轴与请求窗口不一致。原trace保留。
- `browser-faults-and-reruns`1通过/3失败/9未跑，max-failures停止。审计11筛选通过；3项新增场景到截图取证时因Git未跟踪路径相对目录不同而ENOENT。修正取证脚本统一repo root，不改产品校验。
- `browser-faults-runtime-final`11通过/1失败：6项新增双宽场景通过、5项runtime修复通过；剩余时间字符串被正常builder从Z转成.000Z，保留原字符串后定向重跑。
- `browser-empty-and-acceptance-final`10通过：新增6、三路由正常入口3、missing-call恢复1；补拍合法empty。其他既有场景复用之前的有效通过证据，不累加重复次数。
- 自查补入页切片校验；`browser-page-slice-final`27通过（审计18、新增6、三入口3）。命令grep没有选中名为service status的coverage既有场景，另用`browser-coverage-page-slice-final`复验，19通过/1失败：满页校验错误拒绝既有非空部分页。已收窄为仅拒绝范围内空页矛盾，保留实际返回行数；`browser-partial-compatibility-final`定向确认恢复场景及6个双宽故障场景，7通过。
- `browser-narrow-network-final`6通过：新增collector的取消豁免收窄为路由跳转的GET RSC预取，业务API取消仍失败。原始RSC取消和合成503保留，不称网络事件清零。既有collector不改。
- integrator审核纠正：旧非空部分页mock不能倒推生产契约。真实coverage为filtered切片和len(filtered)，audit为同筛选count/limit/offset，未找到稳定完整短页的真实路径。最终保留短页合法行及实际范围，但常显分页证据不完整（`pagination.items`）；范围内空页仍拒绝。`parser-pagination-warning-final`57通过，`browser-pagination-warning-final`只补审计双宽与coverage初次失败恢复短页（附1440/1056图），不重复全套。
- 上述最终定向浏览器3通过；`admin-static-pagination-warning-final`完整Admin门禁及`lint-pagination-warning-final`通过。两页1056短页图已实际复查：合法行、源总数、不完整说明与Retry常显；coverage表格保留既有内部横向滚动，无页面溢出。

所有失败日志、截图、trace与定向重跑记录均保留；不称某一次失败的完整矩阵全绿。
正常fixture只通过显式normal builder补当前serializer字段；坏注入绕过builder。
审计旧测试接纳错/缺offset的预期已替换为拒绝坏证据；深页恢复使用真实最后页边界。
未改变既有collector、失败阈值、截图golden或既有业务断言目标。

## PC 证据与限制

`browser-partial-compatibility-final-artifacts`保留1440/1056下三个页面的partial、
refresh-failed、empty，共18张PNG及JSON；含范围、源指纹、geometry、网络和console。
合法行详情均可打开并Escape关闭；跨site不进入详情。单h1、无页面横向溢出、
常显坏行/旧证据/重试通过；核心工作区在首屏。1056诊断表仍有已有窄列换行，
本组不扩展为布局重排。焦点完整环与人工五秒扫描仍需独立验收，不自称全项视觉通过。

未运行全后台视觉矩阵：没有共享组件/几何/主题修改，按PC选择检查规范仅检查三页；
治理检查通过不代替上述浏览器证据。未使用付费Provider、真实客户、SMTP或交易。
浏览器业务接口为GET mocks；Python临时SQLite初始化/seed会写入，不能称全链零写入。

状态为本地候选。CI、PR、M4 candidate、merged、M4 accepted、production均未执行；
human acceptance pending。builder在clean committed local-ready后冻结；
后续源码复审、M4、PR/CI及合并由integrator独立接管，本会话不启动新批次。


## 整合返修 R1/R2/R3 — 2026-11-02

初始本地提交 `3228511b283efb7af1139f09bb4179424795ce76` 未获准入；
整合会话在同一组内仅退回 B6-10。保留原根目录回执，新增证据写入
`admin-diagnostic-evidence-validation/review-1/`，不追随移动中的 master。

- R1：真实 repository 是 site 优先、无 site 才按 account，而非两者交集。
  行校验改为该优先级；其他精确筛选仍严格检查。响应 filters 仍须回显两个请求参数。
- R2：原 Date.parse 会抹掉毫秒以下差异。现在分离整秒与六位微秒比较，
  与 Python datetime 一致；边界包含、等价时区、小写 RFC3339 请求及更细小数截断有回归。
  URL 和重新应用的请求保留原始时间字符串。
- R3：必需真实 filters/sort；核对参数回显、未提供参数默认值、空 site_ids 和固定倒序。
  时间回显按等价瞬时比较。错误筛选的合法空页与缺失元数据均拒绝，不认证“无证据”。
  正常样本显式补齐元数据，坏注入绕过 helper，通用 fulfill/collector/阈值不改。

`frozen-parent-five-repros` 在不可变旧提交上复现五个反例（退出0表示探针运行完成，
不表示旧代码通过）；`unit-before-fix` 红测4失败/5通过。修正后
`unit-with-rfc3339-case` 两文件75通过，类型和定向 lint 通过。
`browser-audit-r1-r3` 25项中23通过/2失败：旧正常视觉样本未回显筛选；
新增双宽用例过快跳转取消静态chunk。补齐样本并等待当前文档请求结束，
不放宽网络断言；`browser-audit-rerun` 仅重跑相关3项，全部通过。
失败trace、截图及原始网络事件均保留，不重称初轮25项全绿，也不累计重复通过数。

返修最终截图为 `review-1/browser-audit-rerun-artifacts` 下双宽
`audit-review-site-precedence`、`audit-review-microsecond-rejected`、
`audit-review-metadata-rejected`；含URL范围、浏览器事件与测试时源指纹。
已复查1056坏行及元数据失败、1440站点优先图：原筛选、不可核实/失败、Retry常显，
未出现页面横向溢出。人工视觉与完整焦点验收仍待定。
没有布局/主题/字段入口移动；只重验审计相关浏览器、单测、类型/lint/静态契约及文档可达性。
未改动模块的原本地门禁明确复用，不代表新跑全后台。

后端契约依据：`_service_audit_filters` 的 if/elif、审计 serializer 的 filters/sort、
Admin route 的参数传递及 `_parse_audit_rfc3339_filter` 的 datetime.fromisoformat。
整合会话另有真实临时SQLite反例证明；本次未重跑或冒称生产查询。
临时数据库初始化/seed有写入，业务浏览器仍为本地GET mocks。
返修提交/head/tree及完整29文件 base..head SHA256以 review-1/local-ready.json为准。
保持本地候选、clean committed后再冻结；CI/PR/M4/合并/生产/人工验收状态不变。
