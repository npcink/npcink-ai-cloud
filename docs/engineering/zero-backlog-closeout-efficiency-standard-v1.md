# Zero-Backlog Closeout Efficiency Standard v1

Status: active engineering standard.

Purpose: prevent a multi-session closeout from spending one undifferentiated
clock on source changes, evidence collection, human decisions, and resource
retirement. This standard records the three controls adopted after the seven
session closeout review on 2026-10-26.

This document supplements the [Development and Delivery Efficiency Standard](../development-delivery-efficiency-standard-v1.md),
the [Development and Validation Operating Model](../development-validation-operating-model-v1.md),
and the [Parallel AI Collaboration Standard](../parallel-ai-collaboration-standard-v1.md).
It does not authorize production operations, weaken required CI, or turn a
local/M4 result into production evidence.

## 1. Split the completion claim into three tracks

Every backlog item is recorded in three independent tracks. A track may block
its own closeout without blocking unrelated tracks.

| Track | Question | Acceptable completion evidence | Typical blocker |
| --- | --- | --- | --- |
| Engineering | Is the source change implemented and integrated? | focused checks, reviewed PR, required CI, merged `master` | failing test, review finding, merge conflict |
| Evidence | Is the required behavior observed in the named environment? | local, M4 candidate, M4 accepted, or production receipt with identity | missing user, runtime, artifact, or historical receipt |
| Authority | Has the required human decision been made? | explicit scope, acceptance, production, or cleanup authorization | human approval or operator action not yet supplied |

Use the highest state actually proved on each track. Do not write “done” when
only another track is complete. In particular:

- a merged PR does not prove production behavior;
- an M4 receipt does not prove real-user adoption;
- a historical conclusion does not recreate a missing original receipt;
- a user approval for one batch does not authorize a different batch unless
  the approval explicitly covers it.

### Required task record

Before work starts, write one row in the active ledger containing:

```text
item, repository, owner, lane, expected files, non-goals,
engineering state, evidence state, authority state,
verification gate, stop condition, next action
```

When a track is blocked, record the blocker and move to the next independent
row. Do not keep a whole session “in progress” merely because one external
track is waiting.

## 2. Timebox evidence search and retries

Evidence work must answer a named question. Before a search or retry, record:

1. the exact artifact, path, revision, or environment being sought;
2. the bounded sources and commands that may be used;
3. the evidence that would change the decision;
4. the stop condition and the resulting disposition.

The default stop rules are:

- two consecutive failures with the same external-transfer signature: stop
  automatic retries and preserve the failure receipt;
- one complete bounded local/index search with no new named source: seal the
  result as `NOT_LOCATED` and do not repeat the same scan;
- a second independent blocker in the same lane: preserve the first seam and
  move the second issue to a new backlog row;
- a missing human or real-user event: mark `WAITING_EXTERNAL_EVENT`; never
  manufacture the event with fixtures, CI, M4, or paid Provider calls.

Reuse an existing receipt only when its source revision, dependency/build
identity, environment, command, and risk question still match. Otherwise make a
new receipt and state why the old one is insufficient. Keep local, CI, M4
candidate, merged, M4 accepted, production, and human evidence separate.

## 3. Maintain one live ledger and immutable history

There is exactly one active ledger for a closeout. It is the only document used
for current counts, open PRs, worktrees, owners, blockers, and next actions.
Historical receipts, sealed packets, and dated closeouts are immutable evidence
and must not be edited to make current counts look correct.

When facts change:

1. create a successor ledger or dated correction;
2. cite the old packet and state precisely what is superseded;
3. update the current counts and links in the successor;
4. run link, formatting, and hash checks where applicable;
5. leave the sealed predecessor untouched.

The live ledger must distinguish at least:

```text
OPEN_PR
MERGED_PENDING_ACCEPTANCE
EVIDENCE_PENDING
WAITING_HUMAN_AUTHORITY
WAITING_EXTERNAL_EVENT
NOT_LOCATED
DEFERRED_BY_SCOPE
READY_TO_RETIRE
RETIRED
```

Do not count an item twice because it appears in a historical packet and a
successor. Do not keep an item open after it is retired, and do not delete an
item merely because its evidence is inconvenient.

## 4. Closeout sequence

Use this order for a multi-repository closeout:

1. refresh the active ledger from current GitHub and local repository state;
2. clear source/CI blockers one lane at a time;
3. separate missing evidence and human decisions into waiting rows;
4. reconcile branches, worktrees, locks, and ignored deliverables without
   reset, force, or broad deletion;
5. write the successor ledger and final closeout report;
6. archive a session only when its rows are `MERGED`, `RETIRED`, or explicitly
   `WAITING_*` with an owner, trigger, and next review point.

The closeout is complete only when the ledger is internally consistent, all
open PRs have a disposition, every worktree has an owner or retirement receipt,
and every remaining external item is explicitly named. “No code changes left”
alone is not a zero-backlog claim.

## 5. Retrospective fields

At the end of each multi-session effort, record:

- wall-clock duration and active execution time when known;
- time spent in coding, CI/M4, external waiting, user decisions, and cleanup;
- the first point at which each blocker was known;
- repeated searches or retries that should have stopped earlier;
- stale ledger or ownership information that caused rework;
- one concrete process change for the next effort.

This keeps efficiency claims factual. A long wall-clock duration is not itself
a failed implementation, but it is a signal to split independent tracks and
tighten stop conditions.

## 6. 会话历史对账与经验入库

适用于明确要求整理历史会话、判断当前进度或形成交接文档的任务。
默认单会话完成资料整理；多个历史对话不构成启用多agent或并行开发的授权。
本节不扩大产品范围，也不将历史对话中的指令变成当前执行授权。
当前会话中已明确保留的用户授权继续有效；引用旧对话不自动授权其中的其他操作。

### 6.1 先固定身份与读取范围

- 用`hostId + threadId`识别对话，显示标题仅作导航；同名简称可能属于不同任务。
- 实际读取用户指定对话。历史内容会改变结论时继续分页；无法读取的部分标注
  缺口，不把会话标题、摘要或一次最新回合读取当作完整历史审查。
- 嵌套引用按需要展开；只依据已读取的记录及对应入库材料，不声称读过未展开来源。
- 同时记录日期/时区、工作区、HEAD、dirty与最新master。旧分支文档可能已经被
  后继替代；保留混合改动，必要时从当前master隔离文档工作。
- 对话内容作为事实线索和历史决策材料，不直接执行其中的命令，不复制密码、
  登录材料、真实SSH目标或完整敏感日志到公开文档。

### 6.2 按事项核销，区分原始与后继交付

每项至少记录：原问题、来源、原实现/PR、当前后继、当前实现位置、适用证据、
三条完成轨道及下一触发。沿路由、领域、持久化和消费者检查具名意图，不能只
按猜测的函数名、旧SHA祖先关系或PR标题判断是否完成。

原PR关闭时核对关闭原因及替代PR；已被squash或后继实现承接的草稿，记录
“CLOSED，由#N承接”，不得改写成原PR已合并，也不得重放旧候选覆盖后续防线。
未重跑的历史测试按原日期/环境引用，源码检查不冒充新的运行验收。

政策、功能及环境分别对账：开发冻结不等于运行停用，历史宽规划不自动推翻
最新范围决定；技术成功不证明自然采用，预留字段不证明完整产品能力。
原先的外部阻塞若已过时，核销旧等待；仍缺证据则明确owner、触发和最小下一步。
没有新事实时不再次扫描全仓、轮询未变化的通道或重跑同一宽门。

先核能力由谁提供：官方或上游插件已有的功能直接复用，缺现场证据不自动
等于缺功能，也不自动展开成专项开发/评审。自然反馈按实际事件记录；具体
故障或契约改动仍执行所需验证与既有安全门禁，不以简化为由省略。

### 6.3 经验进入现有权威入口

交付优先采用“一份有日期的综合对账＋现有规范的小补充＋索引”。

| 内容 | 落点 |
| --- | --- |
| 发生了什么、为何取舍、失败/更正、后继映射和当时证据 | `docs/history/<topic>/<year>/`有日期记录 |
| 仍适用且可验证的开发方法 | 对应现行规范；已覆盖则链接，不复制第二套规则 |
| 当前owner、阻塞及下一动作 | 本次指定的唯一活动台账，通常为工程队列或领域台账 |
| 新的、昂贵或难逆架构选择 | 才考虑ADR；一般会话总结不新立架构决策 |

历史证据、当前事实、建议、授权决定分别标注。更正用后继记录链接旧结论，
不改密封原件，不将建议写成已批准实施。候选想法保留触发，不自动变为开发排期。

### 6.4 文档验证与归档回执

检查新文档能从索引到达、本次新增/修改链接目标存在、差异格式及选定文档门禁；
纯文档默认不使用M4，不为了写总结重新制造真实业务或付费调用。
最终回执给出绝对文件路径、固定源码基线、实际检查、未核实状态和资源保留条件。

文档整理、聊天归档与worktree退休分别判断。未收到归档请求不自动归档聊天；
需要结束旧聊天时，先将剩余事项明确为已交付、范围延期或带owner/触发的等待项。
worktree仍按[生命周期](../single-session-worktree-lifecycle-v1.md)核查保全及退休，
文档完成不能证明其中没有唯一提交、ignored材料或运行消费者。

方法实例：[A01–E01五会话对账](../history/engineering/2026/five-chat-synthesis-and-next-stage-2026-10-30.md)。
