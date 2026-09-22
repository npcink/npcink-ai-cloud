# Engineering Follow-up Queue v1

Status: active engineering backlog. 记录已判断为"低收益/收益递减、暂缓执行"的
工程清理与整改项，以及近期已完成的工程整改索引，防止后续会话重复规划。本文
不构成发布授权；产品主线见
[next-stage-plan-2026-09-22.md](next-stage-plan-2026-09-22.md)。

取舍原则（操作者 2026-09-22 确认）：优化做不完，先做收益高的；其余记录于此，
后续再做。每项标注建议触发条件——条件不满足就不动。

## 1. 待办队列（按建议优先序）

### 1.1 i18n 死键后续批次

- 事实：#1000 已建立 34 个动态键族契约
  （`frontend/tests/unit/i18n-dynamic-key-families-contract.mjs`）并删除首批
  300 个验证死键；同规则剩余候选约 1,687 个；另有 335 个 zh-only 键（en 无
  对应）待裁决。
- 成本/收益：每批需要用最新守卫重跑分析（键集随代码演进变化）、双侧同步删
  除、扩展 vitest 守卫；收益为目录减重，无运行时收益。**收益递减**。
- 建议触发：任何触碰 `frontend/src/lib/i18n.ts` 结构的任务顺带做一批（每批
  ≤300）；zh-only 键在决定是否支持英文回退策略时一并裁决。
- 工具：`.tmp/i18n_dead_keys.py`（analyze/apply，转义正则契约引用已在硬门
  内）为一次性脚本未入库，重做时按 #1000 的提交说明重建规则。

### 1.2 有界动态键族枚举化

- 事实：`admin.troubleshooting.failure_*`、`admin.plans.state_*` 等族的值空
  间是有界枚举（schema/timeout/unknown 等），可改为显式键常量导出，缩小
  "必须整族保护"的面。
- 建议触发：仅在继续做 1.1 批次时顺带做对应族；单独做不划算。

### 1.3 PBKDF2 全局静态盐

- 事实：`app/core/security.py` 的 `SECRET_HASH_SALT` 为全局固定盐（21 万次
  迭代缓解）。改为 per-record 盐需要迁移既有 hash，属行为变更。
- 建议触发：任何触及站点密钥/登录码存储 schema 的任务时一并设计；单独迁移
  风险大于收益（当前无外部用户）。

### 1.4 dev/CI 依赖安装消费 uv.lock

- 事实：`make bootstrap-dev` 与 CI 用 `uv pip install -e '.[dev]'`（不消费
  uv.lock）；仅生产镜像经 `uv export --locked` 真正锁版本。
- 建议触发：出现一次"本地/CI 与生产依赖不一致"的实际故障时改为
  `uv sync --locked`；预防性改动会拖慢所有 CI 引导，暂不做。

### 1.5 RuntimeService / CommercialService 拆解

- 事实：`app/domain/runtime/service.py`（约 6.7k 行）与 CommercialService
  mixin 拼装（约 1.9 万行）仍是最大结构债；
  [refactor-deletion-inventory-v1.md](refactor-deletion-inventory-v1.md) 已
  规定"行为保持委托抽取、先加表征测试、一次一个职责"。
- 建议触发：下一次需要在这两个文件里做功能任务时，先做该任务触及职责的
  抽取切片；不做无任务驱动的纯拆解会话。

### 1.6 前端数据加载统一（react-query）与 features 抽取

- 事实：10+ 个 admin 页面仍用复制粘贴的 AbortController 样板；
  `@tanstack/react-query` 已安装且 `AdminQueryProvider` 存在，仅 7 处使用；
  `admin/support-requests/page.tsx` 的 7 行薄壳是目标形态。
- 建议触发：任何 admin 页面功能任务改到该页时，迁移该页到 react-query +
  features 抽取；一次一页。

### 1.7 测试体系提速与脆性

- 事实：Playwright 强制 `workers: 1` 串行 40 个 spec；91 个源码文本型契约
  测试与源文本强耦合；`frontend/tsconfig.json` 排除 tests（测试不做类型检
  查）。
- 建议触发：e2e 套件耗时成为日常阻塞时再做并行化；文本契约在其误报第一次
  实际阻碍重构时逐个转行为断言。

## 2. 已完成（2026-09-21/22，防重复规划）

- async 阻塞集群全关：路由层 #982、认证热路径与幂等管道 #983（PBKDF2 随
  #982 路由包装覆盖）。
- `app.dev` → `app/ops` 迁移完成，`app.dev` 包已删除：删除波 #986、reencrypt
  #987、运维工具波 #993、live_site 终波 #1001；生产镜像混入开发工具问题随包
  删除消解。
- 仓库清理波 #989：p5-b4 proof compose 归档、孤儿脚本删除、前端开发文档重
  校准、i18n 首批死键。
- i18n 动态键族契约 + 300 死键 #1000。
- CI 修复：选择器 impact 条目 #990、master E501 热修 #999、targeted 车道全
  仓 ruff 缺口修复（本批）。
- pg18-proof 泳道经评估**决定保留**（生产 PG18 契约唯一证据桥，CI 零执行成
  本；退役条件见讨论记录）。
- Mimosa 预提交门禁降为 warn 模式（`~/.zshrc`）。

## 3. 维护规则

- 完成一项就把它从第 1 节移入第 2 节并注明 PR 号；新发现的低收益项按同一
  格式追加（事实/成本收益/建议触发）。
- 本文档是队列不是承诺：任何项开始前仍须按 AGENTS.md 建变更信封。
