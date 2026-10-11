# 兼容稳定性、预算与支付后续交接清单 — 2026-09-22

Status: active session handoff. This record carries the open items of the
2026-09-22 compat/budget/payment session so a later session or the operator
can continue without the original conversation. Completed evidence is named;
this record is not product acceptance.

## 本会话已完成（证据索引）

- Addon PR [#155](https://github.com/npcink/npcink-cloud-addon/pull/155)（已合并）：
  下载重试窗口拉长（`--retry 8 --retry-delay 20 --retry-max-time 900`）、
  每晚 19:37 UTC 定时矩阵运行、稳定性台账
  （addon 仓 `docs/wordpress-ai-compatibility-stability-ledger-v1.md`；
  口径：账 A = 合入 master 首轮运行、任何首轮失败清零；账 B = 全部运行的第三方失败率；
  回填起点 streak = 2）。
- Cloud PR [#1007](https://github.com/npcink/npcink-ai-cloud/pull/1007)（已合并）：
  [ADR-055](decisions/055-provider-account-level-spend-budget.md) Provider 账户级预算设计记录。
- Cloud PR [#1008](https://github.com/npcink/npcink-ai-cloud/pull/1008)（已合并）：
  `/open/payments/alipay/notify` 路由级回放矩阵
  （`tests/api/test_open_payment_notify_routes.py`，9 场景全绿）。
- 工作区级每日 09:00 自动检查（只读报告：昨晚 schedule 运行、streak、账 B 事件、
  自然观察窗口进度）；跨会话关闭持续生效，可在 Automations 页面删除。

## 待办与观察（按触发条件排列）

| # | 事项 | 触发条件 / 节奏 | 归属 |
| --- | --- | --- | --- |
| 1 | compat 台账记行：schedule 运行记入账 B，合入运行记入账 A | 每日（09:00 自动检查给出数据，记行由任务会话完成） | 任务会话 |
| 2 | 决定是否把 `WordPress AI compatibility blocking lanes` 加入 branch protection required contexts | 账 A streak ≥ 10 且窗口内账 B 第三方失败率 ≈ 0 | 操作者 |
| 3 | ~~ADR-055 实现 PR~~（2026-09-26 追记：核心熔断随 PR #1029、旁路收敛/Admin 压力面/合同测试随 PR #1031 合入 `master`；剩余出口为 clean-`master` M4 promotion、操作者配置 `provider_account_spend_budget` 并执行 warning/拒绝 smoke、rerank 与 web search httpx 兜底等裸 HTTP 付费路径接入或显式豁免——见 [盘点文档](provider-budget-hard-cap-inventory-2026-09-23.md) "实现合入更新"节） | M4 promotion 待共享运行时空闲；武装与 smoke 属操作者决策，先于任何付费 Provider 调用授权 | 操作者 + 开发会话 |
| 4 | 退款回调分发缺口：公网 notify 端点对退款形状通知返回 `fail`（已退款订单），引发支付宝重试；与 [退款能力缺口盘点](refund-gap-inventory-2026-09-22.md) 相互印证 | 建议单独聚焦任务 | 待操作者裁决 |
| 5 | 信用包拆分退款语义：积分结清但订单停留 `paid`，与单笔全额退款翻转为 `refunded` 不一致（PR #1008 Notes 有断言现状的测试） | 建议单独聚焦任务 | 待操作者裁决 |
| 6 | Alipay 沙箱授权 | notify 矩阵已绿，等操作者明确授权 | 操作者 |
| 7 | 自然流量观察窗口（≥50 真实样本、人工三类质量评审） | 窗口约至 2026-09-28；结束时若仍 0 样本，升级为"第一批真实使用来源"的分发决策 | 操作者 + 正常使用 |
| 8 | Mimosa 提交门误报治理：cloud 仓 215 个测试占位符凭据（如 `api_key="test-api-key"`）阻断所有 AI 会话提交；2026-09-22 本会话经操作者逐次授权绕过 5 次 | 尽快（扫描豁免配置或 fixture 改写）；另一会话已在处理 | 操作者 / 治理会话 |

## 环境状态备忘（2026-09-22 会话结束时）

- Cloud 工作树：detached 于 master（`1506a4d4`），干净；本地 `codex/*` 分支与远端同名分支未删除。
- Addon 工作树：停在已合并的主题分支 `codex/compat-stability-retry-schedule-ledger-20260922`；
  另一会话的本地化未提交改动（`includes/class-ai-plugin-localization.php` 等 4 个文件 + 未跟踪 `.mimosa/`）
  全程未触碰，仍待该会话自行收尾。
- 发布用辅助 worktree 均已删除；`.git/info/exclude` 本地忽略了未跟踪的 `.zcodeignore`（文件保留在磁盘）。
