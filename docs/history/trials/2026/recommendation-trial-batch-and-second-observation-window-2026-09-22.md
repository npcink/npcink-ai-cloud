# 推荐试批观察与第二性能窗口 — 2026-09-22

Status: completed. 操作者已裁决试批（93/93）；正式推荐优化按操作者决定延后至真实使用反馈。
本文件为 development lane、L0 日期证据记录；不改变产品代码、运行时或生产状态。

## 背景与目标

两个悬置问题在本轮收口：

1. 2026-09-22 锚点修复（Cloud PR #991）后的**第二个自然观察窗口**：
   判断慢请求是否复发，替代凭单次样本下性能结论。
2. **推荐质量试批**：用最小成本回答"推荐结果是否真的有用"，
   为后续是否投入 30 篇金标集和排序优化提供决策依据。

方法遵循 [推荐质量改进标准](../../../site-knowledge-recommendation-quality-improvement-standard-v1.md)
的 Stage A/B/C 分层：本轮为 Stage A 侧的最小试批（8 篇），不是 30 篇 Stage C 金标集。

## 第二观察窗口：无回归，通过

预登记预期：新窗口首请求 5–9s、暖请求 1–3s、无 20s 超时。实际
（[readiness runbook](../../../wordpress-editor-readiness-runbook-v1.md) 只读验收 ×2 批，
12 请求 / 3 文章，M4 revision `fc11e38c`，LAN 隧道路由）：

| 指标 | related_articles | internal_links |
| --- | --- | --- |
| 首请求（新窗口冷） | 4353.6 ms | 3297.9 ms |
| 暖请求区间 | 655–1121 ms | 37.6–81.6 ms（暖）/ 2988–3270 ms（首批） |
| P50 / 最大 | 831.8 / 4353.6 ms | 1610.3 / 3297.9 ms |

cloud_vector_evidence 12/12，fallback 0，非 200 为 0，写入边界失败 0，正文快照全部未变。
未清缓存、未加 cache-busting 参数，冷样本为自然出现。样本量属观察级，不据此定义 SLA。

## 推荐试批：8 篇 × 93 候选，双 AI 评审 + 操作者裁决

### 采集

- 抽样规则：已发布文章按纯文本长度分桶 rich(≥3000)/short(800–2999)/weak(<800)，
  桶内按 ID 降序取 3/3/2；站点桶分布 199/814/952。
- 16 个只读请求（8 篇 × 2 入口），快照未变，全部 `direct_wordpress_write=false`。
- 四列表观察已存档：related 含 production 序、vector_only（semantic_score）、
  hybrid_evidence（ranking_score）；internal 含返回序、confidence 序、anchor-gated 子集。
  vector_only（internal）与 traditional_baseline 本轮未取，作为缺口如实记录。

### 双评审设置与降级

计划为网关双模型（GPT55+GROK43）交叉预填。实际网关分组仅 `gpt-5.5` 一个模型有通道
（配置的 gpt-5.6/grok-4.6 均 503；gpt-5.5 上游通道自报 deepseek/deepseek-flash）。
降级方案：网关 gpt-5.5（prefill-eligibility.php 一次批量调用，校验零问题）＋
开发会话模型按同一输出契约独立标注；两者不同模型族，符合标准中"避免同族互评"要求。
全部为银牌证据，人工裁决为金标（`human_validation_required=true`）。
操作者本地 `.env.evaluation.local` 的模型名需自行修正（属本地配置，不入仓）。

### 结果

- 双评审一致 79/93（84.9%）；分歧 14，全部为 review↔strong 或 weak↔review 边界，
  无 strong↔weak 根本性冲突。
- 操作者经可交互裁决页（共识预选＋分歧必裁＋一键导出 JSON）完成 93/93 裁决：
  strong 7（7.5%）、review 41（44.1%）、weak 45（48.4%）；
  有用率 related 54.5%、internal 50.0%、合计 51.6%。
- 操作者 14 处覆盖建议**全部为 review→weak**：人工比双 AI 评审更严格，
  内链场景尤甚（Typecho 主题文的跨平台主题候选被整批否决）。
  含义：相关文章可跨生态相邻，内链目标应同生态强相关，两特征宜用不同严格度。

### 试批发现（按优先级）

1. **泛生态填充与多样性不足**：93 槽位仅 45 篇唯一文章（重复率 51.6%）；
   人工终判确认 wordpress美化 系列 9/10 weak、Mountain 4/6 weak、Impack 3/5 weak。
   后续优化首选目标。
2. **PII 分类门误伤**：279876（正文含用户中心/充值/提现字样）的 related_articles
   全文查询被 Cloud 以 `runtime.pii_classification_required` 拒绝（HTTP 400）；
   同文 internal_links 正常。需单独评估（放宽分类或 related 查询改用摘要）。
3. **weak_or_empty 桶无有效推荐仍硬给**：280965（促销短文）13 个候选被一致判 weak，
   系统仍返回 5+8 个。可考虑对超短/推广内容收缩展示。
4. **强相关场景表现好**：同生态互推（Typecho 客户端↔主题）、图片工具互推、
   上传脚本↔上传技巧均判 strong。

## 决策门结论（操作者 2026-09-22 明确）

本轮为快速反馈；**正式优化延后，依据后续真实使用相关功能时的反馈数据细化**。
当前不扩 30 篇全量、不做排序改动、不新增埋点代码（本地优先阶段暂缓遥测扩展）。
使用期数据来源：Toolbox 编辑器既有 metadata-only feedback 事件＋操作者一行式使用记录。
若启动优化，顺序为：泛生态降权/多样性 → PII 门误伤 → 弱桶收缩展示。

## 经验与可复用做法

1. **单模型网关降级**：网关仅一模型可用时，"网关模型＋开发会话模型"双评审
   （不同模型族、同一输出契约）可维持交叉评审价值，事后仍需人工全量把关。
2. **可交互裁决页**：共识行预选＋分歧行必裁＋localStorage 持久化＋一键导出 JSON，
   把人工裁决压到 20–30 分钟；导出记录 origin（分歧裁定/改建议/确认共识）可审计。
3. **试批即决策门**：8 篇×93 候选（约全量 1/4 成本）足以定位主要缺陷类别，
   避免在未证明价值前投入 30 篇金标标注。
4. **采集复用验收机制**：`wp eval` + `rest_do_request` 只读采集可完整保留
   排序字段（semantic_score/ranking_score/confidence/anchor 状态），
   四列表观察可由一次采集离线推导。

## 证据位置

- 人工裁决金标：`npcink-eval-lab/link-recommendation/generated/trial-20260922/trial-human-adjudication.json`
- 双评审与分析：同目录 `trial-prefill-input.json`、`trial-prefill.json`、
  `trial-prefill-session.json`、`trial-agreement-analysis.json`、`trial-review-page.html`
- 采集脚本与原始数据（未入 Git）：主工作区 `.tmp/trial-20260922/`
- 性能窗口样本：主工作区 `.tmp/editor-acceptance-samples/2026-09-22/`

## 预算与回退

付费调用 2 次（网关评审一次＋端点试探一次）；Cloud 只读检索 28 次（验收 12＋采集 16）；
零构建、零部署、零生产操作。本文档为唯一入仓变更；回退为撤回本文件。

M4_OBSERVATION_RECEIPT date=2026-09-22; route=LAN 192.168.10.200 via m4-preview tunnel 18010; sync=not occurred; focused=not measured; promotion=not occurred; operations=tunnel:1/sync:0/deploy:0; stable_502=not measured; m4_only=0 observed; coordination=1 parallel session owned the main worktree admin branch during this session
