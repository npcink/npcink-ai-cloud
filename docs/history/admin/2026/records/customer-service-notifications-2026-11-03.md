# 客户服务通知开发验证 — 2026-11-03

## Scope / Boundary

操作者要求依次落实临时客户通知建议。本批复用现有Portal收件箱，增加Admin
指定客户/全部活跃账户快照、纯文本预览、确认发送、结果查询与历史；修正既有
工单/试用/积分通知说明及站内跳转。不含邮件、营销、调度、WordPress写入、
真实客户发送、合并或生产操作。授权契约见[客户服务通知v1](../../../../customer-service-notifications-v1.md)。

## 本地证据

- 后端新功能domain/API/SQLite迁移：22 passed；3个真实PostgreSQL测试本地明确skip。
- 新增功能及既有生命周期/收件箱/工单事务相关定向回归：44 passed；新增跨API收件/跨账户拒绝/已读反馈场景另2项通过。
- `pnpm run verify:local`：通过；包含release-policy、Ruff correctness/import、targeted mypy、上述后端测试、TypeScript、ESLint、Admin28路由结构契约和定向Vitest。
- 完整Ruff新Python文件通过；i18n completeness通过；新contracts/proxy与既有navigation Vitest共27 passed。
- Admin视觉完整门禁：228项中227 passed、1张客户详情Mac golden失败。
  已逐图审查actual/diff：差异仅新增客户通知导航与发送通知入口；更新该单张Darwin基线。
  随后客户详情8项＋通知4项＋Portal6项，18 passed。未将定向复验改写成完整门禁全绿。
- 发送成功后移除重复禁用表单，通知4项再次通过；1440×1050、1056×800、
  中文/英文与结果明暗均有截图，代理复查通过。人工视觉验收待进行。

## 修复中发现的问题

初次浏览器运行因外部node_modules软链接导致Turbopack失败，改为离线冻结安装；
最初缺少路由IA登记已补齐。select隐式label匹配、重复查询按钮、误用HTML title
作为区块标题等由浏览器失败暴露后修正。另补预览过期明确恢复、历史请求乱序隔离、
存储失败保留最新文本、响应操作者/收件人证据约束。没有放宽断言或截图阈值。
`verify:local`初跑因Next生成的next-env.d.ts被ESLint忽略而失败；移除生成差异后通过。

## 候选与交付状态

本地开发候选已验证。首次M4 candidate为`3a46d9f9`，前后端均匹配该revision，
source_dirty=false；Alembic0092 head，服务healthy，首页与health/live均200。
真实API列表未鉴权401、internal鉴权200，批次数为0；没有真实客户投递。
M4定向24项全部通过，包括3项真实PostgreSQL并发/迁移隔离证明；M4编译页面
Admin4项＋Portal6项共10 passed（业务API为合成mocks，非真实用户发送）。

补充跨API测试发现internal请求重放键单次消费，preview/send不能重用该键。
已修复为每次请求新transport key、同一业务dispatch ID去重；新增真实鉴权API
证明重复请求键409、换键发送成功、仅目标收件人可读及已读回写；浏览器6项通过（另含无法读取草稿时仅GET查看历史、保留原始草稿且禁止发送），
包含失败回滚后GET仍preview、保留批次并换键重试成功。`b153481d`候选的M4后端25项、Admin5项＋Portal6项共11项均通过。
最后补充存储异常时允许只读检查历史；最终版本的sync精确revision/健康响应与
定向结果保存在外置`final-m4-*`记录，早一候选回执保留在`b153481d/`。
Linux对应golden已用M4现有官方Playwright1.59.1镜像生成并审查。
Darwin/Linux差异bbox均为(736,19,1279,133)，除新增导航与发送入口两个区域外，
像素差异为零。更新单张Linux基线后客户详情8项全部通过，未放宽阈值。
CI、PR、merged、M4 accepted、production、human acceptance均未执行或待验收；不把candidate提升为accepted。
本记录不授权生产部署或真实客户发送。

## 外置证据

当前任务独立目录：`/Users/muze/.codex/visualizations/2026/11/03/customer-service-notifications/`。
`local-broad/`保留新增页面截图/回执以及旧golden的actual/diff/trace；
后续定向最终图保留在`local-final/`；Linux红绿与M4浏览器证据分别保留在`linux-first/`、`linux-final/`和`m4-browser/`。截图均为合成客户与合成消息。

## Review / Risk

核对正确性、边界、权限、恢复和查询上限；无新依赖，无Provider花费。
预览绑定原操作者和不可变内容；未知结果保留批次，重复发送使用同一ID；
发送/收件箱/审计同事务。最多1000账户，超限拒绝；发送前资格变化只跳过。
普通应用回退保留新增批次表；0092降级会丢弃批次历史，须先保存相应数据。
入收件箱不代表客户已看到，当前不提供邮件或紧急触达保证。

## 合并前契约补齐 — 2026-11-03

操作者随后明确授权提交并合并，PR为#1363。首次前端CI的lint、类型及单测通过，
Frontend Contracts在新增路由的旧27条库存断言失败；本地复现后按已登记的新页
明确更新为28条，并修正IA矩阵该行的五列格式。继续完整契约检查暴露Portal
中性报告文案仍使用技术化「插件观测」，已改为「站点连接报告」。旧源码级检查
把读取p95和后端配置字段也当作界面泄露，现保留禁止图表/技术标签/原值渲染，
并用SSR检查development与普通环境都不输出模型/数据库标识；历史耗时仍用于
已授权的慢响应说明，客户文案直接写「95%的检索在X秒内完成」而不使用P95标签。
未修改业务阈值、页面结构或发送逻辑。
全量前端契约补齐后通过；本地首次续跑另遇系统Python3.9，改用已有Python3.12
后继续，未为环境问题修改项目代码。最后18项Portal定向单测、2项PC浏览器及
变更文件lint通过。最终CI、合并及M4 accepted以PR与外置
`customer-notifications-merge/`回执为准，原失败日志保留，不改写首次CI为通过。

第二次CI（head `6d25c847`）已通过lint、类型、单测与全量前端契约；关键页面
浏览器检查在客户工作区旧的两个页签断言失败（实际已包含客户通知，共三个）。
保留数量检查并明确三个入口的顺序，补充点击通知入口、主导航归属和当前页状态
验证；本地原失败场景1项通过，完整操作流程与导航两个spec共21项通过，变更
文件lint及whitespace检查通过。无页面实现或golden变更，失败日志保留在外置
合并证据中。最新head的必需CI仍是最终合并依据。

## 最终收尾与需求矩阵 — 2026-11-03

本节更新此前「候选」时点的交付状态；原始失败、定向复验和候选证据保留。
范围仅限本会话授权的客户服务通知、Portal 提示与既有诊断处理指引，
不声称全项目历史缺陷均已解决。

| 历史问题 / 需求 | 源码状态与负责模块 | 运行 / 消费证据 | 尚余边界 |
| --- | --- | --- | --- |
| 临时信息如何通知客户、入口不清楚 | Cloud 手动通知已合并 #1363；Admin 客户工作区→客户通知，客户详情可预选账户；Portal 铃铛收件 | M4 后端25项含真实PostgreSQL隔离验证，通知/Portal定向浏览器；最终页面真实GET可读 | 无邮件/推送/定时；入收件箱不等于客户已读；本次合并操作未发送消息 |
| Portal重复提示、只告警而无原因和处理动作 | 同一PR合并去重及原因/下一步；缺少证据明确未知 | Portal定向单测与PC浏览器通过，完整CI通过 | 历史记录不证明当前故障或恢复；人工使用验收独立 |
| 本地检索P95约5.4秒，如何继续开发 | 本地冷启动排查、指定Ollama embedding有界10分钟驻留、开发环境说明已合并 | 冷/热原始证据与M4候选保存于local-search-development | 非全链路提速保证；会影响需等待检索的交互，但不阻断无关开发；正式向量服务性能未验证 |
| 向量异常不知道怎么处理 | Admin向量观测提供影响、分原因处理与保留站点/时间的链接 | 12单测/6浏览器及M4历史读取证据 | 页面需打开/刷新；主动管理员告警未实现 |
| 其他既有诊断值得完善 | 运行诊断与首页定位已合并；保留问题、站点、起始时间和未知状态 | 10单测、最终8项定向浏览器，完整CI通过 | 不扩展新观测平台、自动重试或WordPress写入所有权 |
| 上线换向量API/数据库与自动提醒 | 已登记于[上线准备](../../../../engineering/phase-2-3-follow-on-v1.md#bounded-administrator-vector-service-alerts--2026-11-03-decision) | 尚无正式向量服务业务基线 | 待真实业务样本、持续时间、阈值及独立上线授权；不是本批已实现功能 |

### 最终证据状态

- 源码：[PR #1363](https://github.com/npcink/npcink-ai-cloud/pull/1363) 已于
  2026-11-03T10:10:00Z squash 合并至 master，提交
  `a08738b1b875c25436fd2eaec2fe9d3c2b21a82b`；原head为
  `873abd1271cbfcd85955cce9de78d1a89fa64c1f`，两个提交的完整Git tree一致。
- CI：[Cloud CI 41614698393](https://github.com/npcink/npcink-ai-cloud/actions/runs/41614698393)
  及全部必需检查通过；最终前端包括关键页面51项、视觉231项、Portal4项、
  TOTP9项及编译BFF52个检查。前两次CI失败保留，不改写成首次全绿。
- M4：promotion_pr=1363、acceptance_state=accepted、source_branch=master、
  source_dirty=false、source_revision为上述合并提交；Alembic0092 head。
  前端按相同源码fingerprint复用873abd12编译产物，不强称其编译SHA变成合并SHA。
- 合并后只读smoke：首页/health/live均200，未登录通知BFF401；已登录通知页
  可读表单、历史与部署身份a08738b1。通过前端代理请求猜测的internal路径404
  不能作为后端路由缺失证据，以真实BFF和既有API验证为准。
- 生产：未promote、未部署；正式服务与真实客户业务验收未执行，不能据M4推断。
- 外部操作：本批只完成GitHub发布/合并和有界M4候选/验收；未为观测制造付费调用，
  未授权真实客户发送。回退仍按本契约保留0092表及历史。

### 分支、worktree与停止点

收尾复核时，GitHub任务分支`codex/customer-notifications`已不存在；
`fetch --prune`已清掉本地remote-tracking ref。本地原任务head与已合并tree一致，
其历史采用外置bundle及dated archive ref保全后再退出活跃分支列表。
本记录的文档补齐使用最新master上的独立收尾分支，最终提交/合并回执另存外置目录。

当前路径`/Users/muze/.codex/worktrees/customer-notifications/npcink-ai-cloud`
被应用识别为task primary checkout；归档工具明确拒绝移除，因此保留锁和目录，
不绕过工具强制删除。稳定M4 operations checkout保留。全仓只读审计有8条注册，
其中4条路径不可用；主检出还有未提交内容，部分其他历史分支仍保留。
审计的GitHub全量列表达到1000条上限，不能拿它当作“无open PR”的证明；
本任务PR另用精确查询确认。没有清空其他任务、缓存、数据库或运行时数据。

本会话可在收尾文档已提交合并、工作区干净且外置回执完成后关闭；
保留受保护checkout不代表仍有未交付功能。全仓历史清理另按
[阶段清理规范](../../../../repository-stage-transition-cleanup-standard-v1.md)处理，
不能把“本任务代码已交付”表述成“全仓分支与worktree已全部删除”。

### 可复用经验及规范入口

1. 提示应在一处说清影响、证据或未知原因、下一步、验证方法；用链接保留调查范围。
   这不是增加更多重复告警。具体界面取舍保留在台账，通用评审要求归入
   [历史闭环规范](../../../../historical-issue-closure-and-release-evidence-standard-v1.md#14-service-notices-and-actionable-diagnostic-guidance)。
2. 单次鉴权请求键与持久业务批次ID是两种身份；重试换请求键但不换批次。
   未知先查原批次，收件、批次与审计同事务；规范真值仍为
   [通知契约](../../../../customer-service-notifications-v1.md)，不另造第二份API规范。
3. 新路由同时核对manifest、IA库存、验收矩阵、工作区数量与点击/选中状态。
   源码级技术词禁令需配合实际渲染验证，允许读取输入字段来选择用户说明，
   同时禁止泄露底层标识；不能直接放宽检查来消除失败。
4. 本地慢检索应先拆分冷启动/embedding/检索证据，再做有界措施；不把本地耗时当
   正式SLO，不把历史失败过窗或缺样本当恢复。环境及样本门槛详见M4与上线准备。
5. 精确记录本地、CI、合并、candidate、accepted、production和人工证据；
   清理先保全，再逐项核对PR、tree、分支、锁与应用保护。目录仍在和源码未合并
   是不同事实，远端分支删除与本地worktree移除也必须分别核实。
