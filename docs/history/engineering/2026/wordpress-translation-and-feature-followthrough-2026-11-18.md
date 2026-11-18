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
| 中文提示 | 基线 180 缺口后按批次补齐；本轮另修复审计误分类，固定 UI/错误提示严格审计通过。动态 metadata、模型提示词与暂停边界保留，详见本轮复核 |
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
- Addon `760b109` 初轮 CI 通过，包含 PHP 8.0/8.2/8.4、PHPStan、包检查和
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
8.02 秒。**原先四项输出均被守卫接受的结论撤回**：旧验证脚本漏传组合后的 task metadata，
直接 HTTP 脚本也漏传真实 Provider adapter 的 schema format；不能用它判断产品守卫。

标题语义基本符合审阅/保存主题，但原始模型返回带引号的字符串而未遵守单字段
JSON 指令。完整 validator → input builder → output decision 回放会正确拒绝它
（`title_schema_missing_title`），原产品 schema 守卫无需放宽。后续真实 adapter
样例另列，不能与旧脚本混写为完整端到端验收。摘要遗漏部分失败与 Notes
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
lane 是 AI 1.4.0，本地 AI 1.5 另有以上证据。该 SHA 的严格翻译审计仍有
161 处缺口；这是历史检查点，本轮处置与新的误分类发现见下文，不能沿用为当前数量。

Cloud `911be444` 已完成依赖变更后的 M4 candidate rebuild，tracing/health/connector
188 项通过；此前 `bde779bf` connector domain/API 426 项通过。`1b0dc171` 仅收窄
optional usage_context 的错误状态读取，mypy 和 20 项 Provider 回归通过。最终同步前检查发现 M4 已被另一 `codex/wp-ai-image-editing` dirty candidate 替换；
同步因依赖指纹不匹配以 42 拒绝，未覆盖该候选，也未追加 deploy。此前测试仍只
属于各自精确 SHA。最终 M4 identity 和跨仓报告保存在本机证据，不将旧 SHA 写成
当前 candidate 或 accepted。

Cloud `d0a79d76` CI 的 frontend、backend-static、依赖审计、全部四个后端分片、
CodeQL 等通过。Python 3.14 Alpine image smoke 及其 backend 汇总门禁被
CVE-2026-119170 阻塞：官方说明仅 Python 3.14.10 + OpenSSL FIPS 模式受影响，
修复版本为 3.14.11；本轮查询的官方 `3.14.11-alpine3.24` tag 尚不存在。
此为候选基础镜像扫描阻塞；未核实生产 FIPS 状态，不声称生产可利用或已修复。
未加扫描白名单、未关闭门禁、未更换生产镜像。后续精确 CI 状态以 PR 最新 SHA 为准。

证据保存在本机 `editor-followthrough-20261118/`（与前两批同一父目录），包括契约、
截图、模型输入/输出、测试日志、安装 hash 与原资产；不包含认证 cookie、密钥或
真实 SSH 目标。PR 均为 draft，未合并、未成为 M4 accepted、未发布生产；人工
自然采用与代表性质量验证仍待进行。


## 本轮复核：完整校验链与翻译误拦

完整输入链新增三例标题回归：裸文本和 JSON 字符串拒绝，`{"title":"…"}`
接受并抽取，不能因测试脚本缺 metadata 而放宽 schema。免费自然样例仅追加一次：
通过真实 `OpenAIProviderAdapter.execute` 生成 Ollama 原生 `format`，以 mock HTTP
transport 转发到现有免费 M4 loopback；返回单字段 JSON，完整守卫接受标题
“AI 建议需先审阅再保存，自动与正式保存不同”，自然 stop，11.88 秒。
未修改 M4 runtime/模型/配置；仍不属于认证 hosted runtime、检索或人工采用证据。

完整回放也暴露真实翻译误拦：中文到英文/德文的字符数自然增长触发 2.2 倍阈值，
而日文/韩文及泛 zh 被当作非中文，汉字被误判成混杂/未翻译。现在用可见文本单位
比较增长（一个 Han/Kana/Hangul 字形或四个其他字符），去除 markup、URL 与 fenced
code；仍保留 2.2 倍启发式和原先 200 字符触发条件。只有明确的非 zh/ja/ko 目标
使用原 CJK 污染启发式；旧 system-only 目标不再被假定为非 CJK。拒绝回答、结构、
完整性和硬预算守卫不变。语言启发式不是语义翻译准确性或全语言覆盖的保证。

替换为旧函数的只读回归插件证明 **9 例修复前失败**；修复后 domain **185**、
API **254** 通过（两套各自报告），Ruff、mypy 通过。另有日文过度扩写负例仍拒绝。
旧四个自然样例完整回放：原标题正确拒绝，英文翻译在长度修复后接受，摘要与缩写
接受；摘要先前语义遗漏仍存在，不把接受状态当作人工质量结论。

## 本轮复核：固定中文提示与审计漏检

先补齐 145 个固定 UI/错误 key；两个候选按精确源文件复核为注册 metadata
（WebMCP 名称、语音 Ability 描述），不归 Addon 翻译。四个现有 AI 页面内的
DataViews 默认域例外从 16 扩为 17 key，新增的 Filter 仅允许 `verb` context；
设置/请求日志之外，两处为现有 MCP Access、Abilities Explorer 的确切 bundle。
仍按 key、call form、context、domain、screen 限定，已有官方翻译优先。

随后审查全部剩余分组，发现审计将 113 个真正 `WP_Error` 消息误归为 metadata、
schema 或长提示词。旧正则只识别带 Please 的少数失败文案，严格门禁零缺口是假阴性。
修复审计：PHP token 扫描只提取 `new WP_Error` 第二参数里的 ai-domain 文案，
优先归为错误提示；注释、错误码、第三参数与邻近 schema 不因此加入。另复核四个
现有 admin/revision bundle 中的 9 个固定提示。新增这 **122** 个翻译后，共补齐
**267** 个 key；不翻译动态 Ability schema 或模型提示词，不启用新/暂停功能。

最终安装版 AI 1.5.0 审计：1,326 个源 key，1,070 个 shim 条目，固定 UI、错误提示、
未覆盖默认域均为 0；剩余 300 项为 72 metadata/开发文案、211 schema/JSON、17 长
提示词，27 个 stale 留待核查。门禁是有界源码审计，不等于所有英文已翻译。
浏览器仍见组件/字面量 PAGE、OF、Plugin、ACTIONS、Text；能力浏览器原有描述重复、
列过宽也未在本批改版。未逐个触发全部错误态，不将字典覆盖写成逐态浏览器验收。

本地四页（AI 设置、请求日志、能力浏览器、MCP 访问）PC 1440/1280 核查，包含
真实 locale payload、默认域/错误 context/外来 domain 边界、显示选项及取消日志删除。
未调用模型或 Ability、未安装/启用/保存功能；文章 279790 与功能设置指纹不变，
临时认证及 MU helper 清理。只打开选项而不改动其值；外部 Gravatar 阻断单独记账。
信息层级：常显的状态、动作与不确定性原位保留；按需入口沿用已有选项和帮助；
技术证据放本记录；未移动或删除重复文案。Cloud Admin 路由未改，落实台账不适用。

Addon PHP/边界、PHPStan、38 JS、WordPress.org、POT 与严格翻译检查通过。
本批未改 bootstrap/默认状态/兼容下限，Playground 不重复作为本批专属证据。
本地翻译通过源 symlink 立即生效；Cloud 运行时修改仍为 source candidate，M4 被另一
候选占用，未覆盖、未成为 accepted；最新 CI 以精确提交另记，不继承历史全绿。
本轮脚本、日志、回放和截图另存 `editor-localization-20261118/`，含 SHA-256 manifest。
本轮工作区 whitespace 检查通过；整分支 `git diff --check origin/master...HEAD`
会把两份已提交 unified patch 的上下文前缀（空格后接 tab/空白上下文行）报为
whitespace，故该原始整分支命令并非绿色。两份 patch 的顺序 apply/rebuild 证据
另存前批；不为消除文本载体的告警改坏 patch，也不将本轮局部检查冒充整分支通过。

### 经验与后续边界

- 测试链必须包含组合后的 metadata 和真实 adapter 的 schema format；夹具错误与
  产品缺陷分别归因，撤回失真的验收记录，禁止为通过测试放宽产品约束。
- 严格审计还要审查被排除分组；用源码调用位置识别错误消息，不能只凭词长或
  “The/JSON”等前缀把用户错误提示归到 schema。新增负例防止 metadata 越界。
- 不用全局提高输出限制解决跨文字密度误判；保留过度扩写、结构与硬预算负例。
- 未映射三项、代表性语义质量/自然采用、上游本地补丁维护及镜像扫描阻塞仍独立
  跟踪；本批不通过恢复暂停功能或覆盖他人 M4 来制造完成状态。


## 剩余事项落实：列表、中文标签与摘要完整性

本轮继续同一编辑器 seam。原生 AI 本地提交 `7c9381c`，Addon 提交 `eb93f04`。
Cloud 源码为后续摘要修复候选；两份 GitHub PR 仍为 draft，未合并、未生产发布。

### 原生列表处置与视觉证据

能力浏览器表格用途为**记录目录**。常显保留对象名称、描述、标识、来源和行操作；
视图设置、帮助、详情按需；完整 ID 保留可读；仅删除重复描述列，没有删除唯一内容。
根因是 DEFAULT_VISIBLE_FIELDS 两次写入 description，并经 localStorage 恢复。
默认、恢复、保存与新字段合并按首次出现顺序去重；隐藏列、暂时失效的扩展列、排序、
每页数量和密度均保留，不清空用户视图。默认名称/描述/标识/来源列宽调整为
22/40/28/10%；完整描述与标识换行，已保存的宽度配置仍优先。

已知来源标签在原生 UI 翻译，显式自定义来源保留；日志列表、筛选和详情共用原生
枚举 label，未知扩展代码原样显示，不翻译模型、提供方 ID 或操作标识。Addon 仅补
9 个固定 ai-domain 译文及默认域 Actions、paging 模板两项：仅原有四页，精确调用/
context/域匹配，官方译文优先。当前允许 19 个 source key，审计命中 17 个组件键，
两者不是相同统计口径。原生三份 patch 与 Addon 字典需要分别维护。

四页真实 PC 1440×1050、1280×960 本地检查通过。能力列表从 1446px 缩至当前
1440 窗口的 1157px 可用区；1280 窗口表格与容器均 997px，无文档横向溢出。
第一轮布局虽不溢出但标识列过窄，截图复核后重新分配列宽；不把无溢出等同阅读
体验通过。日志保留原有表内横向滚动，未声称所有表都无需滚动。

浏览器验证去重旧视图、隐藏来源列、降序/10 条/紧凑密度恢复、分页往返、空搜索及
恢复、键盘行操作显现、日志详情中文/Escape/焦点返回、删除确认取消。五次外部
Gravatar 阻断及对应控制台错误已记账，无其他失败。原文章 279790 与实验设置指纹
不变；未执行能力、未生成/保存文章。加载失败/错误状态未另行模拟；人工视觉验收
仍未完成，不更新任何截图 golden。Cloud Admin 路由未改，Cloud 落实台账不适用。
本地证据为 `editor-list-followthrough-20261118/final-3` 和 `visual-receipt.json`；
`final`/`final-2` 保留夹具对官方译文或「没有结果」文案假设错误的失败，不算产品通过。

原生 19 项回归、typecheck、改动 JS lint、legacy build 通过（3 条既有体积警告）。
[第三份源码补丁](../../../upstream-patches/wordpress-ai-1.5.0-admin-lists.patch) 应接在
前述保存、标题补丁之后；精确 AI 1.5.0 tag 上三份顺序 apply/check、源码比对和
19 项测试通过。只安装 abilities-explorer 的 JS/asset/CSS/RTL 和 request-logs 的
JS/asset 六个文件，旧资产与 SHA-256 在 `installed-backup/`、`install-receipt.json`。
回滚前确认当前 after hash，再恢复对应旧文件；不清空用户视图、不覆盖文章。
尚未向 WordPress 上游发布，升级前须重新比较源码并重建。

Addon PHP/边界、38 JS、PHPStan、严格翻译、WordPress.org、POT、发布包校验与严格
Plugin Check 通过；`eb93f048` 的 13 个独立 GitHub 检查均通过（AI 稳定主线仍为 1.4）。安装版严格审计 1335 key / 1079 shim，固定 UI、错误、默认域缺口
均为 0；原先排除的 300 项组成不变。这仍不是所有英语或所有错误分支的浏览器覆盖。

### 摘要的实测缺陷与修复

使用已有免费 Ollama、真实 Cloud validator → provider input → Provider adapter →
output decision 做单次摘要检查。旧默认 160 token 触发 finish_reason=length，但原先
completion gate 仅限整篇转换，摘要未拒绝；后续 220 字符裁剪又删除连接检查范围。
因此此前遗漏不仅是语义质量限制，还存在可复现的预算和结果整理缺陷。此旧输出
回放到新 decision 后被 provider.output_incomplete 拒绝，无额外模型调用。

仅调整 content_summary：默认 512 token，完整输出最多 2000 字符，超长拒绝而非裁剪；
明确 incomplete/failed/cancelled 或非正常完成原因在文本整理之前拒绝。完整摘要
保留空行分段；显式 caller max_tokens 继续生效。该上限容纳本地原生 1–2 段短摘要，
不随源文章增长到全文预算；不改 WordPress 本地提示词，也不移动审阅或写入所有权。
其他短建议、转换预算、API 契约名和暂停清单不变，沿用既有可操作错误映射。

修正 CJK 夹具长度后，旧源码回放 **8 失败、1 通过**；修改后最终 domain/API 完整文件
**450 通过**（194 domain + 256 API），包含新增两项 API 负向用例；不与前次
448 项重复相加。
新增 API 验证截断/超长均返回 failed、无部分 result，且仅一次 Provider 请求。
Ruff/mypy 改动门禁通过。本次首次全文件运行另发现旧预算断言及 CJK 夹具未超过
220 字符，分别更新期望、修正夹具，未放宽产品守卫迎合测试。

新预算下一次免费实测 6.32 秒自然 stop，保留两段、保存边界及连接检查适用范围。
未自动重跑、未付费、未写文章；仅局部 Provider 传输经 SSH 到既有 Ollama，不是
认证 hosted runtime/M4 应用候选联调，也不是代表性质量或人工自然采用。它仍简化
了部分失败处理细节；不得用单次成功宣称摘要全面准确。

### 继续保留的阻塞

- 最新官方 3.14-alpine registry digest 已变化，但镜像 Python 仍为 3.14.10；官方
  Dockerfile 同版，3.14.11 tag 未找到。CVE-2026-119170 扫描尚未有可确认修复，
  不改为跳过扫描、不把 digest 变化当修复；生产 FIPS 状态未核实。
- M4 最新只读状态仍是另一 `codex/wp-ai-image-editing` dirty candidate，
  source_revision `f17354f234d2852baa41a8b27e07bf73e081c5f7`。未覆盖、未同步本轮
  runtime、未 accepted；免费模型调用不改变应用候选状态。
- 本批最新精确 SHA CI 需要新跑，不能继承上个 SHA 的通过结果。此前 Cloud CI 的
  backend aggregate 因镜像扫描失败而失败；其他通过项不抵消该失败。
- 未映射三项继续不支持；代表性语义质量、自然采用与人工验收待真实使用验证。

### 防回退经验

不能把「HTTP/连接成功」「有文字」「语法和结构正确」等同任务完整成功。
回归必须同时检查最终输出预算、Provider 完成原因、结果整理前后是否丢失末尾事实；
先拒绝明确截断，再做呈现整理。短摘要不应机械套用搜索摘要字符上限。
持久视图修复必须重放旧配置，不通过清空偏好掩盖重复；可读性检查还要看长 ID 与
每行高度，保留完整证据和用户操作入口。英文来源先归属到组件调用、静态枚举或
动态标识，再在各自所有者修复，不做全局字符串替换。
