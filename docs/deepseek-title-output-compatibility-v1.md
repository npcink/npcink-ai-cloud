# DeepSeek 标题输出额度与推理兼容性

日期：2026-10-18。状态：开发修复；生产尚未更新，真实 Provider 验收未完成。

## 故障证据与判断

生产 2026-10-18 14:20:53（北京时间）的标题请求：

- run：`run_82f04b56ef0146408bad65a677e97f95`。
- trace：`82d20aed5a6507187dd23b9e58d85038`。
- `wp-ai.short-text` 主连接 DeepSeek：输入 925、输出 48、推理 48 token，
  `response_status=incomplete`，错误 `provider.output_contract_invalid`。
- 随后的 gpt-5.4 回退两次均无可用上游渠道；由操作员单独核对，不能用它
  掩盖 DeepSeek 的输出问题。此次没有发起重试或 Provider 探测。

旧源码在调用方未指定额度时，把标题 `max_tokens` 和 `max_output_tokens`
设为 48；生产 DeepSeek 连接没有显式 `default_reasoning_effort`。
这与全部输出用于推理、没有可用最终标题的用量证据一致。
原始上游请求和 `incomplete_details.reason` 未保存在本次读取的证据中，
因此“额度耗尽”是源码、用量与协议支持的根因判断，并非原始报文回放。

[DeepSeek Responses 文档](https://api-docs.deepseek.com/api/create-response/)
明确：默认开启推理；`max_output_tokens` 包含可见输出与推理 token；
`reasoning.effort=none` 关闭推理。
[Chat 接口文档](https://api-docs.deepseek.com/api/create-chat-completion/)
使用 `thinking.type=disabled` 控制非推理模式。

## 有界修复与优先级

1. 未显式指定额度的 WordPress 标题，默认由 48 调整到 256 token，为中文
   标题和结构化 JSON 留出余量；有效的显式 `request.max_tokens` 原样保留。
   这是生成上限调整，不是固定扣费；实际用量仍按上游证据记录。
2. 仅对 `npcink-cloud/connector-runtime`、服务器生成的
   `wordpress_ai_connector/title_generation` 元数据，以及
   `deepseek-flash`、`deepseek-v4-flash`、`deepseek-v4-pro` 模型族生效。
   支持现有命名空间；不重命名生产模型，不更换 endpoint。
3. 显式请求推理参数优先，随后是连接显式配置的 effort，最后才使用标题
   非推理默认值。Responses 使用 `reasoning.effort`，Chat 使用
   `thinking.type=disabled`；已有 Chat effort 保留。显式请求模式不会再与
   自动注入的连接默认 effort 冲突。
4. 未列出的模型、其他任务、其他 Ability 保持原行为；不把非推理参数套到
   `deepseek-reasoner`。这是一项经过协议核对的有限运行时策略，见
   [ADR-054](decisions/054-responses-output-boundary-and-no-silent-downgrade.md)。
5. 不增加重试、放宽输出校验或吞掉 `incomplete`。不完整响应继续失败并
   保留 token、成本与状态证据；不将推理内容显示为标题。

Provider 预算预占、结算与用户积分逻辑不修改。当前预占代码对未指定策略
额度默认按 1024 输出 token 估算，本次标题默认 256 未超过该默认估算；
这不代表其他显式预算配置已经通过生产验收。Cloud 仅返回建议，采用、
保存、发布仍属于 WordPress。无需 Addon 升级或数据库迁移。

## 零付费验证

所有新增 Provider 请求均使用 `httpx.MockTransport` 与假密钥。
先观察旧实现失败，再验证修复；这是合成协议复现，不是真实模型质量证明。

```bash
.venv/bin/python -m pytest tests/api/test_wordpress_ai_connector_runtime.py tests/domain/test_openai_provider.py tests/domain/test_wordpress_operation_runtime.py -q
bash scripts/check-changed-python-quality.sh app/adapters/providers/openai.py app/domain/wordpress_ai_connector/runtime.py tests/domain/test_openai_provider.py tests/api/test_wordpress_ai_connector_runtime.py
```

覆盖两个 endpoint、三个 DeepSeek 模型名、显式 effort/模式与额度优先级、
非目标请求隔离、中文最终输出，以及 incomplete 用量保留和拒绝。
本地前两套测试合计 283 项通过，独立 WordPress Runtime 模块 102 项通过；
后者的旧 48-token 断言由正式 CI 揭示后同步修正。定向 Ruff/mypy、发布策略检查通过。
本次不调用付费模型、不修改生产配置。M4 只验证候选，不等于合并或生产更新。

## 后续人工验收（修复经授权发布后执行）

| 顺序 | 操作 | 预期与记录 |
| --- | --- | --- |
| 1 | 核对线上修复版本、短文本主连接及预算就绪 | 记录 Cloud SHA、Addon/官方插件版本、主/回退模型、预算状态；不记录密钥。未发布则停止。 |
| 2 | 打开测试站点已有草稿，正文至少 250 字符 | 标题按钮可用；记录草稿 ID、字数、操作前积分、北京时间。 |
| 3 | 人工点击一次生成标题 | 返回一个完整且切题的标题，不含推理或解释。记录 run/trace、耗时、最终模型和是否回退；失败先停止，勿连续重试。 |
| 4 | 只读核对运行证据 | 默认额度 256；DeepSeek 无显式推理配置时采用非推理模式；状态完成且有可见标题，不再仅输出 48 个推理 token。记录输出/推理 token、调用次数、积分变化。若无可见字段，交由维护方只读核对。 |
| 5 | 人工采用标题并保存草稿，刷新回读 | 标题保留、草稿状态正确；记录采用前后标题是否一致、保存时间。不要自动发布。 |
| 6 | 发现异常时反馈 | 提供北京时间、草稿 ID、run/trace、错误原文、最终 Provider/模型、token 与积分前后值、脱敏截图。缺失字段标“未显示”，不要发送凭据或整篇私密正文。 |

如果显式启用高强度推理或显式设置很小额度，仍可能 incomplete；本修复不
覆盖操作员选择。gpt-5.4 的渠道恢复另行验收，主连接成功不能证明回退可用。
真实生成可能计费，只由操作员在发布和预算确认后按清单执行。

回退：经正常评审流程撤销本次独立提交，再走受控发布；不回滚数据库，
不改生产配置。回退后会恢复旧标题额度及推理行为，故应暂停该场景验收。
