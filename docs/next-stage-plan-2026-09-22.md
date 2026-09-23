# 下一阶段执行计划（2026-09-22）

Status: operator-directed next-stage execution plan. 本文记录方向、顺序、出口标准
与新会话提示词；不构成发布授权、完成声明或暂缓决定的变更。

依据：[strategy-positioning-v1-2026-09-21.md](strategy-positioning-v1-2026-09-21.md)、
[local-first-validation-stage-2026-09-21.md](local-first-validation-stage-2026-09-21.md)、
[site-knowledge-inventory-2026-09-21.md](site-knowledge-inventory-2026-09-21.md)，
以及操作者 2026-09-22 的事实确认与"新开会话逐一落实"的指示。

## 0. 事实基线（操作者 2026-09-22 口头确认，证据文档待补）

- cloud.npc.ink 服务器位于境内，已有 ICP 备案，可正常访问；API 延迟未实测。
- 支付宝真实收款已以个体工商户主体实测成功；退款功能未完成。代码层的退款
  adjustment 与幂等保护已存在（payment/credit 契约文档），缺的是真实退款流程，
  具体缺口待 P1 盘点确认。
- Mimosa 预提交门禁已由操作者在其他会话处理。
- 会话原则：每个会话只处理本会话内容；其他会话的在途工作树与分支不碰。

## 1. 阶段 0：事实缺口（可立即执行，几乎零开发）

| 事项 | 动作 | 产出 | 为什么现在 |
| --- | --- | --- | --- |
| 境内延迟实测 | 从境内观测点对 `/health/live` 与一次真实 runtime 调用采样 | dated 观测文档（P3） | 延迟决定阶段 B 公共内容 API 的同步/异步/流式形态 |
| 退款缺口核实 | L2 盘点：退款代码面逐项标注"已实现/未实现/未验证" | dated 盘点文档（P1） | 收款已通，退款是商业闭环仅剩缺口 |
| 支付与境内事实记录 | dated note + 收窄战略文档风险节 | dated 证据文档（P2） | 避免后续 closeout 引用过时的"收款暂缓"基线 |

## 2. 阶段 A：完成本地优先 5 信号（当前主线）

- 按 local-first 计划原样执行：标题 happy path 先通，每次只补一个最有价值的
  失败场景（空结果、超时、格式异常、重复请求、保存边界）。
- 每次真实试用后在最小记录表填一行（完成情况/修改量/是否愿意再用/卡点）。
- 出口：计划的 5 条完成信号逐条打勾；不设日历期限。
- 缺陷修复会话使用 P4 模板；一次会话只修一个所属模块。

## 3. 阶段 B：公共内容 API 最小竖切（A 完成后启动）

1. 第一步为 P5 设计草案（docs-only）：context 检索端点与 generation 执行端点
   **分离定义、独立计量**（混合 BYOK 前提）、公开 key 鉴权（域名绑定、限额、
   限速）、CORS 策略；
2. 实现 MVP：2-3 个端点（title/summarize + 一个 context-only），WordPress 侧
   先用现有 cloud-addon 打通，不先做轻插件；
3. M4 验证 + 自有站点 dogfood；
4. 同期把 agent_feedback 接上真实采纳数据（数据互联层的第一批真实数据，
   优先级高于任何新功能）。

出口：自有站点调通一个 context+generation 闭环，计量与限额真实生效。

## 4. 阶段 C：WP 6.x 轻插件（最后立项）

- 触发条件：阶段 B 的 API 在自有站点稳定使用 2-4 周；
- 形态：单插件、WP 6.x 兼容、编辑器侧栏、BYOK 优先（SiliconFlow/DeepSeek
  key）+ Cloud key 可选；
- 这是五插件套件之外的新分发面，需正式立项决策（新仓库、AGENTS.md、边界
  文档），届时单独评审。

## 5. 继续冻结

Cloud Batch Runtime、微信支付、broad admin 面、Typecho/静态站连接器、媒体
治理新面——维持 [strategy-positioning-v1-2026-09-21.md](strategy-positioning-v1-2026-09-21.md)
第 8 节的纪律。

## 6. 新会话提示词（逐字复制，一个会话一个任务）

### P1 退款缺口核实（L2 盘点，不实现）

```text
任务：核实 Npcink AI Cloud 支付退款功能的真实缺口，输出 dated 盘点文档，不实现任何代码。
背景：操作者（个体工商户）已实测真实支付宝收款成功；退款流程疑似未完成。已知代码层存在订单/支付事件/退款 adjustment/AI credit 退款的唯一键、锁与幂等保护（见 docs/payment-gateway-contract-v1.md、docs/ai-credit-charge-contract-v1.md、docs/cloud-open-callback-boundary-v1.md）。
步骤：1) 按 AGENTS.md 启动协议读 README 与开发验证工作模型，风险分类 L2（商业资金面）；2) 盘点 app/domain/commercial 中退款相关代码路径（真实退款 API 调用、Portal 入口、Admin 入口、对账与异常重放），逐项标注 已实现/未实现/未验证 并附文件路径；3) 对照 docs/local-first-validation-stage-2026-09-21.md 的暂缓清单，标明哪些缺口属于"真实退款操作"暂缓范围；4) 产出 docs/refund-gap-inventory-<日期>.md（证据路径、缺口清单、后续任务拆分与验证门槛建议），并更新 docs/README.md 索引。
非目标：不发起真实退款、不动生产、不改支付代码、不配置真实支付参数、不碰其他会话的工作树。
验证：文档链接检查 + git diff --check + check:changed --plan；development lane 收口，PR 发布与合并由操作者决定。
```

### P2 支付与境内事实 dated note（L0 docs）

```text
任务：把操作者 2026-09-22 确认的两个事实写成 dated 证据记录，并收窄战略文档的风险表述。
事实：1) cloud.npc.ink 服务器位于境内、已有 ICP 备案、可正常访问，API 延迟未实测；2) 支付宝真实收款已以个体工商户主体实测成功，退款功能未完成。
步骤：读 docs/strategy-positioning-v1-2026-09-21.md 第 9 节与 docs/local-first-validation-stage-2026-09-21.md 支付节；新增 docs/payment-and-domestic-readiness-note-2026-09-22.md（注明来源为操作者口头确认、证据待补）；把战略文档"境内就绪度未确认"收窄为"仅延迟未测"；在 local-first 文档顶部 Status 行下加一行状态指引指向新 note，不改动其正文原文。
非目标：不改代码、不动生产、不改变暂缓决定本身、不碰其他会话的工作树。
验证：链接检查 + git diff --check + check:changed --plan（documentation-only）。
```

### P3 境内延迟实测（观测任务）

```text
任务：实测 cloud.npc.ink 的境内访问延迟，产出 dated 观测文档，用于决定公共内容 API 的同步/异步/流式形态。
步骤：1) 从可用观测点（本机；若可行再加一台境内服务器）对 https://cloud.npc.ink/health/live 采样不少于 20 次，记录 P50/P95/失败率与观测点网络位置；2) 若操作者在场，借助站点侧 cloud-addon 的签名请求对一次本来就要进行的真实 runtime 调用计时（不为测量制造额外付费调用）；3) 产出 docs/domestic-latency-observation-<日期>.md：方法、数字、阈值结论（P95<1s 支持同步端点；1-3s 建议异步或流式；>3s 需境内加速或边缘方案）。
非目标：不改代码、不压测、不制造流量、不动生产、不碰其他会话的工作树。
验证：文档门禁；development lane。
```

### P4 阶段 A 缺陷修复会话模板（可重复使用）

```text
任务：本地优先验证阶段的一次聚焦缺陷修复（本会话只修一个问题）。
开场必读：docs/local-first-validation-stage-2026-09-21.md 的"完成信号"与"最低成本工作方式"，docs/next-stage-plan-2026-09-22.md 第 2 节。
本次缺陷：<一句话：哪个入口、期望 vs 实际、复现步骤或错误类别>
要求：先定位所属模块并声明变更信封；只修该模块；失败分支优先用确定性夹具复现，不为复现调用付费模型；改动后跑覆盖该缝的最窄检查（focused pytest/合同测试），需运行时证据时走 M4 lane（pnpm run m4:preview:test -- --focused <路径>）；在试用记录表补一行结论（完成情况/修改量/是否愿意再用/卡点）。
非目标：不顺手修别的、不扩面、不改 Provider 配置、不动生产。
```

### P5 公共内容 API 设计草案（L0 docs，阶段 B 第一步）

```text
任务：产出公共内容 API 设计草案（docs-only）。触发条件：本地优先标题 happy path 已稳定，或操作者明确提前授权。
必读：docs/strategy-positioning-v1-2026-09-21.md（第 7 节混合 BYOK 与端点分离纪律）、docs/site-knowledge-inventory-2026-09-21.md、docs/multi-platform-connector-boundary-v1.md、docs/refactor-master-plan-v1.md、docs/next-stage-plan-2026-09-22.md 第 3 节。
草案必须包含：1) 端点清单——context 检索与 generation 执行分离定义、独立计量（title/summarize/tags + 一个 context-only 起步）；2) 公开 key 鉴权模型（域名绑定、限额、限速、与现有 mak1_ 站点密钥的关系）；3) CORS 策略；4) 与现有 /v1/runtime/execute 契约的复用与边界；5) 混合 BYOK 的开关式接入路径（自带 provider key 时 Cloud 只提供上下文）；6) 里程碑与每步验证门槛（M4 lane）。
产出：docs/public-content-api-design-draft-v1.md + docs/README.md 索引。
非目标：不写代码、不实现端点、不新增模型调用、不动生产。
验证：链接检查 + git diff --check + check:changed --plan；PR 合并由操作者决定。
```

## 7. 交付与证据状态

development lane、documentation-only、L0。基线：master `3573b900`（PR #987
之后）。本文不改变任何现行暂缓决定；阶段 B/C 的启动以第 3、4 节出口/触发
条件为准。回退：revert 单个合并提交。

## 8. 增补（2026-09-22 计划补录）：开放前必做项 — Provider 账户级预算硬上限

> 本节为 2026-09-23 对本计划的增补，补录 2026-09-21/22 战略会话已确认、但本计划
> 发布时遗漏的缺口；上文原有条目（第 0-7 节）未改动。

- **必做项：Provider 账户级预算硬上限**——账户级每日/月度 USD 硬上限、预算告警、
  超限自动停用三层。现状与差距的逐项盘点（含文件路径证据）见
  [provider-budget-hard-cap-inventory-2026-09-23.md](provider-budget-hard-cap-inventory-2026-09-23.md)：
  三层在已提交 master 上均未实现，已有的只有客户侧限制（AI credits/套餐 budgets）、
  事后成本计量与本地实验 ledger。
- 设计依据：[ADR-055](decisions/055-provider-account-level-spend-budget.md)
  （2026-09-22 经 PR #1007 合入，已接受、未实现）；
  [compat-stability-payment-follow-up-handoff-2026-09-22.md](compat-stability-payment-follow-up-handoff-2026-09-22.md)
  待办 #3 已把实现 PR 列为先于任何付费 Provider 调用授权的前置。
- "开放前"指：外部试用者接入、阶段 B 公共内容 API 上线、正式收费任一发生之前；
  更强的既定门槛是任何付费 Provider 调用授权之前。
- 实现与验证门槛：L2（迁移、worker、运行时行为），focused pytest + dispatch
  扼点合同测试 + M4 运行时证据 + 操作者 smoke；详见盘点文档第 5 节。
