# 编辑器后续落实 — 2026-11-18

Status: source candidate / draft PR；本地安装可查看，未合并、未发布生产。CI 与 M4 分别记账。
承接[功能审计](wordpress-editor-feature-audit-2026-11-17.md)与
[编辑更新保存修复](wordpress-editorial-save-correctness-2026-11-17.md)。

## 当前范围与顺序

操作者同意结合 Phase 1 实际情况依次落实待办。先提交已有候选、验证并修复
已有通用能力的正确性，再处理高频固定中文提示、真实任务质量；现有暂停契约
保留。三个新 Ability 只评估，不因“依次落实”而自动启用或建立通用兜底。

| 项目 | 本轮处置 |
| --- | --- |
| 前两批提交 | Cloud `35749a01`、Addon `760b109`、本地 AI patch `a3a9771`；原有历史提交保留，非生产 |
| 翻译语言冲突 | 确认 Cloud 对中文输入追加简体中文要求；翻译现在始终尊重本地 Ability 的目标语言，包含只在旧 system instruction 中传目标的调用 |
| 总结/翻译/别名/分类/Notes | 真实 WordPress 1.5 Ability + fake HTTP 7 例，原始 source/额外背景/目标/策略/数量传输与结构化消费通过 |
| 中文提示 | 完整 AI 1.5 审计基线仍有 180 缺口；固定 UI、组件默认域、动态 metadata 和暂停功能必须逐项区分，不全局覆盖默认域或翻译模型提示词 |
| 标题、语义质量、图片/评论 | 标题草稿/历史/反馈已修复并验证；4 个免费模型自然样例和 4 项图片/评论确定性检查另列，保留质量限制 |
| 未适配三项 | 容器标签、修订摘要、输入补全继续未适配；当前核心优先，不恢复暂停功能 |

## 翻译修复与证据

Cloud 原有末尾语言兜底覆盖所有中文场景，只有 slug 除外；因此它与本地
“翻译为英文/日文/繁体中文”等要求同时出现。现在对 translation 和 slug 均不
追加该兜底，其余任务保留现有行为。不更改本地提示词、源内容、目标语言字段、
结果结构检查、未翻译/过度扩写/拒绝输出及不完整输出守卫；无新 API、配置或依赖。

五种明确目标语言（en-us/de-de/ja/zh-tw/zh-cn）与旧 system-only 一例：修复前
**6 项失败**，修复后完整 connector runtime domain **172 项通过**。
新增用例也修正测试工厂：translation 是 source_text 任务，不能虚构 prompt+
source_text 混用的请求。失败样例和最终结果分别保存。

真实 Local WordPress 7 项使用合成输入并拦截所有外部 HTTP，执行：中文→英文、
英文→中文、总结、别名去重/数量、分类 existing_only、分类 allow_new、语法 Notes。
六项成功返回；existing_only 故意返回不存在的词，由上游丢弃并以 `no_results`
（REST 500）拒绝，属于负向验证，不伪报七次成功生成。allow_new 只返回候选，
没有实际创建或赋词。Notes 合成输出包含上游要求的 priority，验证其筛选后结果。
所有文章/postmeta、分类词/关联和 Notes 指纹不变。

捕获这七份实际 WordPress 操作契约后，交给真实 Cloud validator 和 provider-input
builder：source 单次保留、system instruction、目标语言、分类策略、JSON schema
均通过。这是分段确定性集成，不是网络直连成功或模型质量结论。

## 交付与限制

- 原生 AI 保存修复仍为本地 1.5.0 补丁，源码及测试已提交到独立本地仓库；升级前
  比较源码并重跑回归，未向 WordPress 上游发布或声称官方修复。
- CI、M4、安装包及人工效果各自记录；生产发布需要单独的精确授权。
- 规范补充：输出语言继承只适用于保留源语言的任务；翻译以明确目标为准，
  回归必须检查最终组合指令，不能只检查 target_language 字段存在。

## 2026-11-18 本轮交付检查点

- Cloud draft PR [#1438](https://github.com/npcink/npcink-ai-cloud/pull/1438)，
  Addon draft PR [#361](https://github.com/npcink/npcink-cloud-addon/pull/361)；
  均未请求自动合并。WordPress AI 补丁只保存在本地，不向上游发布。
- Cloud `bde779bf` 已同步 M4 candidate；connector domain/API **426 通过**。
  本地 297 项和 M4 426 项有重叠，不相加宣称独立覆盖。非 master accepted/生产证据。
- Addon `760b109` 初轮 CI 14 项通过，包含 PHP 8.0/8.2/8.4、PHPStan、包检查和
  WordPress AI 兼容检查；该兼容门禁稳定主线为 AI 1.4，不代替本地 AI 1.5。
- Addon 后续 `0a477ec` 补齐 19 个固定编辑器 UI key（完整审计 180→161），
  PHP、PHPStan、38 JS 检查通过。真实 PC 1440/1280 验证 locale 注册、标题审阅
  弹窗和翻译进度；其余新增错误态与修订摘要未逐个浏览器触发。无草稿持久化，
  用户原文未改动，临时草稿、MU helper 与会话已清理。最新提交 CI 另记。

### CI 失败与修复

Cloud 初轮 frontend 在浏览器依赖安装前失败：Ubuntu archive selector 只支持 Azure
镜像，新 runner-images 支持 `us-east-2.ec2.archive.ubuntu.com`，因此 fail-closed。
核对 actions/runner-images 当前 `configure-apt-sources.sh` 后，仅添加该确切镜像，
保持未知来源拒绝、security stanza 和其他源不变；**31 项软件源回归通过**。
没有放宽为任意域名或跳过浏览器安装。

Python 审计报告锁定 `opentelemetry-api 1.45.1` 的 CVE-2026-126360；仅将 API/SDK
升级到 1.45.2、配套 semantic-conventions 升至 0.66b2。其余锁定包保持不变；
使用 CI 同版本 uv 0.12.10 确认锁文件有效，default/zilliz 两组审计通过。
此记录是锁文件审计结果，不等同于生产可利用性结论或已部署修复。

## 标题重新生成：草稿、反馈与采用保护

本地 WordPress AI commit `6a2c01de25a7de2cc4c4addf32451521ae7395b8`
承接保存补丁 `a3a9771`；Addon `5517876512523b8313abc4dec7b4aaad7a311de0`
优先转发当前标题，并补充 5 个本地补丁固定 UI key。所有权仍在 WordPress，
Cloud 不存标题历史、不获得最终写权。

- 本地 Ability 新增可选 current_title（1000）、current_excerpt（10000）、
  previous_titles（至多 5 条、每条 1000）、feedback（500 字符）。数字 context
  仍为同一文章权限锚；未传的新字段不影响旧调用。显式空草稿覆盖旧数据库值，
  不能由连接器再补回已删除标题。
- 用户可输入修改意见；最近五个候选只保留于组件内存，并交给本地提示词要求避免
  重复。NFKC、去首尾空白与大小写归一后的精确重复被拒绝，不自动重试或付费重跑。
- 生成期间标题、摘要、正文或文章身份变化时不允许插入旧候选；候选与反馈保留，
  错误显示在当前弹窗内。点击插入仅修改草稿，作者另行保存。
- Rename 入口同样保护用户字段和连续点击；本轮浏览器覆盖标题工具栏，Rename
  分支只有源码、类型和 utility 证据，不能标为浏览器验收通过。

15 项上游单测通过（11 项保存 + 4 项标题）、typecheck、改动 JS lint 与 legacy
build 通过；build 有 3 条原有包体积警告。真实 REST 验证草稿覆盖、空值覆盖、旧
调用、超长反馈/历史拒绝、匿名权限拒绝；没有持久化用户草稿。
真实 PC 1440/1280 验证重复候选/反馈保留、无自动重试、显式插入只变草稿、生成时
继续编辑后阻止旧候选插入。临时草稿、认证会话及 MU helper 已删除，用户文章
279790 指纹不变。浏览器报告中的 Gravatar 外部阻断与导航 blob abort 分别记录，
不宣称控制台零错误。

### 可重建和回滚

先在精确 AI 1.5.0 tag `769a5171889182ecaa03e1f4474df3708138a1bb` 上应用
[保存补丁](../../../upstream-patches/wordpress-ai-1.5.0-editorial-save.patch)，再应用
[标题补丁](../../../upstream-patches/wordpress-ai-1.5.0-title-regeneration.patch)。
本轮干净本地 clone 顺序 apply/check 通过；源码仓库不是官方发布。
执行 `node --test tests/unit/editorial-updates.test.cjs tests/unit/title-generation.test.cjs`、
`npm run typecheck` 和 `npm run build:legacy` 后，标题安装仅涉及
`includes/Abilities/Title_Generation/Title_Generation.php`、同目录
`system-instruction.php`，以及 `build-scripts/experiments/title-generation.js`、
`.asset.php`、`.css`、`-rtl.css`。本地安装已完成。
证据目录 `title-original/` 保存这 6 个旧文件；回滚前核对 manifest 的 installed
hash，仅恢复这些文件，不回滚文章或覆盖其他插件资产。升级会覆盖本地补丁，
必须按新版本重新审阅；Addon symlink 与上游源码补丁分别管理。

## 有界真实生成质量检查

使用真实本地 Ability 捕获的自然文章契约、Cloud validator/input builder 和现有
免费 M4 Ollama `qwen3.5:4b-q4_K_M`，各生成一次标题、摘要、英文翻译、缩短正文。
未新增模型、未花费 Provider 费用、未写文章；不是经过认证的完整 hosted runtime、
Site Knowledge 检索或生产模型验收。四次均自然 stop，耗时分别 11、6.22、13.33、
8.02 秒；`prepare_provider_output` 接受不代表所有最终 schema/消费端都已验收。

标题语义基本符合审阅/保存主题，但原始模型返回带引号的字符串而未遵守单字段
JSON 指令，完整标题结果序列化仍需单独端到端样例。摘要遗漏部分失败与 Notes
完成条件，将连接检查缩窄为“网络状态”，不能记为全面质量通过。英文翻译保留
原文流程与限制；缩写保留人工审阅、插入/保存和任务限制。每类只有一个样例，
没有代表性准确率或自然采用证据，不据此批量调提示词或宣称全部模型有效。

## 图片和评论族：现有支持的边界复核

真实本地 REST Ability + 全部外部 HTTP 拦截，共 4/4 通过：图片提示词保留 style
和额外背景；评论回复/分析不外传非公开草稿标题与摘要；ALT 上传回执严格校验后
仅传 artifact ID，不塞内联 base64，消费为 alt_text/is_decorative。
最初 ALT fixture 只返回 artifact_id，不满足 media_upload_result.v1，正确被拒；
补齐 MIME、尺寸、字节数、checksum、有效期后通过。这是测试夹具修正，非产品绕过。

评论分析按上游设计写入 5 项 `_wpai_*` 分析元数据，不能把整个 Ability 写成只读。
文章、原 ALT、评论正文不变，不写回复、不改审核状态；临时文章、评论和图片均
finally 删除。1 像素合成图片与合成模型输出只能证明传输/消费，不能证明视觉准确性。

## 未映射三项的处置

- block-container-label-generation：需本地 block metadata.name 审阅采用与上下文测试；
  当前核心标题/摘要/选文价值优先，保持不支持。
- revision-change-summary：需明确修订对、长差异截断、隐私与比较准确性验证；固定 UI
  汉化不等于已适配，保持不支持。
- type-ahead：高频后台调用、草稿隐私、费用与幽灵文本采用风险尚无价值证据，延后。

不添加通用 chat 兜底，不自动注册映射或恢复任何暂停入口。

## 最终候选状态与独立阻塞

Addon `5517876` 的 GitHub required/compatibility checks 全部通过；稳定上游阻塞
lane 是 AI 1.4.0，本地 AI 1.5 另有以上证据。严格 AI 1.5 全量翻译审计仍为红：
161 处（145 fixed UI、2 Ability error、14 default-domain），不把高频提示完成写成
全量翻译完成。动态 metadata、模型提示词和默认域不能盲目全局替换。

Cloud `911be444` 已完成依赖变更后的 M4 candidate rebuild，tracing/health/connector
188 项通过；此前 `bde779bf` connector domain/API 426 项通过。`1b0dc171` 仅收窄
optional usage_context 的错误状态读取，mypy 和 20 项 Provider 回归通过。最终文档
提交后的 M4 identity 和跨仓报告保存在本机证据，不将旧 SHA 写成当前 accepted。

Cloud `1b0dc171` CI 的 frontend、backend-static、依赖审计、后端分片 1/3/4、
CodeQL 等通过，分片 2 在此记录时仍运行。Python 3.14 Alpine image smoke 被
CVE-2026-119170 阻塞：官方说明仅 Python 3.14.10 + OpenSSL FIPS 模式受影响，
修复版本为 3.14.11；本轮查询的官方 `3.14.11-alpine3.24` tag 尚不存在。
此为候选基础镜像扫描阻塞；未核实生产 FIPS 状态，不声称生产可利用或已修复。
未加扫描白名单、未关闭门禁、未更换生产镜像。后续精确 CI 状态以 PR 最新 SHA 为准。

证据保存在本机 `editor-followthrough-20261118/`（与前两批同一父目录），包括契约、
截图、模型输入/输出、测试日志、安装 hash 与原资产；不包含认证 cookie、密钥或
真实 SSH 目标。PR 均为 draft，未合并、未成为 M4 accepted、未发布生产；人工
自然采用与代表性质量验证仍待进行。
