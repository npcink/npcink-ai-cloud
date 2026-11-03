# 开发会话操作经验记录（2026-11-02）

Status: dated development closeout record. 本文记录本轮运行时、反馈、回调、检索与
退款文档核对的事实、验证边界和可复用方法。2026-11-03 的 M4 后续验收见第 6 节；
不是生产验收或新的功能授权。
现行约束仍以 `AGENTS.md`、验证分层、Phase 1 范围和相关活动契约为准。

## 1. 本轮处理的问题与证据

本轮修复了以下八类问题，并为每项补了回归证据：

1. Provider 返回非 JSON 或 JSON 根类型错误时，OpenAI adapter 统一转换为
   `provider.output_contract_invalid`，避免异常穿透成 500。
2. `no_store`、PII 和 secret 运行的 Provider、预算、输出准备和最终化错误使用固定
   文案，避免把输入或上游响应内容写入持久化错误和响应。
3. 运行请求沿用 master 的双层幂等设计：客户端身份 v2 包含存储、超时、重试、
   保留期、callback、task backend 和 canonical run；旧 hash 保持原格式以迁移重放。
   执行快照与客户端身份分离，不能把新增字段写入旧 hash 破坏历史重放。
4. Agent feedback 幂等重放读取已存事件字段；工程 smoke 样本从质量分母、趋势和场景
   排除；无质量样本时 `accepted_rate` 为 `null`。
5. HTTP callback 以 `stream=True` 发送，只检查状态码并在成功和失败路径关闭响应，
   避免缓存任意大的响应体。
6. PostgreSQL JSON fallback 检索限制为最新 5000 个 chunk，并在
   `result_grouping` 报告 `candidate_window_limit` 和 `candidate_window_limited`。
7. 退款盘点文档按当前代码改正了 Alipay notify、内部 Admin API、失败/unknown 分流；
   本轮补上 Provider `refund.query`、有界 `ops_cadence` 对账、指数退避与最大尝试数，
   并把 Portal 自助退款冻结和订阅退款 credits 语义写入活动契约。
8. 将上述决策与验证边界写入活动文档，避免把 dated inventory、mock 回归或本地绿灯
   误报成生产事实。

## 2. 可复用的审查与修复方法

- 先用同一个反例穿过文档、代码和测试三层，再修实现。例如同一幂等 key 搭配不同
  `storage_mode` 或 timeout，必须得到 409，而不是只比较 helper 的 hash。
- 对错误处理同时检查三条路径：数据库持久化、HTTP 响应和重试/fallback 状态。只在
  最终响应脱敏而让 attempt 或 run error 留下原文，仍属于泄露。
- 对质量统计先定义分母，再写代码。工程 smoke、impression 和真实采纳事件不能混在
  同一个质量率中；零分母要返回 `null`，不能伪造 0% 或 100%。
- 对外部响应默认不读取 body。callback 只需状态码时必须使用 streaming，并用失败状态
  测试确认 `close()` 也执行；测试 double 应匹配真实调用签名，避免生产代码为兼容假对象
  引入可能重复发送的 fallback。
- 历史盘点必须带日期和基线。发现代码已演进时，修订状态表和索引导航，保留原始日期，
  并显式区分“已实现”“部分实现”“未执行”，不能用一段总提示覆盖矛盾的旧表格。
- 全量测试失败要按归因记录：本次改动引入的回归必须修复；与本次无关的 tracing、
  impact-policy 等基线失败必须保留失败证据，不能用局部测试结果冒充全量通过。

## 3. 当前验证结果

- 2026-11-02 完整 pytest 实际结果：**3 failed、5511 passed、171 skipped**，
  另有 8 subtests passed 和 1 个 Starlette/httpx 兼容弃用警告。失败为两个新增 cadence
  数量断言和一个 credit-pack PATCH/GET 操作证据不一致；后续相关 33 项定向重跑通过。
  这不是一次全量绿灯。先前 tracing 和 API impact-policy 的 17 项已通过。
- 2026-11-03 合并前复查修复旧幂等 hash 兼容性、查询成功状态校验、队列饥饿，
  并修复 callback/query 重放导致部分 credit-pack grant 重复扣减；新增签名错误、
  缺失/处理中状态、单号/金额不符、超时、队列过滤、租约与回调交错反例。
- 当前退款网关/服务、runtime lifecycle/provider transactions 与 cadence 窄集：
  **103 passed**。最终 PR revision 的 CI 结果另行记录，历史数字不代表当前全量绿灯。
- Ruff 目标文件、`git diff --check`、release policy、部署脚本 shell 语法检查通过。
- Agent feedback quality gate：26 passed，前端 Cloud admin type-check、lint 和边界
  contract 均通过。
- 上述合并前阶段未执行 M4 和真实 Provider；2026-11-03 已补 M4 验收及真实本地
  Ollama adapter 调用，见第 6 节。生产部署、Alipay 沙箱/生产交易、收费远端模型 API
  和真实 Portal 用户验收仍未执行；模拟回归不能替代这些状态。

## 4. 会话与仓库收口规则

- 2026-11-03 操作者授权远端推送、PR 合并及本会话 worktree 清理。交付分支为
  `codex/runtime-audit-remediation-20261102`；最终 PR、merge SHA 和清理回执以
  本节后续收口记录为准。生产部署与真实交易不在此次授权范围。
- 主工作树仍有既有未跟踪目录 `.trae-html-share-packages/` 和 `npcink-cloud-overview/`；
  本轮没有修改或删除它们。
- 其他受锁定 worktree 归属其他会话。未经对应操作者明确授权，不删除、归档、重置或
  强行清理；关闭当前会话前应先决定本分支是提交并开 PR、保留待审，还是明确放弃。

## 5. 后续范围与收口状态

1. Portal 自助退款入口仍冻结，未实现，也未获产品授权。
2. 收费远端模型 API、Alipay 沙箱/生产交易及生产验证仍无本次验收证据。
   操作者于 2026-11-03 明确“支付相关的功能我生产环境再做”；本轮停止支付验证，
   不再要求沙箱材料，不代替操作者安排生产操作。
3. 原修复已由 PR #1358 合并为 `b15ffe6d`；原任务本地/远端分支已删除，主目录与
   其他会话受保护 worktree 保留。M4 后续验收不再列为未完成项。

## 6. M4 后续验收（2026-11-03）

[完整验收记录](history/engineering/2026/runtime-audit-m4-acceptance-2026-11-03.md)
记录了基线、命令、结果及支付探测失败；该记录仅适用于所列修订。

- PR #1358 的合并提交 `b15ffe6dc1af5f7767efc9e0376a9a1f81e08900` 已从干净
  `master` 执行 `m4:preview:promote -- --pr 1358`，耗时 26.92 秒。
- M4 `acceptance_state=accepted`、`promotion_pr=1358`、`source_dirty=false`；
  实际 API `/health/live` 的 `source_revision=b15ffe6dc1af` 与合并提交一致。
- M4 九个文件的定向回归 **232 passed**，pytest 耗时 12.30 秒，完整命令 15.42 秒；
  一个 Starlette/httpx 弃用警告保留。测试中的网关 fixture 仍属于模拟证据。
- 真实本地 Ollama `qwen3.5:9b` 经应用 adapter 完成一次标题生成，12.86 秒，
  输入/输出 token 为 51/11；没有收费 Provider 调用或应用数据库写入。
- 正式支付宝网关仅进行一次只读退款查询探测，响应缺少验签所需签名，报告
  `service.alipay_response_signature_missing`；未产生支付、退款或本地账务写入。
  该失败不能证明退款成功链路可用，也不能据此断言密钥错误或生产服务故障。
- 可复用规则：M4 与生产操作分开；真实本地模型与收费远端 API 分开；只读查询、
  响应验签、退款结算与权益回冲分开。操作者决定暂缓某项后，保留实际失败证据，
  不以 mock 或健康检查替换缺失的验收结果。
