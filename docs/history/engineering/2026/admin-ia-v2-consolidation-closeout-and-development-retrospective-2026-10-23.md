# 管理端信息架构 v2 整合与操作面收口 — 2026-10-23

Status: historical implementation evidence; current Admin standards remain authoritative.

状态：应用源码已合并进 `master`（`a6fa69bf`，PR #1201）；使其通过 required
检查的最小依赖修复已先合并（`92d2cd30`，PR #1202）；PC 管理员路径的
人工视觉验收仍待操作者在共享预览上完成。

范围：`/admin` 的主导航分组与工作区标签、共享页头、概览首屏操作列表、
队列键盘导航，以及 Phase 1 商业冻结提示。

本文记录开发历史、工作审视和可复用方法。长期规则已同步写入
[Cloud Admin UI Standard v1](../../../cloud-admin-ui-standard-v1.md) 与
[Cloud Admin Information Architecture v2](../../../cloud-admin-information-architecture-v2.md)。
本文不改变 Cloud/WordPress 所有权，不批准生产发布，也不把 M4 候选等同于
生产或独立人工验收。

## 1. 原始问题与目标

管理端一级导航条目过多，操作者在多个并列入口之间反复横向扫描，而
"客户运营"相关的队列（工单）又与商业记录平铺在同级：

- 一级导航条目过多，实际按操作者任务聚类的入口被拆散；
- 工单与客户记录本属同一类工作，却分列不同一级入口；
- 各页页头重复出现同一层级的眉标信息，挤占首屏可用高度；
- 概览页的"下一步动作"是写死的静态列表，不随运行态变化；
- 高频队列没有键盘路径，长列表翻找成本高；
- Phase 1 商业开发冻结只在 `AGENTS.md` 记录，界面侧没有可读的说明。

目标是**不新增路由、不改数据所有权**的前提下，把导航改造成"一级入口 =
操作者任务域，同一任务域内的路由以工作区标签并列呈现"的形状，并让
共享页头、概览首屏、键盘路径三处一并收口。

## 2. 交付内容

| 交付项 | 落点 |
| --- | --- |
| 一级导航 15 项收敛为 8 项 | `frontend/src/app/admin/layout.tsx`、`frontend/src/features/admin/navigation.ts` |
| 工单并入客户工作区标签 | Customers 工作区新增 Tickets 标签 |
| 商业记录工作区标签（订阅/套餐/积分包/服务状态） | `commercialWorkspaceTabs` |
| 共享页头去眉标（P2） | `frontend/src/components/backoffice/BackofficeScaffold.tsx` |
| 概览首屏改为数据驱动操作列表 | `frontend/src/app/admin/page.tsx`（`actionItems.map`） |
| 队列键盘导航 j/k/Enter/Esc | `frontend/src/features/admin/useAdminQueueKeyboard.ts`、`AdminQueueKeyboardHint.tsx` |
| Phase 1 商业冻结提示 | `navigation.ts` 的 `commercial_freeze_hint` |
| 长期规范同步 | `docs/cloud-admin-ui-standard-v1.md`、`docs/cloud-admin-information-architecture-v2.md` |
| 回归覆盖 | `admin-navigation-contract`、`admin-overview-navigation-v2-contract`、`admin-queue-keyboard-contract`、operator-path / queue e2e（折叠导航计数=8、390px 移动视口、面包屑断言） |

## 3. 边界与设计判断

- **路由不变**。工作区标签是呈现层，同一 `href` 仍可直达；标签不拥有数据，
  不改变任何 API、权限或持久化语义。
- **不新增商业逻辑**。冻结提示只陈述"Phase 1 期间不新增商业功能，既有
  读路径与积分/权益路径照常工作"，未触碰 runtime、credit、entitlement、
  source_type 或配额参数，符合 `AGENTS.md` 的商业冻结。
- **概览操作列表只做投影**。首屏动作由既有运行态数据派生，不新增后台
  轮询、聚合接口或写操作。
- **键盘导航不越权**。j/k 只移动焦点，Enter 才进入详情，Esc 只收起抽屉，
  不绕过任何检查器或审批路径。

## 4. 验证与证据分级

| 证据层级 | 结果 |
| --- | --- |
| 本地 | i18n 完整性契约 1787 keys 通过；admin 概览/工单/订阅键盘定向 Playwright 3 passed；`check:admin-ui` 与 `check:admin-ui:visual` 通过 |
| CI | PR #1201 全部 required 检查通过（frontend / backend / PR body contract / Secret scan / Analyze）；视觉基线为 Linux 平台版本 |
| 已合并 | `a6fa69bf`（PR #1201）squash 合入 `master` |
| M4 | 候选在 `0dfb5a3c`（03:28Z）验证：服务健康、前端由该修订重建、served layout chunk 含 "Phase 1 development freeze" / workspace tab 标记；随后共享 M4 槽位被另一会话的分支占用，预览当前不再服务该候选。当前 head 与该候选仅差 `uv.lock` 依赖升级，前端构建内容未变 |
| 生产 | 未触碰：无 Deploy、无 host 变更、无生产配置写入 |
| 人工验收 | 待操作者在共享预览上确认管理端视觉与交互 |

## 5. 协作与方法教训

1. **共享 M4 槽位是单资源，不是本地环境**。本会话的候选在验证后即被另一
   会话覆盖；教训是：改共享环境前先读 `last-deploy.txt` 等基线标记确认
   归属，验证候选要用"源修订标记 + 服务内 chunk 内容"而不是肉眼 UI 判定。
2. **master 上既有门禁失败会连带卡住无关 PR**。#1201 的 `backend` 聚合
   失败唯一原因是 master 上就存在的 `opentelemetry-api 1.44.0`
   （CVE-2026-114603）。教训是：把基础门禁修复拆成独立的最小 PR 先合
   master，再把新 master 合进业务 PR；不要在业务 PR 里夹带依赖升级。
3. **混合 worktree 里不要就地提交**。共享主 worktree 同时存在其他会话的
   未提交工作与一条无关的文档提交；在该 worktree 推送会把无关内容带进
   PR。教训是：任务分支从最新 `master` 另开独立 worktree 并加锁，共享
   worktree 只作为只读来源。
4. **视觉基线是平台相关的**。仓库同时存在 `*-darwin.png` 与 `*-linux.png`，
   CI 跑 Linux 基线；本地改过界面后必须刷新对应平台的基线并重跑视觉套件。
5. **证据分级要分开陈述**。本地绿、CI 绿、已合并、M4 候选、生产、人工
   验收是六种不同状态；本文只把"已合并"写成事实，其余保持候选或待验收。

## 6. 后续与未决

- 人工视觉验收待完成：需要在共享预览上确认 8 项导航、页头精简、概览
  操作列表、队列键盘路径与冻结提示；预览归属需与占用 M4 的会话协调。
- 本次未做生产发布判断，发布路径仍受
  [Cloud Production Release Policy v1](../../../cloud-production-release-policy-v1.md)
  与人工授权约束。
- `docs/compatibility-matrix.md` 未改行：规则 3 的触发条件是联合发版或
  活跃契约名/推荐地板变更，本会话两者皆无。
