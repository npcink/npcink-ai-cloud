# 七会话 Phase 1 收口与协作经验 — 2026-10-24

## 定位

本文是 2026-10-23 至 2026-10-24 七个 Codex 会话的统一收口记录。它记录已经合入的开发工作、各级证据的边界、协作中发现的可复用方法，以及下一阶段仍需操作者决定的事项。本文不替代 `AGENTS.md`、发布策略、M4 标准或生产授权。

当前开发基线：`master`，合并提交 `0a0cdbad1ec629f64e1b7bf7a50ba2b3b8138d3c`，对应 Portal TOTP T2 联合 PR #1247。该版本已完成 M4 accepted 窄回读；生产未部署。

## 七会话分工与结果

| 会话 | 主要职责 | 已落地结果 | 当前状态 |
| --- | --- | --- | --- |
| B01 | 商业化前台与现有商业入口的安全承接 | 自助商业入口、限流/熔断和安全恢复路径由 PR #1220 合入 `8a664095`；既有商业读路径保留 | 开发交付完成；真实支付/退款和生产仍未验收 |
| B02 | 唯一集成、合并车道与 M4 操作 | 负责 PR #1217、#1225 等前置收口，以及 T2 联合 PR #1247；处理最终 CI、保护性 squash、clean-master M4 accepted | T2 已合入 `0a0cdbad`；集成/M4 窗口已交回总规划 |
| B03 | Portal 后端自助能力、会话注册和数据生命周期 | 账号关闭、通知收件箱、会话注册/撤销、TOTP 存储基础等已进入 master（代表性 PR #1227、#1238、#1243、#1244、#1245） | 后端实现完成；完整外围环境与生产证据仍按阶段计划保留 |
| A01 | 独立后端/安全复核 | 对 TOTP 状态机、数据库事务、公开 RFC 测试向量的精确指纹清单做独立复核；没有放宽 secret scan | T2 复核 CLEAR；历史误报已记录为扫描器/测试向量问题 |
| A02 | 商业通知范围与实现 | PR #1246 合入 `cdfe0e44`：试用实际结束通知一次；AI 积分执行拒绝按订阅周期通知一次；只写现有 Portal inbox | 53 项窄测、ruff、mypy、`check:changed` 通过；M4 已随 #1247 一并接受 |
| C1 | Portal 前端和浏览器场景实现 | 支付回跳、附件隔离、Portal 状态与 TOTP 前端消费；T2 最终前端 blob 为 `2278440603708d866e5c2f978fd0fa528fb3ea6a` | 源码冻结并进入联合集成；前端结论由 C1-s 独立确认 |
| C1-s | 独立前端/BFF/取证复核 | 发现并推动关闭 BFF 私有响应头丢失、重试 Promise rejection、重复状态说明、过早骨架截图等问题 | 最终 `CLEAR`；16 项 PC 回放通过、无 pageerror、精确清理完成 |

“完成”在上表只表示该会话声明范围内的开发交付完成。它不把本地、CI、合并、M4、生产和人工业务体验合并为一个状态。

## 证据分层

- **Local**：T2 后端真实 PostgreSQL `101/101 PASS`，原 API 模块 `32/32 PASS`；前端最终 PC 回放 16 项通过、0 `pageerror`；A02 生命周期窄测 53 项通过。
- **CI**：PR #1247 最终提交的六项 required checks 全部成功，包括 Secret scan、CodeQL、backend static、PostgreSQL 门禁、production image smoke、前端和后端测试汇总。此前 RFC6238 公开向量误报与精确 fingerprint 清单失败均已保留原始日志并修复。
- **Merged**：#1247 的 merge commit 是 `0a0cdbad1ec629f64e1b7bf7a50ba2b3b8138d3c`；master 已快进到该提交。
- **M4 accepted**：`accepted-status.log` 记录 `acceptance_state=accepted`、`promotion_pr=1247`、`source_dirty=false`、Alembic `20261024_0091 (head)`，API/frontend/数据库服务健康；TOTP 测试账号、schema 和 session proof 均为零残留。
- **Production**：没有生产部署、production promotion、真实交易或付费 Provider 观察。本阶段规则仍要求这些动作由操作者对每个精确动作单独授权。
- **Human evidence**：Portal 预览和错误态由会话内人工复核；真实支付宝交易、退款、真实 14 天试用、三名 Free 用户和生产编辑器闭环仍未被本轮开发证据替代。

## 关键经验

### 1. 先固定 ownership，再并行实现

高冲突域采用“一名实现 owner、一名独立 reviewer、一名 protected merge-lane owner、一个 shared M4 owner”的结构。C1 只负责前端，C1-s 只负责审查；B02 负责唯一联合树和合并。这样既能并行收集证据，也不会让多个会话同时改同一工作树或争抢 M4。

### 2. 以字节身份和证据收据交接

T2 联合使用 base、HEAD、tree、逐文件 SHA-256 manifest 和 clean 状态交接。审查时先证明当前 blob 就是被审的 blob，再复用测试结论。`git diff --check`、源文件哈希和 M4 source bundle 指纹比“看起来是同一批改动”可靠。

### 3. 编译后的边界必须单独验证

后端返回的 `private, no-store`、`Pragma: no-cache`、`Vary: Cookie, Authorization` 在 BFF 层最初被丢弃；仅看后端测试或浏览器表单 happy path 会漏掉这个问题。最终验证同时检查应用 BFF、编译后的 HTTP 出口和外层 M4 代理，确保敏感 TOTP 路由的成功、错误和代理失败都保留私有响应语义。

### 4. 状态机要优先处理终止条件

`attempts_remaining=0` 的终止语义优先于同时出现的 retryable 标签；网络不确定、服务端成功但响应丢失、已消费、过期和绑定失效必须分别建模。challenge cookie 只用于 cookie-only bootstrap，不能被升级为 Bearer；`setup/confirm` 继续保持未挂载。

### 5. 取证脚本也属于验证面

第一次 terminal 截图拍到加载骨架，且“输入框不存在”断言过早通过。修复验证 harness 后，必须等待真实终态标题，再检查表单消失、说明唯一、重试动作存在并截屏。验证脚本失败时先修脚本证据，不要把取证缺口变成产品改动。

### 6. 处理安全扫描误报时保持精确

RFC6238 公共测试向量触发 API-key 误报时，保留扫描规则，只把已审查的精确 fingerprint 加入完整清单，并保持“清单必须完全相等”的合同。不要用全局忽略、放宽模式或删除测试向量来换取绿色 CI。

### 7. 商业通知必须服从既有边界

A02 的通知复用既有 `portal_notifications` 表和现有事务：只写 Portal inbox，不加 cron、SMTP、历史回填、migration、价格、额度、ledger、provider 或销售控制面。收件人必须是唯一 active owner、active principal 且邮箱可规范化；缺少可靠周期或收件人时静默跳过。事件 ID 由账号、订阅和周期确定，从而保证试用结束一次、积分拒绝每周期一次。

## 未完成事项与下一阶段

1. **生产与真实业务验收**：按 `AGENTS.md` 保持人工闸门。需要单独授权后，才可做真实支付宝交易/退款、真实试用周期和生产 promotion；不能因为 M4 accepted 自动升级。
2. **Phase 1 编辑器闭环**：继续按 Phase 1 runbook 完成 WordPress Ability → Addon → Cloud runtime → hosted model → reviewed editor adoption → bounded feedback 的真实证据。生产部署仍由操作者精确授权。
3. **Phase 2 Portal follow-on**：从最新 master 重新扫描截图基线和残留 e2e 失败，清理 orphan `running` inline runs，并继续改善 Portal 502/busy UX；这些工作与 T2 认证收口分开排程。
4. **Admin Quiet 外部工作**：#1222/#1223 属于其他工具的暂停域，不纳入本七会话收口；保持现状，避免与本线重新争抢 merge/M4 资源。
5. **仓库卫生**：本批 T2 集成工作树和 M4/merge 锁已完成交回；历史实现 worktree 不自动删除，任何归档都要按 worktree 生命周期标准逐项核对，避免误删仍需追溯的证据。

## 收口判断

七个会话的开发待办已完成其已授权的代码、测试、审查、合并和 M4 accepted 工作；统一经验已写入本文。剩余项目属于生产/真实业务授权或 Phase 2 follow-on，不应伪装成当前开发批次已完成。
