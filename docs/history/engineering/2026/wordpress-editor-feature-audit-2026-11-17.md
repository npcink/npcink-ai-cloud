# WordPress 编辑器功能审计与首批修复 — 2026-11-17

Status: local source candidate；未合入、未同步本轮 M4、未部署生产。

用户确认采用“统一盘点、先修公共链路、按功能族验收”的方式。首批限于标题、
文章摘要、选中文本缩短/扩写/改写。首批未修改上游 AI 插件、未新增编排平台，
未改变 WordPress 的提示词、审阅与最终写入所有权。

## 1. 功能清单与后续顺序

本表是审计记录目录，不是第二份 Ability 注册表。投影权威见
[能力兼容矩阵](../../../wordpress-ai-capability-compatibility-matrix-v1.md)。
“已映射”只表示当前 Addon 有适配路径；不代表本版本的端到端效果已验收。
本机实测 WordPress AI **1.5.0**，Addon 来自独立仓库 symlink。

| 功能 / Ability | 参考内容与要求（来源为上游 Ability） | 结果与本地应用边界 | 当前处置 |
| --- | --- | --- | --- |
| 标题 `ai/title-generation` | 当前正文、附加背景、站点/写作指引；简洁准确、同语言；Cloud 另校验长度/旧标题 | Cloud 提取单个标题，Ability 返回 title 对象；人工采用/保存 | 首批修复传输封装说明，真实 WP / fake HTTP 通过；语义质量待验 |
| 文章摘要 `ai/excerpt-generation` | 规范化正文、附加背景、摘要系统指令 | 字符串建议；原文不因生成落库 | 首批修复 AI 1.5 消息角色；长正文和背景保留通过 |
| 内容改写长度 `ai/content-resizing` | 选中 HTML、shorten/expand/rephrase、各自长度要求；保留事实/语言/格式 | 单个 HTML 结果；采用/保存归上游编辑器 | 首批修复操作意图及扩写预算；三种操作投影通过 |
| 内容总结 `ai/summarization` | 正文、背景与总结长度 | 总结字符串；消费端负责采用 | 已映射，本轮未重新做浏览器/模型质量验收；第二批 |
| 内容翻译 `ai/content-translation` | 内容、目标语言；保留结构 | 翻译字符串；采用/保存归本地 | 已映射；第二批核对语言、区块结构、完整性 |
| 别名 `ai/slug-generation` | 标题、正文、建议数量；可用永久链接别名 | 结构化建议；URL 变更归本地 | 已映射；第二批核对多语、数量、碰撞/采用保护 |
| 内容分类 `ai/content-classification` | 内容、taxonomy、existing_only/allow_new、数量 | 结构化候选；建词/赋词归本地 | 已映射；第二批区分推荐与实际创建/赋值 |
| 编辑建议 `ai/editorial-notes` | 区块、上下文、检查类型及已有 Notes | 结构化 Notes；Notes 保存/权限归上游 | 已映射；第二批复验；SEO 专项暂停保持 |
| 编辑更新 `ai/editorial-updates` | 区块和待处理 Notes | Ability 只返回文字，但上游 JS 应用区块后调用 savePost | 第二批已修本地 AI 1.5 保存与 Notes 顺序；11 回归 / 6 浏览器场景，见后继记录；仍无应用前预览 |
| 替代文本 `ai/alt-text-generation` | 图片 Artifact、上下文；只描述可见内容 | ALT 字符串；附件/区块更新归本地 | 已映射独立 vision；第三批验图片传输、事实与采用 |
| 容器区块标签 `ai/block-container-label-generation` | 区块内容及文档背景；短标签 | 区块 metadata.name；保存归本地 | 本机已注册，但 Addon 无场景映射；未适配，不因开关开启声称可用 |
| 修订变更摘要 `ai/revision-change-summary` | 明确的文章与两个修订版本 | 修订差异说明；不是修改原文 | 本机已注册，但 Addon 无场景映射；未适配 |
| 输入补全 `ai/type-ahead` | 光标、前后文、区块与字数/触发模式 | 补全文本；插入归本地 | 本机已注册，但 Addon 无场景映射；首批外，未适配 |
| Meta description `ai/meta-description` | 标题、规范化正文与指令 | 短文本建议 | 已映射不等于启用；既有 SEO 暂停契约优先，不恢复 |
| 图片提示词 `ai/image-prompt-generation` | 内容、背景、视觉风格 | 文本提示词，不等于生成图片 | 已映射，未重验；不扩展文生图边界 |
| 评论分析 `ai/comment-analysis` | 指定评论、关联文章背景 | 结构化分析；上游可能保存评论 metadata | 已映射；不得混入“无写入”通用验收 |
| 评论回复 `ai/suggest-reply` | 评论与语气 | 回复建议；发送归本地 | 已映射，本轮未重验 |

后续顺序：先验编辑更新的保存/失败边界，再处理总结/翻译/别名/分类/Notes；
之后处理视觉和尚未适配的入口。每批先复现问题，再决定代码改动，不为凑清单
统一重写。发现内容丢失、错误写入、权限问题时优先处理；未复现的质量疑虑记为
待验证，不升级为已确认缺陷。新增入口仍受 Phase 1 和暂停边界约束。

## 2. 本轮已确认且已修复的三类问题

1. **长度意图冲突**：Cloud 对全部改写统一要求接近原长，与上游缩短约一半、
   扩写约 1.5–2 倍的要求相冲突。Addon 现传递本地已验证 action，Cloud
   验证枚举并使用对应长度说明。无 action 的旧调用仍尊重原本地指令。
   扩写仅扩大计算所得默认输出预算，保持 65,536 token 上限、明确 caller
   预算、模型容量检查及不完整输出拒绝。未承诺每篇文章都能扩写到两倍。
2. **AI 1.5 摘要角色变化**：旧适配把 user message 当纯指令；新上游已经
   将正文和 additional-context 放在该消息中。旧路径会复制正文到指令区，
   丢掉原 user message 中的背景框架，并可能撞上 12k 指令上限。新路径完整
   保留消息为 opaque source，只传实际 system instruction；旧摘要和
   meta-description 路径保留。不解析标签、不修改 vendor 文件。
3. **标题序列化含糊**：上游要求纯标题，Cloud schema 又要求 JSON。现于
   本地指令之后明确 JSON 只用于传输封装，纯文本要求适用于 title 字段值；
   原提示词保留。严格 schema 及结果校验仍在，未另建提示词管理器。

Cloud 修改 contracts/runtime；Addon 修改文本模型和请求 guards。新增字段为
`wordpress_operation.v1.request.rewrite_action` 可选字段，只有 content_rewrite
允许，非法值在 HTTP 前拒绝。错误提示提供编辑器操作并补齐中文翻译。
部署顺序为 **Cloud → Addon**：旧 Cloud 可能容纳额外字段，但仍含旧指令，
因此不能把“请求未报错”当修复生效。详见[跨仓兼容表](../../../compatibility-matrix.md)。
回滚可按仓撤销本轮精确补丁；无数据库迁移、无用户文章恢复操作。

## 3. 仍未解决的边界与质量问题

- 标题正文取自当前编辑快照，旧标题/作者/分类等背景可能来自已保存文章；
  当前未统一未保存草稿快照。应由本地 Ability/编辑器提供同一上下文，不在
  Addon 通过全局过滤器影响其他 Provider，也不偷偷扩展上游 schema。
- “重新生成”仍不携带前次被拒绝候选或作者希望怎样改；未实现候选去重、
  风格选择或反馈式重试。本轮只消除已确认的公共冲突。
- Prompt 约束、JSON 校验和 mock 返回不能证明标题准确性、扩写事实性或
  摘要好用；不把格式回归通过冒充语义质量通过。
- 未适配的新 Ability 不走泛化 chat 兜底，保留明确失败。此轮未新增功能开关。
- 上游编辑更新会直接保存是已确认行为；首批未验证其草稿、局部失败及修订保护。
  后继[第二批记录](wordpress-editorial-save-correctness-2026-11-17.md)补充本地保存修复与证据；未新增预览。

## 4. 验证与证据

首次 Cloud 回归红测保存为 `editor-batch-cloud-before.log`：10 项失败，
用于证明 action 与标题封装缺口。修复后 domain **166 项通过**，
API/context/provider 集成测试 **297 项通过**；Addon test:all、PHPStan、
38 项 JS 回归、WordPress.org 静态检查、Playground、gettext freshness、
安装包 build/verify 和严格 Plugin Check 均通过。Cloud 定向 Ruff/mypy、
release-policy 及文档可达性检查通过。各日志独立保留，不把不同测试套件
相加当作模型质量样本数。

本机真实 WordPress 通过 Abilities REST 执行 5 个用例：标题、长摘要，以及
shorten/expand/rephrase。使用合成内容、请求内合成能力快照及 fake HTTP；
所有外部 HTTP 均被拦截，意外任务/请求失败关闭，没有付费模型调用。
原始报告 `editor-batch-local-acceptance.json` 显示：

- 5/5 HTTP 200，每例只有一次预期生成请求；
- 摘要 source **15,077 字符**，原文出现一次、额外背景保留；
  system instruction **1,848 字符**，不含正文；
- 三种 action 均进入真实请求，选区 HTML/链接原样传输，返回链接可被上游消费；
- 标题返回由上游消费为单一 title 对象；
- 执行前后全站文章关键字段与 postmeta 的完整指纹相同。

测试脚本/日志保存在本机目录
`/Users/muze/.codex/visualizations/2026/11/16/01a1e282-815d-7332-b08c-71217440e6c6/editor-feature-audit-20261117`，
附源码 SHA-256 清单；此路径为本地证据，不是跨机器发布产物。
临时测试脚本不安装为插件，不改设置或 Provider 配置。

| 证据状态 | 本轮结论 |
| --- | --- |
| 本地确定性测试 / 静态 / 包检查 | 按最终日志记账；不能代替下一行 |
| 真实 WordPress + fake HTTP | 上述 5 例通过；仅证明本地投影与消费 |
| 本轮 PC 浏览器采用/保存 | 未运行；未改审阅 UI，未将既有旧版本截图当新证据 |
| Hosted model 语义质量 | 未运行，无付费请求 |
| M4 candidate / accepted | 本轮均未执行，不将本地测试替代为 M4 结果 |
| GitHub CI / 合并 / 生产 | 本轮均未执行；跨仓矩阵的 Cloud exact-SHA 门受脏工作树阻断 |
| 人工验收 | 待用户实际使用；不自签完成 |

## 5. 为什么之前没发现，以及之后如何防漏

此次可以确认的测试缺口是：通用“改写成功”测试未验证三种操作的最终组合
指令；摘要 helper 的旧假设未覆盖 AI 1.5 新消息角色；历史验收状态没有明确
绑定当前插件版本和功能映射。不能据此推断旧版本每次调用都失败，也不把
质量风险统称为代码 bug。

规范已补入[开发标准第 10 节](../../../wordpress-ai-recommendation-development-standard-v1.md#10-native-ai-feature-audits-and-prompt-role-regressions)
及 Addon `docs/verification-evidence-standard.md`：升级检查消息角色、覆盖
每种操作、用超过指令上限的正文检测角色混淆、检查最终组合指令，真实
WordPress 测试验证消费与不写入；浏览器、模型质量、部署单列。功能表必须
区分注册、映射、传输通过、采用保存通过和人工效果验收，防止“开关全开”
或“旧报告全绿”掩盖尚未适配与未验收项。


## 6. 后继批次

[编辑更新保存正确性 — 2026-11-17](wordpress-editorial-save-correctness-2026-11-17.md)
在首批之后单独验证并修复上游 AI 1.5 消费端；本页首批各项证据状态仍仅属于
首批，不据此扩展为所有功能或当前完整翻译已通过。
