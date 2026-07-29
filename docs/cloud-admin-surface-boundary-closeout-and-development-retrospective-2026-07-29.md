# Cloud Admin 界面边界收尾与开发复盘 — 2026-07-29

状态：本轮界面边界调整已合并并完成 M4 开发环境验收；方法与经验已固化。

范围：归纳围绕 Cloud Admin 表格、弹窗、表单和空状态边界的讨论、判断、
实现、验证与交付过程，给后续人类和 AI 开发者提供可复用的工作方法。

本文是带日期的历史记录和实施说明，不替代
[Cloud Admin UI Standard v1](cloud-admin-ui-standard-v1.md)、
[Cloud Admin Frontend Engineering Standard v1](cloud-admin-frontend-engineering-standard-v1.md)
或 `frontend/admin-ui-manifest.json`。本文不授权全站视觉重构、生产部署或
Cloud/WordPress 所有权变化。

## 1. 结论

后台界面不应追求“全部有边框”或“全部无边框”。边界必须表达结构、交互、
状态或不完整性中的至少一种语义。

本轮形成的规则是：

| 表面 | 规范边界 | 原因 |
| --- | --- | --- |
| 短、固定配置表，通常不超过六行 | 只保留表头底线，正文依靠对齐和留白 | 字段是一个连续设置组，不需要把每行切成独立对象 |
| 数据表或比较表 | 安静表头与低对比度正文行分隔 | 操作者需要横向比较重复对象 |
| 弹窗或抽屉 | 安静实线外框、标题栏和底部操作区分隔 | 表达独立工作上下文与稳定操作区 |
| 输入框、选择器、文本域 | 可见实线与焦点状态 | 表达可编辑性和键盘焦点 |
| 面板内部章节 | 优先留白，必要时一条实线 | 避免重复框套框 |
| 空状态或拖放目标 | 共享 primitive 的低对比度虚线 | 表达尚未创建或可插入的目标 |
| 加载、状态、披露或普通内容 | 禁止虚线 | 虚线不能成为通用装饰 |

因此，`border-style: dashed` 不是后台统一风格。普通表格、弹窗、控件、
状态和 disclosure 不得直接使用虚线。去掉正文分隔线也不等于去掉弹窗、
表头、控件或焦点边界。

## 2. 问题如何演进

### 2.1 初始观察：边框太多，但不能先选 CSS

最初问题来自外部服务配置弹窗。连续配置行同时存在弹窗外框、标题栏、
表头、正文行线、输入框和底部操作区边界，视觉层级过密。

如果直接把所有边框替换为 `dashed`，会产生三个问题：

1. 完整配置看起来像“待补充”或“可拖放”状态；
2. 数据、交互、状态和容器边界失去语义区别；
3. 后续页面会复制一个没有适用条件的 CSS 偏好。

因此本轮没有从 `border-style` 开始，而是先识别每条线承担什么任务。

### 2.2 关键判断：区分配置表和数据表

主要矛盾不是“实线还是虚线”，而是此前把两种不同信息结构当成了同一种表：

- 数据表由多个重复对象组成，需要逐行比较和定位；
- 短配置表由一个固定对象的少量字段组成，表头和列对齐已经足以表达关系。

两者都保留语义化 `<table>` 结构，但视觉边界不同：

- 数据表：`rows`；
- 短配置表：`header-only`。

这比全局删除 `border-b` 更安全，也比逐页面写例外更容易治理。

### 2.3 为什么修改后仍会看到边框

本轮只移除了短配置表正文行分隔。以下边界仍然是预期结果：

- 弹窗外框；
- 弹窗标题栏与底部操作区分隔；
- 配置表表头底线；
- 输入框、复选框和按钮边界；
- 数据表正文行分隔；
- 键盘焦点、选择态、错误态和危险状态边界。

如果正文行线仍然存在，还必须先确认实际运行版本。讨论过程中曾出现当前工作区
位于另一条功能分支、而 `origin/master` 已包含新改动的情况。浏览器可能运行
旧分支、旧构建或旧预览；这不是继续修改 CSS 的依据。

正确核对链是：

```text
当前页面
-> 实际运行的工作树和分支
-> source revision
-> 合并 PR
-> M4 或目标环境部署 revision
```

“分支落后 `origin/master` 若干提交”只表示当前分支没有包含远端主分支的最新
提交，不自动表示本地代码错误，也不授权重置、覆盖或混合用户未提交工作。

## 3. 实施结果

PR `#355`（`Refine short admin configuration boundaries`）将规则写入标准、
manifest、共享组件、契约测试和 PC 视觉基线。合并 revision 为
`5958d3232a90b67bc2614db898c388abd40c2bb5`。

### 3.1 共享实现

`AdminConfigurationTable` 的边界从 `rows` 改为 `header-only`：

- 保留语义化表头和三列结构；
- 移除 `<tbody>` 的 `divide-y`；
- 不恢复圆角外框；
- 输入、选择和其他交互控件继续拥有自己的实线边界；
- `data-boundary="header-only"` 作为可测试合同。

### 3.2 已覆盖的后台区域

共享组件在合并时覆盖五个路由、八处短配置区：

| 路由 | 配置区 |
| --- | --- |
| `/admin/external-services` | Tavily、Unsplash 等外部服务配置 |
| `/admin/ai-resources` | Provider 连接配置、模型维护 |
| `/admin/runtime-profiles` | Runtime Profile 配置 |
| `/admin/vector-settings` | 固定向量档案、验证结果 |
| `/admin/service-settings` | Portal 公共地址、USD/CNY 核算汇率 |

这不是只针对 Tavily 的 route-local 修补。共享组件让现有使用方同步获得规则，
后续符合条件的短配置区也应复用同一 primitive。

### 3.3 没有批量修改的页面

以下页面保留正文行分隔是有意设计：

- `/admin/accounts`、`/admin/subscriptions`、`/admin/support-requests`、
  `/admin/plans`、`/admin/portal-users` 等对象队列；
- `/admin/site-compliance` 的规则、版本和发布数据表；
- 对象详情中的审计记录、事件历史和重复数据；
- 诊断页面中的日志、异常和证据列表。

`/admin/credit-packs` 的目录项需要比较对象，`/admin/site-compliance` 的多个
表格需要比较规则与版本，因此不能仅因 manifest 将路由分类为
`configuration` 就套用 `header-only`。页面模型决定任务，具体信息结构决定
表面边界。

## 4. 规范如何形成闭环

本轮没有只改 CSS，而是建立四层一致性：

1. **文字规范**
   `docs/cloud-admin-ui-standard-v1.md` 说明适用条件、禁止项和判断顺序。
2. **机器可读策略**
   `frontend/admin-ui-manifest.json` 固定
   `configurationTableBoundary=header-only`、
   `dataTableBoundary=rows`、弹窗和控件使用实线、虚线只属于
   `AdminEmptyState`。
3. **共享实现**
   `AdminConfigurationTable` 承担短配置表的语义和几何，route 不重复写
   table framing。
4. **防回退证据**
   结构契约拒绝 `divide-y` 回归，Playwright 检查实际行边界，固定 PC
   截图覆盖关键工作台。

其中任何一层单独存在都不完整：

- 只有文档，后续代码容易漂移；
- 只有组件，适用范围不清；
- 只有截图，不能证明语义、可访问性或运行版本；
- 只有 CI，不能替代操作者视觉判断。

## 5. 后续开发的判断方法

### 5.1 先判断信息结构

使用 `AdminConfigurationTable` 前必须同时满足：

- 表示一个固定设置组，而不是多个业务对象；
- 字段短、稳定，通常不超过六行；
- 三列“设置项 / 当前值 / 操作或说明”能够提高扫描效率；
- 行之间不需要独立选择、排序、分页或批量操作；
- 父级已经提供工作面边界，不需要再加一层外框。

任一条件不满足，应选择数据表、设置目录、编辑器、详情列表或 disclosure。

### 5.2 再判断边界语义

新增一条线之前依次询问：

1. 对齐和留白是否已经足够？
2. 关系仍不清楚时，一条低对比度实线是否足够？
3. 该表面是否有独立所有权，确实需要实线外框？
4. 它是否明确表示空、未创建或可拖放目标，才允许虚线？

如果不能说明边界表达的语义，就不应添加。

### 5.3 不以页面类别批量替换 CSS

禁止使用全局机械替换把 Admin 中的 `border-b`、`divide-y` 或 `border`
批量删除。相同 CSS 在不同位置可能分别表示：

- 数据行边界；
- 标题和正文边界；
- inspector 分区；
- 危险操作区；
- 选择或焦点状态；
- 可编辑控件。

先盘点 shared primitive，再迁移一个明确表面。不得以“统一视觉”为理由混入
API、保存事务、凭据、审计或 Cloud/WordPress 所有权变化。

## 6. 实施工作流

以后处理类似反馈时，使用以下顺序：

1. 运行 `git status --short --branch`，确认脏工作和实际分支；
2. 读取 Admin UI standard、frontend engineering standard 和 manifest；
3. 记录页面模型、操作者任务、动作层级、状态所有权和 PC gate；
4. 在真实页面中区分容器、数据、配置、控件、状态和空状态边界；
5. 优先修改共享 primitive，不在 route 中增加视觉例外；
6. 同步更新 standard、manifest、结构契约和必要的视觉基线；
7. 先运行聚焦契约，再运行 `check:admin-ui`；
8. 共享布局变化运行 `check:admin-ui:visual` 并人工检查 actual screenshot；
9. 精确暂存本次文件，提交并通过受保护 PR 合并；
10. 应用源码变化按 M4 规范生成 candidate；合并后只对当前干净
    `origin/master` 执行 promotion；
11. 分开报告本地、CI、M4、生产和人工验收，不跨级推断。

文档或仓库政策变更默认不需要 M4；验证链接、格式、release policy 和
docs-only gate 即可。

## 7. 验证与证据

PR `#355` 的交付证据包括：

- Admin UI 结构门禁通过；
- frontend contracts 通过；
- 22 个 PC 视觉用例通过；
- 外部服务、Provider、Runtime Profile 和 Service Settings 四组固定截图
  已审查；
- GitHub required checks 和 CodeQL 通过；
- PR 合并后，当前 `master` 在 M4 上完成所需重建；
- M4 状态记录：
  - `acceptance_state=accepted`
  - `promotion_pr=355`
  - `source_revision=5958d3232a90b67bc2614db898c388abd40c2bb5`
  - `source_branch=master`
  - `source_dirty=false`
  - `/=200`
  - `/health/live=200`

这些证据只证明精确合并版本在开发验收环境中的状态。它们不证明生产部署、
真实操作员验收或 GA。

## 8. 工作审视报告

### 8.1 原定目标

- 判断后台是否适合使用虚线或减少边框；
- 将判断扩展为其他后台页面可复用的统一规范；
- 实现共享改造并防止回退；
- 解释为什么页面仍可能看到边框；
- 完成提交、推送、PR、CI 和 M4 开发验收；
- 将过程整理成仓库内的长期方法。

### 8.2 完成情况

- [x] 已区分配置表、数据表、弹窗、控件和空状态边界；
- [x] 已将短配置表改为 `header-only`；
- [x] 已覆盖五个路由、八处配置区；
- [x] 已写入 standard、manifest 和自动检查；
- [x] PR `#355` 已合并，M4 accepted 证据已绑定精确 revision；
- [x] 本文完成历史、经验和后续方法收束；
- [ ] 未执行生产部署或人工可用性签字；两者不属于本轮授权。

### 8.3 发现的问题与纠偏

| 严重程度 | 具体问题 | 根本原因 | 改进方法 |
| --- | --- | --- | --- |
| 必须改正 | 初始问题容易被简化为“实线换虚线” | 从 CSS 属性出发，没有先识别信息结构和状态语义 | 先完成表面分类，再选择 shared primitive 和 token |
| 必须改正 | 页面仍有边框时容易继续删除必要边界 | 把“正文行线移除”误解为“整体无边框” | 在验收清单中逐项区分表头、正文、弹窗、控件和焦点边界 |
| 必须改正 | 旧分支或旧运行版本会被误判为样式未生效 | 没有先建立 source、branch、build、runtime revision 证据链 | 截图或改 CSS 前先确认实际运行 revision |
| 应当改正 | 单页视觉修补容易遗漏其他相同配置区 | route-local 思维，没有先盘点共享组件使用方 | 先统计 primitive consumers，再决定共享或局部变更 |
| 应当改正 | “其他页面也统一”容易演变为全局去边框 | 把一致性误解为相同 CSS，而不是相同判断规则 | 统一语义决策，不统一所有视觉结果 |
| 应当改正 | 文档、代码和测试可能分别正确但彼此不一致 | 缺少可执行 manifest 连接规范和实现 | 每次 shared UI 变化同步检查四层闭环 |
| 建议改进 | 视觉优化可能不断发现新微调点 | 没有预先定义停止条件 | shared rule、关键 PC evidence 和真实缺陷关闭后即冻结 |

### 8.4 做得有效的部分

- 保留了用户脏工作，使用独立工作树处理正式变更；
- 从真实代码、manifest、组件使用方和截图出发，而不是凭偏好下结论；
- 保留数据表和交互控件的必要边界，没有追求极端“无边框”；
- 将一次具体反馈提炼为文字规范、机器策略、共享实现和自动门禁；
- CI、M4、生产与人工验收分别报告，没有把 `200` 或截图写成发布结论；
- 在主分支前进后重新同步、验证并提升精确合并版本。

### 8.5 下次重点关注

- 先确认浏览器运行的是哪个分支和 revision，再解释“未生效”；
- 只有短、固定、三列配置组才使用 `header-only`；
- 不批量删除 Admin 中的边框类；
- 共享边界变化必须同时审查最长文案、焦点、错误、禁用和危险状态；
- 真实操作失败优先于纯视觉微调，达到停止条件后冻结。

## 9. 最小审查清单

提交新的 Admin 边界改动前，确认：

- [ ] 页面模型和实际信息结构已分别判断；
- [ ] 每条保留或新增的边界都有明确语义；
- [ ] 短配置表没有正文行分隔和重复外框；
- [ ] 数据表仍能逐行扫描；
- [ ] 控件、焦点、选择、错误和危险状态仍清晰；
- [ ] 虚线只来自获准的 empty/drop-target primitive；
- [ ] 没有新增 route-local table shell 或 geometry literal；
- [ ] standard、manifest、shared primitive 和 contract 一致；
- [ ] PC actual screenshot 已人工检查，而非只更新 snapshot；
- [ ] 实际运行 branch 和 revision 已记录；
- [ ] 验收结论没有跨越本地、CI、M4、生产或人工边界。

## 10. 权威参考

- [Cloud Admin UI Standard v1](cloud-admin-ui-standard-v1.md)
- [Cloud Admin Frontend Engineering Standard v1](cloud-admin-frontend-engineering-standard-v1.md)
- [Cloud Admin UI 开发复盘与工作方法](cloud-admin-ui-development-retrospective-2026-07-27.md)
- [正式生产发布时机与后台设置页冻结复盘](production-release-timing-and-admin-settings-freeze-retrospective-2026-07-28.md)
- [Development and Validation Operating Model v1](development-validation-operating-model-v1.md)
- [M4 Preview AI Development Standard v1](m4-preview-ai-development-standard-v1.md)
- `frontend/admin-ui-manifest.json`
- `frontend/src/components/admin/AdminConfigurationTable.tsx`
- `frontend/tests/unit/admin-ui-governance-contract.mjs`
