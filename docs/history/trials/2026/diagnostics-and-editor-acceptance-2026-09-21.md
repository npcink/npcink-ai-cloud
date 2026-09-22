# 运行诊断与编辑器推荐验收 — 2026-09-21

Status: initial review completed; 2026-09-22 candidate editor apply/undo/native-save acceptance passed; Cloud PR #991 and evidence-gate PR #996 merged; M4 source-only promotion #996 accepted.
This dated record does not certify human usability or production. M4 evidence is revision-bound below.

## 2026-09-22 后续修复与候选验收

以下证据补充并更新下文 2026-09-21 的失败状态，保留原始失败记录便于追溯。

- 验收脚本已在本地修正：相关文章使用现行 Site Knowledge 搜索入口；HTTP 失败、
  缺少显式 `direct_wordpress_write=false`、Cloud 不可用不再被判为通过。
  4 项负向/边界测试通过，三篇文章六次真实请求全部返回 Cloud 证据且正文不变。
  已提交 `f63cedec`，Cloud PR #996：https://github.com/npcink/npcink-ai-cloud/pull/996 ，必需检查通过并已合并。
- 超时根因定位为 Cloud 对全部片段的锚点窗口做昂贵边界检查。M4 只读探针在
  737 个片段和固定代表性段落上测得旧算法 26.664 秒，新算法 5.047 秒，
  两者均找到 43 个匹配；每隔 50 个片段抽样比较精确输出一致。此探针使用
  固定代表性段落，并非浏览器原文请求的端到端基准，不据此定义 SLA。
- 修复只在词边界检查前排除原文中不存在的子串，不调整超时、召回、锚点资格、
  公共响应结构或 WordPress 写入权。提交 `ab060199`，Cloud PR #991：
  https://github.com/npcink/npcink-ai-cloud/pull/991 。
- 候选以 `daf3d296` 为基线同步到 M4；8 项定向测试通过，最终本地六项测试
  使用非通用词验证大小写及双向词边界，Ruff 与目标 mypy 通过。
- 回放捕获的真实请求：Cloud HTTP 200，约 8.718 秒，总计约 8.874 秒，
  `candidate_source=cloud_vector`、`source_knowledge.status=ready`。
- 真实 Gutenberg 文章 `281071`：7 个候选，1 个界面可应用候选，成功应用
  1 条后撤销；复制、metadata-only feedback、保存前数据库不变、没有直接
  WordPress 写请求、无控制台/网络错误均通过。
- 临时草稿 `281118`：复制真实文章正文后验证应用，显式原生保存后才改变
  `post_content`，反馈为 `internal_link_saved_unchanged`。测试随后删除草稿，
  `wp post exists 281118` 返回非零，确认清理。

剩余：Toolbox 的应用资格修复提交 `867300b` 尚因两次 GitHub HTTPS 传输失败未推送；
诊断页操作者理解度反馈；任务相关分支引用仍按发布规则保留。Cloud PR #991/#996
均已合并，M4 promotion #996 已接受 `081e0628b0b9bfea11d361abd355e64950f8d591`，
状态为 `source_branch=master`、`source_dirty=false`。这是当次读取的最新
`origin/master`，后续文档合并不追溯改变这份日期证据；当前没有生产部署。

新增本地证据：`.tmp/anchor-candidate-sync.log`、`.tmp/anchor-focused-m4.log`、
`.tmp/anchor-request-replay.log`、`.tmp/anchor-native-save.log`、
`.tmp/acceptance-20260922/editor/`。

## 工作审视报告

### 原定目标

复核两个历史任务：`01a0a964-0b7d-78f2-ad38-f6c8713f4914` 的运行诊断页面可理解性，
以及 `01a0276c-9247-75d3-9ec7-88fec1fcd6f1`（观察改进）的真实编辑器相关文章、
内链建议、复制、应用、撤销与 WordPress 写入边界。

本次 development lane，日期证据为 L0/local-only 文档收口。未修改产品代码、
插件配置或生产环境；未增加付费生成调用。测试使用现有 Cloud Site Knowledge
检索，因此不把“未增加付费生成”写成“完全没有运行时/embedding 调用”。

### 完成情况

| 项目 | 当前证据 | 验收结论 |
| --- | --- | --- |
| 诊断页源代码 | `ab39c705a396ea1596d5eac45be8876b7d301ba6`，包含已合并的 Cloud #950 | 已集成 |
| 诊断页定向浏览器 | `admin-runtime-diagnostics-v2.spec.ts` 8 个测试；首轮 7 passed，1 个因生成 receipt 时系统 Git 的 Xcode license 报错；使用已安装独立 Git 后仅重跑该项，1 passed | 8 项均有通过证据；API fixture 浏览器测试，不是真实后端 E2E |
| 诊断页截图复核 | 当前源码 PC 首屏、证据抽屉及窄屏：问题/范围/下一步优先，低频详情折叠，成功状态未被调用记录缺口误标失败 | Agent 界面复核通过；操作者理解度尚无本次反馈 |
| WordPress readiness | WordPress、数据库、Addon、Toolbox、Cloud health 均 ready | 环境前置检查通过，不代表浏览器推荐链路通过 |
| 原只读编辑器命令 | 文章 `281071/2701/1`；internal_links 为 HTTP 200、cloud_vector_evidence/cloud_vector，候选 7/8/2；related_articles 全部 HTTP 400；正文快照未变 | 原命令报告 passed 不能作为完整验收成功 |
| 当前相关文章检索入口 | `/npcink-toolbox/v1/site-knowledge/search`，intent=related_content；临时空样本 `281116`、文章 `281071/2701` 均 HTTP 200、provider=npcink_cloud、status=ready，结果数 0/4/5；direct_wordpress_write=false，正文快照不变 | 搜索入口和空结果分支通过；不能替代编辑器相关文章 UI 验收 |
| 真实 Gutenberg 浏览器 | 文章 `281071`；自动预取、metadata-only feedback、复制、精确锚点、选择不改正文通过；真实选中 WordPress 后候选仍为 cloud_unavailable | 端到端未通过 |
| 应用/撤销 | 缺少 Cloud 向量证据时页面拒绝应用；测试等待“已在当前编辑器应用”超时 | 防误写有效；本次没有成功应用，故撤销/原生保存不能签通过 |

相关文章搜索的三个请求约为 3056.7 / 787.3 / 969.3 ms。样本量小，且未控制缓存，
不据此定义 SLA 或性能结论。临时空样本也不代表真实业务文章的推荐质量。

### 发现的问题

| 严重程度 | 问题描述 | 原因与证据边界 | 改进与复验条件 |
| --- | --- | --- | --- |
| 必须改正 | `scripts/wordpress_editor_acceptance.py` 只按快照不变设置 passed；HTTP 400 仍成功退出 | 用无写入条件替代完整业务条件，且未持续对照现行入口契约 | 独立修复验收脚本；校验 HTTP、实际支持的 intent/section、证据来源、显式 no-write 和非空样本；预期空结果单列；错误响应必须非零退出 |
| 必须改正 | 历史 related_articles 已不被当前 `/editor/content-support` 接受；简单改为 related_content 仍 400 | 初步判断只核对了知识检索契约，没有先核对编辑器入口 allowlist；两者不是同一个契约 | 以当前产品入口确定相关文章的验收面；记录旧独立入口的迁移/退役，不能用替代搜索端点伪称 UI 已通过 |
| 必须调查 | 真实浏览器请求返回 cloud_unavailable；此前捕获的 source_knowledge 错误为 20 秒 cURL 28，而 WP-CLI 可获得 cloud_vector | readiness、CLI 和 web 请求上下文不同；超时发生位置已见，最终根因未证明 | 对照同一输入的 WordPress web/CLI 与 Cloud 请求链，核对相关日志和耗时；不凭猜测直接加超时或改召回算法 |
| 应当改正 | 缺少 Cloud 证据的候选仍被标为 can_apply_to_editor 并出现应用操作，实际点击才拒绝 | 精确 source_match 与完整应用资格的展示没有对齐 | 单独核对 UI/apply 资格；Cloud 证据不足时在操作前明确不可应用，保留复制路径 |
| 应当改正 | 技术截图和自动化通过不能证明操作者已经理解诊断页 | 工程证据与用户理解度属于不同验收条件 | 操作者需能回答“发生什么、谁处理、下一步点哪里”；不得自动填写 human acceptance=passed |

前两次尝试中的 `direct_wordpress_write=true` 是原脚本在错误响应缺少该字段时的
默认值，不是观察到 WordPress 实际写入。已确认的正文快照未变，应表述为错误响应
缺少边界字段，而非“发生三次越权写入”。

发现两个独立阻塞后，本次按开发操作模型停止扩展修复范围，保存失败证据。
未放宽向量证据门槛、未强制应用本地 fallback、未自动原生保存真实文章。

### 做得好的地方

- 逐项区分源码合并、mock 浏览器行为、真实请求、Agent 视觉复核和操作者验收。
- Cloud 不可用时没有伪装成向量结果；应用被拒绝，复制和 metadata-only 反馈仍可用。
- 只重跑因本机 Git 环境失败的一个测试，没有重复全套质量门。
- 临时草稿 `281116` 已核对标题后删除，`wp post exists 281116` 返回非零。
- 浏览器临时登录 helper 已清理；本次 Next dev 生成的 AGENTS/CLAUDE 与
  next-env 变动已恢复；失败截图移入 `.tmp`，测试服务器已停止。

### 下次重点关注

1. 先修复验收脚本的失败判定和退役 intent，增加 HTTP 400、缺少证据、空样本的
   有效负向测试；不要重新恢复已退役产品入口只为迁就旧脚本。
2. 用真实 web 请求定位 20 秒超时；获得 cloud_vector 后再复验复制、应用、撤销。
   原生保存仅用可删除草稿，并验证保存前数据库不变、显式保存后才变。
3. 诊断页保留操作者理解度反馈项；不能用本次 mock 截图替代真实运行数据验收。

这些是本次复盘的后续要求，尚未作为新的产品规范或代码改动发布。

## 版本与本地证据

M4 status 读取为 accepted、promotion_pr=973、source_branch=master、
source_dirty=false、source_revision=4c72ef1139df653502e8b36ab45f9c0dcffead10。
本次本地 origin/master 为 ab39c705；两者间 diff 仅为五个文档文件。
这说明运行代码未因这些文档落后而改变，但不把 M4 标记冒写成最新 master SHA。
本次未 sync、deploy 或 promote。

本地证据保存在 Cloud 主工作区（生成物未入 Git）：

- `.tmp/editor-acceptance-samples/2026-09-21/sample-1.json`
- `.tmp/editor-selection-acceptance.log`
- `.tmp/acceptance-20260921/editor/`
- `.tmp/acceptance-20260921/diagnostics/`
- `.tmp/acceptance-20260921/diagnostics-rerun/`
- `.tmp/acceptance-20260921/m4-status.log`

原始第一次 related_content 尝试使用了错误的临时重写，随后已核对修正；
修正后编辑器入口仍为 400。最终搜索端点结果与失败的编辑器入口结果分开记录。

既有规范继续适用：[运行观测工作台规范](../../../runtime-observation-workbench-operator-guidelines-v1.md)、
[WordPress readiness runbook](../../../wordpress-editor-readiness-runbook-v1.md)。

M4_OBSERVATION_RECEIPT date=2026-09-21; route=Pgy 172.16.3.35 via local tunnel 18010; sync=not occurred; focused=not measured; promotion=not occurred; operations=sync:0/deploy:0; stable_502=not measured; m4_only=not established (WordPress web request timeout under investigation); coordination=not occurred

M4_OBSERVATION_RECEIPT date=2026-09-22; route=Pgy 172.16.3.35 direct and local tunnel 18010; sync=not measured; focused=pytest 0.92s (transport not measured); promotion=not measured; operations=candidate-sync:1/promotion-sync:2/deploy:0; stable_502=not measured; m4_only=not established (Cloud anchor CPU cost reproduced); coordination=not measured
