# Admin UI Spec（Quiet 队列表）

> 供确认的 **Quiet 队列表** 约定。只覆盖 `/admin` 宽表 `queue` 页的分页、筛选胶囊、header 密度与交付门禁。  
> **不**替代 [Cloud Admin UI Standard v1](cloud-admin-ui-standard-v1.md)、[IA v2](cloud-admin-information-architecture-v2.md)、[Customer Operations Workspace](cloud-admin-customer-operations-workspace-standard-v1.md) 或 [审查与交付手册](cloud-admin-ui-review-and-delivery-playbook-v1.md)。  
> 过程教训（预览 bind-mount ≠ 镜像层、点头前不合）见 [Portal Quiet UX 交付复盘 — 2026-10-23](history/portal/2026/portal-quiet-ux-delivery-retrospective-2026-10-23.md)；**勿**把 Portal 壳层 / IA 抄进 Admin。

Status: draft Spec for Quiet queue tables（docs-only；确认后再改 UI）。

---

## 1. 目标与范围

- **目标**：队列表更安静、更密、筛选用胶囊、默认约 10 条、底栏能看见「起止 / 共 N」；交付前 agent 对照本 Spec 自检，再请操作员硬刷点头。
- **范围**：Admin **`queue` 宽表操作台**（对比表 + 工具条 + 分页）。首批以服务端分页、URL 可分享的队列表为准。
- **不在范围**：壳层面包屑 / workspace tab、详情页（工单时间线、客户 detail tabs）、诊断密度档位页、商业冻结页、Portal 窄壳与聊天气泡。

---

## 2. 与既有权威的关系

| 文档 | 仍拥有 |
| --- | --- |
| [UI Standard v1](cloud-admin-ui-standard-v1.md) §5 | 表上方稳定工具条、空态、行内操作、support queue 等待对象等 |
| [IA v2](cloud-admin-information-architecture-v2.md) | 页面模型、`Operator surface / 主导航 / workspace tab` 面包屑 |
| [Customer Ops Workspace](cloud-admin-customer-operations-workspace-standard-v1.md) | accounts / coverage / subscriptions 等路由边界与默认排序 |
| [Playbook](cloud-admin-ui-review-and-delivery-playbook-v1.md) | 审查顺序、preview vs closeout、L0/L1/L2 |
| **本文** | Quiet 队列表：**默认 page size、胶囊筛位置、header 摘要收敛、反模式、试点成功标准、交付自检** |

冲突时：产品所有权 / 安全 / 审计 / 无障碍 > IA / Customer Ops > UI Standard > 本文 Quiet 细化。

---

## 3. 从 Portal Quiet 可迁移 / 不可迁移

| 可迁移（思想） | 不可迁移（形态） |
| --- | --- |
| 一级定位靠导航高亮 + 页标题，少路径噪音 | **保留** Admin `admin-route-breadcrumb`；勿为 Quiet 拆掉 |
| 状态 / 注意力用 **胶囊（pill）**，少常驻图例 | 勿把全部筛塞进标题行右侧（Admin 标准：表上方稳定工具条） |
| 默认约 **10 / 页**；底栏「起止 / 共 N」 | 勿收窄内容列到 Portal `56rem` |
| Spec + agent 预览自检 → 用户硬刷点头 → 再合 | 勿把工单详情改成 Portal 气泡聊天 |
| 附件不变量：Portal **未发送草稿**，Admin **不得看见** | 勿 import `PortalRowActions` / Portal 组件套件 |
| bind-mount 绿 ≠ 镜像层对齐 tip | 勿用 Portal `PortalBreadcrumb` 规则改写 Admin IA |

共用原语继续用 Admin 既有：`BackofficeFilterPill`、`AdminDataTableFrame`、`ListPagination`、`BackofficePageHeader`、`BackofficeStatusBadge`。

---

## 4. Quiet 队列表约定

### 4.1 分页

- **默认 `limit = 10`**（服务端分页；浏览器不得只对当前页重排冒充全局风险序——见 UI Standard §5.1）。
- **URL 可覆盖**（如 `limit` / `offset`）；缺省回退 10。分享链接刷新后筛选与分页仍成立。
- 底栏文案形态：**「起止 / 共 N」**（或现有 i18n `common.pagination_summary` 等价），上一页 / 下一页。
- **单页也显示范围**（Quiet 意图）。今日 `ListPagination` 在 `total ≤ limit && offset === 0` 时整段隐藏——**改共享组件前须点名本条并评估影响面**；试点页可先局部 sticky 底栏对齐 Quiet，再收口共享原语。
- 服务端仍 **先筛/排序再分页**；空队列用共享空态，不为空数据保留大块空检查器列。

### 4.2 筛选与胶囊

- **状态 / attention**（及同类离散枚举）：用 `BackofficeFilterPill`（或同等胶囊），放在**表头相关区 / 表上方工具条**，贴近标题与表，勿单独「大筛选卡片」。
- **搜索、主题、排序、账号等**可留在工具条**紧凑第二行**（或同行宽度不够时折行）；仍属「表上方稳定工具条」，不是浮动遮表面板。
- 去掉常驻状态**图例**（状态在行内徽章 / 胶囊上已可读）。
- 「全部」类选项文案带维度（如「全部状态」），见 Playbook §1。
- URL 仍为队列事实来源；清筛 / 换页时勿丢无关上下文（如 return / focus 规则按现页契约）。

### 4.3 Header 摘要密度

- `BackofficePageHeader`：一页一标题 + ⓘ；主操作至多一个 + 有界次要操作。
- 摘要行：**少 summary 堆砌**。只保留帮助「现在该处理谁」的事实（例如待办数 / 逾期数）；去掉装饰性 metric pill 墙与重复说明。
- 诊断页已有 `density="compact"` + pill 的，**勿为 Quiet 拆掉**（见 UI Standard §1.1）；本文不覆盖 Diagnostic Density Tier。

### 4.4 附件与跨面不变量

- Portal 工单：**选文件 = 本地草稿**；**发送才上传挂载**。Admin 在用户未发送前**不得**看见该附件（与 Portal Spec / Quiet 复盘一致）。
- 本 Spec 不改附件 API；队列表 Quiet 改动不得削弱此边界。

---

## 5. 试点：`/admin/support-requests`

**第一页 Quiet 队列表试点**（实现另 PR；本文只定成功标准）。

当前基线（master 观测，实现时再核对）：`SUPPORT_REQUEST_PAGE_SIZE = 20`；大块 grid 筛选工具条；header 多枚 summary。

| 成功标准 | 说明 |
| --- | --- |
| 默认 10 / 页 | 常量与请求 `limit` 对齐；URL 可覆盖 |
| 状态 / attention → 胶囊 | 贴近表上方工具条；无常驻图例、无大筛选卡 |
| Header 摘要收敛 | 保留风险相关事实；去掉装饰堆砌 |
| 底栏范围可见 | 「起止 / 共 N」；单页策略按 §4.1 |
| 保留既有能力 | 服务端风险排序、URL 筛、drawer / 详情、键盘 j/k、等待对象投影 |
| 自检门禁 | §7 打勾后再请操作员硬刷点头；**不合入未点头 PR** |
| 不变量 | 不见 Portal 预发附件；不改壳层面包屑；不聊天化详情 |

后续同构队列（Spec 确认且试点点头后）：`/admin/accounts`（现 25）→ `/admin/subscriptions`（现 20）→ `/admin/coverage`（现 50）等。Observability / 诊断页不纳入本 Quiet 批。

---

## 6. 禁止模式

- 为 Quiet **拆除** `admin-route-breadcrumb` / workspace tab  
- 内容列收窄到 Portal **56rem**，或照搬 Portal 顶栏 IA  
- 工单详情改成 **气泡聊天**；import **Portal** 行操作 / 面包屑套件  
- 把全部筛塞进 **标题行 title-end**，违反「表上方稳定工具条」  
- 大块 **filter card**、常驻状态图例、装饰 metric 墙  
- 默认 page size 仍 20/25/50 却宣称 Quiet 已对齐  
- 浏览器端对单页排序冒充全局队列序  
- contracts / type-check 绿就宣称可验收；把肉眼版式甩给用户当第一道闸  
- bind-mount / rsync 预览绿却未核对 `/health/live` `source_revision` 与是否被旧树盖回  
- 未点头 **auto-merge** Quiet UI PR  

---

## 7. 交付门禁 / 自检

改 Quiet 队列表 UI 后，**agent 交付前必须**（不可跳过）：

1. **对齐 tip / 工作区**：勿在脏的无关分支上改；用 worktree；合入后若预览异常，先查 Git tip vs 预览 workspace vs `source_revision`（见 Quiet 复盘 §4）。
2. **同步预览**（m4 sync / 约定方式）后 **本人打开** `http://127.0.0.1:18010/admin/...` 本次路由（试点至少 `/admin/support-requests`）。
3. **目视对照**本 Spec §4–§6 与下表，**不只**看代码 / CI。
4. **先修残留**，再报告「可预览 / 请硬刷点头」。
5. **用户点头前不合**；Hold-batch 可攒开放 PR。

### 7.1 Quiet 队列表勾选

- [ ] 默认约 10 / 页；URL `limit`/`offset`（或页约定参数）可分享  
- [ ] 状态 / attention 为胶囊，在表上方工具条 / 表头相关区  
- [ ] 无大筛选卡、无常驻状态图例  
- [ ] Header 摘要已收敛，无装饰 pill 墙  
- [ ] 底栏可见「起止 / 共 N」（含单页策略按 §4.1 已说明）  
- [ ] 壳层面包屑仍在；内容未收窄到 56rem  
- [ ] 未引入 Portal 组件套件；详情未聊天化  
- [ ] 风险排序 / URL 筛 / 等待对象等既有队列契约未回退  
- [ ] 预览 `source_revision` 与声称 tip 一致（知悉 bind-mount ≠ 镜像层）  

---

## 8. 范围外（non-goals）

- 不改 Admin 壳层面包屑、主导航 IA、workspace tab  
- 不改工单详情 StackCard 时间线 / 内部备注模型  
- 不改诊断密度档位、Observability compact 工具条（已 Quiet 相关则保持）  
- 不改商业冻结页、生产发布策略、SLA 控制中心  
- 不在本文扩写全站视觉 token；全站规则仍在 UI Standard  
- **本文合入 ≠ 授权改 UI**；UI 另开 PR，并走 §7  

---

## 9. 权威落点

| 内容 | 位置 |
| --- | --- |
| Quiet 队列表分页 / 胶囊 / 密度 / 反模式 / 试点 / 自检 | **本文** |
| 表、工具条、support queue 契约 | `docs/cloud-admin-ui-standard-v1.md` §5 |
| 审查与 preview/closeout | `docs/cloud-admin-ui-review-and-delivery-playbook-v1.md` |
| Portal Quiet 过程与预览退版教训 | `docs/history/portal/2026/portal-quiet-ux-delivery-retrospective-2026-10-23.md` |
| Portal 布局权威（对照用，勿照搬） | `docs/portal-ui-spec.md` |

---

*确认本 Spec 后，再按试点页切片改 UI；未确认前不批量改版。*
