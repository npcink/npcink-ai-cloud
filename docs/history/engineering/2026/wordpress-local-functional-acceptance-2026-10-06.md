# 本地 WordPress 功能验收记录（2026-10-06）

Status: local deterministic workflows and one real Ollama title/save/credit chain verified; third-party and Cloud feedback acceptance pending.
操作者正常使用文章 6261 的标题建议，确认有帮助并采纳；本地保存匹配和实际
扣额已关联到同一 Cloud run。此前主流程、取消重载、并发标签页、权限拒绝及
本地质量事件关联通过。第三方执行、自然反馈上报和完整六条 Done 尚未收齐。
本文只验收开发环境，不授权生产发布或启动试用。下文保留首轮阻塞历史。

## 1. 范围、版本与预算

- 工作：账号 Free → Addon → 官方 AI 插件编辑器 → 人工保存 → Cloud 证据。
- 源码：独立锁定 `codex/wordpress-local-acceptance` 工作树，基于干净
  master `e3f4a5d56e26c281f04b57da6c3c25ace5e663f1`。
- M4 只读状态：`acceptance_state=accepted`、`promotion_pr=1073`、
  `source_branch=master`、`source_dirty=false`，源码版本与上述 master 相同。
- Local：`https://magick-ai.local`，WordPress 7.1.1 / 官方 AI 1.3.0 /
  Addon 0.2.0。Addon 挂载源码 `d60cce3`，所在分支为
  `refactor/descriptor-normalizer-dedup`；这不是 Addon 已合并声明。
- 路径：操作者此前选择的 Pgy SSH 前台隧道，Cloud JSON 入口
  `http://127.0.0.1:18010`；不使用生产或 Cloudflare Access 作机器连接。
- 预算：45 分钟拆分点、付费 Provider 调用 0、完整大套件执行 0。
- 非目标：套餐/周限额/邀请管理、支付、Provider 配置、参考图协议、
  生产、其他工作树源码、制造试用数据。WordPress 保持最终写入所有权。

## 2. 已确认的基础状态

| 检查 | 本轮结果 | 证据边界 |
| --- | --- | --- |
| Local 数据库、站点目标 | SELECT 1 成功，siteurl 匹配 | 不代表浏览器编辑器可用 |
| Addon / Toolbox / 官方 AI | 已启用；Addon verified、connector enabled | 不代表每种模型可运行 |
| M4 接收状态 | 仍为 PR #1073 的干净已接收版本 | 本轮没有 sync、deploy 或 promote |
| 本机 Cloud 连通 | 隧道恢复后 readiness=ready，health/live=200 | 初始 502 是独立的本机消费路径问题 |
| 文本、视觉能力 | 原有签名读取刷新后 configured | 配置快照，不是生成或结果质量证据 |
| 文生图能力 | unavailable / no_eligible_model | 本轮不能宣称文生图当前可用 |
| 观测 | monitoring=true，hourly Cron 已注册，journey buffer=0 | 空队列不证明自然上报成功 |

能力快照 `checked_at=2026-10-06T10:11:03.221467Z`，有效期 300 秒，
`provider_call_performed=false`。通过既有 refresh 路径更新缓存，没有写入
伪造快照或修改模型、运行配置。未来验收须重新取得新鲜证据。

隧道的浏览器采样报告 `browser_transport=degraded`、采样字节为 0；
不能把 tunnel_ready 当 Cloud 浏览器质量证明。使用 NO_PROXY 后基础 HTTP
就绪检查通过；本轮没有完成 Cloud 页面浏览器验收。

## 3. 浏览器两次尝试与停止点

复用 Addon 已有 `scripts/smoke-wordpress-ai-text-browser.mjs`，设置
`WP_AI_TEXT_FAKE_PROVIDER=1`。脚本限定 Local/development，使用临时草稿、
短期 WordPress 登录会话、局部假 Provider，finally 清理本轮数据。
没有切换真实站点凭据，没有生成请求到达 Cloud 或外部 Provider。

1. 第一次：Playwright 模块路径未找到。退出前移除本轮替身和 option，
   删除临时草稿 281284。修正为现有 `playwright@1.59.1` 模块路径，
   不安装依赖、不改变 Addon 源码。
2. 第二次：认证 cookie 进入后台目标页，但页面是 WordPress 原生维护提示，
   编辑器等待 30 秒超时。`ability responses=[]`、`pre-save fixture writes=[]`。
   脚本确认移除本轮替身与 option、销毁会话、删除草稿 281285。

只读核对发现 Local 根目录存在 `.maintenance`；WP-CLI 报告
`Maintenance mode is active`，`/wp-admin/` HTTP 503。截图人工核验同样显示
“Briefly unavailable for scheduled maintenance”。标记修改时间为本地
2026-10-06 18:09，无法仅凭标记确认更新已经结束；本轮保留该文件。

连续两次浏览器尝试失败后停止，未第三次重试，未执行取消重载、并发标签页
或权限拒绝变体。当前没有标题/摘要/改写的新通过证据，也不能用空响应证明
已注入 Provider 故障或额度扣减正确。

## 4. 六条 Done 的本轮判定

| Done | 状态 | 原因 / 下一步 |
| --- | --- | --- |
| 真实标题建议不少于 10 次 | 未在本轮完成核验 | 历史运行数量不能替代真实展示与文章使用关联 |
| 空结果、超时、Provider 错误可恢复 | 未验证 | 编辑器未加载，替身故障尚未到达 |
| 建议与人工保存边界 | 历史证据可复用，本轮未验证 | 本轮未进入审阅或显式保存步骤 |
| 重复、取消、重试与扣减幂等 | 部分历史证据，本轮未验证 | 账号幂等不等于编辑器运行与扣减幂等 |
| run / usage / Provider 记录 | 历史事实可见 | 只读数据库查询找到记录，本轮未新建生成 run |
| 真实采纳与质量反馈闭环 | 历史事实可见，关联仍需核对 | 不将人工补充或保存观察冒充原生 agent_feedback |

沿用 [账号权益开发候选记录](trial-free-entitlement-development-candidate-2026-10-06.md)
及 PR #1073 的账号/API、真实 PostgreSQL 并发、Portal 功能和截图证据，
不重跑同一版本完整大套件，也不把这些证据写成 WordPress 全流程验收。

对当前连接站点的 M4 数据执行只读事务并 rollback：历史 connector-runtime
为 1768 succeeded / 83 failed；原生 `agent_feedback.editor_content_support`
89 条，编辑展示事件 28 条、观察结果事件 49 条；customer journey 中
title_generation succeeded 127 条。这些合计混合历史开发与使用，不能当
独立真实用户、10 次正常文章写作、当前成功率或试用 H1/H2/H3。
Provider 记录成本不是第三方账单，本轮不计算商业指标。

## 5. 后续顺序与恢复边界

1. 确认 Local 更新是否仍在进行；结束或按明确恢复方案解除维护后，重新
   检查后台 HTTP 与实际编辑器。按本轮停止规则，需要下一轮明确继续指令。
2. 重新做只读能力刷新，使用已修正模块路径的原有替身浏览器脚本；
   优先完成主流程，再运行取消重载、并发与权限变体，不扩大产品面。
3. 对其余官方能力优先复用已有契约和可关联真实证据；第三方真实生成不为
   制造验收数据发起，模型质量或付费路径未验证就明确标记。
4. 文生图目前没有 eligible model。配置模型或暂停入口应另列明确操作；
   参考图编辑继续暂缓，不用历史成功图片替代当前能力证据。
5. 本地完整验收完成后整理实际生产发布范围、配置与回滚方案，生产仍单独
   授权，之后才招募站长和指定 T+0。

工具附带发现：runbook 的 `pnpm run wordpress:editor:readiness -- --json`
向 argparse 传入额外 `--` 会退出；本轮直接运行现有 Python 脚本完成
同一检查。此命令说明问题单列后续，未修改运行工具。

## 6. 交付与回滚

文档收口：`git diff --check`、release-policy、254 个相对链接核验通过；
documentation reachability 495/495。`check:changed --plan --workflow-lane
development` 判定 documentation-only、PR required=false；这仅验证记录交付，
不消除上述浏览器阻塞。

只新增本记录和 docs 索引；不修改 Cloud、Addon、WordPress 配置/源码或
原文章。Provider dispatch 0；测试临时数据清理已确认。前台隧道在本轮
结束时关闭，M4 维持原已接收版本。源码工作树保留锁定供下一轮继续。

原始证据位于本会话工作树忽略目录 `.runtime/local-acceptance/`：readiness、
M4 status、只读历史查询、journey inspector、失败截图和浏览器日志。
记录为本地 development lane 交付，不创建新 PR，不宣称已合并或生产可用。
撤回本报告仅需移除本轮两处文档变更，不改变已授予权益或已有运行记录。

## 7. 维护恢复后的继续验收（2026-10-06）

操作者明确“本地 WordPress 已经正常了”后继续。只读检查确认维护模式未
启用，未认证后台返回正常登录跳转 302，实际浏览器认证后可加载编辑器。
WordPress 7.1.1 / AI 1.3.0 / Addon 0.2.0 未变。Addon 已为干净 master
`5d8356f`（PR #229）；与首轮 `d60cce3` 文件内容无差异。
Cloud 当前 master 与 M4 accepted 仍为 `e3f4a5d5`、PR #1073。
Mac 与其他工作树源码未修改；本轮仍为付费调用 0、Cloud 完整大套件 0。

### 7.1 真实编辑器、隔离 Provider 替身

以下均复用原有浏览器脚本，每个场景独立临时草稿和登录会话，所有生成
请求均 `transport_preempted=true`，没有到达真实 Cloud/第三方执行。

| 场景 | 结果与耗时 | 关键证据 |
| --- | --- | --- |
| 标题/摘要/整段改写主流程 | 通过，11.10s，草稿 281286 | 标题模拟失败后重试、重新生成、人工修改再插入；摘要可见；改写可审阅 |
| 取消后重载 | 通过，8.66s，草稿 281288 | 保存前写入 0、显式保存 0，重开恢复原始标题/内容，无 dirty |
| 并发标签页 | 通过，15.33s，草稿 281289 | 两页均显示建议；三次隔离标题尝试，其中一页失败后重试；保存前写入 0 |
| 无编辑权限 | 通过，3.42s，草稿 281290 | 临时作者被拒绝编辑管理员草稿；Ability 响应 0、替身事件 0、写入 0 |
| 本地质量事件关联 | 通过，7.77s，草稿 281291 | 为验证本地展示/保存关联单独执行，不是重复大套件或原生云端采纳证明 |

两个主流程的保存前写入均为 0，人工显式保存为 1，revision delta=1；
标题、摘要与目标段落匹配预期，非目标 sentinel 块保持原样。
人工检查 1280×720 的 review 与 saved 截图：替换原文/建议可读、接受与重新
生成可操作、模态框未溢出；保存后显示“已保存”和人工修改后的标题。
不据此扩大到所有媒体界面或 WordPress 移动端视觉验收。

五个场景均确认临时草稿删除、会话销毁、替身插件和 option 移除；权限场景
还删除临时作者。各场景分别清理 16/11/7/0/16 条本轮 journey 事件，
保留原有队列。模拟事件不能进入真实试用指标或 Cloud 账单。

本地质量关联结果：9 条事件、3 个任务会话，pending=0；4 presented、
1 repeated、1 superseded、3 outcome.observed。摘要/改写为 saved_exact_output；
人工编辑过的标题为 saved_after_generation_unmatched。invalid_content_storage=0、
forbidden_fields=[]。这是本地分类和关联证据，不把“未匹配保存”当拒绝或
原生采纳，也不证明 Cloud 接收或自然 Cron 上报。

### 7.2 其他官方接口与确定性契约

只读注册清单共 19 个官方 `ai/*` Ability，包括标题、摘要、改写、翻译、
Slug、Excerpt、Meta description、分类、编辑建议、评论分析/回复、ALT、
图片提示词、图片生成/import、post detail/terms 和 type-ahead。
“已注册”只证明入口元数据，不宣称每项实际模型执行、UI 和导入均通过。

现有 PHP 测试、HTTP/SDK 替身的聚焦证据：

- connector-result 15 项、failure-projection 27 项断言通过；
- 原 runner 的 performance-guards 公共启动步骤，加 connector-registration、
  connector-runtime、request-log-bridge、provider-acceptance，共 193 项通过；
- 隔离 alt-text-artifact-handoff 37 项通过。合计 272 项 `[ok]`，退出码均为 0。

首次把 connector-registration 直接独立执行时缺少公共 plugin bootstrap，
“renamed addon directory”断言失败。核对 tests/run.php 的真实依赖顺序后，
使用其已有启动文件重跑相关模块通过；不改源码或断言来绕过失败。
这些用例覆盖边界、结构/错误投影、输出契约及 ALT 来源交接；它们不能代替
第三方生成的内容质量或实际原生图片导入。

中央 `composer quality:matrix` 只读状态已保存。本轮无跨仓库代码交付，
不执行全仓矩阵大套件；Cloud 精确版本的必需 CI 与账号/Portal 证据复用
PR #1073。主工作树旧检出不代表 M4 当前已接收版本。

### 7.3 本轮结论与剩余验收

**本地确定性编辑主流程通过；尚不能签署“全部能力和六条 Done 完成”。**

| 事项 | 本轮结论 |
| --- | --- |
| 注册即 Free、重复登录/连接保护 | 复用 PR #1073 的 API/PG/Portal 证据；不冒充新的真实邮箱/QQ 授权验收 |
| 标题/摘要/改写、人工审阅保存、取消/并发/权限 | 当前 Local 浏览器替身验证通过 |
| 空结果/超时/Provider 失败 | 确定性错误投影契约通过，浏览器证明模拟 Provider 失败后可重试；不是所有故障的实网复现 |
| 实际 Cloud run、模型和扣额幂等 | 既有 API、历史记录可见；本轮没有真实生成调用，ai_credit_evidence=false |
| 展示/保存观察 | 本地事件关联通过；原生反馈、Cloud 接收与自然上报仍单列 |
| 真实标题使用不少于 10 次 | 正常写作样本仍待收齐，不用模拟请求或历史开发合计凑数 |
| 文生图 / ALT / 参考图 | 新鲜快照文生图 no_eligible_model；视觉 configured 仅证明配置，ALT 实际执行未新增；参考图继续暂缓 |

下一步优先核对正常写作中产生的真实第三方生成 → 审阅保存 → run/用量与
反馈，补实际扣额和失败记录；不为凑样本制造付费调用。文生图应明确选择
配置现有模型并验收，或暂停该入口；本轮未改 Provider 或 WordPress 功能
开关。其余实际支持能力依据真实需求补对应证明，保持未知项显式可见。
所有本地功能与配置门槛收齐后，才整理生产发布候选并另行取得发布授权。

恢复轮证据保存在 `.runtime/local-acceptance/browser-resumed-*` 的 JSON、日志、
截图及 readonly readiness/capability/19-Ability 清单。前台隧道在本轮结束
时关闭；M4 无 sync/deploy/promote，继续维持已接收版本。

## 8. 操作者真实标题使用核验（2026-10-06）

操作者报告文章 6261、标题生成、约 20 秒，“有帮助，采纳了”。这里的
20 秒是主观耗时估计，不是操作时刻。核验沿用前台 Pgy 隧道和既有签名额度
读取，Cloud 仅执行限站点、固定起点的只读事务；未生成、保存或修改原文章，
未调整 Provider、额度、Cron 或支付配置。新增代理 Provider dispatch 为 0。

### 8.1 同一运行的执行、保存与扣额

关联 run：`run_3cb8764a3ae74647acce7246a40403e9`。

| 证据 | 本次事实 |
| --- | --- |
| Cloud 执行 | connector-runtime succeeded，error_code=null；北京时间 19:11:03.251 至 19:11:31.571，约 28.32 秒 |
| 实际生成模型 | M4 本地 `ollama-m4/qwen3.5:9b`；输入 1573、输出 28 token，模型调用 23954ms，retry_count=0 |
| 附属调用 | 同一 run 的 `qwen3-embedding:0.6b` 输入 284 token、输出 0，3920ms；这是 embedding 调用，不是第二次标题生成 |
| 展示证据 | 本地 generation.presented，task_key=title_generation；19:11:31，关联同一 run 和 generation_id |
| 保存证据 | 本地 outcome.observed=saved_exact_output、evidence_type=exact_hash_match；19:12:45；文章 modified_gmt 与该时间一致，pending 已清空 |
| 用户判断 | 操作者明确“有帮助，采纳了”，作为独立人工记录保留 |
| 实际扣额 | used 524→528、remaining 9776→9772；该 run 账本为运行 1 + embedding token 1 + 生成 token 2，共 4 credits |

账本三条消费对应不同收费单位，不把它们当成重复扣额；本次样本不能替代
并发/重试扣额幂等的完整验收。观察窗口内另有 site-knowledge-status 成功
run，未见对应 Provider 调用或消费条目，不计为标题生成。

这是原有测试账号，当前额度总量 10300；不以该历史账号证明新注册 Free
默认 300 credits。该默认值继续沿用 PR #1073 的专项证据。本次两项模型
记录成本均为 0，实际使用的是本地 Ollama，因此不证明第三方平台执行、
账单成本或试用 H3；不把 Cloud 记录成本当第三方账单。

### 8.2 自然上报及 H1 的证据边界

截至北京时间 19:13:56，本地有 2 条 editor-assist 事件，以及 4 条 journey
事件（标题 started/succeeded/accepted、save succeeded）。其中展示与保存
事件关联同一 generation_id，成功/保存事件关联同一 run；Cloud 当前窗口
尚未收到对应 editor/journey 事件，原生 agent_feedback 也无对应记录。

monitoring=true，DISABLE_WP_CRON=false，hourly 任务已注册；下一次计划时刻
为 19:52:21。上次成功上传在 19:10:29，早于本次生成，不能用于证明本次
事件已上传。计划时刻不等于实际执行时刻，仍须正常站点访问触发。
本轮没有手动 Cron/flush，不用主动上报替代自然上报验收。

本地 exact_hash_match 与人工确认支持“这次标题被保存且用户认可”的结论，
但不把 journey accepted 或保存观察冒充原生 agent_feedback；不据此宣布
试用 H1=100% 或达标。后续自然上报完成后，应按 run_id 和预期云端 event_id
核对接收及去重，另行判定当前原生采纳统计是否有缺口。

### 8.3 本轮收口与剩余工作

**真实本地标题生成 → 展示 → 人工保存 → Cloud 扣额已验证一例。**
第三方模型/账单、自然上报、原生采纳证据、其他能力和完整六条 Done 仍待
收齐。本次不启动四周试用、不修改 H1/H2/H3，不为凑次数制造生成请求。

原始只读证据保存于 `.runtime/local-acceptance/real-use-{before,after}.json`、
`real-use-cloud-evidence.json`、`real-use-wordpress.json` 和
`real-use-journey-inspector.json`。不记录文章内容或凭据。
前台隧道暂保留供操作者正常本地使用与后续自然上报；无新 sync/deploy/promote。
本轮只补录本报告，完成 docs-only 检查后本地提交；无新 PR 或生产发布。
本轮 diff 检查、release-policy、报告相对链接和 documentation reachability
495/495 通过；check:changed 维持 documentation-only / development /
runtime none。未重跑 Cloud 大套件或模型测试。
