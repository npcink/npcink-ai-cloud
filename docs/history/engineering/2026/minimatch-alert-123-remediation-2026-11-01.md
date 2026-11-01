# minimatch #123 安全维护记录 — 2026-11-01

状态：本地修复已验证，[PR #1342](https://github.com/npcink/npcink-ai-cloud/pull/1342)
已发布；GitHub 告警刷新及 M4 接受尚待完成。
不构成生产部署或真实 Provider 调用授权。

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
- `pnpm audit --json` 仍 exit 1：同一 GHSA 的 `<11.0.1` 范围把 3.1.5
  列为中危，路径为 frontend → eslint → minimatch。未添加 ignore、
  audit suppression，未手动 dismiss GitHub 告警。
- 实查 3.1.5 没有 optimizationLevel、firstPhasePreProcess 实现；同一八段
  反例只产生一项，没有本公告的放大机制。这是具体机制核对，不能表述成
  3.x 不存在任何漏洞或扫描已经通过。公告范围仍需上游确认/修订；
  合并后必须重新读取 #123 状态及依赖版本，不能预先声明自动关闭。
- 原始本地日志保留在本任务证据目录的 before-regression.log、
  after-regression.log、lint.log、type-check.log、unit.log、contracts.log、
  audit-after.json 与 build.log；最终回执记录精确修订和 PR 链接。

## M4、回滚与后续编辑验证

首次只读状态检查时 M4 为另一个 Admin 任务的候选 `466e4386`，其会话
“执行”最新回执明确冻结。未经占用协调，不替换该候选；本地与 PR 可独立推进。
依赖输入变动须用 `m4:preview:deploy`，合并后从干净 master promote，
核对探针修订、最终前端镜像依赖清单及首页/登录页 smoke；sync 不能代替重建。

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
未调用模型。此时 Cloud 探针仍来自另一候选，不能算本次 M4 接受证据。
历史 2026-10-27 改写样例加强原文确定性的缺口仍保留；本次没有新的人工
采纳、省时、复用意愿或付费价值证据。后续复用
[既有 cohort 运行手册](../../../real-editor-cohort-operations-v1.md)，
真实调用前声明预算并逐次 claim 既有 ledger，不以测试数据填充自然样本。
