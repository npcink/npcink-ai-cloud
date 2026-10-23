# Portal Quiet UX（IA / 工单附件 / 账号账单）— 交付复盘（2026-10-23）

Status: time-bounded Portal historical evidence; not current Portal authority.

Current authority:

- 布局与验收：[Portal UI Spec](../../../portal-ui-spec.md)（含 §1 IA、§5 页面约定、§7 验收清单、**§9 交付门禁 / 自检**）
- 客户工作区标准：[Cloud Portal Customer Workspace UI Standard](../../../cloud-portal-customer-workspace-ui-standard-v1.md)
- M4 预览同步 vs 部署：[m4-preview-ai-development-standard-v1.md](../../../m4-preview-ai-development-standard-v1.md)（`sync` ≠ `deploy`）；同日 M4 证据索引见 [preview-sync-ne-deploy-session-closeout-2026-10-23.md](../../m4/2026/preview-sync-ne-deploy-session-closeout-2026-10-23.md)

Protected PR: [#1199](https://github.com/npcink/npcink-ai-cloud/pull/1199)
Branch: `codex/portal-breadcrumb-top-off-20261022`
Squash on `master`: `0a7ee0dee639bbde66861f9aaf4bf28975a40cfb`
Merged: 2026-10-23（Asia/Shanghai 约 16:34）

本文件只记取舍、过程与反模式；产品条文以 Spec 为准，**不**复述 §7 清单。

## 1. 背景与目标

在 [#1165](https://github.com/npcink/npcink-ai-cloud/pull/1165) / [#1168](https://github.com/npcink/npcink-ai-cloud/pull/1168) 安静状态与套餐密度之上，把「顶栏一级页」的信息架构与工单聊天细节收成 Quiet 默认：

- 一级页靠**导航高亮 + 页面标题**定位，不再叠面包屑。
- 工单 / 账号与「服务」同为顶栏一级同伴；次级路径从各自一级起算。
- 升级只在「套餐」；账单 / 支付订单在「账号」。
- 工单附件：**选文件 = 本地草稿**，**发送才上传并挂到该条**；Admin 不得见预发附件。

PC 端 only。合入时曾有 CI 红项（a11y / docs 可达 / mypy / contract 等），与 [#1200](https://github.com/npcink/npcink-ai-cloud/pull/1200) 同类，靠 admin 合入——遗留 CI 不在本批收口，见「未做」。

## 2. 落地范围（摘要）

| 切片 | 结果 |
| --- | --- |
| 面包屑 / IA | 顶栏一级（首页 / 套餐 / 工单列表 / 账号）无 `PortalBreadcrumb`；工单详情 `工单 / 标题`；最近活动 `账号 / 最近活动`；站点详情仍 `服务 / 我的站点 / 名` |
| 套餐 vs 账号 | 升级 / 管理套餐 / 买积分 / 试用仅套餐页对话框；账号 = 登录与安全 + 支付订单；去掉账号「套餐与支付 / 升级套餐」摘要行 |
| 工单聊天 | 气泡 L/R、composer `rounded-2xl`；回形针直开选文件；draft chip + ×；发送后附件在气泡正文下 |
| 附件生命周期 | 本地草稿 → 发送时 upload + `attachment_ids`；× 只清草稿、不误报「无法确认」；后台预发不可见 |
| 最近活动 | 站点筛进表头；默认约 10/页 + sticky 底栏 |
| 选套餐 Modal | `size="3xl"` / 对比表收紧 |
| Spec | §1 / §5 / §7 / 反模式与 §9 自检项随本批更新（权威在 Spec，不在本文） |

## 3. 关键决策与反模式

1. **一级页不画面包屑**  
   与顶栏高亮重复即噪音。深度 ≥ 2 才画路径；且路径从**同级一级导航同伴**起算。

2. **勿把工单 / 账号挂到「服务」下**  
   「服务」= 首页 / 站点工作区。把「服务 / 工单」当面包屑是 IA 回退，不是「统一挂服务根」的省事写法。

3. **附件：选 ≠ 发**  
   预上传会让 Admin / 审计在「用户还没点发送」时看见文件。本地 draft + 发送挂载是产品不变量；× 必须可逆且不打不确定态横幅。

4. **升级入口唯一**  
   账号页再放「升级套餐」会和套餐页双入口抢注意力；账单留在账号即可。

5. **大 IA / 后端契约不顺手改**  
   Alipay `payment_return` 仍落 `/portal/billing`（Spec §8）；迁账号需单独批 + e2e。

## 4. 预览 / M4：bind-mount 与「镜像层完全对齐」

### 4.1 当日事故链（#1199 合入后）

1. 自检阶段：`m4-preview` 部署锁被占用 → 用 **frontend bind-mount / rsync** 把候选前端刷进预览，自检通过。
2. 合入 `master` `0a7ee0de` 后，约 16:29 的 **docker / m4-dev 重建** 用**较旧工作树**盖回挂载目录。
3. `http://127.0.0.1:18010/portal` 部分界面退回旧 UX（再现「服务 / 工单」面包屑），即使用户担心「代码丢了」——**Git 合入完好**，丢的是预览工作区内容。
4. 修复：将 master tip 的 `frontend` + 相关 `app` **再次 rsync** 进 m4-dev 工作区并 recreate；`source_revision` 对齐 `0a7ee0de`。官方 `frontend_image` 标签当时仍可滞后。

### 4.2 名词：「镜像层完全对齐」是什么、有何作用

| 层级 | 含义 | 作用 |
| --- | --- | --- |
| **Bind-mount / 工作区覆盖** | 容器挂宿主机目录或 rsync 进 workspace，运行时读挂载内容 | **快**：锁占用或不想整镜像重建时，可先自检。**脆**：后续 `deploy` / compose recreate / 用旧树重建会**盖回旧文件**，预览看起来「退版」，与 Git tip 脱节。 |
| **镜像层对齐** | 按 tip **重建** frontend（及需要的 API）镜像，使镜像内 bake 的源码 / 构建产物 = 目标 revision；再让运行容器用该镜像 | **稳**：不依赖临时挂载；新起容器、换机、清 volume 后仍是同一 tip。正式 promote / 长期候选应以镜像为准。 |

与同日 [#1213](https://github.com/npcink/npcink-ai-cloud/pull/1213) 写入标准的 **`sync` ≠ `deploy`** 互补：

- `sync` 绿 ≠ 运行中进程已是 tip（见 M4 closeout）。
- **bind-mount 绿 ≠ 镜像层已对齐 tip**；宣称「预览已是合入版」时，应核对 `/health/live` `source_revision` **以及**是否仍靠临时挂载掩盖旧镜像。

### 4.3 可复用运维要点

1. 锁占用时 bind-mount 自检可以，但合入后若做过 recreate，**必须**再对 tip 做一次内容对齐（rsync 或完整 deploy）。
2. 用户报「界面退回旧版」时，先查：**Git tip** vs **预览 workspace / 镜像标签** vs **`source_revision`**，勿先怀疑合入丢失。
3. 向用户解释「镜像层对齐」：把新代码**烤进镜像**，而不只是挂目录盖一层；作用是避免重建/换容器后 Quiet UX 再次消失。

## 5. 交付门禁（本批强化）

与 Spec §9 一致，本批再次验证：

1. **改 → 同步预览 → 本人目视对照 Spec → 先修残留 → 再请用户硬刷点头 → 再合。**
2. contracts / type-check 绿 ≠ 可验收；肉眼版式（面包屑、附件 draft、分页 10）不得甩给用户当第一道闸。
3. **Hold-batch**：开放 PR 上攒批，用户点头后再 squash；未点头不 auto-merge。
4. 合入后若预览异常，按 §4 区分「代码丢了」与「预览树被盖旧」。

## 6. 收尾状态（写文档当日）

- [x] `#1199` squash 合入 `master`（`0a7ee0de`）
- [x] 题分支 `codex/portal-breadcrumb-top-off-20261022` 远端已删；本批 worktree 已移除
- [x] Spec 已含本批 IA / 附件 / 反模式（随 #1199；其后 docs 另有 #1213）
- [x] 合入后预览曾退旧 → 已 rsync tip 恢复；**官方 frontend 镜像层完全对齐**当时未做（仍可能 bind-mount 掩盖）
- [ ] 合入遗留 CI（frontend a11y、docs 可达、`_support_mixin` mypy、contract `14==13` 等）— 单独小 PR
- [ ] `payment_return` 整段迁账号 — Spec §8 明确另迭代
- [ ] 知识库视频 / PDF、Admin Quiet 表对齐、附件边界加固 — 下一阶段

其他 locked worktree / 并行题分支不在本批清理范围。

## 7. 可复用规范要点（短清单）

1. 顶栏一级页：无面包屑；次级从一级同伴起算（工单→工单，账号→账号，站点→服务）。
2. 附件：本地草稿 → 发送才入库；Admin 预发不可见；× 不打不确定横幅。
3. 升级唯一入口在套餐；账号保留支付订单与登录安全。
4. UI 交付走 Spec §9；过程教训进 `docs/history/portal/2026/`，不稀释 Spec。
5. 预览：「sync ≠ deploy」+「bind-mount ≠ 镜像层对齐」；退版先查 revision / 挂载 / 镜像，再查 Git。
6. 用户点头前不合；合完剪本批分支与 worktree。

## 8. 权威落点

| 内容 | 位置 |
| --- | --- |
| IA / 页面 / 反模式 / 验收 | `docs/portal-ui-spec.md` §1、§5、§6、§7 |
| 交付门禁 / 自检 | `docs/portal-ui-spec.md` §9 |
| `sync` ≠ `deploy` | `docs/m4-preview-ai-development-standard-v1.md`；[M4 2026-10-23 closeout](../../m4/2026/preview-sync-ne-deploy-session-closeout-2026-10-23.md) |
| 本轮 Quiet UX 过程与预览退版教训 | 本文 |
| 前序安静状态 | [portal-status-ux-quiet-delivery-retrospective-2026-10-20.md](portal-status-ux-quiet-delivery-retrospective-2026-10-20.md) |
