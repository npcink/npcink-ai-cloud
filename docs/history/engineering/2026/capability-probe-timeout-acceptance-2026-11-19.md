# 能力验证代理修复：合并、M4 专项验收及退休回执 — 2026-11-19

状态：本次代理修复已合并，干净 master 已完成 M4 accepted 部署及对应专项检查。
本回执接续 [集成与复盘](capability-probe-timeout-integration-2026-11-19.md)，
[11 月 18 日审计](capability-probe-timeout-closeout-audit-2026-11-18.md) 保留其当日状态。
时间均为 Asia/Shanghai；M4、CI、生产与人工证据分别记账。

## 已完成的交付

| 层次 | 证据与限制 |
| --- | --- |
| 源码集成 | PR [#1443](https://github.com/npcink/npcink-ai-cloud/pull/1443) 于 2026-11-19 18:17:11 squash 合并，master `620e65b711319a777999a598b36db758ecbbb835`；被审查 head 为 `3cf1ff125b4af27183a361c7cf3dd7c2f571058b`，合并树与交付树完全一致 |
| 本地 | 对齐主干锁文件的 Next 16.4.6；Vitest 87 文件 / 1209 项、定向代理 23 项、PC 浏览器 39 项、Admin/type/lint/契约、三套 Nginx 语法及发布策略通过；1440/900 截图由代理复核，无 golden 更新 |
| GitHub CI | #1443 所需检查通过后受保护自动合并；Cloud CI、CodeQL、文档/PR/密钥/专项质量、前端、Python 镜像 smoke、三组后端契约等最终成功；工作流按范围跳过项仍是 skipped |
| M4 accepted | 从稳定 M4 运维检出执行 `m4:preview:promote -- --pr 1443 --deploy`，18:21:06 完成；`acceptance_state=accepted`、`promotion_pr=1443`、master、`source_dirty=false`，API/frontend revision 均为 `620e65b7` |
| 实际运行 | API/frontend/proxy healthy，`/` 与 `/health/live` 200；真实 Nginx 加载精确能力验证路径 130 秒。远端 BFF、页面、i18n、M4 Nginx 文件 SHA256 与合并源一致。未登录探测 POST 返回 `401 / auth.admin_session_required` |
| M4 浏览器专项 | 实际 M4 前端、浏览器模拟 API：超时 504 与连接中断 502 两项 2/2，保留选择、无配置写入、无自动重试；1440/900 截图保留。这证明已部署前端提示和交互，不是付费模型或真实后端长调用验收 |
| Ollama | 部署前后均由原 LaunchAgent 管理，PID `57267`，loopback `127.0.0.1:11434`；未执行推理 |
| 生产与人工 | 未执行 production promotion/deploy，未制造真实 Provider 调用；未宣称操作者视觉接受、模型质量或生产验收 |

M4 部署沿用原运行镜像输入 `02c78e44…`、前端镜像输入 `66ec2290…`，
运行镜像构建未变化；本轮更新前端源码/编译结果与代理配置，worker/migration
源未变化，Alembic 保持 `20261103_0092`。最终文档 PR 不改变应用输入；
若之后 M4 被其它任务替换，需重新核对运行版本，不能把本文当作实时状态。

## 验收中的失败、修正及独立后续

本地初始端口占用、旧依赖提醒、命令 cwd、Nginx 片段包装问题见集成记录，
均已用正确环境/入口执行对应检查，未修改依赖清单或测试预期掩盖失败。

M4 首次浏览器命令经 pnpm 传入额外 `--`，使 `--grep` 失去选项含义，实际启动
39 项整份页面测试。运行到第 27 项后主动终止；出现 3 个失败，因此该次记为
**中止且有失败，不是全绿**。正确命令直接调用既有 wrapper、只跑本次两项，
2/2 通过。三项意外失败另行定向复核，目录读取失败和返回确认两项通过；
“cancel and close discard only the dialog draft without writing”仍失败于
`/admin/runtime-profiles?profile=route.classification` 跳转 `/admin/ai-resources`
的 URL 断言（15 秒），不是探测请求或草稿断言。trace 中可见目标 RSC/脚本
读取，但根因未证实；不能仅凭局部信息归因于隧道、缓存或本次修复。

该导航场景不在本次改动路径中；同一源码的本地整份页面 39/39 和必需 CI 已过。
按默认选择检查及分道约束，本次没有扩展修复共享导航，也没有声称 M4 整份
页面全绿。后续事项统一列于下表：

| 后续项 | 处置 | 责任 / 触发 / 下一步 |
| --- | --- | --- |
| M4 取消草稿后供应商导航 | `DEFERRED_BY_SCOPE`；保留失败日志、截图和 trace，根因未知 | 后续前端维护任务在操作者要求或自然重现时接手；先用真实授权会话区分模拟 fixture、跨页 RSC 与实际导航行为，再决定是否修源码。复核前不列作已修复或全页面通过 |
| `grok-imagine-image` 旧上游失败 | `DEFERRED_BY_SCOPE`；最新只读记录仍为 11 月 17 日 `provider.upstream_unavailable` | 后续供应商维护任务在需要恢复该模型/新自然失败时接手；先核对原请求与供应商证据，新付费验证需相应授权；旧记录不证明当前仍不可用 |
| 项目其它 worktree 与分支 | 其它任务资源，不属于本次退休 | 按各自 owner/PR/唯一提交和受保护用途核查；28 个登记与 15 个缺目录、PR 查询上限不等于已清理 |

这些独立后续不被称为已解决；本次关闭的是精确代理修复交付，项目全量缺陷和
生产上线没有因本回执自动完成。

## 分支、worktree 与证据退休

用户本轮明确授权完成 PR/CI/merge、M4 检查和本任务精确清理。
实现分支 `codex/capability-probe-timeout` 的完整树已由 #1443 合并，
`git diff 620e65b7 codex/capability-probe-timeout` 为空；不存在遗留源码。
最终回执使用从新 master 创建的 `codex/capability-probe-closeout-receipt`，
待其文档 PR 合并并再次核对干净、无唯一交付、无活跃占用后，精确退休：

- 本任务托管 worktree：`/Users/muze/.codex/worktrees/capability-probe-timeout/npcink-ai-cloud`；锁原因为 `codex:capability-probe-timeout`。
- 本任务实现和回执分支的本地/远端引用；清理前须逐一证明 PR merged 与树被包含。
- 不操作其它主检出、受保护 M4 运维检出、分支、缺失目录登记或运行服务。

本文提交时精确清理尚待文档 PR 合并；执行结果由本机外部清理回执记录，
不在清理前写成已删除。运维检出保持 clean master、作为稳定接续入口。

本机长期证据目录：
`/Users/muze/.codex/visualizations/2026/11/17/01a1e794-512a-7c82-aa7b-1ab027cea30c/capability-probe-timeout/closeout-20261119/`。
其中含原提交 Git bundle、五轴审查 JSON、CI/merge JSON、M4 状态与部署日志、
源文件哈希、加载路径、专项截图和未通过导航的 trace。均放在任务 worktree 外，
其生命周期与分支清理分开；最终清理前再次确认已保存。

## 开发经验与结束条件

“代理返回失败”必须与“后端已落证据”分开；优先只读确认，不自动重放可能
收费的请求。旧分支整合前先查主干是否已部分替代；M4 accepted 要核对干净
revision、源码、加载配置与对应专项行为。出现无关失败要保留反例并列明触发，
不把收口无限扩大为项目所有问题清零。

这些经验已归入 [前端恢复规范](../../../frontend-request-recovery-v1.md) 和
[Admin 落实台账](../../../admin-information-hierarchy-implementation-ledger.md)。
本回执文档合并且精确资源退休完成后，本会话即可按“本次代理修复已交付，
独立事项已列明”关闭；不需要因此请求生产部署或真实模型开销。


## 2026-11-19 18:32 后继退休核对：主检出保护

最终回执 PR [#1444](https://github.com/npcink/npcink-ai-cloud/pull/1444)
已于 18:30:52 合并为 `8a0f77bebb6763268bb02130f4b36e8cb264f99d`，
必需检查通过，回执分支树与合并树完全一致。稳定 M4 运维检出已快进至该
干净 master；与已验收 M4 应用 `620e65b7` 只差文档，不重复部署。

对本任务路径调用应用托管归档时，应用明确拒绝：
`The task's primary checkout cannot be removed.` 因而撤销上文的目录删除计划，
将该路径处置为 **主检出受保护保留**，不是“已删除”。不通过终端解锁/强删
绕过应用保护，也不把它计作遗留未合并工作。

本次退休改为：交付和证据已合并并另有 Git bundle/截图/trace，文档后继提交
合并后，使该主检出干净停在最新 master 的 detached HEAD，保留锁并标注本任务
已关闭、目录受保护；精确删除本任务实现、回执、主检出保留说明三条分支的
本地/远端引用。具体操作结果由同一外部 `resource-retirement.json` 保存。

该目录可以继续作为聊天恢复/查看源文件入口。若以后确需删除，须由应用先
解除主检出保护，再重新核对路径、owner 和无唯一交付；本会话不擅自解除。
其余任务与运维检出继续保留。按此明确处置，本次代理修复可关闭；不能声称
全仓 worktree 均被删除或所有独立缺陷已修复。
