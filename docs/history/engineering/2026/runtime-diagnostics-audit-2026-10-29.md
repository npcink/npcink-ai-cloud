# 运行诊断、审计证据与 Agent 反馈质量审查 · 2026-10-29

## 结论与范围

三部分存在共同的证据解释问题：正常的非模型操作进入调用缺口告警，反馈事件被解读成采纳质量，切换范围时旧结果仍可能被当成新范围证据。应先修统计口径、范围隔离与查询失败状态，再处理趋势和展示细节。

本轮确认 **15 项问题**：运行诊断 D01–D06、反馈质量 D07–D12、审计证据 D13–D15。P1/P2 是内部修复顺序，不是生产安全严重性。条件夹具发现不表示当前现场已发生相同规模的问题。

本轮交付为只读审查和建议；没有修改业务代码、写入共享 M4 测试数据、制造付费 Provider 调用、部署、推送或合并。保持 Cloud 元数据投影边界，WordPress 审批、保存与最终审计真相仍在本地。

用户入口：

- `/admin/troubleshooting?focus=hosted_model.provider_call_gap`
- `/admin/audit`
- `/admin/agent-feedback?window=168`

## 证据身份与限制

| 层级 | 本轮证据 |
| --- | --- |
| 本地源码 | `b845c6ae`，分支 `codex/observation-evidence-fixes-20261029`；之前观测修复已提交 |
| 初始 M4 | candidate；backend `0de7f2b5d3c13e7131c0574307f44da65f38b7f6`；frontend source `b3365709a940965a3570648db68c7e4b576fbace` |
| M4 浏览器与只读响应 | 运行诊断三个分类、概览、运行/对照记录、失败详情、趋势表；反馈 24h/7d；审计初始及精确查询失败状态 |
| 本地隔离复现 | 临时 SQLite + 实际服务/API；本地 Next 页面 + 浏览器响应夹具；PC 1440/900 宽度 |
| 本地已有测试 | 5 passed；见下方验证明细；不是对本报告所列缺陷的修复验收 |
| GitHub CI / 合并 / M4 accepted / 生产 / 人工验收 | 本轮均未执行或未取得 |

审查中途共享预览入口中断。本机 `18010` 返回连接重置；只读 M4 status/logs 先报告 Docker API 错误，随后报告 Docker socket 不存在。未重启、修复或覆盖共享环境。后半段交互使用本地浏览器夹具，不能替代 M4 实测。

反馈页、审计工作区与反馈服务在已核对的 frontend source revision 与本地 HEAD 之间无差异。运行诊断此前 F06–F14 批次的精确 run 下钻等修改尚未同步到该 M4；不将这些已在本地修复的部署差异重复列为新缺陷。

参考约束：[运行诊断契约](../../../runtime-observation-diagnostics-v1.md)、[反馈质量契约](../../../cloud-agent-feedback-quality-gate-v1.md)、[PC 选择验证规范](../../../frontend-pc-scope-and-selective-verification-v1.md)。

## 运行诊断

### D01 · P1 · 非模型状态读取被报告为缺少模型调用

**范围：M4 实测、源码、隔离 API 复现。** 14 天快照有 1,138 次运行、270 次调用缺口，其中 knowledge 266。取 knowledge 缺口列表最近 100 条，88 条为成功的 `npcink-cloud/site-knowledge-status`，12 条为 sync；这 88 条状态读取没有模型调用是预期行为，不能因此认定调用记录丢失。不能据此断言全部 266 条都属误报。

`app/domain/site_knowledge/service.py:823` 的状态实现读取索引/快照等状态，没有 hosted model dispatch；runtime 授权也将其识别为 status。`app/domain/runtime/telemetry_evidence.py:7` 却只排除 `media_upload`；summary 的 `service.py:1431` 和运行列表的过滤也沿用这一假设。隔离 API 中，成功 status、零调用记录被返回为 `provider_evidence_state=missing`。

**建议：** 根据操作的实际执行语义统一判定“是否需要模型调用证据”，在概览、缺口、分组、趋势和列表中复用。首先排除已知状态读取；sync 的无变化/无候选等路径要逐项确认，不能把整个 knowledge 家族都豁免。不要补造调用记录或强迫状态读取调用模型。

**验收：** status 不再进入缺口和相关分母；真正应调用模型却没有调用证据的运行仍能被检出；调用前失败和记录丢失继续保持待调查状态。

### D02 · P2 · “实际供应商/实际模型”展示的是运行路由字段

**范围：M4 详情、源码、隔离 API。** knowledge 失败详情显示 `site_knowledge / site-knowledge-managed`，同时有调用记录。`frontend/src/app/admin/troubleshooting/page.tsx:469` 使用 `selected_provider_id/selected_model_id`，并命名为“实际”。运行列表 `app/domain/runtime/service.py:1778` 直接投影 RunRecord 字段；knowledge 生命周期 `:740`、`:3514` 将其设置为逻辑服务占位。真正 embedding 调用另有 ProviderCallRecord，二者不是同一种事实。

**建议：** 最小修改先准确命名为运行选定路由/逻辑服务；只有从调用记录取得的 provider/model 才称实际调用。一个运行可有多个调用或回退，避免把首条调用冒充全程事实。

**验收：** 无调用证据时不展示“实际模型已执行”；逻辑知识库服务与实际 embedding 供应商可区分；回退/多调用不丢失含义。

### D03 · P2 · 反馈计量关联会增加其他家族的运行数

**范围：M4 数量不一致线索、隔离服务复现。** M4 家族与 execution-kind 运行数量存在差异；单凭这一差异不能认定错误。隔离复现证明：5 条 RunRecord，其中一条运行的反馈 UsageMeterEvent 属于另一个家族，最终各家族 `runs_total` 合计为 6，并出现没有该类 RunRecord 的 agent_feedback“运行”。总体运行数仍为 5。

原因是 `app/domain/runtime/service.py:1520` 按计量事件的家族更新分组；`:1902` 将关联 run_id 放入分组 run_ids，`:1935` 再以关联集合扩大 runs_total。反馈事件关联到一个运行，并不改变这个运行本身的家族。

**建议：** 运行计数和运行家族以 RunRecord 为准；计量/反馈按自身语义统计，关联运行数另列或在原运行分组上关联。不要用事件家族重分类运行。

**验收：** 对同一运行增加反馈或附加计量事件，不改变运行总数和家族归属；无对应 RunRecord 的关联不能伪装成运行数量。

### D04 · P2 · 分组 Top N 可隐藏低频运行失败和调用错误

**范围：隔离 API 条件复现；当前 M4 未证明触发。** 告警汇总 `app/domain/runtime/service.py:2197`、`:2218` 从已经截断的 capability_groups 累加错误和失败。真实 API 夹具中 55 次运行含 1 次失败和 1 次调用错误；默认 `limit=25` 下低频家族被排除后，两类告警均消失，但每日趋势仍分别计数 1。三项 `evidence_limits` 均为 false，没有提示是分组截断。

**建议：** 告警总量从完整有界运行/调用集合计算；展示分组随后截断，并单独给出分组截断信息。分组上限不应决定是否存在告警。

**验收：** 超过 25 个家族时低频失败仍触发告警；改变展示 limit 不改变告警总量；告警、趋势、详情采用一致口径。

### D05 · P2 · 下载文件缺少复现该结论的筛选与证据范围

**范围：源码、以 M4 响应回放的本地浏览器下载。** 实际下载 JSON 只有 `window_hours/generated_at/selected_issue/unit/daily_counts`。站点、function、复核 since、有效起止时间及截断信息都未写入。失败证据导出也仅记录 window、生成时间、recovery 与 failures。见 `frontend/src/app/admin/troubleshooting/page.tsx:211`、`:401`。

**建议：** 在现有导出中补齐有效筛选、实际时间范围、UTC 桶语义、样本/截断状态及证据来源；继续只导出受限元数据。

**验收：** 从站点或复核窗口导出的文件，离开页面后仍能准确复现范围；截断样本不能被当成全时段完整结果。当前下载计数总和 270 与选定问题一致，这一行为应保留。

### D06 · P2 · 无运行时计量完整率仍显示 100%

**范围：隔离 API 与本地页面。** 空范围响应 runs=0、AI 分母=0，页面调用完整率为 `—`，但计量完整率仍为 100%。`frontend/src/app/admin/troubleshooting/page.tsx:291` 只对 provider 指标检查分母；后台空集合覆盖率返回 1。

**建议：** 两个指标各自依据对应分母展示 `— / 无样本`，列出待定量。无运行时的“暂无法判断”结论已经正确，应与指标一致。

**验收：** 零运行、全部非 AI、全部待处理等状态下，不以 100% 暗示计量已经被实际验证。

## Agent 反馈质量

### D07 · P1 · 切换站点失败后旧数据被放到新站点范围下

**范围：源码、本地浏览器 503 夹具。** 先加载全部站点 40 条/42.5%，再筛选新站点并使新请求失败。旧 40 条及 42.5% 仍显示，右侧问题检查器的“当前范围”却变成新站点。虽然有“仍保留最近一次快照”提示，但没有标注它属于全部站点，容易产生错误归因。

`frontend/src/app/admin/agent-feedback/page.tsx:340–395` 的 data/hasLoadedRef 没有范围键，错误也不与快照范围绑定。

**建议：** 按 window+site 绑定数据和错误。相同范围刷新失败可保留旧快照；跨范围失败显示该范围无可用证据，或明确展示旧快照自己的范围，禁止检查器使用新范围解释旧统计。

**验收：** 站点 A → B 请求失败、时间窗改变、快速切换及迟到响应均不串数据；同范围刷新失败仍可安全保留已标识的旧快照。

### D08 · P2 · 不存在的问题定位被静默替换成第一项

**范围：源码、本地浏览器夹具。** URL `focus=not-in-scope`，返回 evidence_weak 和 wrong_next_step 两项，页面仍直接选中 evidence_weak，没有告知原定位未找到。见 `frontend/src/app/admin/agent-feedback/page.tsx:411`。

**建议：** 仅在未指定 focus 时默认第一项。显式 focus 不存在时保留 URL，说明当前证据范围没有该问题，供用户自行改选。

**验收：** 分享链接、缩小范围或刷新后问题消失，均不会打开另一问题冒充原对象；可复用诊断页已有行为。

### D09 · P1 · 曝光进入通用质量分母，忽略还被显示成拒绝

**范围：M4 响应、源码、隔离反馈 API。** 当前 7 天有 40 条事件，其中 accepted 17、ignored 20、rejected 3，页面“采纳”42.5%。不能把它直接理解为保存采纳率。隔离 API 同一推荐 session 只有一次 impression（outcome=ignored）和一次 Apply（accepted）时，通用 accepted_rate=50%，趋势 rejected=1；session Apply rate 则为 100%。这几种比例含义和分母不同。

`app/domain/agent_feedback/service.py:130–200` 将所有事件都计入通用质量统计；`:704` 把 ignored/expired/blocked 也归为 rejected，前端却写“拒绝”。现行质量契约明确要求曝光保留原始计数、从通用质量率/趋势/场景等排除；文档称 `impression_only`，现有事件通过 impression action + ignored 表达，修复时需对照真实契约，不能仅添加一个未被接受的 outcome 名称。

**建议：** 定义并复用合格质量事件集合，曝光按 source action 识别；通用“接受动作”、实际拒绝、忽略、过期、阻止分别命名。保存采纳沿用明确的本地保存回执和 session 分母，不能从 accepted 总数推导。

**验收：** 仅追加曝光不降低既有质量结果的比例，也不增加拒绝量；重复 open/copy/Apply 不冒充多个 session 保存；各层分子分母可核对。

### D10 · P2 · 接口已有推荐保存/撤销质量，页面完全忽略

**范围：M4 响应与源码。** `recommendation_quality` 已返回 related_articles/internal_links 的 session 指标。当前 internal_links 有 16 个曝光 session、4 个 Apply、1 个 saved_unchanged、3 个 undo，`sample_status=insufficient`；页面没有对应区域，只显示通用采纳和“没有质量问题”。`normalizeAgentFeedbackSummary` 未消费 recommendation_quality。

这些数字不能与全站 42.5% 直接作同分母比较，但能说明单一“采纳”没有表达保存与撤销过程。缺少低质量标签也不能证明推荐结果质量没有问题。

**建议：** 复用既有响应展示有界推荐质量摘要，区分曝光、操作、保存回执、撤销与样本不足；将空队列文案限定为“没有收到低质量标签”。无需新增分析平台、模型评分或采集原文。

**验收：** 保存与 Apply 分开显示，撤销可见；低于既定 20 session 标为不足；Cloud 不宣称拥有 WordPress 最终保存真相。

### D11 · P2 · 无样本为 0%，少量样本却标成绿色 100%

**范围：M4 浏览器与响应。** 24h 事件为 0，头部仍显示采纳/证据偏弱/步骤错误均为 0.0%。7d 的 editor_assist 只有 6 条事件，但采纳 100% 使用成功色，没有低样本限制。另有一条 model_flow_smoke/admin_preview_smoke 混在全局统计中；它是工程样本，不能作为真实用户价值证据。

**建议：** 零分母显示无样本；每项比例展示分子、分母；少量反馈明确只作描述、不据此下质量结论。最小化标明工程 smoke 的来源和混合口径，产品价值判断使用独立合格样本。不要为通用指标擅自复制别的指标阈值；媒体/推荐继续使用已有契约阈值。

**验收：** 0/0 不显示成质量率 0%；6/6 不被解读为充分的质量通过；工程样本与客户证据可辨。

### D12 · P2 · 趋势静默丢弃前面的小时桶

**范围：源码、本地浏览器夹具。** `frontend/src/app/admin/agent-feedback/page.tsx:738` 固定 `.slice(-8)`。输入 10 个小时桶时只展示末 8 个，标题仅为“小时桶”，没有“最近 8 个有事件桶”或截断说明。7 天的数据容易被误当成完整趋势；无事件小时也没有被明确表达。

**建议：** 显示完整有界趋势，或明确最近 N 个非空桶及覆盖范围，并允许查看全部。缺桶与零事件小时分别说明，避免把缺少数据当作质量归零。

**验收：** 9 个及以上桶时范围不隐瞒；头部总量与展示趋势的关系明确，小时标签和时间区间可核对。

## 审计证据

### D13 · P1 排障前置 / P2 页面修复 · 查询失败仍显示“匹配 0”

**范围：M4 实测与源码；线上根因未核实。** 默认审计查询失败；精确 event_id=1、以及不存在站点的查询等待 8–10 秒仍未返回，被客户端超时/主动中止。页面最终有失败提示和重试，同时头部、列表标题、分页写着“匹配 0 / 共 0”。这是查询结果未知，不是成功确认零条。

随后预览整体连接中断，M4 只读工具也无法正常访问 Docker daemon。因此不能把审计超时归因于全表扫描、索引缺失或某段 SQL，更不能断言生产存在同样故障。精确 ID 也超时尤其要求先排除代理、服务和数据库连接可用性。

`frontend/src/features/admin/audit/AdminAuditWorkspace.tsx:101` 在无 data 时将 total/items 默认成 0。另在新筛选加载中会保留旧表和旧“匹配”量，仅以“刷新中”及 aria-busy 表示；本地 1.8s 延迟夹具中筛选 event_id=999 时仍展示 #101 与匹配 1，缺少旧范围说明。新范围失败后的 React Query 缓存行为依目标键而异，不能一概声称始终保留另一范围的数据。

**建议：** 先只读定位并恢复 M4 查询链路，再补默认/精确/无匹配/分页实测。页面将未加载、失败、成功为空分开；只有成功数据可称“匹配 N”。保留旧页时标出已加载页的范围和时间，并在跨筛选期间限制旧记录操作。

**验收：** 请求失败不显示已确认的 0；新范围加载不误称旧结果为该范围匹配；服务恢复后用真实查询证明，而非用本地 mock 代替。

### D14 · P2 · 结果筛选缺少 failed，深链重新提交会丢失该条件

**范围：源码、本地浏览器复现。** 下拉框仅有 succeeded/success/error/blocked。实际 `app/api/routes/service.py:1101` 的 capability probe 审计会写 failed，`app/domain/commercial/mixins/_admin_mixin.py:1258` 也有 partial。打开 `/admin/audit?outcome=failed` 后下拉框实际选中空值；点击“应用筛选”变成 `/admin/audit`，静默扩大范围。

**建议：** 覆盖现有真实 outcome 值，并对未知但合法的 URL 值保留临时选项；不要把 failed/error/success/succeeded 无说明混并。已知结果提供清楚中文，保留原值供排障。

**验收：** failed/partial 可以选择和刷新；已有未知 outcome 深链重新应用不丢失；真正无匹配和筛选不支持可区分。

### D15 · P2 · 目标审计事件不在当前页时静默不定位

**范围：源码、本地浏览器。** `focus=999`、当前返回 #101 时，页面没有抽屉，也没有“所选事件不在当前页/范围”的提示。`AdminAuditWorkspace.tsx:110` 仅在当前 items 中 find，未处理 absent focus。与反馈页不同，它没有替换对象，但用户无法判断链接失效、记录不存在还是在别页。

**建议：** 显式说明定位未命中；提供保留既有站点/时间边界的精确 event_id 查询入口。精确查找也不能绕过权限或擅自放宽原范围。

**验收：** 不存在、被筛掉和不在本页的目标均有可理解提示；已有精确定位和关闭抽屉行为保持正常。

## 可保留行为与次要建议

- 运行诊断：显式问题 focus 未出现时保留选择；任务结果与调用错误分开；缺失调用与有调用对照分开；详情可读并可 Escape 退出。历史错误不自动等于当前故障；无新运行不能证明恢复；样本上限已有可见提示。
- 审计：默认 include_payload=false；抽屉不展示请求/结果 payload，技术字段有折叠；精确 ID 会打开对应详情，关闭会移除 focus。已有越页恢复、RFC3339 精度及后端输入校验应保留。
- 反馈：Cloud/WordPress 边界说明和高级信息折叠有效；媒体推荐区已有的不足样本、保存真相约束可继续复用。
- 跨页导航：14 天到反馈页会明确提示采用 7 天，没有把它误报为时间窗暗改。其他不支持 since 的来源保持其支持的时段是现有契约，仍建议在落地页标清范围差异。
- 趋势细节：运行诊断使用的单序列 `AnalyticsLineChart` 默认 smooth=true（`EChartsWrapper.tsx:176`），计数建议使用直线或柱状并标明 UTC/首末部分日期；不是本次最高优先级。
- PC 900px：三个页面未见整页横向溢出；审计表使用独立横向滚动。反馈场景表标签列挤压、中文多次换行，建议允许表内横向滚动或调整列宽；不扩展移动端适配。

## 修复顺序与停止条件

1. **恢复可查询前提并纠正结论：** 只读定位 D13 环境链路；业务修复先 D01、D07、D09，连同 D06/D11 消除无样本误导。
2. **统一证据来源与范围：** D02–D04、D08、D14/D15；之后补 D05 导出范围。
3. **补已有证据展示：** D10、D12，再处理趋势形态和 PC 表格密度。

停止条件：正常状态读取不触发缺口；不同范围不会串证据；告警不受展示 limit 影响；曝光、接受动作、保存、撤销、忽略分别可解释；失败查询不冒充零结果；指定对象找不到时明确告知；下载可还原证据范围。达到这些正确性条件后停止，不扩张成新监控/评分/自动修复平台。

## 验证记录

本地使用实际服务与临时 SQLite，没有 Provider 执行：

- status 无调用 → 被误判 missing；复现 D01。
- 5 条运行 + 一条跨家族关联反馈 → 分组合计 6；复现 D03。
- 默认 25 个展示分组、55 条运行 → 漏掉实际 1 次失败/1 次调用错误，趋势仍为 1，三项证据截断 false；复现 D04。
- 同一推荐 session 一次曝光 + 一次 Apply → 通用接受率 50%、趋势拒绝 1、session Apply 100%；复现 D09。
- 空运行范围 → 两项后台覆盖率均为 1；页面调用完整率 `—`、计量完整率 100%；复现 D06。

本地浏览器使用受控响应验证 D07/D08/D12/D14/D15、新范围加载中的旧表显示、诊断复核起点/返回完整时段、缺失问题保留、趋势表与 JSON 下载。截图覆盖 1440px/900px，证据位于忽略目录 `.tmp/diagnostics-*`，不作为可移植 CI 工件或生产证据。

已有测试：`tests/domain/test_commercial_service_audit_repository.py`、`tests/api/test_service_routes.py::test_service_routes_manage_account_site_and_keys`、`tests/api/test_agent_feedback_routes.py::test_agent_feedback_summarizes_recommendation_quality_by_session`，合计 **5 passed**。它们证明被覆盖的基础读写/过滤/契约仍可运行，没有覆盖本报告全部边界，也不代表缺陷已经修好。

本轮业务代码未改；无需重跑全后台或全量构建。报告执行文档可达性和 diff 检查后本地提交。M4 恢复后的真实审计分页、默认/精确查询及完整复核流程仍待验证。
