# 开发会话操作经验记录（2026-11-02）

Status: dated development closeout record. 本文记录本轮运行时、反馈、回调、检索与
退款文档核对的事实、验证边界和可复用方法；不是生产验收、M4 验收或新的功能授权。
现行约束仍以 `AGENTS.md`、验证分层、Phase 1 范围和相关活动契约为准。

## 1. 本轮处理的问题与证据

本轮修复了以下八类问题，并为每项补了回归证据：

1. Provider 返回非 JSON 或 JSON 根类型错误时，OpenAI adapter 统一转换为
   `provider.output_contract_invalid`，避免异常穿透成 500。
2. `no_store`、PII 和 secret 运行的 Provider、预算、输出准备和最终化错误使用固定
   文案，避免把输入或上游响应内容写入持久化错误和响应。
3. 运行请求幂等指纹纳入存储模式、超时、重试、保留期、callback、task backend 和
   canonical run 等控制字段，并在执行契约和 managed policy 完成后计算。
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

- 退款网关/服务/cadence/部署契约回归：110 passed；受影响测试集与变更 Python
  检查通过，mypy targeted 通过。
- 最后一次全量 pytest（新增两条对账回归之前）：5511 passed、171 skipped、1 个
  Starlette/httpx 兼容弃用警告；不再有 tracing 或 API impact-policy 失败。新增两条
  对账回归随后单独通过，未重复消耗全量门禁。
- Ruff 目标文件、`git diff --check`、release policy、部署脚本 shell 语法检查通过。
- Agent feedback quality gate：26 passed，前端 Cloud admin type-check、lint 和边界
  contract 均通过。
- 未执行：生产部署、M4 验收、真实 Provider、Alipay 沙箱/生产交易和真实 Portal
  用户验收。本地 SQLite、MockTransport、monkeypatch 和测试客户端证据不替代这些状态。

## 4. 会话与仓库收口规则

- 当前分支 `codex/runtime-audit-remediation-20261102` 已提交本地 commit
  `501c1a94`，相对 `origin/master` ahead 1；尚未推送、创建或合并 PR。因此不能声称
  已远端提交、已合并或可安全关闭。
- 主工作树仍有既有未跟踪目录 `.trae-html-share-packages/` 和 `npcink-cloud-overview/`；
  本轮没有修改或删除它们。
- 其他受锁定 worktree 归属其他会话。未经对应操作者明确授权，不删除、归档、重置或
  强行清理；关闭当前会话前应先决定本分支是提交并开 PR、保留待审，还是明确放弃。

## 5. 后续明确未完成项

1. Portal 自助退款入口仍冻结，未实现，也未获产品授权。
2. 真实 Provider、Alipay 沙箱/生产、M4 与生产验证；这些证据不能由本地回归替代。
3. 远端推送、PR 创建/合并和本会话 worktree 的生命周期收口。
