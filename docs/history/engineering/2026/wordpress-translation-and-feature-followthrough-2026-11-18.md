# 编辑器后续落实 — 2026-11-18

Status: source candidate；提交、CI、M4 与生产状态在本页分别记账。
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
| 标题、语义质量、图片/评论 | 后续按自然任务与所属消费端单独验收；合成输出不作为质量结果 |
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
