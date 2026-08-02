# Cloud Admin UI 审查、迭代与交付手册 v1

状态：active engineering playbook。

日期：2026-08-02。

目的：把 `/admin/ai-resources` 多轮真实使用反馈中形成的界面判断、实现
方法、验证分级和多 AI 会话协作经验，整理为后续人类与 AI 可以直接执行的
工作规范。

本文不是新的视觉系统，也不替代以下权威标准：

- [Cloud Admin UI Standard v1](cloud-admin-ui-standard-v1.md)；
- [Cloud Admin Frontend Engineering Standard v1](cloud-admin-frontend-engineering-standard-v1.md)；
- [AI Development Validation Tiers v1](ai-development-validation-tiers-v1.md)；
- [Development and Validation Operating Model v1](development-validation-operating-model-v1.md)；
- [Parallel AI Collaboration Standard v1](parallel-ai-collaboration-standard-v1.md)。

如果本文与产品所有权、安全、凭据、审计、发布或无障碍规则冲突，以更强的
边界为准。

## 1. 本轮工作解决了什么

本轮从 `/admin/ai-resources` 的真实 PC 页面和连续截图反馈出发，先后识别并
处理了以下问题：

| 观察 | 根因 | 收敛方向 |
| --- | --- | --- |
| 页面上方存在大块空白 | 摘要、说明和工作区没有形成连续任务流 | 压缩常驻说明，让状态、筛选和表格更早进入首屏 |
| 两个筛选器都显示“全部” | 控件值存在，但筛选维度不可辨认 | 值中包含维度，例如“全部可见性”“全部能力” |
| 搜索框过长 | 工具栏按剩余空间扩张，没有按任务频率分配宽度 | 为搜索、筛选和主操作建立 PC 宽度预算 |
| “更多筛选”只有一个项目 | 为未来扩展提前制造了一层交互 | 单一常用筛选直接显示；没有至少两个真实低频项时不建“更多筛选” |
| 行内“更多”菜单遮挡按钮或表格 | 菜单被放在表格滚动/裁切上下文内，定位不感知视口碰撞 | 使用共享、portal 化、可翻转和可偏移的操作菜单 |
| 弹窗右侧出现两个纵向滚动条 | overlay、dialog body 和内部数据区同时拥有滚动 | 一个连续任务只允许一个纵向滚动 owner |
| 弹窗默认展示过多配置和解释 | 低频信息与当前任务竞争首屏 | 主要工作对象常驻；高级、历史、原始证据按频率折叠或按上下文进入 |
| 修改后云端页面没有变化 | 本地源码、PR、M4 candidate、M4 accepted 和浏览器缓存被混为一谈 | 每次报告明确 evidence state、revision、URL 和缓存状态 |
| 外观修改等待时间过长 | 预览反馈和工程收尾使用同一套重门禁 | 分离 preview clock 与 closeout clock，按风险使用 L0/L1/L2 |

这些问题不是独立的像素缺陷。它们共同反映了一个核心矛盾：页面希望一次
展示所有信息，却降低了操作者识别对象、判断状态和完成下一步的速度。

## 2. 总目标：减少一次正确操作所需的成本

Cloud Admin 是内部 PC 操作台，不是消费产品展示页。评价界面的首要指标
不是“展示了多少内容”或“看起来多丰富”，而是：

1. 操作者能否快速识别正在处理的对象；
2. 能否区分正常、异常、待配置和危险状态；
3. 能否在最少视线移动和点击中完成主要操作；
4. 能否在操作后获得可信且不扰乱上下文的反馈；
5. 低频证据是否仍可找到，但不占据默认工作面。

因此，信息密度不等于信息数量。有效密度是“每个首屏区域都帮助当前任务”；
无效密度是把说明、历史、调试标识和维护入口同时常驻。

## 3. 审查页面时的固定顺序

不要从圆角、颜色或卡片开始。按以下顺序审查：

### 3.1 明确操作者任务

先回答：

- 当前页面属于 `overview`、`queue`、`detail`、`configuration`、
  `diagnostic` 还是 `authentication`；
- 操作者进入页面后首先判断什么；
- 最常执行的一个动作是什么；
- 哪些动作是次要、低频、恢复性或危险操作；
- 哪个 API 或领域对象拥有最终事实。

页面模型与路由声明以 `frontend/admin-ui-manifest.json` 为准。

### 3.2 画出任务链，而不是组件树

推荐先写成纯文字：

```text
识别对象 -> 判断状态 -> 缩小范围 -> 执行操作 -> 查看结果 -> 必要时恢复
```

然后检查每一步是否都有直接入口，是否发生来回滚动、重复打开、跨区寻找或
失去筛选上下文。组件只是承载任务链的手段。

### 3.3 再决定工作面

| 信息结构 | 首选形式 |
| --- | --- |
| 多个对象重复相同字段 | 语义数据表 |
| 固定短字段配置 | 三列配置表 |
| 多个异构设置组 | 稳定目录 + 单一活动面板 |
| 长文本或复杂编辑 | 扁平编辑器 |
| 原始证据、历史、调试和恢复 | disclosure、drawer 或上下文入口 |

不要因为“统一”把所有内容变成卡片，也不要因为“表格高效”把不适合比较的
长文本和危险操作压进一张万能表。

## 4. 默认展示与渐进披露

默认工作面只保留完成当前任务不可缺少的内容。

### 4.1 默认显示

- 对象身份和当前状态；
- 影响判断的关键指标；
- 高频搜索和筛选；
- 当前主要工作对象；
- 一个主操作和必要的相邻次操作；
- 与当前失败直接相关的恢复入口。

### 4.2 默认折叠或按需打开

- 原始 ID、版本、revision 和调试参数；
- 历史/废弃对象；
- 高级运行参数；
- 长篇解释和外部参考；
- 删除、清空、停用和恢复；
- 只有异常时才有意义的诊断证据。

### 4.3 不应隐藏

- 会改变保存结果的字段；
- 当前异常原因；
- 凭据是否保持不变或正在替换；
- 操作影响范围；
- dirty、disabled、loading、error 和 retry 状态；
- 危险操作的对象身份与确认信息。

隐藏内容的目的必须是降低默认认知负担，不能通过隐藏掩盖功能或风险。

## 5. 工具栏和筛选规范

### 5.1 每个筛选器必须自解释

两个控件都显示“全部”时，用户无法在扫读中判断筛选维度。优先使用：

- “全部可见性”；
- “全部能力”；
- “全部状态”；
- “全部供应商”。

不要依赖远离控件的说明文字或 placeholder 来解释已选值。

### 5.2 “更多筛选”的成立条件

只有同时满足以下条件时才建立“更多筛选”：

1. 至少有两个真实、低频且相关的筛选项；
2. 展开后不会遮挡主要结果；
3. 当前生效条件可在关闭状态下被看见；
4. 清除方式明确；
5. 不会让常用筛选多一次点击。

只有一个筛选项时直接显示。不要为假想的未来需求提前增加交互层级。

### 5.3 PC 宽度预算

工具栏先保证控件可辨认，再让搜索占据剩余空间。常见顺序是：

```text
有限宽度搜索 -> 有标签的筛选 -> 次操作 -> 一个主要操作
```

搜索框不应无限拉长；主操作不得被长 placeholder 或状态反馈挤出首屏。使用
最长中文标签、长模型名和常见 1280/1440 PC 宽度验证。

## 6. 操作层级与“更多”菜单

### 6.1 哪些操作直接展示

- 高频主操作：直接显示，例如“配置”“保存”；
- 高频次操作：与对象相邻，例如“测试”“同步”；
- 低频操作：进入 `AdminActionMenu`；
- 危险操作：菜单末尾、独立分隔、危险色，并保持对象级确认。

不要为了减少按钮把高频操作都塞入菜单。也不要把删除与配置、测试做成同等
权重的默认按钮。

### 6.2 菜单的工程要求

行内 overflow 菜单必须：

- 通过 portal 脱离表格的 `overflow` 和 stacking context；
- 以触发器为锚点，优先 `bottom-end`；
- 在视口边缘自动 `flip` 和 `shift`；
- 滚动或 resize 时自动更新位置；
- 支持方向键、`Escape`、外部点击关闭和焦点返回；
- 链接使用正确的外部打开语义；
- 危险操作不因菜单迁移而绕过原确认流程。

优先使用项目已经采用的定位能力和共享 `AdminActionMenu`。不为一个菜单引入
完整第三方视觉组件库；第三方 headless 定位库只负责碰撞、坐标和生命周期，
视觉、动作语义和状态仍由项目拥有。

## 7. 弹窗和滚动规范

### 7.1 一个连续任务，一个纵向滚动 owner

当弹窗包含长表格、模型列表、日志或预览区时：

```text
overlay: 不滚动
dialog shell: 不滚动
header: 固定
toolbar/summary: 固定
main work region: 唯一纵向滚动 owner
pagination/footer: 固定
```

使用 `AdminWorkbenchDialog contentMode="contained"` 表达这个结构，不在
路由内重复 modal 高度、focus 和 overflow 代码。

### 7.2 允许双滚动的唯一常见例外

桌面 split view 的左右两个 pane 可以分别滚动，但必须同时满足：

- 两者是同级 sibling work regions；
- 各自承担独立任务，例如编辑与预览；
- 外层 dialog body 不再纵向滚动；
- 任一 pane 内部不再嵌套第二个纵向滚动区；
- 移动端收敛为一个连续 workspace scroller。

“页面右边看见两个滚动条”不是自动失败；关键是它们是否属于两个并列工作区。
一个滚动条控制另一个滚动区的外层时，就是需要修复的嵌套滚动。

### 7.3 审计方法

不要只搜索 `overflow-y-auto` 后批量删除。逐个确认：

1. 实际滚动 owner 是谁；
2. header、toolbar、table、pagination 和 footer 的父子关系；
3. 小视口是否产生第三个滚动层；
4. sticky 元素绑定了哪个滚动容器；
5. 键盘 Page Up/Down、滚轮和触控板是否操作预期区域。

只有确认存在父子纵向滚动时才修改。drawer、dropdown、代码区和两个并列 pane
可能是合理的独立滚动，不应盲目统一。

## 8. 功能完整性检查

外观简化完成后必须逐项回答“功能是否仍然存在、能否找到、语义是否相同”。

### 8.1 控件清单

- 搜索、每个筛选和清除筛选；
- 分页、结果数量和当前范围；
- 创建、配置、测试、同步和保存；
- dirty-state 与离开保护；
- loading、empty、filtered-empty、error、retry 和 saved；
- 外部文档链接；
- 删除、停用、清空、恢复及确认；
- 键盘访问、关闭和焦点返回；
- 凭据保持不变、显式替换、取消替换和不回显。

### 8.2 数据语义清单

- 总数、当前页数量和筛选后数量不得混用；
- “可用”“启用”“已测试”“已同步”和“情报完整”是不同事实；
- 缺失证据不能显示为零或成功；
- 页面不从视觉需要反推新的 API 或数据 owner；
- 反馈更新不能清除搜索、筛选、分页或当前对象。

如果一个入口被移入菜单或 disclosure，测试必须证明新入口和原语义。不能只用
“源码中仍有 handler”来证明用户可访问。

## 9. 三级验证：让反馈快，让收尾可信

本节是 [AI Development Validation Tiers v1](ai-development-validation-tiers-v1.md)
在 Admin UI 的实操摘要。完整定义仍以该标准为准。

| 级别 | 典型改动 | 先看效果 | 提交收尾 |
| --- | --- | --- | --- |
| L0 外观 | 文案、颜色、图标、局部间距，且不改变几何或交互 | 精确静态检查 + 单页 PC 检查 | 相关 contract + PR checks；默认不需要 M4 |
| L1 页面组合 | 布局、折叠、筛选呈现、列顺序、操作位置、route-local 交互 | 聚焦 route contract/行为 + PC receipt | `check:admin-ui`、聚焦交互、必要时一次完整视觉矩阵、PR checks |
| L2 共享/行为/运行敏感 | 共享 primitive、焦点、危险操作、凭据、API、依赖或部署输入 | 聚焦源码证据 + 合适的隔离 candidate | 完整相关链、PR、合并、需要时 clean-master M4 promotion 和 smoke |

### 9.1 两个时钟

- preview clock：尽快给操作者看可判断的候选效果；
- closeout clock：完成提交、CI、合并、M4 accepted 或生产所需证据。

不要让无关后端 CI 阻止一个合格的页面预览，也不要因为页面已经可看就省略
后续 merge/acceptance 证据。

### 9.2 立即升级风险级别

出现以下任一情况，停止较低级别流程并向上升级：

- 修改第二条路由或共享 primitive；
- 改变 focus、keyboard、disabled、loading、error、confirmation 或危险操作；
- 出现 overflow、旧静态资源、console/network error；
- 修改 API、状态 owner、凭据、依赖、Docker、Compose、proxy 或部署脚本。

升级不是失败，而是防止“小改动”偷偷扩大风险。

### 9.3 为什么需要审查，但不应每次全跑

共享菜单和弹窗看似只是外观，实际可能影响：

- 所有使用该 primitive 的页面；
- 键盘和 focus 恢复；
- 删除操作可发现性和确认；
- portal/stacking/overflow；
- PC 与移动端滚动；
- 编译 CSS 和缓存后的真实浏览器结果。

因此共享交互值得严格验证；但正确做法是按风险选择门禁、完整矩阵只在收尾
运行一次，而不是每改一个像素就重复所有检查。

## 10. 三到五个 AI 会话的推荐协作方式

并行的目标不是让所有会话同时改、同时发 PR、同时占 M4，而是并行调查与
实现，串行化会破坏证据的关键通道。

### 10.1 角色

- builder：只负责一个冲突域，做到 clean committed `local-ready`；
- integrator：唯一负责 current-base 集成、PR、CI、merge lane 和 primary M4；
- investigator：只读调查并把证据交给 builder/integrator。

### 10.2 默认队列

```text
多个 builder/investigator 并行
  -> 每个 builder 交付 local-ready receipt
  -> integrator 一次接纳一个
  -> required checks
  -> merge
  -> 必要时 clean-master M4 accepted
  -> 接纳下一项
```

最多保留一个正在 merge/runtime lane 的项目，以及两个已接纳、等待集成的
`local-ready` 项。超过后不要继续制造新分支；空闲会话转为审查、复现或清理
当前阻塞。

### 10.3 三个唯一 owner

任何时刻只允许：

1. 每个高冲突域各有一个实现 owner；
2. 一个 protected merge-lane owner；
3. 一个 shared-runtime operation owner。

工作树锁只防止误删，不代表取得以上任何一种 ownership。

### 10.4 local-ready 回执

```text
Local-ready receipt
- conflict domain:
- branch/worktree:
- commit/base:
- changed files/contracts:
- gates passed/failed/not run:
- runtime need:
- dependencies and rollback:
- next safe action:
```

builder 交付回执后停止修改该域。除非 integrator 明确 handback，否则 builder
不追赶 `master`、不发布 merge-ready PR、不覆盖 M4 candidate。

## 11. 缓存、部署与“为什么没看到效果”

每次交付必须明确区分：

| 状态 | 可以声称什么 |
| --- | --- |
| local verified | 本地源码 seam 通过 |
| local-ready | builder 的提交可交给 integrator |
| candidate on M4 | 当前候选在 M4 工作，但不一定已合并 |
| PR verified | 推送 revision 通过 required checks |
| merged | 已成为 `master` 源码真相 |
| accepted on M4 | 干净最新 `master` 已 promotion 并 smoke |
| production validated | 受控生产流程完成 |
| human accepted | 人类在目标环境确认任务可用 |

页面没有变化时按以下顺序诊断：

1. 当前查看的是本地、M4 candidate、M4 accepted 还是 production；
2. 页面响应中的源码 revision 是否为预期 revision；
3. 前端容器是否重新加载了源码；
4. HTML 和静态资源是否来自同一 revision；
5. 浏览器是否仍缓存旧 HTML/CSS/JS；
6. 登录、Access 或 502 是否把错误页误当成业务页面；
7. 最后才考虑 rebuild，不把冷构建当作默认刷新手段。

`Command + Shift + R` 能解决问题时，说明浏览器资产缓存是直接原因；它不证明
部署脚本没有缓存契约缺口。仍应记录 source revision、响应头和可复现路径，
由部署脚本专项任务判断是否需要修改 no-store 或资产版本策略。

## 12. PR #460 的最终案例

本轮共享交互修复最终形成 PR `#460`，合并 revision 为
`44469fb0f17896d3c1e425c5d732d7edb4dc886a`。主要结果：

- 新增共享 `AdminActionMenu`，处理碰撞、portal、键盘和危险项分隔；
- `/admin/ai-resources` 行内更多菜单不再受表格 overflow 裁切；
- `AdminWorkbenchDialog` 增加明确的 contained content mode；
- AI Resources 模型表成为唯一纵向滚动 owner，分页和 footer 留在外部；
- Runtime Profiles 候选模型区采用同一规则；
- Service Settings 邮件预览在移动端使用一个 workspace scroller，桌面端只
  允许两个并列 pane 独立滚动；
- 搜索、筛选、同步、批量维护、分页、保存、测试、外链和危险确认语义保留。

验收链为：相关 contract/Playwright/Admin gate，本地完整 frontend contracts，
GitHub required checks，squash merge，clean current `master` M4 promotion，
`acceptance_state=accepted`、`promotion_pr=460`、`source_dirty=false`、首页与
`/health/live` 为 `200`。登录后的人工视觉确认仍是独立证据，不能由 HTTP、
CI 或 M4 accepted 替代。

## 13. 常见反模式

- 看到空白就塞入更多统计卡片；
- 只有一个低频项也创建“更多筛选”；
- 用两个都叫“全部”的下拉框节省标签；
- 把所有操作放进 overflow，牺牲高频效率；
- 用 `z-index` 无限加码修复被祖先 overflow 裁切的菜单；
- 同时让 overlay、dialog body 和 table body 滚动；
- 为一个菜单或弹窗引入完整视觉组件库；
- 搜索源码中的 handler 后就声称功能没有缺失；
- 用截图证明保存、权限、凭据或危险确认正确；
- 用 `200`、push、CI、merge 或 M4 candidate 声称用户已经看到效果；
- 三到五个会话各自发 PR、追 `master` 并覆盖同一个 M4；
- 为了“更保险”在每次微调后重复完整视觉矩阵和全量 M4 suite。

## 14. 执行检查表

### 开工前

- [ ] 检查 Git、worktree、PR、conflict domain 和 shared runtime owner；
- [ ] 声明页面模型、操作者任务、动作层级和状态 owner；
- [ ] 记录 change envelope、非目标、文件范围、门禁和回滚；
- [ ] 选择 L0/L1/L2，并写明升级条件。

### 设计前

- [ ] 用文字写出任务链；
- [ ] 标记默认显示、低频披露和绝不能隐藏的内容；
- [ ] 检查搜索/筛选的含义和 PC 宽度预算；
- [ ] 检查主操作、次操作、overflow 和危险确认；
- [ ] 明确弹窗唯一 scroll owner。

### 实现后

- [ ] loading、ready、empty、filtered-empty、error、retry 可辨认；
- [ ] 搜索、筛选、分页和当前对象在反馈后保持；
- [ ] 菜单碰撞、Escape、方向键、外部点击和焦点返回正常；
- [ ] 弹窗没有父子纵向滚动；
- [ ] 移入 disclosure/menu 的每项功能仍可访问且语义未变；
- [ ] 最长中文、模型名、域名和窄 PC 视口没有裁切或横向溢出。

### 交付时

- [ ] 只暂存当前任务文件；
- [ ] 报告 exact revision、gate 和未测量项；
- [ ] preview 与 closeout 状态分开；
- [ ] PR、merge、M4 candidate、accepted、production、human acceptance 分开；
- [ ] 合并后需要 M4 验收时只从干净最新 `master` promotion；
- [ ] 明确释放 merge lane、M4、frontend slot 和 tunnel ownership；
- [ ] 文档-only 任务不进行无意义的 M4 mutation。

## 15. 给后续 AI 的最短执行原则

如果只能记住六条：

1. 先问操作者要完成什么，再决定页面长什么样；
2. 默认工作面只展示当前判断和操作需要的信息；
3. 高频操作直接、低频操作收起、危险操作隔离确认；
4. 一个连续弹窗任务只保留一个纵向滚动 owner；
5. 先按风险快速给预览，再完成对应级别的可信收尾；
6. 多会话并行实现、串行集成，永远保持一个 Git 真相和一个 M4 owner。
