# 开发会话操作经验记录（2026-09-26）

Status: dated development experience record. 记录 2026-09-26 Provider 预算收口
会话中可复用的流程经验与诊断思路，供后续 AI 会话与操作者参考；本文是经验记录，
不是新的强制标准（现行权威仍是 AGENTS.md、操作模型、验证分层与各合同文档）。

本日交付链：#1031（预算旁路收敛 + Admin 压力面 + dispatch 合同测试）→
#1035（合并通道修复：CVE 复核窗口续期 + 全量 mypy 基线恢复）→
#1036（预算实现状态文档对齐）。合并通道经验已被后续会话固化为
[merge-lane-operations-runbook-v1.md](merge-lane-operations-runbook-v1.md)；
本文记录该 runbook 之外的会话经验。

## 1. squash 合并会丢分支后续提交

#1029 squash 只包含发布时刻的内容；原分支上后续提交（旁路收敛、Admin 面与
阈值测试）没有进入 PR，静默留在未推送的本地分支。发现方法：合并后对
`origin/master` grep 关键标识（如 `claim_before_dispatch`、`account_class`）
并与 `git log --all --grep` 的提交主题比对。回收模式沿用 PR #985 先例：只读
审读原提交 → 按日期序 cherry-pick 到本会话新分支 → 门禁后合并（本次 #1031
第三次验证该模式）。注意先核实原分支是否仍挂在锁定工作树上（是则只读引用
提交对象，绝不写入对方工作树）。

## 2. 必需检查可能互相死锁，修复 PR 要并集规划

CVE 复核窗口是时间性门禁，到期后阻塞所有触碰 backend/deploy 路径的 PR；全量
mypy 失败阻塞同类 PR。两者被拆成两个修复 PR 时形成循环阻塞（A 等 B、B 等 A）。
解法：把两个通道修复合成一个 PR（#1035），一次过两道门。规划修复顺序时先画
"哪个 PR 触发哪些门禁"的依赖图再拆分；修复类小 PR 并不会因为改动小而少过门禁。

## 3. 依赖未锁定时静态门禁基线会漂移，且在 master 上不可见

`uv pip install -e '.[dev]'` 无 lock，CI 与本地同步漂移。master 上全量 CI
长期未跑时漂移不可见（#1030 之后 9 天无全量运行），一旦有 PR 触发该 lane 就
集中爆雷（本次为 24 处 SQLAlchemy Row typing 错误）。处置：注解级修复保持
跨版本稳健（显式注解 + `row[i]` 索引访问），并建议操作者评估 uv lock 锁定。
后续会话已陆续钉扎依赖（#1066-#1070）；"master 全量 CI 长期未跑 = 基线未知"
这一判断依据值得保留。

## 4. SQLAlchemy 2.0 的 Row 是变参泛型，不是 tuple 包装

`Row[A, B]` 表示两列（可解包为两个值）；`Row[tuple[A, B]]` 表示一列、其值为
元组——后者解包报 `Need more than 1 value to unpack`。跨模块传递多列行时用
变参形式；聚合标量解包遇到 `object` 推断时改用 `row[i]` 索引访问（返回 Any），
比逐个 cast 更省且跨版本稳健。

## 5. 管道吞退出码：规则要落到"推送前显式检查"

09-22 笔记 §2 已记录 `tail` 吞发布器错误；本次同类坑以 pytest 变体复发：
`pytest … | tail -2 && git push` 链中 pytest 失败被 tail 的退出码掩盖，把
失败测试推上了远端。固化规则：凡是"验证 → 推送/发布"链，验证一步必须
`rc=$?` 显式检查或拆成两条命令；`&&` 链左端是管道时，退出码永远来自管道
最后一个命令。

## 6. 共享 M4 活跃占用的可操作判定

接管或让位的判定依据：`m4:preview:status` 的 `deployed_at_utc`。距当前
<30 分钟且 `acceptance_state=candidate` 视为对方会话活跃，让位不覆盖；本次
两次检查（01:37Z 部署、复查时 14 分钟前刚重部署）均据此让位，promotion 留给
空闲窗口。让位决定要写进交付文档的剩余出口，避免下一个会话重复侦察。

## 7. 合同测试的"结构扫描 + 允许清单"模式

约束"所有 X 必须过 Y"类不变量（本次：所有适配器 `execute(` 调用点必须先过
预算 claim）时：扫描习语 → 允许清单（每项必须写理由）→ 双向断言（未清单的
命中报错；清单条目不再命中也报错防死条目）。新旁路路径无法静默进入，豁免
必须显式留名并给出理由。09-23 笔记的 grep 防死条目守卫是同一思路的特例。

## 8. 本地引用陈旧会得出反向错误结论

合并确认后未重新 `git fetch` 就 `git log origin/master`，会以为改动没合入
（本地引用停在合并前）。任何"以 master 内容为准"的判断前先 fetch；同理，
基于陈旧引用新建的分支要 rebase 后再编辑（本次盘点文档编辑前重放了一次）。

## 本会话遗留出口（详见盘点文档"实现合入更新"节）

Provider 预算的三层防线已合入 `master`（#1029/#1031），截至本文编写仍开放：
clean-`master` M4 promotion 与 accepted 证据、操作者配置
`provider_account_spend_budget` 并执行 warning/拒绝 smoke、rerank（Jina）与
web search httpx 兜底等裸 HTTP 付费路径的接入或显式豁免。现状核对以
[provider-budget-hard-cap-inventory-2026-09-23.md](provider-budget-hard-cap-inventory-2026-09-23.md)
为准。
