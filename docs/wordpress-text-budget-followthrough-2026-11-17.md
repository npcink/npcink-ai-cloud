# WordPress 文本预算落实与回归规范 — 2026-11-17

状态：现行源码契约。Cloud #1438（`637a6524`）、Addon #361（`077f8c8c`）
及 Toolbox #411（`201ea51f`）、#412（`73d9caf6`）已分别合入主分支。
下方本地 WordPress 和 M4 candidate 回执保留原检查点范围；合入不等于这些回执
覆盖了合并后的版本，也不等于生产发布。跨仓部署边界见[兼容表](compatibility-matrix.md)。
本规范接续 [限制审计](wordpress-input-limit-audit-2026-11-17.md)，不恢复任何暂停功能。

## 现行预算与行为

| 路径 / 所有者 | 预算 | 达到边界时 |
| --- | --- | --- |
| WordPress AI 改写、翻译、编辑更新 / Cloud runtime | 默认输出 tokens 为 `ceil(estimate_text_tokens(source) × 1.25) + 256`，最低 512，最高 65,536；显式正数预算仍优先，最高也为 65,536。最多接受 75,000 Unicode 输出字符 | 原文保留；非正常结束、Responses incomplete/failed/cancelled 或超大结果拒收，不把半篇结果作为成功；记录实际用量，不自动重试或换模型 |
| Smart Ask、四个既有问答桥接 / Toolbox | 2,000 Unicode 字符，另有 8,000 UTF-8 字节上限 | 提交前显示“最多 2,000 个字符，请精简后重试”；服务端独立校验，拒绝后不请求模型 |
| Toolbox 本地检查的全文上下文、完整上下文摘要 | 50,000 Unicode 字符（处理后的正文文本） | 本地检查仍明确披露覆盖截断；完整上下文摘要直接超限调用会拒绝，不默默改为前半篇 |
| Toolbox 段落检查选区 | 12,000 Unicode 字符 | 明确提示缩小选区；优先采用实际选择的文本，缺失时才使用整块文本，不把二者重复拼接；下游不再裁为 420 词/字符摘要 |
| 排版 / Toolbox → Addon → Cloud | 原始 HTML 含标记最多 50,000 Unicode 字符，且不超过 256 KiB UTF-8；候选不超过 512 KiB UTF-8 | 输入完整传输；Cloud 和本地分别验证；浏览器按 UTF-8 字节校验候选，不以 JS UTF-16 长度冒充字节 |

输出 tokens 估算仍使用既有保守 Unicode 估算器。模型已知上下文容量不足时先拒绝，
不裁原文、不制造 Provider 调用。目录未声明容量不代表无限容量，Provider 的输出能力、
60 秒超时与实际质量仍是独立限制。75k 是接收保护上限，不是承诺生成 75k 字。
标题 80、摘要 220、摘录 180、ALT、检索证据、音频预算以及文章语言检查的
30k UTF-16 / 80 块 / 每块 1,600 上限不随全文上下文扩容；短摘要保持原压缩策略。

Cloud 只管执行、结果和用量；Addon 只管验证与签名传输；Toolbox 只管界面和审阅消费。
作者通过既有 WordPress 编辑器决定是否采用与保存。无自动分片、后台写入、新队列或批量恢复。

## 防止同类问题复发

1. 每项预算注明所有者、单位、测量时机和超限行为。Unicode 码点、UTF-16 偏移、
   原始 UTF-8、JSON 信封、模型 token/context、结果大小各自校验。
2. 调整输入上限时，追踪到最终发送 prompt 与结果消费端。入口放宽不代表内部
   `wp_trim_words`、共享 helper、默认输出 token 和浏览器结果校验已经匹配。
3. 整篇转换禁止静默裁剪。`finish_reason` 来自 Provider DTO，由通用运行层经输出审查
   接口传入任务策略；通用运行层不得反向依赖 WordPress 业务模块。正常停止也不能证明
   语义完整，保留既有质量检查与作者审阅。
4. 裁剪工具必须在字符路径直接返回，不再跌入字节 `substr`；无 mbstring 时也保持 Unicode
   边界。PHP、JS 和 Cloud 均测试中文、emoji、ASCII、恰好上限和多一字符。
5. 测试 JSON 替身必须尊重编码 flags/depth。至少一项断言读取最终 prompt 的 source，
   不只检查入口对象。用真实 WordPress 验证 schema、安装源码和原文指纹；连接健康不代替生成验证。
6. 测试不完整结果时同时验证结果未接收、只调用一次、无自动 fallback，以及真实 token/cost
   仍记账。输出被拒绝不等于没有发生费用。使用 fake Provider，禁止为制造证据付费。
7. 纯数值配置和测试替身通过不等于用户提示可用。实际浏览器曾暴露“无效参数：question”，
   本轮因此增加提交前中文指引，且不发送无效请求。
8. 超大结果检查覆盖所有受支持的文本形状：`output_text`、`text`、`content`、
   `choices[].text/message.content`，先拒绝再归一化，不能只保护主适配器的常见返回形状。

## 验证证据与限制

- 本地 Cloud：WordPress operation / runtime provider / signed API 427 测试通过；
  排版 domain / signed API 52 测试通过，共 479；Ruff、定向 mypy 通过。
- M4 candidate：同五个文件 479 测试通过。源自混合工作区 `codex/support-ticket-prefill`，
  base `f17354f234d2`，dirty；同步不等于合入或 accepted。
- Toolbox：完整 `composer test:all` 通过。编辑上下文、共享 helper、Smart Ask 也通过
  `php -n`（无 mbstring）测试；完整 prompt 保留 12k 选区 / 50k 全文。
  浏览器脚本测试覆盖 v1/v2 候选恰好 512 KiB 和超出 1 字节，以及超限原文零 HTTP、零正文修改。
- Addon：完整测试、PHPStan、WordPress.org guard、POT freshness、重建 ZIP 验证、
  strict Plugin Check、Playground 结果在同组原始日志中分别留存。
- 真实 WordPress：中文/emoji/ASCII 的 50k 上下文与 12k 选区完整；12,001 选区本地拒绝；
  中文/emoji 各一次签名排版到 M4，50k 原始字符候选完整且本地内容保护校验通过，
  Provider 调用均为 0；50,001 在 Addon 拦截。文章 279790 的标题、正文、摘要、状态、修改时间指纹未变。
- 真实 PC 浏览器：已登录本地站点的新验证页，超限问题显示中文具体限制与精简重试动作；
  没有修改原文章。未宣称所有错误家族、全部 PC 宽度或真实模型长文质量已验收。
- 跨仓 `composer quality:matrix:run`（限定本次三个仓库并显式指定 Cloud 工作区）：
  Toolbox / Addon 为 `passed`；Cloud 为 `needs_validation`，原因是尚未提交的混合工作区
  不能建立精确 SHA 的 GitHub CI 证据，因此矩阵总退出码为 1，不能写为跨仓全绿。
  首轮还发现 Toolbox 新文档缺少索引入口；补齐后复跑，两个插件完整门槛通过。

最终自查覆盖正确性、可读性、模块边界、输入/结果校验与资源上限；未引入依赖，
通用运行层继续通过输出审查接口承接任务策略。最终 Cloud 七个关键生产文件的本地 / M4
SHA-256 一致；这是候选源码一致性证据，不等于模型质量或生产验证。

外部证据组 `text-budgets-20261117` 保存本地/M4日志、安装重放、源码/包 hashes。
CI、merge、M4 accepted、生产和独立用户质量验收未建立；无付费模型测试。
回滚仅撤销本轮预算、完整性、Unicode helper 与提示相关 hunks；保留此前回执恢复、
工单预填、50k source 输入和其他混合工作区内容。
