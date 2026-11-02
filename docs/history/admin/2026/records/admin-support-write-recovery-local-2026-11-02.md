# Admin 工单写入恢复本地候选 — 2026-11-02

本记录仅为 B6 第一组 B6-03/04/05/06 的 builder 本地证据，不是发布或生产事实。
Base `05cbdcb93088570f179657e759959909e9a81e74`，分支
`codex/admin-support-write-recovery`；复用原执行 worktree 和 session lock。
最终提交、tree、完整路径 SHA256 及原始命令回执见证据根的 `handoff.json`。

实现与边界见[活动契约](../../../../admin-support-write-recovery-v1.md)，
四类内容取舍见[落实台账](../../../../admin-information-hierarchy-implementation-ledger.md)。

## 问题与可执行反例

| 问题 | 修复与证据 |
| --- | --- |
| B6-03 丢响应后重复消息/通知 | 同 tab 原意图先持久再 POST，未知仅 GET；同 actor/key 的精确持久成功去重。领域公开/内部去重、不同正文/visibility/目标/动作冲突；HTTP 原鉴权窗口内409，合成过期后正常鉴权回放不重发邮件；无审计同值不确认。 |
| B6-04 并发/迟到响应 | 四写共享 ref 串行与按钮状态，target/epoch/key 隔离；双击/跨动作、切目标迟到、历史状态成功后当前状态读取和其他备注草稿保留的浏览器用例。PG 双事务四场景已写，本机缺 runner显式skip，不能用SQLite代替锁证明。 |
| B6-05 错对象/坏成功/坏子记录 | 实际serializer必需字段、归属、原提交值及回执验证；坏message/attachment局部提示，合法空列表有效；消息、状态、附件/下载解析单测与坏成功浏览器用例。 |
| B6-06 初读失败仍可写 | 初读失败/错目标时依赖写入关闭，GET Retry恢复且保留草稿/未知意图；无identity或storage失败fail closed。 |

所有业务场景为隔离合成资料，未写客户记录、真实 SMTP、支付或 Provider。
原始调查反例仍在 integrator 的 `admin-functional-audit-batch-6` 证据根；
43 个调查场景并不表示 43 项本次产品测试。

## 本地验证

证据根（本机绝对路径）：

`/Users/muze/.codex/visualizations/2026/11/02/01a1929f-2271-7550-b73e-07abd2a0a629/admin-support-write-recovery/`

每个 `<label>.command.json` 保存 argv/cwd/时间/exit，`.log` 保存原始stdout/stderr。

- `backend-final`：22 passed、4 skipped。后续 `backend-compatibility`：5 passed，
  保留队列、附件可见性及既有 waiting-state 迁移契约；未新增迁移。
- `pg-skip-reason`：4 skipped，`explicit disposable M4 PostgreSQL runner is required`。
  下一验证是 integrator 在已授权 M4 disposable lane 执行该 integration 文件。
- `frontend-unit-final`：3文件21 passed（解析14、BFF权限1、原队列Query6）。
- `python-quality-closeout`：changed Python ruff correctness/import 与 targeted mypy通过；
  新增helper/tests完整ruff通过。`type-final`、`frontend-quality-closeout`、`snapshot-lint`、`i18n`通过；
  最终 `final-targeted-lint`、`final-source-type`再验通过。
- `admin-gate`：仓库 `pnpm run check:admin-ui`通过；材料只涉及详情与窄BFF，
  未更改共享primitive/样式/token，不机械跑全后台视觉矩阵。现有closure含正式
  Admin visual receipt；新恢复状态补相关双宽原图/结构化回执。
- 浏览器 `browser-final`：31个场景，30 passed、1 failed。该失败是测试脚本把
  mail-failed赋值误写成位运算，未改应用或断言以放行。`browser-targeted`最终5场景
  全通过，含修正邮件、正常四写、未知刷新、初读和5MiB；不是声称一次全31绿。
  后续 `visual-capture-check`初读单项及 `browser-normal-current`正常链单项通过，
  用于截图稳定性和合成后端保留当前状态的夹具校准；`browser-final-copy`仅复验最终简化成功文案。
  自查再加完整存储快照比对，`browser-snapshot-final`5项覆盖正常四写、消息未知刷新、
  5MiB附件、邮件失败及同key存储快照被改时拒绝清除。自查另修摘要恢复异步窗口，`browser-restore-final`4 pass/1 fail：最初测试拦截所有WebCrypto调用，释放句柄被框架摘要覆盖；
  限定只拦截本工单规范摘要后，`browser-restore-targeted`验证摘要等待期间禁写及恢复原意图；
  新增用例后共33个独立浏览器场景（恢复31项、既有closure2项），
  通过证据分批组成；不声称单次33项全绿。正式closure最终回执单独保留于`browser-closure-final-results`。

浏览器使用已有官方 Chromium `159.0.8138.0` 修复snapshot，固定路径记录在
外部（ignored）consumer config `frontend/.runtime/support-fixed159.config.ts`；
仓库browser配置、collector、阈值和golden未变。每次build/serve本worktree dirty
源码，非M4或生产。原始事件只按现有规则分类，未匹配API fail closed。

首轮 `browser-initial` 因填入值后的精确label定位、合成消息ID重复及中英文copy
匹配失败中止（6 fail/1 interrupted/1 pass/17未跑）；第二轮
`browser-attempt2` 23 pass/2 fail（保存按钮动态名称导致测试等待超时；注入422的
默认statusText与预期不符）。修改为稳定动作定位、真实serializer夹具和精确注入
说明；没有放宽正常请求失败判定。两轮失败产物与所有原始命令日志保留。

## PC 视觉复核与证据状态

`pc-1440/1056-normal`、`-unknown`、`-read-failed` 为PNG和结构化JSON，另有
`pc-1056-retry-pending`。主标题各1，横向scrollWidth不超clientWidth；对象/未知
阻塞和恢复按钮无需展开帮助即可判断，附件仍按需。全部本地合成、浅色PC范围；
中文closure的键盘附件及返回链通过。人工产品验收待定，未更新任何golden。

初次1056初读全页图底部捕获到重复固定栏；补两个animationframe稳定和禁用截图
动画后，DOM heading/header几何与全页/viewport原图一致，不再重复。仅修取证
稳定性，没有改壳层或将异常分类豁免。最终read-failed双宽同时保留viewport PNG。

local：候选就绪。CI：未运行。M4 candidate/accepted：未执行。
merged：未合并。human：未验收。production：未授权、未操作。
无push/PR/auto-merge/M4切换/ops改动，未提前处理B6后两组。

## 五轴自查与交接

正确性：精确持久证据和当前值区分；事务/邮件边界、坏成功和存储失败保守处理。
可读性：领域窄helper、解析边界、详情hook分工，无通用队列或新增状态平台。
架构：复用audit和child，无迁移；确认及回填仅窄工单GET。
安全：沿用can_manage_accounts与anti-replay，不落字节/真实正文到交付日志。
性能：附件意图小于2KB，5MiB字节不持久；编码分块避免每字节字符串数组；
确认最多两条审计＋适用子记录。未来审计清理不得破坏去重证据寿命。

回滚方式：在review/merge lane revert本组聚焦提交，无数据库回滚；不得清空
已发送未知意图或以新key重发作为回滚。integrator独立复核、PG并发实证、PR/CI与
开发合并另行执行。builder提交clean local-ready后冻结，保留原lock/worktree。

## R1 Unicode 规范返修

integrator 在独立审核中实际复现：JS trim/空白分词与 Python strip/split不同，
U+0085正文被后端去边缘、文件名被折叠，原意图digest与持久成功回执不一致，
导致未知确认不释放。原 `314e17fd`未admission；本节是原分支的独立增量提交，
最终 HEAD/tree/增量文件hash见原证据根 `r1/handoff.json`，不覆盖初版证据清单。

前端新增窄文本规范模块，精确涵盖Python29个空白码点，保留BOM/零宽字符。
正文values/body/digest、finish草稿比较、恢复校验、按钮和处理函数最小长度一致；
长度按码点，正文限制2–4000。文件名去路径、折叠、码点截断，并去截断暴露的
空白边缘，保证发送值再次经过后端规范仍不变。后端业务/鉴权/事务规则和receipt
精确断言未放松；旧版损坏的未知意图不自动迁移或清除，不换key重发。

真实serializer夹具由一次性合成SQLite通过CommercialService生成，含NEL、
四个控制分隔符、全部Python空白＋中文emoji、BOM/零宽保留四组正文/附件输出。
后端回归重验字段、digest及原GET确认；不把SQLite当PG并发证据。

`r1/`原始结果：

- `unicode-serializer`：17 passed（包含新增5项真实serializer/完整空白表对照）。
- `unicode-unit`：20 passed（既有parser14、新增Unicode6）；类型、定向lint、
  changed Python质量通过，最终静态回执另外保留。
- `unicode-browser-final`：**同一次21 passed**，Unicode正常/丢响应正文与附件16项，
  短正文1项；普通四写、普通丢响应、5MiB附件和异步恢复门禁4个对照。
  丢响应8项都刷新恢复原意图，只一次写入、一次原key/digest确认GET，成功清对应
  草稿与意图并开放后续操作。每项单列合成操作/确认JSON及原事件清单。
- 负对照：临时替换回314e17fd的应用三文件后运行新严格断言，正文NEL原摘要
  `82487134…`再次与实际`499a8211…`不符；文件名在修正internal visibility的
  独立负对照仍摘要不符。命令、失败图/trace保留，随后逐字恢复返修源码。

首次负对照因Node JSON import缺少type属性而未执行测试；修正测试导入后复现。
首次正向20项8pass/12fail：夹具附件默认public而serializer为internal导致8个
错误预期，4个确认请求计数在异步发起前读取；测试选择internal并等待原GET后，
最终21项全通过。未修改应用来适配夹具，也未放宽事件collector/错误分类/阈值。
首次负对照的附件可见性也存在该夹具问题，故另补修正visibility后的文件名负对照。
所有失败及最终产物分目录保留；后一次负对照不改变已通过21项的返修源码。

本轮仅补上述受影响门禁和相关PC取证，未全后台扫图、未更新golden。
local：R1本地候选待独立审核；CI未运行，M4candidate/accepted未执行、未合并、
人工未验收、production未授权未操作。PG4仍待既有专用runner，不因本轮通过而消除。
原worktree/branch/lock保留；无push/PR/M4/ops/后两组扩展。

R1五轴自查：完整Python空白表、BOM保留及码点边界有真实serializer/浏览器对照；
文件名截断暴露空白后再次去边缘，避免二次规范改变提交值。规范集中在既有工单
模块，无通用框架/依赖/后端规则变化；保留原身份、精确回执、未知门禁，未迁移旧
意图。处理仅线性字符串扫描，没有附件字节副本或额外网络请求。最终type/lint、
完整test文件ruff、Admin契约及docs618/618通过，交由integrator独立审核。
