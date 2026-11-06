# 运行诊断与配置版式：收口审计和开发经验（2026-11-06）

状态：2026-11-06 初次审计为development候选交接；下列初次审计记录保留。
操作者随后明确要求「继续」，授权提交、PR/CI、合并、M4验收及仅清理本会话资源，
当前进入merge lane；最终结果以本文后续合并回执为准。
这是本会话截图反馈的有界对账，不宣布全项目或全部历史审计项清零。

## 1. 目标与证据边界

用户关注空洞布局、重复模型信息、主次不清、无意义短表、连续折叠及低频设置
占位，并要求同类盘点与后续 AI 防回退规范。范围为 PC Admin 信息层级，关联
Portal/公共页面只按实际盘点记录；不扩产品功能、权限、计费或 WordPress 写入。

本次会话问题逐项处置见[落实台账](../../../admin-information-hierarchy-implementation-ledger.md)
2026-11-05「运行诊断摘要版式返修」至2026-11-06供应商高级设置补记。
此前更早的审计批次和其他会话仍以各自记录为准。

| 历史反馈 | 当前源码处置 / 内容入口 | 证据及限制 |
| --- | --- | --- |
| 诊断页空白大、文本杂乱、结论不突出 | 常显结论、原因、下一步、范围及样本限制；分组证据按短比较表取宽，不拉满页面 | 本地及M4候选记录见台账；不等于真实Provider故障恢复或生产证据 |
| 其他页面也有短表拉空、重复说明 | 媒体交付表尾合计与P95帮助；共享审计摘要总数改dl、分组短表；趋势明细限高且邻图独立高度 | 台账逐页区分已整改、核查保留、空态、失败和重定向；不是全状态验收 |
| 连续折叠是否应改Tab | 先分任务；主配置常显，验证记录、技术信息和独立媒体配置分别具名进入；避免把无关对象硬排成Tab | 运行配置专项及PC截图；草稿、未知和只读恢复另有反例测试 |
| Toolbox候选为何重复展示 | 移除重复候选区；原用途目录保留唯一候选来源 | 本地专项与M4候选见台账 |
| 增加兜底模型列 | 用途目录独立主模型/兜底模型列，未分配明确标注 | PC目录截图及专项；候选顺序不等于实际调用结果 |
| 适用任务名称看不懂 | 已知任务显示可读名称；未知代码保留可辨识回退 | i18n与任务目录断言；不恢复暂停任务 |
| 媒体摘要挪到页头、重复模型名及上下空白 | 页头保留状态、已保存时段、数量与配置入口；删除与下方目录重复的模型名，按组紧凑换行 | 1440/1056/900等PC截图；模型继承及完整候选仍在原工作台 |
| 候选链高级设置太占位 | 标题旁文字入口→同一dialog紧凑高级视图；返回候选链保留草稿，原保存入口提交 | 本地及M4模拟API专项、截图；保存拒绝/未知与只读恢复单列 |
| 其他位置是否有类似大折叠 | 图片交付参数和自定义供应商六项运行时元数据改为连接表内文字入口→同一dialog紧凑视图 | 本地供应商49项通过；后补Enter防护与定向检查见下文；最后这批未同步M4 |

不能推导为“所有地方都已无问题”：外部服务/服务设置的有数据配置、反馈检查器
有样本状态、登录表单等未由本次路由扫描覆盖。各页完整状态、真实保存、人工
视觉接受和生产行为也不能从模拟API或截图基线通过推出。

## 2. 最后一批供应商设置复核

内容分层：常显供应商连接/模型管理、图片交付已保存验证与未保存提示、费用说明和
主保存入口；按需为图片返回格式/精确域名及自定义运行时元数据；技术证据仍由
原测试/审计入口提供；删除整块低频折叠，不复制状态或增加第二份保存协议。

实现保留原ProviderConnectionDialog及表单状态：高级视图宽度沿用compact的960px
上限，六项元数据为连接ID、Provider ID、类型、来源角色、能力及运行时配置。
原记录中将字段数说成八项不准确，以源码六项为准。失败/陈旧提示位于dialog公共区；
Enter不在高级视图提交；主保存保留原图片域名校验。

本轮执行既有供应商专项的定向复核：

- 图片交付中英文及自定义高级设置3项通过（18.6s）：检查失败/重试/已验证与
  草稿区分、返回入口焦点、自定义草稿重开、Escape返回，以及Enter无POST/PATCH/DELETE。
- 首轮图片截图被测试成功通知遮挡，不能据此关闭视觉验收。测试改为关闭通知，
  显示URL模式的精确域名行后，重跑图片两语言2项通过（24.3s）。这是重叠复验，
  不相加为5个独立场景。
- 实际目检两种高级视图1440/1056/900px，以及900px返回后的主连接界面：无横向
  溢出、无空白等高区，返回动作与草稿提示可见；图片参数变动后显示未保存并禁用测试。
- `frontend/.runtime/provider-advanced-closeout/`保留首轮及自定义证据；
  `frontend/.runtime/provider-image-closeout/`保留最终两语言图片字段/返回截图。
  所有请求均为模拟API，没有付费Provider调用。

既有49项完整供应商检查及静态门禁在本次定向补证之前通过。后补检查只证明对应
受影响路径；不将其冒充重新全量、M4或真实保存验收。公共错误/陈旧提示搬入面板后
的所有组合状态尚未单独逐一目检。

收口最终静态复验：`pnpm run check:admin-ui`（含TypeScript及定向lint）、
`pnpm --dir frontend run test:i18n-contract`、`bash scripts/check-release-policy.sh`、
`git diff --check`均通过；本报告7个本地链接无缺失。日志在
`.runtime/session-closeout-20261106/`。构建生成的`next-env.d.ts`额外引用已精确恢复，
未将生成变化纳入交付；没有为收口更新golden或扩大到全后台浏览器复跑。

## 3. Git、PR、M4及关闭条件

本轮`git fetch origin --prune`后：

| 证据轨道 | 实际状态 |
| --- | --- |
| 当前源码 | `/Users/muze/.codex/worktrees/runtime-diagnostic-layout/npcink-ai-cloud`；`codex/runtime-diagnostic-layout`；HEAD和origin/master均为`22cd9c9df9cc921681f28fce32069ffaa93dd6dc`，改动在工作区 |
| 提交/PR | 本会话改动未提交；精确head查询PR返回空数组；`git ls-remote --heads origin codex/runtime-diagnostic-layout`无结果，无远端同名分支 |
| 本地验证 | 分批专项、契约和PC截图见台账；最后供应商复核见§2及本轮补记 |
| CI/合并 | 没有本分支PR，未运行对应PR CI、未合并 |
| M4候选 | 最新历史回执`2026-11-06T04:09:40Z`，`22cd9c9d+dirty`，前端指纹`5b20ffc04a0bac26bf78237357dda7ce42477e4a14400d2e9a9e78fe801d25be`；候选链高级设置定向通过，API/前端健康、health/live=200 |
| 最后源码与M4差异 | 上述候选不包含最后供应商高级设置；18010旧预览不能作为这批源码验收 |
| M4 accepted / 人工 | 本分支无合并后clean-master接受回执；最终人工验收待完成 |
| 生产 | 本会话未部署，未获本次生产部署授权 |

现阶段可以凭本记录接续工作，但不建议以“全部完成”关闭并清理本会话。
后继完成条件：明确进入merge lane→核对最新master与完整diff→提交并发布含Scope/
Boundary/Verification/Risk的PR→通过所需CI/视觉门禁→按规范完成候选及合并后M4
接受→确认精确PR已合并和任务树干净、证据已保全→仅清理本任务分支与工作树。
生产不在该链条内。不得只更新截图基线替代审查。

[开发工作模型](../../../development-validation-operating-model-v1.md)规定默认development，
只有明确要求publication或merge才进入merge lane。用户本次为状态核对，未将问题
本身当作发布/合并命令。聊天归档、代码合并、工作区清理分别判断。

## 4. 分支及工作树保留清单

只读审计：`.runtime/session-closeout-20261106/worktrees.json`；12个登记，当前任务1个、
保护项11个，无修改。6个登记路径不存在，**不等于已完成安全清理**；锁与元数据仍在。
GitHub全量PR查询达到1000行安全上限，不能据空PR字段声称没有PR；当前分支另作精确查询。

| 路径（均为本机绝对路径） | 归属/发现 | 本轮处置与退休条件 |
| --- | --- | --- |
| `/Users/muze/.codex/worktrees/runtime-diagnostic-layout/npcink-ai-cloud` | 当前会话；dirty；锁`codex:runtime-diagnostic-layout` | 保留；当前代理/本会话接续负责，达成§3条件且保全ignored证据后再精确清理 |
| `/Users/muze/gitee/npcink-ai-cloud` | primary；detached且dirty | 保留主工作区；不与本任务混清 |
| `/Users/muze/.codex/worktrees/admin-subscriptions-quiet-20261030/npcink-ai-cloud` | 其他任务锁；clean；相对master有4个unique commits | 保留，待原任务核对PR/提交和交接 |
| `/Users/muze/.codex/worktrees/registration-access/npcink-ai-cloud` | 其他任务锁；clean；有1个unique commit | 保留，待原任务核对交付 |
| `/Users/muze/.codex/worktrees/production-release-preparation/npcink-ai-cloud` | M4/release保护；clean；HEAD同master | 保留运维角色，不能因无unique commit删除 |
| `/Users/muze/gitee/npcink-ai-cloud-m4-ops` | M4/ops保护；clean；落后origin/master 5提交 | 保留稳定运维入口；本轮不更新或删除 |
| `/Users/muze/.codex/worktrees/admin-cleanup-receipt/npcink-ai-cloud` | 路径缺失但锁仍在；审计记录PR #1362 merged | 保留登记，须原owner/元数据与证据核对后另行恢复或退休 |
| `/Users/muze/.codex/worktrees/audit-m4-acceptance/npcink-ai-cloud` | 路径缺失；acceptance/M4锁 | 同上，保护角色需单独核对 |
| `/Users/muze/.codex/worktrees/customer-notifications/npcink-ai-cloud` | 路径缺失；锁；PR #1364 merged | 同上，不因PR merged直接移锁 |
| `/Users/muze/.codex/worktrees/legacy-image-limitation/npcink-ai-cloud` | 路径缺失；锁；PR #1332 merged | 同上 |
| `/Users/muze/.codex/worktrees/notification-layout/npcink-ai-cloud` | 路径缺失；app-primary-retained锁 | 同上，不把其旧PR当本会话交付 |
| `/Users/muze/.codex/worktrees/vision-timeout-20261030/npcink-ai-cloud` | 路径缺失；其他任务锁 | 同上，PR查询缺口另行核对 |

本机有22个本地分支，远端有9个heads（含4个Dependabot分支、master/production及
其他任务分支；不计origin/HEAD符号引用）。fetch prune只修剪失效跟踪引用；没有删除
任何本地/远端分支。若需全仓阶段清理，应按[工作树生命周期](../../../single-session-worktree-lifecycle-v1.md)
及其阶段清理入口另立归属核对，不能从“看起来旧”推断可删。

## 5. 经验、根因及防回退入口

反复返修的原因是没有先确定信息归属与阅读任务：只缩间距或把整段换成折叠，仍会
保留重复内容和无效占位；测试只证明交互，不能证明用户能抓住重点。最后源码晚于
候选预览时，又容易将旧页面误当新实现。整改应先去重复、确定结论与动作，再选
表格/Tab/独立工作台；改完实际看图，同时核对源版本。

长期规则写回现有单一入口，不新建平行设计系统：

- [信息层级规范](../../../cloud-admin-visual-information-architecture-review-standard-v1.md)：
  内容常显/按需/技术证据/去重；§13短比较、记录目录、配置编辑与逐列阅读距离；
  §14连续折叠任务归属、具名文字入口、草稿/错误/焦点、隐式提交及截图状态要求。
- 根[AGENTS.md](../../../../AGENTS.md)要求改前核对规范和台账，不能恢复已去重内容、
  隐藏判断事实或把“审查过”写成“整改完成”。PR模板要求移走内容的入口及PC证据。
- [落实台账](../../../admin-information-hierarchy-implementation-ledger.md)记具体取舍与失败、
  重跑、未覆盖范围；[PC选择检查规范](../../../frontend-pc-scope-and-selective-verification-v1.md)
  限定受影响PC宽度/行为，避免局部排版反复扩大全站测试。
- 测试通过、截图目检、M4 candidate、提交、CI、合并、M4 accepted、人工及生产必须
  分轨。收口时先查Git/精确PR/候选版本与工作树，不能用“测试绿”替代任何后续状态。

初次审计时本记录与规范仍在本地未提交改动中，后继发布必须一并纳入，才成为远端仓库约束。

## 6. 授权后合并收尾（进行中）

操作者在审计结果后明确要求继续，授权范围为本会话提交、PR/CI、合并、M4接受及
精确资源清理，不含生产。当前base仍为`22cd9c9d`，无新master差异。
最终复查发现旧`cloud-admin-ui-standard-v1.md`仍要求兜底副文本和Toolbox候选折叠，
已同步为独立兜底列、候选去重及高级视图保留草稿，与信息层级规范§14一致。
代码评审按正确性、可读性、边界、安全及性能复查；沿用现有dialog/草稿/API，不引入
依赖、后端数据流或独立写入。后续PR、CI、M4接受与清理分别补回执，不倒改初次审计。


### 合并前最终检查

完整Admin视觉门禁一次执行240项：239通过，仅运行配置目录截图高度213→214px
失败。已对照Darwin和Linux各自原生actual/expected/diff，确认列宽、数值、动作及
状态不变；将审查后的各平台actual精确更新到对应现有基线，未跨平台复制、未放宽
差异阈值。Darwin密度专项复验通过（12.5s）；Linux原生专项复验通过（2.6s），回执见本轮证据归档。
其余239项不重跑，由GitHub required checks完成合并准入。

M4新候选于2026-11-06T06:31:44Z同步，源码为22cd9c9d+dirty，前端指纹
`818f044bb8e23ee5daa22bbdd72952384e993442a9fdde0d23eafd9fdd064fcf`。
9项供应商/运行配置/高级设置/未知保存只读恢复检查通过（1.1m），PC截图已目检。
这是最终供应商改动的M4候选补证；模拟API不等于真实保存/模型验证。

变更文件ESLint及diff检查通过；Admin UI/i18n/发布政策静态门禁沿用本轮相同源码
回执。本地check:fast因缺少.env在Compose解析前退出，未执行contract/domain测试，
不冒充后端通过；本次无后端源码改动，CI依实际分类执行强制门禁。

清理前将本会话ignored证据保全到以下独立目录（不含node_modules/.next）：
`/Users/muze/.codex/visualizations/2026/11/05/01a1aada-fa1d-7702-9ce5-b519dd8db5b3/runtime-diagnostic-layout/closeout-20261106/`。
其中repo-runtime/与frontend-runtime/分别映射原.runtime/与frontend/.runtime/；
最终PR、CI、M4接受和精确清理的机读回执追加于此目录，不要求保留任务checkout。

### PR #1378 首轮CI返修

首轮CI `42175698157` 的后端静态、三个契约分片及impacted检查通过；前端1153项
单测中1152通过、1失败。失败为旧目录单测仍要求恢复限制包含在issueVerification
整句内，而本次已将限制拆为相邻常显段落。修正该测试对行动句和限制句的归属断言，
保留无新样本/仅任务成功不能证明恢复及WordPress侧确认语义；对应10项单测通过。
M4缺失调用/供应商失败两项现有浏览器反例复验通过（14.4s），不改页面源码。

完整前端源码契约在本机默认Python3.9下因zip(strict=True)退出；改用任务目录内
Python3.12入口后全部通过，不修改检查器或系统Python。首次CI失败、环境失败及
定向重跑分别保留，不称首次全绿。自动OCR工作流为disabled_manually，未启用或
声称自动评审通过；本轮已完成五轴代码复查及确定性门禁。
