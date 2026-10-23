# 安全审查收口与有界修复 — 2026-10-23

Status: historical session evidence; long-lived rules live in
[`AGENTS.md`](../../../../AGENTS.md)（Security review anti-false-positive
checklist + Local deploy target and loopback conventions）。

状态：公开面脱敏与本机脚枪修复、以及经操作者明确同意的 hardening，已随
Portal quiet billing 工作线合入 `master`（squash：`dd821ab3`，PR #1168）。
本会话专用本地分支 `codex/portal-billing-quiet-ux-20261020` 已删除；当时
无独立 worktree。本文只记录经验与**未点头则不动**的待办，不授权生产发布。

## 1. 会话范围与交付

| 项 | 结论 |
| --- | --- |
| 公开仓真实 SSH 目标 | 外置到 `.deploy-secrets/workspace-target.env.sh`；仓库留 loader + example；文档去实 IP |
| 本机 / smoke 脚枪 | `docker-compose.dev.yml` 与 deploy-bundle smoke Postgres 绑 `127.0.0.1` |
| Hardening（须同意后做） | prod healthcheck、`service_healthy`；API key per-secret salt + 双读；生产拒非空 `*_API_KEY` env |
| 规范 | `AGENTS.md` 防误报清单第 7 条：默认只落地公开面 + 本机/smoke 脚枪；hardening 须单独征得同意 |

本地体验约束（操作者明确要求）：**不能只管删、不管用**——真实目标可外置，但必须保留 example、loader 与文档路径，本机 `source deploy/workspace-target.env.sh` 仍可用。

## 2. 可复用经验

1. **定级先于改动**：每个 finding 先标 production / local-dev / smoke / default-only；没有公开面证据不要写「沦陷 / 裸奔」。
2. **密钥断言要两步证据**：当前树已跟踪 **且** 全历史可证（或 gitleaks --all）；否则只叫「目标暴露」，不叫「已泄密」。
3. **默认可落地范围要窄**：公开面脱敏 + 本机冒烟脚枪；healthcheck / 随机盐 / CSP / 拒 env 密钥等是 hardening，**默认只提案，不擅自做**。
4. **外置 ≠ 砍掉 DX**：secrets 目录、example、loader、rsync 排除与占位 host 拒绝要一起做，避免「安全了但本机不能 deploy」。
5. **上线验收 ≠ 立刻发布生产**：验收是对照清单确认合入改动在真实环境是否正常；操作者可先推业务，验收稍后再勾。
6. **会话收尾**：合入 master（或 squash）后删本会话本地 gone 分支；不要清别的 worktree / 脏工作区。

## 3. 待办（opt-in，未点头不动）

| 待办 | 说明 | 触发 |
| --- | --- | --- |
| CSP 强制 | nginx 仍为 Report-Only，且无稳定 report 管道；强制前需分 Admin/Portal 策略 | 操作者明确同意，且 Report-Only 证据够 |
| 历史 IP `filter-repo` | 公开仓历史仍可能含旧 `114.132` / `120.24`；有 fork/mirror 要一并评估 | 操作者明确同意做历史改写 |
| Next 安全头等收尾 | headers、config 弱默认启动校验、env 键对齐、`cryptography` 直接依赖等 | 操作者明确同意开小 hardening PR |
| 上线验收清单 | healthy（api/frontend/proxy）、Admin 已配 provider 密钥、生产无非空 `*_API_KEY`、入口与真实调用通 | 准备验证合入改动时勾选；**不是**「必须立刻发生产」 |
| Portal #1199 等业务线 | 面包屑等业务 PR | **另线**；本安全会话不驱动合并节奏 |

Dependabot / 杂 PR 清队列亦属业务/维护带宽，不在本会话默认动作内。

## 4. 刻意未动

- 未默认 `filter-repo`、未强制 CSP、未改生产机 SSH 策略（需独立窗口）。
- 未清理其他会话 worktree / 分支（admin-ia、portal-breadcrumb 等）。
- 未触碰主工作区脏文件（当时检出在无关业务分支上的未提交改动）。

## 5. 相关指针

- 规则：[`AGENTS.md`](../../../../AGENTS.md)
- 本机目标：[`deploy/WORKSPACE_TARGET.md`](../../../../deploy/WORKSPACE_TARGET.md)
- 合入载体：PR [#1168](https://github.com/npcink/npcink-ai-cloud/pull/1168)
