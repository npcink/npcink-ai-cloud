# Cloud Admin 工单队列收口与开发复盘 — 2026-08-01

状态：阶段功能已合并并在 M4 开发环境接受；人工视觉验收与生产发布仍是独立状态。

范围：从工单页面信息密度审查、全宽队列与按需检查、筛选工具栏收口、
Portal 演示入口和确定性数据，到服务端等待对象与等待时长投影的完整开发链。

本文记录历史、设计思路、自我审视和可复用方法。当前强制规则仍以
[Cloud Admin UI Standard v1](cloud-admin-ui-standard-v1.md)、
[Cloud Admin Frontend Engineering Standard v1](cloud-admin-frontend-engineering-standard-v1.md)、
[Development and Validation Operating Model v1](development-validation-operating-model-v1.md)
和 [ADR-038](decisions/038-server-owned-support-waiting-state-projection.md)
为准。本文不授权生产部署、Cloudflare 修改、WordPress 写入、AI 自动回复、
工单分配或新的 SLA 控制中心。

## 1. 原始问题与目标

最初截图暴露的核心问题不是颜色或圆角，而是操作面与页面空间不匹配：

- 页面头部和卡片之间存在大块无信息空白；
- 队列与常驻检查器并排时，空数据或短队列仍为检查器预留宽度；
- 多组筛选分两行，PC 横向空间没有转化为扫描效率；
- 每条工单的生命周期状态存在，但“谁在等谁、等了多久”没有真实数据；
- 空工单页无法支持视觉验收，需要可重复、边界清楚的演示数据；
- 本地回环入口、Portal 开发登录和宿舍远程 Cloudflare 预览被混在同一问题里。

阶段目标因此定义为：

1. 让 PC 操作者在一个首屏内看见真正的工作队列；
2. 使用全宽队列承载重复比较，详情按需出现；
3. 保持四个筛选和两个操作在 `1440px` 下一个稳定工具栏行；
4. 让风险排序基于服务端全局事实，而不是当前页或浏览器猜测；
5. 用等待对象、等待开始和首次响应表达会话轮次；
6. 建立从本地 fixture、M4 candidate、PR/CI、合并、M4 accepted 到人工验收的诚实证据链。

## 2. 交付历史

| 阶段 | 合并证据 | 解决的问题 |
| --- | --- | --- |
| Query-first 基线 | PR `#353`, `4532c533` | URL、请求取消、占位/保留结果、失败重试和 mutation invalidation 有明确状态所有者 |
| 全局风险排序 | PR `#387`, `fd94426e` | 服务端先做全局风险排序再分页，详情返回队列上下文 |
| 全宽队列与按需检查 | PR `#436`, `0642b7b0` | 移除常驻空检查器宽度，使用语义表格和共享 `AdminContextDrawer` |
| 单行 PC 筛选 | PR `#438`, `5c1d63af` | 四个筛选和 Apply/Clear 在 PC 上保持一行，并有几何回归断言 |
| 队列到详情闭环 | PR `#439`, `1fe9293a` | 失败/成功公开回复、返回上下文、焦点恢复和结构化视觉收据形成跨路由证据 |
| 确定性 Portal 演示数据 | PR `#447`, `84548c2c` | 为 `site_smoke` 提供可重复 Portal 演示夹具和测试，不依赖偶然数据库状态 |
| 等待状态与超时语义 | PR `#450`, `6fd4e5a1` | 服务端等待对象、等待时长、首次响应、attention 筛选、迁移回填和 Admin 展示 |

PR `#450` 的 GitHub 必需检查结果为 `17` 成功、`2` 跳过、`0` 失败。
合并后从干净 operations worktree promotion，最终 M4 证据为：

```text
acceptance_state=accepted
promotion_pr=450
source_revision=6fd4e5a12d5d31c08d7518e6721f0913d5f8e16a
source_branch=master
source_dirty=false
alembic_revision=20260801_0078 (head)
/=200
/health/live=200
```

这是开发环境接受证据，不是生产发布或人工视觉接受。

## 3. 关键设计思路

### 3.1 从空白区域追到页面模型，而不是先改 CSS

大块空白的根因是页面仍按“队列 + 常驻检查器”分配空间，而操作者的主任务是
先扫描和排序工单。正确改法是让队列恢复全宽，把检查放进按需抽屉或详情页。

判断顺序应是：

1. 当前页面模型和操作者任务是什么；
2. 哪个工作面需要持续占据空间；
3. 哪些信息只在选中对象后才有价值；
4. 最后才调整网格、间距和列宽。

### 3.2 信息密度来自减少结构浪费

高密度不是把所有字体和控件变小。有效密度来自：

- 让横向空间用于重复字段比较；
- 一个表格只保留一次表头、行分隔和状态表达；
- 把低频详情移到按需入口；
- 把相近筛选合并为一个清晰视图选择器；
- 正常状态保持安静，等待客服和超时获得更高权重；
- 空状态只占完成解释和恢复所需的空间。

### 3.3 工单状态不等于工作队列状态

`open`、`in_progress`、`resolved`、`closed` 描述生命周期；“等待客服”、
“等待客户”和“已完成”描述公开会话轮次。二者不能互相替代。

如果浏览器根据 `status`、`created_at` 或 `updated_at` 推断等待对象，会遇到：

- 内部备注错误重置客户等待时间；
- 公开附件不参与会话轮次；
- 已解决紧急工单仍被显示为高危；
- Portal、Admin 和后端各自形成一套规则。

因此 PR `#450` 将等待状态作为服务端事务投影。UI 只负责呈现和 URL 视图，
不拥有第二个状态机。详细决策见 ADR-038。

### 3.4 排序必须发生在分页之前

当前页排序只能回答“这一页谁排前面”，不能回答“全局最该处理谁”。支持队列
必须由服务端完成筛选、风险计算和排序，再分页返回。浏览器可以展示规则，
但不得重新排列一页并将其称为全局风险顺序。

### 3.5 演示数据是验收基础设施，但不是生产证据

空数据库无法证明正常队列密度、长标题、等待时长、抽屉和详情闭环。确定性
fixture 和 `site_smoke` 演示数据应覆盖有代表性的状态，并可重复建立。

同时必须标注数据模式：

- Playwright fixture 证明确定性交互；
- 本地 seed 证明开发演示路径；
- M4 数据证明当前开发运行环境；
- 真实用户和生产数据需要独立授权与验收。

不应把 mock/E2E 描述成真实用户验收，也不应为了“看起来有数据”修改生产。

### 3.6 预览入口必须按消费者区分

| 消费者 | 正确入口 | 说明 |
| --- | --- | --- |
| 本机 Portal 开发会话 | `http://127.0.0.1:18010/portal/dev-entry?...` | 需要前台 M4 tunnel、开发入口启用和演示身份/站点绑定 |
| 本机 Admin 开发会话 | `http://127.0.0.1:18010/admin/dev-entry?...` | 只接受 `/admin` 内部 redirect |
| 宿舍/远程人工预览 | `https://cloud.mqzjmax.top` | 通过 Cloudflare Access 的浏览器会话，不使用本机回环地址 |
| WordPress 开发连接器 | `http://127.0.0.1:18010` | 需要 JSON，不应指向可能返回 Access 登录 HTML 的公网域名 |

Portal 开发入口停在登录页时，应分别检查：入口是否启用、外部 origin、开发
身份、`site_smoke` 绑定和后端可达性。不要把一个登录页当成 UI 功能证据。

## 4. 实施方法

### 4.1 先刷新当前基线

本阶段最重要的一次纠偏是：初始建议建立在落后 `master` 的页面印象上，而
最新 `origin/master` 已经包含全宽队列、按需抽屉、单行筛选、全局排序和浏览器
闭环。继续按旧基线实施会重复已经完成的工作。

因此每次后续任务必须：

1. `git fetch origin`；
2. 比较当前 checkout、`origin/master` 和目标路由最近提交；
3. 阅读现有 closeout、manifest 和拥有该行为的测试；
4. 只实现当前基线仍缺失的下一层问题。

### 4.2 保留用户的脏工作树

共享检出已有他人改动时，本阶段使用干净、锁定的 `codex/*` worktree，精确
暂存 16 个任务文件。没有 reset、stash、`git add -A` 或覆盖共享 M4 所有者。

### 4.3 用一条垂直切片完成状态语义

等待状态不是一个前端标签补丁。完整切片包括：

```text
model + reversible migration
  -> repository transactional transitions
  -> domain/API projection and Portal denylist
  -> server filters, summary, risk order
  -> frontend URL/type/presentation
  -> domain/API/migration/Vitest/Playwright evidence
```

只改其中一层会产生漂移：例如 UI 有“超时”但服务端分页不认识，或迁移只
回填消息却遗漏附件。

### 4.4 测试先证明状态机，再证明布局

本阶段的有效验证顺序是：

1. 领域测试证明全局排序、summary 和 attention；
2. API 流程证明客户、客服、内部备注、附件、解决、重开、通知失败和 Portal
   非泄露；
3. 迁移往返证明消息/附件回填、内部事件忽略、约束、索引和 downgrade；
4. Vitest 证明 URL 查询和前端风险映射；
5. Playwright 证明 PC 工具栏、队列、抽屉、详情、返回上下文和移动端 overflow；
6. `check:admin-ui` 与视觉矩阵证明共享治理没有退化；
7. M4 PostgreSQL 与 focused tests 证明真实容器迁移和运行路径；
8. GitHub 必需检查决定合并，干净 `master` promotion 决定 M4 accepted。

`check:fast` 在隔离 worktree 因没有 `.env` 而在启动本地 Docker 前退出。
正确处理是保留事实、不复制密钥、不把作者 Mac 变成未授权运行时；随后由
聚焦本地检查、M4 容器测试和 GitHub 全量分片完成相应证据。

## 5. 工作审视报告

### 原定目标

提升工单页信息密度，形成全宽队列、按需详情、单行筛选和真实可执行的
下一阶段工单优先级语义，并最终合并、接受和可供人工预览。

### 完成情况

- [x] 全宽语义队列和按需抽屉已合并；
- [x] 四个筛选与两个操作在 PC 端单行；
- [x] 队列与详情公开回复闭环有浏览器证据；
- [x] `site_smoke` 确定性 Portal 演示夹具已合并；
- [x] 等待对象、等待时长、首次响应、超时筛选和历史迁移已合并；
- [x] GitHub CI 全绿，`master` 已在 M4 accepted；
- [ ] 人工视觉接受仍由操作者在受保护公网预览中确认；
- [ ] 生产部署、工单分配、AI 回复和可配置 SLA 不在本阶段范围。

### 发现的问题

| 严重程度 | 具体问题 | 根本原因 | 改进 |
| --- | --- | --- | --- |
| 必须改正 | 初始下一阶段建议没有先刷新 `origin/master`，重复建议了已合并的全宽队列和按需抽屉 | 把对话截图和旧 checkout 当作当前集成真相 | 任何后续建议先 fetch、查最近 PR/路由历史和现有 closeout |
| 必须改正 | 第一版迁移回填只考虑公开消息，审阅时才发现历史公开附件也能决定等待对象 | 状态机设计先从主要事件出发，没有先枚举所有同权事件族 | 写迁移前建立事件矩阵，至少覆盖消息、附件、内部事件、反馈、解决和重开 |
| 应当改正 | 用户多次追问“怎么预览、现在能不能预览、为什么还在登录页” | 实现状态和可访问入口没有在每个阶段一起交付 | UI 更新同时报告 URL、消费者、登录/seed 前置条件和当前 evidence state |
| 应当改正 | 空工单页难以判断真实密度 | 只准备代码，没有同步准备代表性可重复数据 | 把确定性 fixture/seed 作为视觉验收计划的一部分，并标注数据模式 |
| 应当改正 | `check:fast` 在隔离 worktree 失败后才明确其 `.env`/本地 Docker 前置条件 | 选择门禁前没有先确认命令的运行环境契约 | 先分类 source/static、M4 runtime、GitHub CI；不在缺密钥 worktree 盲跑 Docker wrapper |
| 建议改进 | 视觉、数据语义、演示入口和发布链集中在一个长任务中 | 用户按阶段连续授权，任务自然扩展但没有每阶段重新写小结 | 每个阶段保留一张“已完成 / 当前真相 / 下一步 / 非目标”小表，减少历史重查 |

### 做得好的地方

- 用户截图反馈被转化为页面模型、工具栏几何和服务端状态规则，而不是一次性像素修补；
- 没有用前端第五状态替代既有四状态合同，而是分离生命周期和等待对象；
- 保持 Portal 客户投影与 Admin 内部调度证据隔离；
- 在提交前进行五轴代码审阅，并实际修正附件回填遗漏；
- 精确区分 local verified、candidate、PR verified、merged、M4 accepted、生产和人工验收；
- 合并后使用干净 operations worktree promotion，没有把候选当作最终真相；
- 原共享工作区、Cloudflare 和生产均未被修改。

### 下次重点关注

1. 给建议前先刷新当前集成基线，特别是连续多轮对话或多个并行 PR 之后；
2. 状态投影先画完整事件矩阵，再写字段、迁移和 UI；
3. 每个可视阶段同时交付预览 URL、登录/seed 前置条件和证据级别；
4. 高信息密度优先通过结构和按需披露获得，不从统一缩小控件开始；
5. 视觉验收必须同时覆盖有数据、空、筛选空、失败保留、长文本和窄屏；
6. 文档与策略进入 docs-only lane，不为“更完整”重复 M4 或应用级全量测试。

## 6. 后续开发规范

### 6.1 工单队列设计清单

- [ ] 页面模型是 queue，操作任务可以一句话说明；
- [ ] 默认队列回答优先级、等待对象、等待时长、身份、状态、范围和下一步；
- [ ] 队列全宽，低频详情按需打开；
- [ ] 频繁筛选和操作在 `1440 x 1050` 下形成稳定一行；
- [ ] 筛选、排序和分页由服务端统一拥有；
- [ ] URL 拥有可分享的筛选、分页和 focus；
- [ ] retained/placeholder 结果明确标注且只读；
- [ ] 内部备注不改变公开会话等待对象；
- [ ] resolved/closed 不继续进入活动风险；
- [ ] 空状态不制造大块结构性空白。

### 6.2 状态投影清单

- [ ] 生命周期状态、等待对象、风险级别和 notification 状态分别定义；
- [ ] 所有能改变等待对象的事件族已枚举；
- [ ] 转移与事件写入同一事务；
- [ ] 首次响应只写一次；
- [ ] 迁移同时覆盖历史消息和附件，并忽略内部活动；
- [ ] Portal/外部投影有明确 denylist 或 schema 边界；
- [ ] summary 与 attention 使用同一服务端语义；
- [ ] 阈值是明确产品规则，不伪装成可配置 SLA。

### 6.3 视觉和运行验收清单

- [ ] ready、empty、filtered-empty、retained-error、selected、returned 已覆盖；
- [ ] 公开回复失败和成功都保留队列上下文；
- [ ] 焦点安全返回，Escape 和键盘行为正确；
- [ ] 最长中文、标题、邮箱、站点 ID 和等待时长可辨；
- [ ] 视口无页面级横向 overflow；
- [ ] fixture、seed、M4 和真实数据证据分别标注；
- [ ] 本地回环、Cloudflare 人工预览和 WordPress connector 使用正确入口；
- [ ] M4 candidate、PR、merge、M4 accepted、生产和人工接受分别报告。

## 7. 下一阶段建议

下一阶段不应立即增加 AI 自动回复或大型 SLA 配置中心。先观察真实工单量和
人工操作阻力，按以下顺序选择最小下一步：

1. 用真实内部工单完成一次人工视觉验收，确认等待对象和 48 小时阈值符合操作习惯；
2. 记录首次响应时长和等待客服数量的样本充分性，不因少量 demo 数据调整规则；
3. 只有出现多人抢单或责任不清时，再设计 assignment owner 和审计合同；
4. 只有固定阈值确实不适合不同套餐/客户层级时，再设计 SLA policy；
5. AI 回复必须是独立的建议、权限、审核、失败和客户沟通项目，不能借工单队列顺带加入。

## 8. 权威参考

- [ADR-038: Server-owned support waiting-state projection](decisions/038-server-owned-support-waiting-state-projection.md)
- [Cloud Admin UI Standard v1](cloud-admin-ui-standard-v1.md)
- [Cloud Admin Frontend Engineering Standard v1](cloud-admin-frontend-engineering-standard-v1.md)
- [Cloud Admin Support Requests Query Closeout](cloud-admin-support-requests-query-closeout-2026-07-29.md)
- [Cloud Admin Phase C Support Request Queue Acceptance](cloud-admin-phase-c-support-request-queue-acceptance-2026-07-12.md)
- [M4 Preview AI Development Standard v1](m4-preview-ai-development-standard-v1.md)
- [M4 Preview Development Workflow](m4-preview-development-v1.md)
- [Development and Validation Operating Model v1](development-validation-operating-model-v1.md)
