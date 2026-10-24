# 安全审查收口与有界修复 — 2026-10-23

Status: historical session evidence; long-lived rules live in
[`AGENTS.md`](../../../../AGENTS.md)（Security review anti-false-positive
checklist + Local deploy target and loopback conventions）。

2026-10-25 复核：公开目标外置、本机/smoke loopback 修复及下表 hardening
均已随 Portal quiet billing 工作线进入 `master`（squash：
`dd821ab3fce3adec49d81e57b362181946e040c0`，PR #1168），并在复核基线
`87b3541364ea67de39284c3904767a4d92a13319` 保留。这里证明的是源码承接；
生产部署、健康状态、实际凭据和真实调用均未在本次验证。

原会话记录称 hardening 已获操作者同意，专用分支
`codex/portal-billing-quiet-ux-20261020` 当时已删除且没有独立 worktree；
这些原会话陈述未在本次独立补证。本文保存历史经验和未验收事项，
不授权新的 hardening、历史改写或生产操作。

## 1. 会话范围与交付

| 项 | 结论 |
| --- | --- |
| 公开仓真实 SSH 目标 | 外置到 `.deploy-secrets/workspace-target.env.sh`；仓库留 loader + example；文档去实 IP |
| 本机 / smoke 脚枪 | `docker-compose.dev.yml` 与 deploy-bundle smoke Postgres 绑 `127.0.0.1` |
| Hardening（须同意后做） | prod healthcheck、`service_healthy`；API key per-secret salt + 双读；生产类环境拒绝 config 明确字段清单中的非空 Provider 凭据 |
| 规范 | `AGENTS.md` 防误报清单第 7 条：默认只落地公开面 + 本机/smoke 脚枪；hardening 须单独征得同意 |

原会话记录的本地体验约束：**不能只管删、不管用**——真实目标可外置，但必须保留 example、loader 与文档路径，本机 `source deploy/workspace-target.env.sh` 仍可用。

## 2. 可复用经验

1. **定级先于改动**：每个 finding 先标 production / local-dev / smoke / default-only；没有公开面证据不要写「沦陷 / 裸奔」。
2. **密钥断言要两步证据**：当前树已跟踪 **且** 全历史可证（或 gitleaks --all）；否则只叫「目标暴露」，不叫「已泄密」。
3. **默认可落地范围要窄**：公开面脱敏 + 本机冒烟脚枪；healthcheck / 随机盐 / CSP / 拒 env 密钥等是 hardening，**默认只提案，不擅自做**。
4. **外置 ≠ 砍掉 DX**：secrets 目录、example、loader、rsync 排除与占位 host 拒绝要一起做，避免「安全了但本机不能 deploy」。
5. **上线验收 ≠ 立刻发布生产**：验收是对照清单确认合入改动在真实环境是否正常；操作者可先推业务，验收稍后再勾。
6. **会话收尾**：原会话提倡清理本会话 gone 分支；执行时须服从现行 worktree 与阶段清理规范，先核精确承接、dirty/ignored、恢复能力和占用，再按精确对象退休，不凭 gone 标签删除。

凭据拒绝规则见 `app/core/config.py` 的
`_PRODUCTION_FORBIDDEN_PROVIDER_CREDENTIAL_FIELDS`；它不是对任意
`*_API_KEY` 名称做通配拦截。密钥实际是否由 Admin 配置属于现场验收。

## 3. 原会话后续建议（未验收，不自动授权）

| 待办 | 说明 | 触发 |
| --- | --- | --- |
| CSP 强制 | 复核基线 nginx 为 Report-Only；原会话记录的 report 管道状态未核实，强制前需验证环境并分 Admin/Portal 策略 | 操作者明确同意，且 Report-Only 证据够 |
| 历史 IP `filter-repo` | 原会话提示历史可能含退役目标标识；本次未扫描全历史，有 fork/mirror 要一并评估 | 操作者明确同意做历史改写 |
| Next 安全头等收尾 | headers、config 弱默认启动校验、env 键对齐、`cryptography` 直接依赖等 | 操作者明确同意开小 hardening PR |
| 上线验收清单 | healthy（api/frontend/proxy）、Admin 已配 provider 密钥、生产配置不含 config 明确禁止字段中的非空 Provider 凭据、入口与真实调用通 | 准备验证合入改动时勾选；**不是**「必须立刻发生产」 |

历史提及的 Portal #1199 已合入，不再列作待办；业务线与安全维护继续分别验收。

Dependabot / 杂 PR 清队列亦属业务/维护带宽，不在本会话默认动作内。

## 4. 原会话刻意未动

- 未默认 `filter-repo`、未强制 CSP、未改生产机 SSH 策略（需独立窗口）。
- 未清理其他会话 worktree / 分支（admin-ia、portal-breadcrumb 等）。
- 未触碰主工作区脏文件（当时检出在无关业务分支上的未提交改动）。

## 5. 相关指针

- 规则：[`AGENTS.md`](../../../../AGENTS.md)
- 本机目标：[`deploy/WORKSPACE_TARGET.md`](../../../../deploy/WORKSPACE_TARGET.md)
- 清理规范：[单会话工作区生命周期](../../../single-session-worktree-lifecycle-v1.md)、[阶段清理](../../../repository-stage-transition-cleanup-standard-v1.md)
- 合入载体：PR [#1168](https://github.com/npcink/npcink-ai-cloud/pull/1168)
