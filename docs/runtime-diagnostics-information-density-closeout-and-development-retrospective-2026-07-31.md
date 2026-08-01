# 运行诊断信息密度优化收口与开发复盘 — 2026-07-31

状态：第一阶段应用源码已合并并包含在 M4 accepted `master`；2026-08-01
状态自适应布局跟进已在独立分支完成本地门禁、隔离 M4 候选和认证 PC 浏览器
验证，尚未合并或提升为主 M4 accepted。

范围：`/admin/troubleshooting` 的只读 Cloud 运行诊断工作面、编辑辅助质量
摘要、证据入口、异步数据状态、前端验证链和共享 M4 候选通道协作。

本文记录开发历史、工作审视和可复用方法。长期规则已同步写入
[Cloud Admin UI Standard v1](cloud-admin-ui-standard-v1.md)。本文不改变
Cloud/WordPress 所有权，不批准生产发布，也不把 M4 acceptance 等同于
生产或独立人工验收。

## 1. 原始问题与目标

初始页面能够展示运行指标和证据，但默认视图的信息密度偏低：

- 同一异常的证据代码、说明、范围和操作同时占据主表宽度；
- 运行结论不够独立，操作者需要从多个摘要状态中自行归纳；
- 质量趋势、证据通道和运行说明默认展开，低频材料挤占首屏；
- 两个远端数据源的加载、失败和更新时间没有形成一个诚实的页面级状态；
- “样本不足且没有候选”容易被误读为“当前质量没有问题”；
- 短表格在左右工作区中可能被较高的检查器拉伸。

目标不是增加更多数据，而是提高每个首屏元素对管理员决策的贡献。默认
路径应当是：

```text
当前结论
  -> 活跃异常排序
  -> 选择一项
  -> 查看匹配证据与下一步
  -> 按需展开低频质量或运行说明
```

## 2. 边界与设计判断

页面在 `frontend/admin-ui-manifest.json` 中属于 `diagnostic` 模型。它的
操作者任务是从 Cloud 运行证据得出有限结论并进入最窄的只读证据视图，
不是修改供应商、路由、prompt、审批、能力或 WordPress 内容。

本阶段采用以下边界：

| 项目 | 决定 |
| --- | --- |
| 主操作 | 检查当前异常并打开匹配证据 |
| 次操作 | 切换时间窗、刷新、展开低频详情 |
| 破坏性操作 | 无 |
| 远端状态 | 运行诊断 API 与质量 API 各自拥有请求、错误和新鲜度 |
| URL 状态 | 当前异常 `focus` 与时间窗 `window`，由 search params 持有并可刷新、分享 |
| 本地状态 | disclosure 开关等临时交互状态 |
| 明确非目标 | 后端/API 变更、供应商或路由变更、WordPress 写入、生产发布 |
| 回滚 | 定向 revert PR #426；无数据迁移或后端回滚 |

主要矛盾是“完整证据很多”与“管理员必须快速判断”之间的冲突。解决方式
不是删除证据，而是把比较字段留在主表，把解释字段移到上下文检查器，并将
低频证据放入 disclosure。

## 3. 交付结果

应用改动通过 PR
[#426](https://github.com/npcink/npcink-ai-cloud/pull/426) 合并：

```text
feature_head=a146eb736e948ac893bacc23a4a6587b8ebbe65f
merge_commit=31fbf4f4ad89f55df8c87701b4c4adb9d05ebc4d
merged_at_utc=2026-07-31T03:01:34Z
```

改动共涉及 8 个文件，`334` 行增加、`111` 行删除。结果如下：

| 区域 | 收口后的默认行为 |
| --- | --- |
| 页面状态 | 分别显示运行数据和质量数据更新时间，并投影刷新中、部分失败和全部失败 |
| 运行结论 | 使用独立、不截断的结论行，状态徽章只承担状态名称 |
| 异常队列 | 主表固定为严重度、异常、影响范围、次数、操作 5 列 |
| 当前检查器 | 展示证据代码、受影响运行、范围、建议步骤和匹配证据入口 |
| 队列几何 | 表头固定、表体限高、左右工作面顶端对齐，短表不再被拉伸 |
| 质量摘要 | 默认折叠，只常驻归因会话、样本阶段、候选数和更新时间 |
| 质量语义 | 样本充分性、采集阶段和候选状态分开；低样本零候选不再显示成功 |
| 证据通道 | 默认折叠，摘要保留通道数量和用途 |
| 运行说明 | 更名为“运行证据说明”并默认折叠 |

共享 `AdminDataTableFrame` 只增加了可选表体类名入口，默认行为保持不变；
队列最大高度使用共享 `--admin-diagnostic-queue-max-height` token，没有在
路由中复制几何字面量。

## 4. 验证与接受证据

### 4.1 本地和 CI

应用修订完成时的验证结果：

| 门禁 | 结果 |
| --- | --- |
| `pnpm run check:admin-ui` | 通过 |
| `pnpm run check:admin-ui:visual` | 24 项通过 |
| 聚焦运行诊断 Playwright | 3 项通过 |
| 前端单元测试 | 20 个文件、106 项通过 |
| 编辑辅助质量门 | 13 项 pytest 通过，ruff、类型、lint、contract 通过 |
| 跨页面关键导航 smoke | 1 项通过 |
| `git diff --check` | 通过 |
| GitHub required checks | Frontend、backend fast gate、CodeQL、依赖审计、密钥扫描、PR contract 和 CI observability 全部通过 |

结构测试负责证明列、共享 token、参考页面和 forbidden pattern；Playwright
负责证明折叠、展开、选择、部分失败和样本不足语义。二者不能互相替代。

### 4.2 M4 接受链

PR #426 合并后，M4 主候选通道一度由
`codex/account-identity-simplification` 占用。该候选在一轮 CI 中出现
后端分片失败，因此本任务没有抢占锁、覆盖候选或改用本机 Docker。

占用任务随后完成修复和合并。PR
[#431](https://github.com/npcink/npcink-ai-cloud/pull/431) 的 clean-master
promotion 将包含 PR #426 的当前 `master` 提升到 M4：

```text
acceptance_state=accepted
promotion_pr=431
source_revision=dafc00aab183722bed6732094cd29c2e15eac575
source_branch=master
source_dirty=false
```

已用 Git 祖先关系确认 `31fbf4f4` 包含在 accepted revision `dafc00aa`
中。这里的 `promotion_pr=431` 表示触发最终 clean-master promotion 的
PR，不应错误改写为 PR #426 自己完成了 promotion。

### 4.3 认证 PC 浏览器

在 `http://127.0.0.1:18010/admin/troubleshooting` 使用已认证浏览器完成
`1440 × 1000` PC 验证：

- 页面显示 79 次运行、53% 供应商调用覆盖、100% 计量覆盖和 3 项异常；
- 运行结论、5 列异常队列和当前异常检查器一次可辨；
- 三个低频详情默认均为关闭状态；
- “编辑辅助质量”可展开；
- 选择“运行任务失败”后，检查器标题与内容正确联动；
- 页面级横向溢出为 false；
- 浏览器控制台没有 error。

这属于 authenticated M4 PC evidence，不代表生产部署或独立外部人员验收。

## 5. 实施中的失败与纠偏

| 事实 | 根本原因 | 纠偏 |
| --- | --- | --- |
| 隔离工作树最初通过外部 `node_modules` 链接运行时，Turbopack 判定依赖位于根目录之外 | 为节省安装时间复用了不满足构建根约束的物理路径 | 使用 `pnpm install --offline --frozen-lockfile` 在任务工作树建立物理依赖，不修改 lockfile |
| 质量门首次运行找不到任务工作树中的 `.venv` | 把“干净源工作树”误当成“每个工作树都有独立运行环境” | 明确指定已接受工作树的 Python 环境运行同一冻结依赖门；不把缺少本地 `.venv` 误报为产品失败 |
| 第一轮 CI 的旧结构契约仍强制主表保留证据代码 | 测试保护的是旧物理布局，不是新的操作者职责分层 | 更新契约：主表保护排序字段，检查器保护证据代码、受影响运行和下一步 |
| 跨页面 smoke 在折叠证据通道后仍直接寻找内部链接 | 测试没有执行真实的 disclosure 交互 | 先展开“证据通道”，再验证跨页入口 |
| 首次视觉检查发现一行表格被右侧检查器拉高 | CSS Grid 默认 `stretch` 与数据表实际行数不匹配 | 工作区改为 start alignment，并加入几何回归断言 |
| 当次完整 `admin-operator-path` 本地运行还暴露两个无关基线断言 | 聚焦任务与仓库其他页面的演进节奏不同 | 记录为无关证据，不扩大本任务；CI 的关键 Admin 路径与本次目标 smoke 均通过 |
| M4 候选被另一任务占用且一度 CI 失败 | M4 是串行治理的共享运行环境，不是每个任务的私有机器 | 保留失败现场，等待该任务合并和 clean-master promotion；只在 accepted revision 中核对本任务祖先关系 |

## 6. 工作审视报告

### 原定目标

提高运行诊断页面的信息密度，让管理员更快完成“看结论、排异常、查证据、
做下一步”的任务，同时保持 Cloud 只读诊断边界。

### 完成情况

- [x] 完成真实目标 URL、DOM、截图和操作路径检查；
- [x] 完成主表、检查器、质量摘要、复合刷新和低频 disclosure 优化；
- [x] 完成结构、行为、视觉、质量和跨页门禁；
- [x] 完成 PR 合并和 accepted-master 祖先核对；
- [x] 完成 `18010` 认证 PC 浏览器验证；
- [x] 完成标准、复盘和 README 入口；
- [ ] 未执行生产部署或外部人员验收；二者不属于本阶段授权。

### 发现的问题

| 严重程度 | 问题描述 | 根本原因 | 改进建议 |
| --- | --- | --- | --- |
| 必须改正 | 初次建议阶段只说“提高密度”仍不足以指导实现 | 没有先定义诊断页的决策顺序和字段职责 | 先写“结论 → 异常 → 证据 → 下一步”，再决定列、检查器和 disclosure |
| 必须改正 | 结构测试曾把证据代码的物理列位置当成产品契约 | 混淆架构守卫和用户行为 | 契约保护职责分层，Playwright 保护可见行为和交互 |
| 应当改正 | 首次视觉版本出现短表拉伸 | 只审查了内容，没有同时审查父级布局算法 | 诊断 split pane 必测 start alignment、短表、长表和 sticky header |
| 应当改正 | M4 阻塞使“代码完成”与“目标 URL 已更新”之间出现时间差 | 发布状态没有天然同步，且共享通道需要串行治理 | 每次报告 source、CI、merged、candidate、accepted、production 和 human acceptance 七种状态 |
| 建议改进 | 局部门禁通过后仍需要两次 CI 契约纠偏 | 聚焦门和仓库关键路径回答不同问题 | 发布前运行聚焦测试，并对被改变的 disclosure/列职责搜索所有跨页契约 |

### 做得好的地方

- 在脏工作环境中使用锁定隔离工作树，并精确暂存当前模块；
- 没有为了布局改变后端 API、业务结论或 Cloud/WordPress 所有权；
- 视觉检查发现真实几何问题后，补充了可执行回归而不只改截图；
- 对两个远端源保留独立错误和新鲜度，没有把未知、失败或低样本归零；
- M4 通道冲突时没有删除他人锁、覆盖候选或制造第二接受环境；
- 最终用 accepted revision 的祖先关系证明本次提交已进入 M4，而不是凭
  页面可访问或 `200` 推断。

### 下次重点关注

1. 在建议阶段先交付字段职责表和默认决策路径；
2. 布局改动同时验证数据语义、请求生命周期和父级几何；
3. disclosure 改动必须搜索并更新跨页导航 smoke；
4. 多源页面必须明确每个源的 loading、error、freshness 和 partial 语义；
5. M4 忙时先记录 owner、branch、revision 和 acceptance state，再决定等待；
6. 交付时继续分开报告 local、CI、merged、M4 accepted、production 和 human evidence。

## 7. 可复用的诊断页开发方法

### 7.1 调查

1. 从真实管理员 URL 读取当前 DOM、截图、控制台和操作路径；
2. 记录页面模型、操作者判断、主次操作和明确非目标；
3. 按“必须比较 / 选择后查看 / 低频参考”给字段分类；
4. 给每个远端源和本地交互状态指定唯一 owner；
5. 记录当前 accepted source、M4 owner 和用户验收 URL。

### 7.2 设计

| 字段类型 | 默认位置 |
| --- | --- |
| 排序和比较字段 | 主表 |
| 当前选中对象的解释字段 | 检查器 |
| 页面级结论和异常数量 | 摘要/结论行 |
| 样本充分性和新鲜度 | 常驻紧凑摘要 |
| 原始证据、schema、历史和 debug | disclosure 或更深详情 |
| 恢复操作 | 对应失败状态附近 |

每个默认可见元素都应帮助完成当前判断。只有“可能以后有用”而不影响当前
决策的信息，不应占据首屏。

### 7.3 实现

1. 复用 `AdminDataTableFrame`、状态徽章和 Backoffice 诊断 primitive；
2. 使用共享 `--admin-*` token 约束宽度和高度；
3. 远端数据保留在 query/request owner，不复制到本地展示状态；
4. composite refresh 只投影子源状态，不篡改子源真相；
5. 先处理 partial、unknown、insufficient，再写 success 分支；
6. 选择和 disclosure 保持 ephemeral，除非 URL 分享是明确需求。

### 7.4 验证与交付

```text
source contract
  -> focused behavior
  -> unit/type/lint
  -> check:admin-ui
  -> PC geometry and interaction
  -> PR required checks
  -> merge to master
  -> clean-master M4 acceptance
  -> authenticated target-URL browser evidence
  -> independent human acceptance when requested
```

不使用 `200` 代替页面验收，不使用截图代替交互，不使用 M4 candidate 代替
merged `master`，也不使用一次全绿掩盖部分数据源失败。

## 8. 新会话检查清单

后续修改 diagnostic 页面前：

- [ ] 当前工作树来自干净的 `origin/master`；
- [ ] 已读取 Admin UI 标准、工程标准、manifest 和 M4 标准；
- [ ] 已声明结论、异常、证据和下一步的默认顺序；
- [ ] 已列出所有远端源及其 loading/error/freshness owner；
- [ ] 已区分 zero、unknown、failed、partial 和 insufficient；
- [ ] 主表只保留跨行比较字段；
- [ ] 原始证据和低频说明有明确 disclosure 或详情入口；
- [ ] 已覆盖短表、长表、sticky header 和无页面横向溢出；
- [ ] 已覆盖 disclosure 展开后的跨页入口；
- [ ] 已分别记录 source、CI、merge、M4、production 和 human evidence；
- [ ] 未改变 Cloud/WordPress 所有权或增加默认破坏性操作。

## 9. 文档地图与回滚

- [Cloud Admin UI Standard v1](cloud-admin-ui-standard-v1.md)
- [Cloud Admin Frontend Engineering Standard v1](cloud-admin-frontend-engineering-standard-v1.md)
- [Cloud Admin UI Development Retrospective](cloud-admin-ui-development-retrospective-2026-07-27.md)
- [Development And Validation Operating Model v1](development-validation-operating-model-v1.md)
- [M4 Preview AI Development Standard v1](m4-preview-ai-development-standard-v1.md)

本文档和配套 manifest/reference contract 的回滚方式是定向 revert 本文档
PR。它不需要 M4 操作、后端回滚、数据迁移或生产操作。

## 10. 2026-08-01 状态自适应布局跟进

### 10.1 新问题

第一阶段把活跃异常整理为固定比较表，并把当前异常详情移到检查器；当选定时间
窗没有任何运行样本时，页面却继续保留空表框架和较大的默认工作区。结果是：

- 空数据页面视觉上仍显得稀疏，表格没有实际比较对象；
- 后端 `inactive` 摘要中的英文自由文本直接出现在中文管理页面；
- 后端为零样本窗口返回的真值覆盖率 `1.0` 被展示为 `100%`，容易被理解成
  已完成测量且覆盖完整；
- 桌面页头右侧已有可用空间，但健康结论仍另占一条横向状态带；
- 固定右侧检查器在只处理一个短异常时持续占据主工作区宽度。

这说明“信息密度高”不能等同于“所有状态都使用表格”。组件必须由当前状态和
操作者任务决定。

### 10.2 最终布局规则

| 页面状态 | 默认表达 | 原因 |
| --- | --- | --- |
| 有活跃异常 | 全宽语义表格 | 多条记录需要扫描、排序和横向比较 |
| 选择某项异常 | 按需右侧抽屉 | 解释字段只属于当前对象，不应永久挤压队列 |
| 零异常但有样本 | 紧凑健康状态面 | 没有跨行比较任务，不保留空表框架 |
| 零运行样本 | 紧凑“未观测到运行记录”状态面 | 明确是缺少测量，不伪装成健康或完整覆盖 |
| 页面级结论 | 桌面页头右侧，窄屏自然换行 | 使用既有空间，删除重复结论带 |
| 低频证据 | 折叠目录或更深详情 | 保留可达性，不挤占默认决策路径 |

覆盖率只有在 `ai_evidence_required_runs > 0` 时才可格式化为百分比；否则必须
显示“未测量”。主要结论由稳定的 `status` 或证据代码映射到本地化文案，后端
自由文本只可作为证据详情，不能成为多语言管理页的主状态文案。

### 10.3 交付与证据

跟进提交：

```text
branch=codex/runtime-diagnostics-layout-density-20260731
commit=ae108ac8b6cd56453c66c7cea0874a73b753f2b9
```

完成的验证：

| 门禁 | 结果 |
| --- | --- |
| 运行诊断结构契约 | 通过 |
| Admin UI 治理契约 | 通过 |
| `pnpm run check:admin-ui` | 通过 |
| `NPCINK_CLOUD_FRONTEND_PORT=3331 pnpm run check:admin-ui:visual` | 32 项通过 |
| 隔离全栈 M4 槽 | 前端、API、PostgreSQL、Redis、proxy 健康 |
| 认证 Edge，`1912px` 宽屏 | 中文结论、两个“未测量”、紧凑空状态、无横向溢出 |
| 浏览器运行态 | 空表框架 0、打开对话框 0、控制台 error 0 |

隔离槽证据为：

```text
url=http://127.0.0.1:18031/admin/troubleshooting
acceptance_state=candidate
source_revision=beb2566c2e9e3e64701ff5c50236149daccef381
source_branch=detached
source_dirty=false
promotion_pr=none
```

`beb2566c` 是容量基础设施提交、第一阶段 UI 提交和本次跟进提交叠加后的隔离
候选 revision。它证明指定候选在独立 M4 栈中的页面行为，不证明
`ae108ac8` 已合并、主 M4 已接受、生产已部署或独立人工验收已完成。

### 10.4 本轮失败与经验

| 现象 | 事实诊断 | 处理原则 |
| --- | --- | --- |
| 完整视觉门禁中途出现 19 项 `ERR_CONNECTION_REFUSED` | 共享测试端口 `3301` 被并发服务抢占，页面断言此前已有 13 项通过 | 使用测试配置支持的独立端口重跑；不要修改页面掩盖基础设施冲突 |
| 首次 M4 同步返回退出码 75 | 私有源码中继正由另一主预览操作持锁 | 读取 owner、时间和远端进程；等待真实所有者结束，不删锁、不改直传 |
| 锁中 `run_id` 与本地尝试恰好相同 | 时间戳加 PID 在不同会话间不是全局身份，远端命令参数证明是另一任务 | 不凭 run id 猜所有者；结合目标目录、分支、进程和稳定 task owner 判断 |
| `18010` 没有出现新布局 | 主预览与主题分支、隔离槽是不同候选通道 | 报告实际 URL、source revision 和 acceptance state；不把 push 当部署 |

由此形成四条通用规则：

1. 表格服务于比较任务，空状态服务于事实缺失，二者不能按页面类型一刀切；
2. `zero`、`unknown`、`not measured`、`healthy` 必须是四种独立语义；
3. 视觉门禁必须拥有独立端口，或至少在失败时先验证端口归属；
4. 并发预览必须用 task owner、源码 revision、目标 project 和锁状态共同归属，
   不能只看槽号、端口或一个可能碰撞的 run id。

### 10.5 后续会话验收补充

- [ ] 零样本窗口不显示 `100%` 覆盖率；
- [ ] 中文页面不显示后端英文自由摘要；
- [ ] 零异常时不渲染空数据表框架；
- [ ] 有异常时仍保留完整语义表格；
- [ ] 抽屉关闭时队列占满主工作区，打开时焦点与返回行为正确；
- [ ] 页头结论与页面内容不存在重复状态带；
- [ ] 视觉测试使用不会与其他会话冲突的端口；
- [ ] 交付报告写明实际预览 URL、revision、candidate/accepted 和 dirty 状态。
