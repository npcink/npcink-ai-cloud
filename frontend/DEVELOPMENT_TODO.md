# Cloud Frontend 待开发清单

## 项目概述

当前 `cloud/frontend` 是一个基于 Next.js 的 Cloud Web surfaces 工作区，承接当前已上线的 Cloud Web、Portal 与 Admin 界面。

当前阶段口径固定如下：

- `/(marketing)/*`
  - marketing / onboarding / product information surface
  - 不是签约后 customer center
- `/admin/*`
  - operator / platform-admin / internal admin 页面
  - 不是 customer-facing front-office
- `/portal/*`
  - authenticated member portal surface
  - 只承接 bounded Portal session/member/site surfaces、usage/billing/key/audit 的受限自助能力
  - 不代表 checkout/payment/invoice/reconciliation、seat lifecycle、完整 customer success front-office 已开始交付

因此，本文件是“当前 Cloud frontend surfaces 的迭代清单”，不是 customer commercial front-office 路线图。

## 当前阶段边界

- 已落地：
  - marketing / onboarding pages
  - operator/admin `/admin/*`
  - authenticated member `/portal/*`
- 仍未开始：
  - customer-facing commercial front-office
  - 正式 self-serve checkout/payment/invoice/reconciliation
  - 正式 seat lifecycle / dunning / customer billing ops center

## 技术栈

- **框架**: Next.js 14+ (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **状态管理**: React Context + Hooks
- **API 通信**: Fetch API

---

## 已落地页面与能力

以下内容表示“代码已存在或 bounded member/admin surface 已可读”，不表示“Cloud 可以长成第二控制面”。

### ✅ Portal member surfaces

这些页面属于 authenticated member `/portal/*`，不应被扩写成第二控制面。

- [x] Usage
  - `/api/portal/sites/[siteId]/usage-summary`
  - `/api/portal/sites/[siteId]/entitlements`
  - `/portal/usage`
- [x] Audit
  - `/api/portal/sites/[siteId]/audit`
  - `/api/portal/sites/[siteId]/audit/summary`
  - `/portal/audit`
- [x] Billing
  - `/api/portal/sites/[siteId]/billing`
  - `/api/portal/sites/[siteId]/billing/reconciliation`
  - `/portal/billing`
- [x] Site summary / details
  - `/api/portal/sites/[siteId]/details`
  - `/portal/sites/[siteId]`
- [x] API Keys member seam
  - `/api/portal/sites/[siteId]/keys`
  - Portal key management remains scoped under site detail surfaces.
- [x] Support and recovery
  - `/portal/support`
  - `/portal/support/[requestId]`
  - site detail and recent activity use the authenticated ticket path for
    customer follow-up
- [ ] Notifications and third-party integrations
  - customer pages are intentionally not exposed in the current bounded Portal
  - historical backend seams do not count as a shipped customer experience

### ✅ Operator/admin surfaces

这些页面属于 `/admin/*`，是 operator/platform-admin/internal admin 面，不是 customer-facing front-office。

- [x] 管理员 API 客户端方法 (portal-client.ts)
- [x] 管理员 API 路由
  - [x] `GET /api/admin/overview` - 总览数据
  - [x] `GET /api/admin/accounts` - 账户列表
  - [x] `GET /api/admin/accounts/[accountId]` - 账户详情
  - [x] `GET /api/admin/sites` - 站点列表
  - [x] `GET /api/admin/sites/[siteId]` - 站点详情
  - [x] `GET /api/admin/subscriptions` - 订阅列表
  - [x] `GET /api/admin/subscriptions/[subscriptionId]` - 订阅详情
- [x] 管理员页面
  - [x] `/admin` - 管理员总览（统计卡片、Runtime 健康、即将到期订阅、需要关注的订阅）
  - [x] `/admin/accounts` - 账户列表（筛选、表格展示）
  - [x] `/admin/sites` - 站点列表（筛选、表格展示）
  - [x] `/admin/subscriptions` - 订阅列表（筛选、表格展示）
  - [x] `/admin/accounts/[accountId]` - 账户详情
  - [x] `/admin/sites/[siteId]` - 站点详情
  - [x] `/admin/subscriptions/[subscriptionId]` - 订阅详情

**当前定位**:
- 总览仪表板显示账户/站点/订阅统计
- Runtime 健康监控（Queued Runs、Callback Failed、Guard Events）
- 即将到期订阅提醒（7 天/30 天）
- 需要关注的订阅列表
- 账户/站点/订阅列表筛选和搜索
- 统一的状态标签样式
- 响应式表格布局

**详情页面功能**:
- 账户详情：状态卡片、订阅列表、成员列表
- 站点详情：状态卡片、订阅信息、使用量摘要、账单摘要、Runtime 摘要、快速操作
- 订阅详情：状态卡片、账单周期、使用量摘要、账单摘要、状态历史、快速操作

## 已完成 UI 组件

### ✅ 通用 UI 组件库

#### 骨架屏组件 (Skeleton.tsx)
- [x] `Skeleton` - 基础骨架屏
- [x] `SkeletonText` - 文本骨架屏
- [x] `SkeletonCard` - 卡片骨架屏
- [x] `SkeletonTable` - 表格骨架屏
- [x] `SkeletonChart` - 图表骨架屏
- [x] `SkeletonList` - 列表骨架屏

#### 警告提示组件 (Alert.tsx)
- [x] `Alert` - 通用警告/提示组件（支持 info、success、warning、error）
- [x] `ErrorDisplay` - 错误显示组件
- [x] `LoadingDisplay` - 加载提示组件
- [x] `EmptyState` - 空状态组件

#### 错误边界 (ErrorBoundary.tsx)
- [x] `ErrorBoundary` - 类组件错误边界
- [x] `useErrorBoundary` - 函数组件错误边界钩子

#### 图表组件 (Charts.tsx)
- [x] `BarChart` - 条形图组件（纯 CSS 实现）
- [x] `StackedBarChart` - 堆叠条形图组件
- [x] `LineChart` - 折线图组件（SVG 实现）
- [x] `PieChart` - 饼图组件（SVG 实现）
- [x] `StatCard` - 统计卡片组件

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

```
cloud/frontend/
├── src/
│   ├── app/
│   │   ├── portal/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx              # Portal 首页
│   │   │   ├── usage/
│   │   │   │   └── page.tsx          # 使用量页面 ✅
│   │   │   ├── audit/
│   │   │   │   └── page.tsx          # 审计日志页面 ✅
│   │   │   ├── billing/
│   │   │   │   └── page.tsx          # 账单页面 ✅
│   │   │   ├── sites/
│   │   │   │   └── [siteId]/
│   │   │   │       └── page.tsx      # 站点详情页面 ✅
│   │   │   ├── keys/
│   │   │   │   └── page.tsx          # API Keys 管理 ✅
│   │   │   ├── notifications/
│   │   │   │   └── page.tsx          # 通知设置页面 ✅
│   │   │   └── login/
│   │   │       └── page.tsx          # 登录页面
│   │   ├── api/
│   │   │   └── portal/
│   │   │       └── sites/
│   │   │           └── [siteId]/
│   │   │               ├── usage-summary/
│   │   │               │   └── route.ts    # ✅
│   │   │               ├── entitlements/
│   │   │               │   └── route.ts    # ✅
│   │   │               ├── audit/
│   │   │               │   ├── route.ts    # ✅
│   │   │               │   └── summary/
│   │   │               │       └── route.ts # ✅
│   │   │               ├── billing/
│   │   │               │   ├── route.ts    # ✅
│   │   │               │   └── reconciliation/
│   │   │               │       └── route.ts # ✅
│   │   │               ├── details/
│   │   │               │   └── route.ts    # ✅
│   │   │               ├── keys/
│   │   │               │   └── route.ts    # ✅
│   │   │               └── notifications/
│   │   │                   └── route.ts    # ✅
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Navbar.tsx
│   │   │   ├── ThemeToggle.tsx
│   │   │   ├── LocaleSwitcher.tsx
│   │   │   ├── Skeleton.tsx          # ✅
│   │   │   ├── Alert.tsx             # ✅
│   │   │   └── Charts.tsx            # ✅
│   │   └── ErrorBoundary.tsx         # ✅
│   ├── contexts/
│   │   ├── LocaleContext.tsx
│   │   └── ThemeContext.tsx
│   ├── hooks/
│   │   └── useSession.ts
│   └── lib/
│       ├── portal-client.ts
│       ├── env.ts
│       └── utils.ts
```

---

## 开发规范

### 代码风格
- 使用 TypeScript 严格模式
- 遵循 ESLint + Prettier 配置
- 组件使用函数式写法
- 使用 Tailwind CSS 进行样式编写

### 命名约定
- 文件：kebab-case (e.g., `site-details.tsx`)
- 组件：PascalCase (e.g., `SiteDetails`)
- 函数/变量：camelCase (e.g., `handleSiteChange`)
- 常量：UPPER_SNAKE_CASE (e.g., `API_BASE_URL`)

### API 路由规范
所有 API 路由应遵循以下响应格式：

```typescript
// 成功响应
{
  status: 'ok',
  data: { ... }
}

// 错误响应
{
  status: 'error',
  error_code: 'error.code',
  message: 'Error message'
}
```

### 组件规范
- 所有页面组件应处理 Loading、Error、Not Authenticated 状态
- 使用 Suspense 进行流式加载
- 使用 useSession hook 进行会话管理

---

## 下一步行动

1. **完成 P1 体验优化** - 在核心功能完成后进行
   - 添加页面切换动画
   - 实现数据缓存机制

2. **完善 P2-2 使用量图表** - 在 Usage 页面集成图表组件
   - 按天使用量趋势图
   - 按模型使用量分布图

3. **完善 P2-4 集成中心** - 添加 Webhooks 配置功能
   - Webhook 端点管理
   - 事件类型配置

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
