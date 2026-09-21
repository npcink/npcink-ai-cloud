# WordPress AI 开发阶段收尾审计 — 2026-09-21

## 原定目标与结论

使用官方 WordPress AI 验证 Runtime、路由、Provider、人工保存和反馈归因，
保持 WordPress 的最终写入权。原始计划还要求真实用户自然使用的证据，
不能用三次本地模型调用替代自然样本、质量结论或生产验收。

**工程改动已合并；不能据此宣称所有历史问题、测试和清理均已完成。**
本记录修正此前任务中“全部闭环”的过宽表述。会话可以作为阶段性交接结束，
但下表的未完事项必须保留。生产继续遵守现有暂停策略。

## 完成情况与证据

| 项目 | 已核对的证据 | 结论 |
| --- | --- | --- |
| Responses 边界、质量 v2 | [Cloud #971](https://github.com/npcink/npcink-ai-cloud/pull/971)，合并 `c31a7db464450b86b274fb3047a2d59479edc39f`；ADR-054 与 rollout plan 已入库 | 工程实现已合并 |
| DB Provider 能力就绪投影 | [Cloud #973](https://github.com/npcink/npcink-ai-cloud/pull/973)，合并 `4c72ef1139df653502e8b36ab45f9c0dcffead10` | 已合并 |
| M4 acceptance | 本次只读 status 再次返回 `accepted`、PR `973`、`source_branch=master`、`source_dirty=false`、上述 `4c72ef11…` | 已确认；上一阶段记录 focused API tests 8 passed |
| Addon 业务测试和文档 | [Addon #154](https://github.com/npcink/npcink-cloud-addon/pull/154)，合并 `078bf419a49ff8e8d4344902a8f4721c8ab8c16c`；本地 `ef54a92` 与远端合并树 diff 为空 | 已合并；包含浏览器 runner 和测试，不能称为“纯文档 PR” |
| 本地业务路径 | Addon 日期证据记录了 fake 核心流程、取消、权限拒绝、并发标签页、签名传输、Cron、升级回滚、Ollama 三次调用及清理 | 有分场景工程证据，不代表全部场景覆盖 |
| 自然使用及质量毕业条件 | rollout plan 的七日窗口、至少 50 个自然观察与人工决策条件，没有完成记录 | 未证明完成 |
| 中央跨仓库 gate | 本次 `composer quality:matrix` 返回 exit 1，六个存在的目录均被识别为 `not a git repository`，`Gates=not_run`；同轮直接 Git 可读取 Cloud 和 Addon | 工具执行证据无效，须排查子进程 Git 环境并运行有效矩阵；不报告绿色 |

## 待处理问题

1. **补齐测试缺口清单。** Addon local-business-validation-plan-v1 的空/短/长输入、
   中英文混合、超时、429、5xx、malformed、reasoning-only、正常 autosave 等项目，
   本次未逐项找到端到端验收证据。单元测试与浏览器证据分别记录，不得混算覆盖。
2. **语义评审独立验收。** Ollama 三次成功与精确保存证明技术和数据路径；
   仅有哈希、run 状态和保存次数不能证明摘要忠实性、标题相关性和改写保真。
   补内容就地人工评审结论，不上传正文，不自动增加付费调用。
3. **上游网关单列。** 历史 `mqzj` Responses 的 reasoning-only / instruction-like
   输出问题没有被本地 Ollama 的成功修复。ADR-054 的失败关闭和禁止静默降级继续有效。
   再测需明确网关变更、预算和停机条件。
4. **兼容性合并门禁差距。** Addon #154 在 `2026-09-20T17:42:55Z` 合并；
   初次 stable-regression 下载返回 403，重跑至 `17:44:09Z` 才全部绿色。
   本次读取 master required contexts 只有 `PHP contracts`、`PR body contract`、
   `Release static gates`，不包含 `WordPress AI compatibility blocking lanes`。
   这与 rollout plan 的 blocking 表述不完全一致。需要单独校准保护规则；本次未修改。
5. **更新旧状态。** Addon 日期记录顶部仍称 Cloud acceptance 未完成；Cloud rollout
   中也保留 earlier working-tree/gateway 阶段状态。历史事实保留，当前状态以本次审计
   的已核验 PR/M4 结果为准；后续不要把早期状态直接当作现在的结论。
6. **生产和自然试点。** 继续暂停生产发布；自然试点、付费 Provider 预算和质量毕业
   是独立事项，不能借本次合并或会话关闭自动授权。

## 分支与 worktree 保留清单

“无未提交文件”与“清理完毕”分别验收。本次没有删除任何分支或 worktree。

- Cloud 主工作区 `/Users/muze/gitee/npcink-ai-cloud`：审计开始在已合并 feature
  `codex/entitlement-db-provider-eligibility`，随后创建本次文档审计分支。
- Cloud 长期 worktree `/Users/muze/gitee/.worktrees/npcink-ai-cloud-m4-ops`：
  `master=4c72ef11…`，需要保留。
- Cloud 旧 worktree `/Users/muze/.gitee/.worktrees/npcink-ai-cloud-wp-output-fix`：
  `codex/wp-ai-output-fix=58e0d957…`，锁为 `codex:wp-ai-output-fix-superseded`；
  相对 master 有独立历史差异。名称中的 superseded 不是可删除证据。
  必须先核对旧补丁已被接受实现替代、无 owner/handoff、无独立交付，再按生命周期处理。
- Cloud 还保留 `codex/wordpress-ai-runtime-closeout`、
  `codex/retire-expired-openssl-exceptions` 等本地及远端分支；远端还有其他历史 topic。
  未逐一证明安全删除，不宣称已清完。
- Addon `/Users/muze/gitee/npcink-cloud-addon`：只有主 worktree，干净；
  本地业务验证分支与远端 master 树相同，但本地 master 仍是旧 `7797cdd…`。
  还保留 `codex/wordpress-ai-quality-v2` 等分支。API 发布的 topic commit 与本地
  历史 SHA 不同，应以 merged PR 和完整树等价核验，不能仅靠祖先判断。

## 复盘与复用规则

| 问题 | 方法上的原因 | 后续规则 |
| --- | --- | --- |
| 把阶段性工程成功称为全量完成 | 没逐条对照原始毕业条件 | 用已完成、未验证、暂停三类逐条核销 |
| 把 UI 可见/保存成功称为语义合格 | 用技术指标代替业务判断 | 单独记录人工语义评审 |
| 把干净 worktree 称为已清理 | 混淆文件状态和 Git 拓扑 | 对每个分支/worktree 分别检查合并、唯一交付、归属与保留条件 |
| 误称 #154 纯文档且检查通过后合并 | 只看最近 commit 与最终绿色 | 审查完整 base-to-head diff，以及 mergedAt 和各 check 时间 |
| 发布绕过统一 publisher 使用 Git API | 网络恢复时偏离标准路径 | 下次先修复已授权 Git 凭据/网络；例外须明确记录树等价和发布策略差异 |

做得好的部分：Provider 预算封顶、run ID 归因、fixture 清理、WordPress 写入边界、
升级明文凭据失败关闭、Cloud clean-master M4 acceptance 均有独立证据。

下次重点关注：先完成未测场景和语义评审清单、校准兼容性保护规则、修复中央矩阵
执行环境，再安排一次专门的分支/worktree 清理。新任务应读取本报告和下列标准，
不要依赖此前会话中的“全部完成”摘要。

## 已沉淀文档

- [Responses ADR-054](../decisions/054-responses-output-boundary-and-no-silent-downgrade.md)
- [Runtime 分阶段计划](../wordpress-ai-runtime-validation-rollout-plan-v1.md)
- [质量事实与归因规范](../editor-assist-quality-flywheel-v1.md)
- [单会话 worktree 生命周期](../single-session-worktree-lifecycle-v1.md)
- Addon 本地 `docs/local-business-validation-plan-v1.md`、
  `docs/local-business-validation-evidence-2026-09-20.md`、`docs/local-test-guide.md`
  （均随 #154 合并）。

以上审计只读取运行时，没有额外 Provider 调用、M4 sync/deploy 或生产操作。
