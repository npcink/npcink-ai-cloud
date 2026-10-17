# 零付费关键流程回归 v1

Status: development verification runbook; fixed local regression scope, not M4,
production, SMTP delivery, real model quality or human adoption evidence.

目的：让已知的 Provider 异步状态、Portal 开户/恢复、账户授权和预算逻辑缺陷在
发布前暴露。复用 `verify:local` 增加显式模式，不新增第二套变更分类器。

## 入口与边界

```bash
# 默认行为不变：按当前 diff 选 development gates。
pnpm run verify:local

# 固定关键流程，不依赖当前是否有 diff。
pnpm run verify:local -- --critical --plan
pnpm run verify:local -- --critical --doctor
pnpm run verify:local -- --critical
```

没有隐式安装、浏览器下载、Docker、SSH、M4 sync、GitHub dispatch 或生产调用。
Mac 只执行源码检查、进程内 Fake API/SQLite 和 Mock 前端浏览器测试；Cloud
Docker/PostgreSQL/worker/代理集成继续归 M4。这个模式不会替代 PR 必需检查，
也不会在每次保存或 push 后自动运行。

前提是已安装仓库锁定的 frontend 依赖、仓库 `.venv` 和共享 Chromium。
doctor 缺项非零退出，不代操作者装依赖或退回其他运行环境。浏览器始终新建
`127.0.0.1:3307` 的生产构建前端，拒绝复用现有服务器或外部 base URL；
端口冲突保持失败。frontend 中有非 example 的 `.env*` 文件时拒绝构建，
不会读出内容。普通非 critical 浏览器工作流不受此限制。

## 固定覆盖与证据

唯一用例清单为 [critical-regression-v1.json](../config/critical-regression-v1.json)。
修改选择时同时核对覆盖、测试标题与实际报告，不以全文件测试数量冒充关键路径。

| 步骤 | 复用/新增的验证 | 明确不证明 |
| --- | --- | --- |
| type-check | 当前 frontend 与所选测试/fixture/配置的严格 TypeScript | 浏览器动作或服务协作 |
| contracts | Provider 与 Portal 六个现有源码合同 | UI 可操作性 |
| api | 现有临时 SQLite/Fake Provider 开户—Addon—signed runtime—usage/audit；注册即 Free、旧账号补齐、事务回滚、登录、跨账户/撤权拒绝；预算幂等/预警/限额修改 | PostgreSQL 并发、生产预算配置、真实邮件或推理 |
| browser | 15 个精确标题：保存测试成功/失败；目录同步终态及参考失败恢复；登录、Free/零额度/过期会话、Addon 确认、账户/站点过滤、读取重试/旧请求、变更成功后刷新失败 | SMTP 收件、真正 WordPress 写入或商业价值 |

新增目录同步测试用受控等待确认 running→终态、按钮恢复及再次执行；
参考资料失败与目录成功分开验证，不用截图代替状态断言。

执行器对子进程只传递必需基础环境，不继承 Provider key、代理、外部目标、
`NODE_OPTIONS`、`PYTEST_ADDOPTS` 或第三方 pytest 自动插件。Fake API 子进程加载
专用审计钩子，全局导入数据库显式固定为内存 SQLite，测试场景用各自临时库。
真实 DNS/TCP/UDP 尝试即拒绝；即使调用方吞掉异常，整步仍失败。
它不拦截进程内 TestClient 或 Unix socket，也不是通用不可信代码沙箱。

浏览器 API 由现有 page fixture 替身回答。context 兜底拒绝未 Mock API 与外部
请求，service worker 关闭；Next API 上游固定到无服务的回环端口，且没有真实
凭据。页面 fixtures 若把一个外部 URL fulfill 成静态替身，不发生真实网络。
隔离是这组受控测试的零付费保护，不是任意新 Node 脚本的系统级网络沙箱。

## 回执与失败恢复

执行输出 `.tmp/critical-regression/run-*/receipt.json`、逐步骤日志、API JUnit
和浏览器 JSON。回执记录 HEAD、脏状态、工作差异哈希、选中步骤、耗时、失败步骤及局部完成
状态；它不把工作树脏候选标为 accepted，也不输出凭据。产物均为忽略本地状态。
运行过程中 HEAD 或源码差异变化会报告 incomplete；Next 自动生成的 `next-env.d.ts`
单独排除哈希，该文件的生成差异不应提交。历史回执不会被后来一次执行覆盖。

任一步失败立即非零退出，后续步骤不执行。JUnit 空测试或跳过不算通过；浏览器
JSON 必须包含清单中的全部精确标题且零 skipped/flaky/unexpected，重命名漏选
同样失败。浏览器重试为 0；每个源码/API 步骤最多 5 分钟，浏览器含构建最多
15 分钟，超时终止整个子进程组。

定位后只重跑失败步骤，例如：

```bash
pnpm run verify:local -- --critical --only api
pnpm run verify:local -- --critical --only browser
```

`--only` 可重复，回执 `selected` 明确表示局部范围；局部 complete 不等于完整
四步通过。源码改变后重新执行受影响步骤；只有版本/输入一致时才复用其他证据。
不要在缺依赖或失败时用 `|| true`、跳过场景或重复外部调用凑绿。

## 验证前移的交接

1. 开发侧按风险选择本模式或更窄测试，保留失败；修复后走正常 Git/CI。
2. 涉及真实容器、PostgreSQL 并发、worker、迁移、代理时，单独声明 M4 窗口及
   focused 目标，再按现行标准操作。该模式本身不隐式操作 M4。
3. 合并/M4 accepted 与 production 分开；生产差异和真实体验由操作者按
   [邮箱与写作清单](portal-production-validation-runbook-2026-10-16.md)验证。
4. 开发侧核对 run、预算与原生反馈；第一次 smoke 不替代六条 Done 的自然
   使用要求或 3 人四周试用。

回退：撤销本批测试/工具提交，恢复原 `verify:local` 分流与命令清单；无数据库
或运行配置需要回滚。当前产品边界与工程门禁不因本模式改变。

## 2026-10-17 开发验证记录

历史归纳、下一阶段规划及生产人工验收清单已通过
[PR #1124](https://github.com/npcink/npcink-ai-cloud/pull/1124) 合并到 master。
本模式在该合并版本 `585aa660` 上的工作树候选完成以下验证；记录代表开发证据，
不代表本模式已合并或已上线。

- 完整四步回归通过：严格类型检查、6 个源码契约、22 项 API 测试、15 项浏览器
  用例；浏览器零跳过、零重试。步骤合计约 22.4 秒（本机缓存依赖/构建条件）。
- 本地完整回执：`.tmp/critical-regression/run-77ukywq2/receipt.json`，
  `complete=true`；工作差异哈希为
  `ea2ed6cac32c8273104d75a7263babb2f64d3eab577813e6142cbc50c241becb`。
- 执行器契约 12 项、命令清单契约 11 项、聚焦 Ruff/ESLint、shell 语法、
  `check:admin-ui` 通过。初始检查暴露并修复测试配置/fixture 类型问题；首次
  API 导入的默认数据库网络访问被审计钩子拒绝，随后显式固定内存 SQLite。
- Provider 付费调用、M4、Docker、生产操作均未执行。邮箱收件和真实写作
  仍按生产清单由操作者验证；不得用本地替身结果勾选这些验收项。

完整回归后仅补充本文记录并移除 Next 自动生成的声明差异；功能输入未再修改。

受保护发布前复核另补一个回执修复：首尾比较 HEAD，防止运行中提交改动后
工作差异重新为空而掩盖版本变化。新增该失败场景后执行器契约为 13 项通过，
聚焦 Ruff、6 个源码契约及 22 项隔离 API 再次通过；局部回执为
`.tmp/critical-regression/run-40ct77yd/receipt.json`。本次未改变浏览器输入，
复用此前浏览器证据；PR 检查和最终合并状态见本会话收口记录。
