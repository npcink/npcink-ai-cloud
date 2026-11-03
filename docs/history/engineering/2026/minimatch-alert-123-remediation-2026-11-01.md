# minimatch #123 安全维护记录 — 2026-11-01

状态：[PR #1342](https://github.com/npcink/npcink-ai-cloud/pull/1342)
已合并，M4 已 accepted；截至 2026-11-01 刷新后 #123 仍 open，报告版本从
10.2.5 变为 3.1.5。10.x 放大机制已修复，3.x 与公告范围的差异当时待确认。
不构成生产部署或真实 Provider 调用授权。

2026-11-02 收口：GitHub Dependabot #123 已按 `inaccurate` dismiss。该操作只
关闭与公告范围不符的告警记录，不表示把 3.x 宣称为无任何安全问题；本记录下方
保存版本、机制、消费者兼容性和可执行反例证据。`pnpm audit` 仍会按 npm 公布的
宽范围报告 3.1.5，未添加 ignore 或 audit suppression，待 npm/GitHub 公告数据
刷新后复查。

## 范围与依据

- [Dependabot #123](https://github.com/npcink/npcink-ai-cloud/security/dependabot/123)：
  GHSA-g3hv-75wg-m249 / CVE-2026-118764，中危；报告锁文件中的 10.2.5，
  首个修复版为 11.0.1。此前审查 PR #1340 没有修改该锁文件。
- 依赖链为 frontend 的开发依赖 `eslint-config-next@16.4.1` →
  `typescript-eslint@8.61.0` → `@typescript-eslint/typescript-estree@8.61.0`
  → `minimatch@10.2.5`。遍历锁文件生产依赖图没有 minimatch 路径；
  这不替代最终镜像清单核验，也不证明当前线上镜像状态。
- 公告的具体前提是外部可控 glob 与 `optimizationLevel >= 2`。
  当前 typescript-estree 的 `dist/useProgramFromProjectService.js` 仅调用
  `minimatch(filePath, pattern, { dot: true })`，未开启该级别；本项目
  自有前端源码没有直接 minimatch/optimizationLevel 调用。
  目前未证实公网可利用，修复属于开发/构建工具链安全维护。

## 修复取舍

在 [workspace override](../../../../pnpm-workspace.yaml) 中只将
`@typescript-eslint/typescript-estree>minimatch` 固定为 11.0.1，更新唯一
根锁文件；不升级 Next、ESLint、TypeScript 或应用源码。

2026-11-01 查询 npm，最新版 typescript-estree 8.72.1 仍声明
`minimatch ^10.2.2`，10.x 最新为 10.2.6，均不能满足公告修复版本。
11.0.1 的 Node floor 是 `18 || 20 || >=22`，匹配 CI/镜像 Node 22。
上游 11.0 删除 makeRe、AST、regexp 和若干内部方法，并改变部分目录末尾、
Windows/UNC、partial 匹配行为；当前父消费者只使用 named `minimatch`
与 `{dot:true}`，没有调用被移除 API。

其他 ESLint 消费者仍使用 3.1.5 的 callable CommonJS / makeRe API，
不能全局强制到 11.x。去除 override 的条件是父依赖原生接受安全版本，
且下述消费者回归仍通过。

## 可执行反例与兼容性

[消费者回归](../../../../frontend/tests/unit/minimatch-consumer-contract.mjs)
沿实际 ESLint config → typescript-eslint → estree 解析 minimatch：

```js
new Minimatch(Array(8).fill('**/../a/b').join('/'), {
  optimizationLevel: 2,
  braceExpandMax: 64,
}).set.length
```

旧 10.2.5 返回 256，断言失败；修复版返回 64。使用八段而非几十段，
避免在旧依赖上制造无界 CPU/内存消耗。另验证 dot、中文路径、扩展名、
brace、extglob、拒绝匹配，以及真实 TypeScript parser
allowDefaultProject 允许/拒绝路径；保留 ESLint 3.x 的可调用与 makeRe 契约。
该脚本由既有 `frontend test:contracts` 与前端 CI 实际执行。

## 本地验证与扫描残留

- Node 22.22.3、pnpm 10.33.0；frozen install、root lock 校验、完整 ESLint、
  TypeScript、67 文件 / 752 项 Vitest、全部前端契约、release-policy 通过。
- Next 生产构建通过；构建自动生成的 next-env 类型引用已精确恢复，未纳入 PR。
- `pnpm audit --json` 在 2026-11-01 及本次复核仍 exit 1：同一 GHSA 的 `<11.0.1` 范围把 3.1.5
  列为中危，路径为 frontend → eslint → minimatch。未添加 ignore、
  audit suppression；在本次范围证据形成前未手动 dismiss GitHub 告警。
- 实查 3.1.5 没有 optimizationLevel、firstPhasePreProcess 实现；同一八段
  反例只产生一项，没有本公告的放大机制。这是具体机制核对，不能表述成
  3.x 不存在任何漏洞或扫描已经通过。公告范围仍需上游确认/修订；
  合并后必须重新读取 #123 状态及依赖版本，不能预先声明自动关闭。
- 原始本地日志保留在本任务证据目录的 before-regression.log、
  after-regression.log、lint.log、type-check.log、unit.log、contracts.log、
  audit-after.json 与 build.log；最终回执记录精确修订和 PR 链接。
- 合入最新 master（含 Admin PR #1344）后补验 TypeScript、788 项 Vitest、
  全部前端契约及消费者回归通过。最终 head `b45f2b76` 的
  [Cloud CI](https://github.com/npcink/npcink-ai-cloud/actions/runs/41316501049)
  与完整适用检查通过；#1342 于 2026-11-01T14:35:48Z squash 合并为
  `57e30fdf05694bcd5c61b048da1d565600c9f7c1`。
- 合并后直接读取 GitHub #123：`state=open`、`fixed_at=null`、
  `version_requirement=3.1.5`；当次开放告警共一条。GitHub 标为 runtime，
  与本地生产依赖图不一致，不能仅据扫描标签判断公网可利用性。
  该状态已在 2026-11-02 的范围复核后变为 `state=dismissed`、
  `dismissed_reason=inaccurate`；没有发送外部消息，也没有以 dismiss 代替
  10.x 的实际修复。

## 2026-11-02 告警范围复核与收口证据

GitHub 公告 GHSA-g3hv-75wg-m249 / CVE-2026-118764 的描述明确针对
`firstPhasePreProcess()` 在 `optimizationLevel >= 2` 时生成 `globParts`，
再由 `secondPhasePreProcess()` 做成对处理；公告推荐 11.0.1。

针对实际剩余路径 `frontend → eslint → minimatch@3.1.5` 做了独立 npm tarball
复核：

- `minimatch@3.1.5` 的 `minimatch.js` 没有
  `optimizationLevel`、`firstPhasePreProcess` 或 `secondPhasePreProcess`；
  只有旧实现的 `globParts` 字段。
- 同一个八段 `**/../a/b` 反例，设置
  `{optimizationLevel: 2, braceExpandMax: 64}` 后，3.1.5 的 `set.length=1`；
  已受影响的 10.2.5 为 `256`，定向修复的 11.0.1 为 `64`。
- 3.1.5 的 callable CommonJS 与 `makeRe()` 仍是 ESLint 及插件的实际契约；
  全局改成 11.x 会破坏该消费者接口。TypeScript ESLint 路径继续使用父级限定
  的 11.0.1 override，未改变 ESLint 的 3.x 副本。

据此于 2026-11-02 通过 GitHub Dependabot API 将 #123 标记为
`dismissed_reason=inaccurate`，评论仅包含上述机制、版本反例和兼容性结论。
当前 API 状态为 `state=dismissed`、`fixed_at=null`、依赖版本仍为 `3.1.5`。
本次关闭的是错误匹配的公告范围；若公告补充 3.x 复现、3.x 发布新的相关修复，
或生产镜像出现不同依赖路径，必须重新打开调查，不得沿用本次 dismiss。

## M4、回滚与后续编辑验证

首次只读状态检查时 M4 为另一个 Admin 任务的候选 `466e4386`，其会话
“执行”最新回执明确冻结，因此先完成本地与 PR 验证。操作者随后明确允许
本任务接管 M4；接管时另一任务已合并 #1344，M4 为其 accepted 修订。
本任务合入该最新 master 后才完成候选部署，保留其他任务改动。

候选通过 `m4:preview:deploy` 重建前端依赖镜像；合并后从干净 master 执行
`m4:preview:promote -- --pr 1342`，于 2026-11-01T14:37:46Z accepted：

- `source_revision=57e30fdf05694bcd5c61b048da1d565600c9f7c1`，
  `source_branch=master`，`source_dirty=false`，`promotion_pr=1342`。
- 前端镜像 `sha256:d7f789e9291088dc19658c444fba2a19cc3a9346748710205708a680ffd31411`；
  容器 Node 22.23.3，estree 消费者实际解析 11.0.1，ESLint 解析 3.1.5；
  八段反例为 64，实际容器消费者契约在候选和 accepted 阶段均通过。
- 首页、Portal 登录、Admin 登录、JS 资源与 liveness 均 200；accepted
  探针修订为 `57e30fdf0569` 且 clean。服务运行正常，数据库保持
  `20261024_0091 (head)`，未新增迁移。
- promote 的 sync 复用已重建且输入指纹相同的候选镜像；前端源修订保留
  `b45f2b76`，其树与 squash merge 完全一致。sync 未被当作依赖重建证据。
- M4 是开发镜像配合 production 前端模式，包含开发工具链；其中生成的
  `.next/standalone` 未发现 minimatch。未部署或验收生产 runner 镜像，
  不把 M4 或本地 standalone 清单表述成线上生产证据。

回滚为 revert 本次依赖与回归提交、重建 M4；这会重新引入旧依赖风险，
不能通过删除回归或隐藏告警宣称安全。无数据库迁移或跨仓公共契约变更，
不要求跨仓兼容矩阵升级。

安全维护后复用既有编辑就绪工具与自然任务记录，优先标题、摘要、选中
文本改写。自动化、M4 与代理审阅不算真实人工采纳；不为凑十次样本调用
付费模型，不制造保存/反馈数据，不扩大到新平台或后台功能。

## CI 独立分片发现与准备检查

依赖 PR 首轮 [Cloud CI](https://github.com/npcink/npcink-ai-cloud/actions/runs/41301254220)
前端、CodeQL、密钥扫描、Python 依赖审计与文档检查通过；contract-3 为
448 passed / 1 failed，失败为
`test_m4_portal_postgres_runner.py::test_production_environment_is_preserved_and_guard_rejects_it`。
该文件与 master 的 blob 相同，独立本地进程复现了相同失败：runner 清空
Cloud 环境后才导入会初始化应用的集成测试模块，缺少生产配置使其在 DB
安全断言执行前失败。完整套件先前的模块缓存遮蔽了导入顺序依赖。

按依赖更新规范用单独 [PR #1343](https://github.com/npcink/npcink-ai-cloud/pull/1343)
将 fixture 导入移到环境清理之前，不改应用、runner、fixture 或任何原断言。
修正后独立用例 1 passed、全文件 9 passed、ruff 通过；#1343 全部检查通过，
于 2026-11-01T11:31:23Z 合并为 `6360b073`。依赖分支已合入该 master，
须以新 head 的完整检查结果为准。原红 CI 与本地复现证据保留。

编辑验证仅推进了准备层：现有 `magick-ai` 站点只读 readiness 为 ready，
Addon/Toolbox 实际挂载路径已核对；`check:editor-assist-quality` 28 项通过，
定向 lint、UI 契约和不自动改动边界通过。未变更站点状态、配置或文章，
未调用模型。准备检查当时的 Cloud 探针来自另一候选，不追认为本次 M4 证据；
本次 accepted 证据独立记录在上一节。
历史 2026-10-27 改写样例加强原文确定性的缺口仍保留；本次没有新的人工
采纳、省时、复用意愿或付费价值证据。后续复用
[既有 cohort 运行手册](../../../real-editor-cohort-operations-v1.md)，
真实调用前声明预算并逐次 claim 既有 ledger，不以测试数据填充自然样本。

## 可复用经验与收尾边界

1. 告警关闭必须读取合并后 API；同一告警可从一个依赖版本转指另一个版本。
   保留版本、manifest、scope 与机制证据，不能以 PR merged 代替 fixed。
2. 跨主版本 override 只作用于已核对的父消费者；不得为消除扫描红灯破坏
   其他消费者的 callable/makeRe 契约。3.x 残留继续公开记录，等待公告范围
   确认或父依赖提供兼容安全版本，再复验并决定是否移除 override。
3. 集成测试 fixture 会初始化应用时，独立分片/新进程必须能走到目标断言。
   本次 fixture 导入顺序问题用独立进程复现；不以全套模块缓存掩盖失败，
   不修改生产保护断言来制造绿灯。
4. M4 status 必须先返回，才能决定后续部署。本次曾提前启动旧 head 上传，
   发现基线变化后在 scp 阶段终止，未执行远端 apply；随后合入最新 master
   重新验证并部署。不能同时启动状态查询与依赖该结果的远端写入。
5. clean-master 门禁发现运维目录两份未跟踪 Playwright 日志后，逐件复制、
   SHA256 校验并移至任务证据目录，保留原件；未清扫其他任务工作区。

本任务功能、测试修正和收尾文档分别留存合并回执；精确分支/worktree
删除结果记入仓库外最终回执，避免为记录自身合并再创建循环收尾提交。
稳定 M4 运维 checkout 和其他任务工作区不属于本次清理对象。
可结束本轮实现会话，但不得将 #123、生产验证或真实人工编辑价值标为完成。
