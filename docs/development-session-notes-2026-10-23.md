# 开发会话操作经验记录（2026-10-23）

Status: dated development experience record. 记录 2026-10-23 会话中可复用的
诊断顺序、边界写法与流程经验，供后续 AI 会话与操作者参考；本文是经验记录，
不是新的强制标准（现行权威仍是 AGENTS.md、操作模型、验证分层与 CI 契约）。

本日交付链：#1208（`running` 状态有界自动 fail 兜底）→ #1209（current master
的 e2e 重扫与两条过期断言对齐）→ 本文（经验沉淀）。

## 1. 继承来的失败数字是负债，不是基线

- Phase 2 早期文档写着"大约 50 个 e2e 失败"。在 current master `244cab8f`
  上跑完整本地 Playwright，实测是 **261 passed / 3 failed / 2 skipped**
  （5.3m）。两个数量级以上的偏差说明：上一轮的数字是**当时某个快照的印象**，
  不是可继承的基线。
- 处置规则：任何"失败数量""绿/红状态"的转述，都要先在**当前 master**上重扫
  才能当作事实；文档里出现的数量必须带**测量时的 commit**和**命令**，
  否则下一个会话只会继续引用过期数字。已按此改写
  [phase-2-3-follow-on-v1.md](engineering/phase-2-3-follow-on-v1.md) §2.1。
- 跳过数也要分类。本轮的 2 个 skip 是**有意门控**
  （`NPCINK_CLOUD_FRONTEND_BASE_URL` 与 `NPCINK_CLOUD_SETUP_STATE_OVERRIDE=pending`），
  不是环境坏了，也不是债务；混进"失败"里会虚增工作量。

## 2. 过期断言 vs 产品 bug 的判定顺序

两条失败都不是产品 bug，而是断言落后于**有意的产品变更**。可复用顺序：

1. **先本地确定性复现**，再分类。单独重跑该 spec，确认它每次都同样失败，
   排除时序 flaky。
2. **找到改掉产品的那次提交**，别停在"断言和 UI 对不上"。
   本轮：#1119 让 `resolveUiErrorMessage` 对 `ApiError` 一律回退到本地化
   兜底文案（后端措辞降级为诊断数据）；#1198 把 audit 描述收进 header 的
   ⓘ 提示（安静化改造，文案只在弹层打开时挂载）。
3. **判断那次变更是不是有意的**。有意的，就归为过期断言；把断言改到**新的
   用户可见结果**上，而不是改产品去迁就旧断言。
   - `admin-account-site-runtime.spec.ts`：断言本地化加载失败文案
     （`Failed to load data|加载数据失败`），不再断言后端原话。
   - `portal-workspace-path.spec.ts`：断言挂在 header ⓘ 提示上——先用
     `aria-label` 断言可访问名，再 hover 后断言 `data-portal-info-hint="panel"`
     里的文案；比断言整页可见文案更贴近用户真实路径。
4. **断言要守住同一个意图**。重写后仍需证明"用户看到了失败/范围提示"，而不是
   把断言删掉换绿。

## 3. 定向选择门禁的盲区在"选择之外"

- 本轮两条过期断言**都不在** CI 的 `frontend` job 选择里
  （`admin-operator-path` / `admin-navigation` / `admin-acceptance-matrix` /
  `admin-ai-advisor-pc-v2` + `portal-workspace-path` 的四条标题 grep +
  变更视觉选择）。也就是说：**CI 全绿并不能证明这些文件没漂移**，
  选中范围之外的文件需要别的机制兜底。
- 这正是 [development-session-notes-2026-09-23.md](development-session-notes-2026-09-23.md)
  §4 记的"定向选择盲点"的新形态：盲点不在"选中的文件写错了"，而在
  **"没被选中的文件慢慢过期"**。完整套件重扫是唯一能发现它的手段。
- 复用做法：CI 门禁用窄选择控运行时，但**周期性地跑一次全量**，并把全量
  结果作为独立证据记录（本地 / CI 分开记账）。

## 4. 视觉基线不得在断言 PR 内顺手重生成

- register 页 `portal-register-current` 本地漂移约 3%（35 680 px）。该 spec
  不在 CI e2e 选择里，所以只有 darwin 基线、没有 linux 基线。
- 处置：**不在断言 PR 里 `--update-snapshots`**。像素漂移可能是真回归，
  重生成基线会把回归证据洗掉；正确路径是"有意更新基线 + 人工目检验收"，
  两件事分开记账。
- 选 PR 范围时按**模块**切，不按"顺手"切：视觉基线、契约、运行时代码
  分属不同评审面。

## 5. P0-1 的边界写法：不伪造 Provider 证据的有界兜底

- `running` 状态此前只有 operator-only 建议，进程崩在 Provider 执行中会永久
  卡住。落地为有界自动 fail：超过
  `max(1800, timeout_seconds * (attempts_per_candidate * 2 + 1) + 900)` 才动，
  且必须先取行锁再复核状态/年龄。
- 关键约束：**不产生任何 Provider 用量、结果或扣费证据**，不重放请求；
  只写 `runtime.stale_running_auto_failed`（不可重试、不可 fallback），
  让正常终态回调去收尾。原"不自动重放 Provider"的边界见
  [runtime-provider-transaction-boundary-v1.md](runtime-provider-transaction-boundary-v1.md)，
  本次是把该边界**显式记为例外**，而不是默默放松。
- 兜底上限复用 worker 批量上限（`runtime_worker_batch_size`），callback
  worker 传 0——自动修复只发生在真正有心跳的队列 worker 上。

## 6. 分支与 worktree 卫生：squash 合并 ≠ 提交在 master

- squash 合并会让本地分支的原始提交 SHA **不再出现在 master 历史里**。
  判断"是否已落地"要看 `git cherry` / 内容等价，不能看祖先关系。
- 反向的坑：**远端分支已删 + 本地仍有未合并提交 = 隐形工作**。本轮在主
  工作树发现本地分支 `codex/admin-ia-v2-workspaces` 的远端已 `gone`，但仍有
  4 个提交（约 8000 行：Admin 单位经济面板、Portal 账号注销与通知收件箱）
  **不在 master**；另有 9 个已改未提交文件、2 个 stash、4 个未跟踪路径。
  这类工作不会被任何门禁发现，只能靠逐条核对 commit 与 PR 状态。
- 处置约定：发布器**永不删分支**（多 worktree 仓库的硬约束），删除是合并后
  的独立动作，且需操作者授权；未被合并的提交要么开 PR，要么明确记录为
  放弃，不要留在"看起来干净"的分支上。

## 7. 流程操作要点

- 发布前 worktree 必须干净：`pnpm run build` 会重新生成
  `frontend/next-env.d.ts`，发布前要把它还原，否则 `pr:publish` 直接拒绝。
- 完整套件重扫放在**独立 detached worktree**里做，避免污染主工作树；
  扫完再在同一 worktree 上开分支做修复，节省一次依赖安装。
- 断言 PR 只改测试文件 + 对应 backlog 文档，不夹带产品代码与视觉基线。
- 文档里的数量、状态、"已通过"都要带测量依据；本地绿、CI 绿、M4 候选绿、
  已合并、M4 已验收、生产、人工验收是**分开的证据状态**，不要合并表述。

## 8. 遗留与挂起项（含再评估触发条件）

- **register 视觉基线**：保持延后。触发条件：操作者给出人工目检结论后，
  才做一次有意基线更新并单独记账。
- **M4 上的历史 `running` 孤儿 run**：#1208 只覆盖**未来**的新孤儿；
  M4 现存孤儿仍需一次只读盘点报告，再决定是否清理。
  触发条件：进入 Phase 2.2 时启动盘点，盘点本身不改状态。
- **Portal 502 / busy UX**：属于产品文案与交互面，排在 Phase 2.3，
  不与断言对齐 PR 混做。
- **本地未合并工作**（§6 的 4 个提交 + 未提交改动）：等操作者决定开 PR、
  记录放弃，还是先补齐验收。未经明确授权不合并、不丢弃。
- M4 未使用（本轮全部为测试/文档/运行时代码层改动），故无 M4 观察回执。
