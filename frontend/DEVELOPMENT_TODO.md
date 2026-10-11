# Cloud Frontend 待开发清单

## 项目概述

当前 `cloud/frontend` 是一个基于 Next.js 的 Cloud Web surfaces 工作区，承接当前已上线的 Cloud Web、Portal 与 Admin 界面。

当前阶段口径固定如下：

- 顶层公开页面（`/`、`/help`、`/privacy`、`/setup`、`/status`、`/terms`）
  - marketing / onboarding / product information / 法务与状态 surface
  - 不是签约后 customer center
- `/admin/*`
  - operator / platform-admin / internal admin 页面
  - 不是 customer-facing front-office
- `/portal/*`
  - authenticated member portal surface
  - 只承接 bounded Portal session/member/site surfaces、usage/billing/audit 的受限自助能力
  - 不代表 checkout/payment/invoice/reconciliation、seat lifecycle、完整 customer success front-office 已开始交付

因此，本文件是“当前 Cloud frontend surfaces 的迭代清单”，不是 customer commercial front-office 路线图。

## 当前阶段边界

- 已落地：
  - 顶层公开 / onboarding / setup / status / 法务页面
  - operator/admin `/admin/*`
  - authenticated member `/portal/*`
- 仍未开始：
  - customer-facing commercial front-office
  - 正式 self-serve checkout/payment/invoice/reconciliation
  - 正式 seat lifecycle / dunning / customer billing ops center

## 技术栈

- **框架**: Next.js 16（App Router，dev 使用 `next dev --webpack`）
- **语言**: TypeScript 5.9
- **样式**: Tailwind CSS 3.4
- **状态管理**: React Context + Hooks
- **API 通信**: Fetch API，经 `src/app/api/{portal,admin,setup}/[...path]/route.ts` 三个 BFF catch-all 代理到 Cloud 后端；调用封装在 `src/lib/portal-client.ts` / `src/lib/api-client.ts`

---

## 已落地页面与能力

以下内容表示“代码已存在或 bounded member/admin surface 已可读”，不表示“Cloud 可以长成第二控制面”。页面清单以 `frontend/src/app/**/page.tsx` 实际存在为准（2026-09-21 校准）。

### ✅ Portal member surfaces

这些页面属于 authenticated member `/portal/*`，不应被扩写成第二控制面。

- [x] 会员工作台首页 `/portal`，登录 `/portal/login`，注册 `/portal/register`，账户 `/portal/account`
- [x] Usage：`/portal/usage`（后端 usage-summary / entitlements 数据经 BFF 读取）
- [x] Audit：`/portal/audit`
- [x] Billing：`/portal/billing`
- [x] Site summary / details：`/portal/sites/[siteId]`
- [x] Support and recovery：`/portal/support`、`/portal/support/[requestId]`
- [ ] API Keys member 页面与通知/第三方集成页面
  - 当前 bounded Portal 有意不提供这些 customer 页面
  - 前端工作区内没有对应页面；历史后端 seam 不算已交付的 customer experience

### ✅ Operator/admin surfaces

这些页面属于 `/admin/*`，是 operator/platform-admin/internal admin 面，不是 customer-facing front-office。

- [x] 管理员 API 客户端方法（portal-client.ts）与 `/api/admin/[...path]` BFF catch-all
- [x] `/admin` 总览（统计卡片、Runtime 健康含 queued runs / guard events、即将到期订阅、需要关注的订阅）
- [x] 账户：`/admin/accounts`、`/admin/accounts/[accountId]`
- [x] 站点：`/admin/sites/[siteId]`（站点列表能力并入账户/总览工作区）
- [x] 订阅：`/admin/subscriptions`、`/admin/subscriptions/[subscriptionId]`
- [x] 套餐与额度：`/admin/plans`、`/admin/credit-packs`
- [x] 工单：`/admin/support-requests`、`/admin/support-requests/[requestId]`
- [x] 审计与排障：`/admin/audit`、`/admin/troubleshooting`
- [x] 运营与合规：`/admin/coverage`、`/admin/site-compliance`、`/admin/usage-statistics`
- [x] AI 面：`/admin/ai-advisor`、`/admin/ai-resources`、`/admin/agent-feedback`
- [x] 外部服务与观测：`/admin/external-services`、`/admin/service-settings`、`/admin/runtime-profiles`、`/admin/media-observability`、`/admin/plugin-observability`、`/admin/vector-observability`、`/admin/vector-settings`
- [x] 登录：`/admin/login`

Admin 面的页面模型、操作层级与共享 primitive 以 `frontend/admin-ui-manifest.json` 与 `docs/cloud-admin-ui-standard-v1.md` 为准。

## 已完成 UI 组件

### ✅ 通用 UI 组件库（src/components/ui/）

- 骨架屏（Skeleton.tsx）：`Skeleton`、`SkeletonText` 等家族成员
- 提示（Alert.tsx）：通用提示与错误/加载/空状态展示
- 图表（Charts.tsx）：条形图、折线图、饼图、统计卡片家族
- 基础 primitive：Button、Card、Input、Modal、Badge、Dropdown、Toast、ListPagination、MetricTile、Footer、Navbar、LocaleSwitcher、ThemeToggle、LoadingFallback、EmptyState、EChartsWrapper、UsageChart
- 错误边界（src/components/ErrorBoundary.tsx）：类组件边界与 hook 用法

---

## 待开发功能

以下 backlog 仅表示 bounded member/admin surfaces 还可继续补强。
它不是“customer-facing commercial front-office 已经启动，只差收尾”的信号。

---

### 📋 P1: 当前阶段内可继续补的 member/admin 体验优化

**优先级**: P1 (中)

#### P1-1: 加载状态优化
- [x] 添加骨架屏 (Skeleton) 组件
- [ ] 优化页面切换动画
- [ ] 添加渐进式加载

#### P1-2: 错误处理优化
- [x] 统一错误提示组件
- [x] 添加错误边界 (Error Boundary)
- [x] 首页套餐用量失败与首次绑定账户加载支持显式重试
- [ ] 继续按真实失败样本补充页面级恢复动作，不新增全局自动重试

#### P1-3: 响应式优化
- [x] Portal 响应式导航与 44px 主要触控目标
- [x] 390px 登录、注册、WordPress 绑定、套餐、用量与工单任务覆盖
- [ ] 根据真实设备反馈继续修复键盘、支付 App 返回和浏览器差异

#### P1-4: 性能优化
- [ ] 实现数据缓存
- [ ] 优化 API 请求（防抖/节流）
- [ ] 代码分割和懒加载

---

### 📋 P2: 当前阶段内的 bounded 能力补完

**优先级**: P2 (低)

#### P2-2: 使用量图表
- [x] 创建条形图组件
- [x] 创建折线图组件
- [x] 创建饼图组件
- [x] 创建统计卡片组件
- [x] Usage 页面集成 AI 额度趋势
- [x] 支持 1h / 24h / 7d / 30d 时间窗口
- [x] 明确空趋势状态和可下钻的额度记录
- [ ] 按模型使用量分布图（只有出现明确客户任务时再做）
- [ ] 导出使用量报告

#### P2-4: 集成能力（当前不作为用户体验交付）
- [ ] 不恢复已下线的 Webhook、通知或第三方集成页面，除非有新的边界评审和真实用户任务证据

### ⛔ 外部验收阻塞项

- [ ] 3–5 位非开发用户完成
  `安装/启用 Addon → 注册/登录 → 绑定 → Free 激活 → WordPress AI 首次成功`
- [ ] 记录无需提示完成率、完成时间、卡点、错误恢复率和用户原话
- [ ] 真实商户或批准沙箱完成支付、延迟回调、失败、取消、退款申请和工单接管
- [ ] 运营主体、公开联系渠道、退款处理周期、保留期限及第三方清单完成审批

Mock E2E、HTTP `200`、M4 候选或绿色 CI 均不能替代上述真实用户和外部验收。

## 明确不在当前 TODO 中推进的事项

- customer-facing commercial front-office 正式交付
- GA customer portal / self-serve onboarding
- checkout / payment / invoice / reconciliation 正式前台
- seat lifecycle / dunning / customer billing operations center
- 任何会让 `/portal/*` 被误读成“已上线正式商业前台”的包装

---

## 项目结构

以当前 `frontend/src` 实际目录为准（2026-09-21 校准）：

```
frontend/src/
├── app/
│   ├── page.tsx、help/、privacy/、setup/、status/、terms/   # 顶层公开页面
│   ├── portal/          # login/ register/ account/ usage/ billing/ audit/
│   │                    # sites/[siteId]/ support/[requestId]/ page.tsx
│   ├── admin/           # login/ accounts/[accountId]/ sites/[siteId]/
│   │                    # subscriptions/[subscriptionId]/ plans/ credit-packs/
│   │                    # support-requests/[requestId]/ audit/ coverage/
│   │                    # usage-statistics/ ai-advisor/ ai-resources/
│   │                    # agent-feedback/ external-services/ media-observability/
│   │                    # plugin-observability/ vector-observability/
│   │                    # vector-settings/ runtime-profiles/ service-settings/
│   │                    # site-compliance/ troubleshooting/ auth/login/
│   └── api/
│       ├── portal/[...path]/route.ts      # Portal BFF catch-all
│       ├── admin/[...path]/route.ts       # Admin BFF catch-all
│       ├── admin/advisor/                 # ops-summary value/preview/review/history
│       ├── setup/[...path]/route.ts       # Setup BFF catch-all
│       └── health/route.ts
├── components/
│   ├── ui/              # Button、Card、Modal、Skeleton、Alert、Charts、
│   │                    # Navbar、LocaleSwitcher、ThemeToggle 等通用 primitive
│   ├── admin/           # AdminDataTableFrame、AdminEmptyState、AdminWorkbenchDialog
│   │                    # 等共享 admin primitive（清单见 admin-ui-manifest.json）
│   ├── backoffice/      # BackofficeScaffold
│   └── ErrorBoundary.tsx
├── features/
│   └── admin/           # accounts、support-requests 等 admin 页面模型代码
├── contexts/
│   ├── LocaleContext.tsx
│   └── ThemeContext.tsx
├── hooks/               # useSession、useTranslation、useTheme、useRetry、
│                        # usePortalSiteKnowledge、usePortalSiteMonitoring 等
├── lib/                 # i18n.ts、portal-client.ts、api-client.ts、env.ts、
│                        # safe-response.ts、admin-display.ts 等展示/客户端模块
├── types/
└── proxy.ts             # 开发统一入口（8010）
```

---

## 开发规范

### 代码风格
- 使用 TypeScript 严格模式
- 遵循 ESLint（flat config，`eslint . --max-warnings=0` 必须零告警）
- 组件使用函数式写法
- 使用 Tailwind CSS 进行样式编写

### 命名约定
- 文件：kebab-case (e.g., `site-details.tsx`)
- 组件：PascalCase (e.g., `SiteDetails`)
- 函数/变量：camelCase (e.g., `handleSiteChange`)
- 常量：UPPER_SNAKE_CASE (e.g., `API_BASE_URL`)

### API 调用规范
前端不直接实现业务 API 路由：portal/admin/setup 流量统一经过
`src/app/api/**/[...path]/route.ts` BFF catch-all 代理到 Cloud 后端。
响应解析统一走 `src/lib/safe-response.ts` 的 `readResponsePayload`；
错误负载携带 `message` 与可选 `error_code`（BFF 自身失败使用 `proxy.*` 错误码）。

### 组件规范
- 所有页面组件应处理 Loading、Error、Not Authenticated 状态
- 使用 useSession hook 进行会话管理
- Admin 页面遵循 `docs/cloud-admin-ui-standard-v1.md` 的共享 primitive 与
  `--admin-*` token，不新增 route-local modal overlay 或重复 geometry 字面量

---

## 下一步行动

1. **完成 P1 体验优化** - 在核心功能完成后进行
   - 添加页面切换动画
   - 实现数据缓存机制

2. **完善 P2-2 使用量图表** - 在 Usage 页面集成图表组件
   - 按天使用量趋势图
   - 按模型使用量分布图（出现明确客户任务后）

---

## 文档更新记录

| 日期 | 更新内容 | 作者 |
|------|----------|------|
| 2026-03-23 | 初始文档创建，完成 P0-1 到 P0-4 | Cline |
| 2026-03-23 | 完成 P0-5 管理员后台 | Cline |
| 2026-03-23 | 完成 P2-1 API Keys 管理页面 | Cline |
| 2026-03-23 | 完成 P1 体验优化组件（Skeleton、Alert、ErrorBoundary、Charts） | Cline |
| 2026-03-23 | 完成 P2-3 通知设置页面 | Cline |
| 2026-03-23 | 完成 P2-4 集成中心（Webhooks + 第三方集成） | Cline |
| 2026-09-21 | cleanup wave 重校准：删除不存在的 /portal/keys、/portal/notifications 等条目，路由清单与项目结构对齐实际代码，修正技术栈版本与 zh-TW 口径，移除与 P2-4 边界矛盾的 Webhook 待办 | cleanup wave |
