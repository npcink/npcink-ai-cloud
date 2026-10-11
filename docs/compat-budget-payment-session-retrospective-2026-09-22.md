# 兼容稳定性、预算与支付会话复盘 — 2026-09-22

Status: dated retrospective. This record distills reusable method from the
2026-09-22 session; open items live in the
[后续交接清单](compat-stability-payment-follow-up-handoff-2026-09-22.md),
which stays the current continuity authority.

## 会话做了什么（一段话）

从一次只读审计出发（compat 稳定性、Alipay 回放矩阵缺口、Provider 预算分层、
自然观察、生产暂停五项），经操作者批准分成三个执行阶段加一个观察阶段，
一天内以四个 PR 完成闭环：addon #155（下载重试加固 + 每晚定时矩阵 +
稳定性台账口径）、cloud #1007（ADR-055 账户级预算设计）、cloud #1008
（notify 路由级回放矩阵 9 场景）、cloud #1009（会话交接清单）。

## 可复用的执行模式

1. **审计 → 操作者批准口径 → 分阶段 → 一会话一模块 → 集中决策点**。
   先用只读核查把模糊问题变成可判定问题（例如"10 次连续"的计数口径、
   两本账），操作者批准后再动代码；需要操作者决策的事项攒齐证据后
   一次性列出，避免多轮往返。
2. **子代理分工**：实现类任务（addon CI 三件事、notify 测试矩阵）交给
   自包含 brief 的子代理——brief 里给文件行号锚点、硬约束（不改产品代码、
   不 commit、不 publish）、报告格式；主会话保留审查、提交、发布权。
   两个子代理均一次通过，主会话复跑测试后才提交。
3. **并行会话纪律**：发布用独立的加锁辅助 worktree，绝不触碰其他会话
   未提交的改动；主树需要腾分支时用 `git switch --detach` 原地切换，
   发布后恢复原状、辅助树即用即删。

## 本仓库的机械经验（下次直接照做）

- **新文档必须同时挂 `docs/README.md` 索引**，CI 的 Documentation
  reachability 门会拦未挂链文档；提交前本地先跑
  `python3 scripts/check_doc_reachability.py`（本会话唯一一次 CI 返工）。
- **发布器要求分支包含最新 `origin/master`**：长会话里 master 会移动
  （本会话两次），发布前先 `git fetch` 再 merge master 进主题分支。
- **脏工作树发布序列**（AGENTS.md 规定的落地版）：主树 detach 腾出分支 →
  `git worktree add <临时树> <分支>` → `git worktree lock --reason codex:<task>` →
  在临时树发布 → unlock → remove → 主树切回。
- **squash 合并后的分支清理**：`git branch -d` 会因无祖先关系拒绝，
  先 `git diff --stat origin/master..<branch>` 确认为空（内容已并入），
  再 `git branch -D` 与远端删除；只删自己会话的分支，其他会话的分支、
  m4-ops 稳定树、锁定中的辅助树一律不动。

## 方法沉淀

- **测试分层**：域层状态机覆盖不等于路由层覆盖；支付类公开回调端点
  应有一套路由级回放矩阵（本会话的九场景清单可作模板：合法成功、
  幂等重放、金额篡改、未知订单号、伪造/缺失签名、过期迟到回调与
  sweep 后及时对账、return 先于 notify、重复退款、部分后全额退款）。
- **稳定性证据方法学**（addon 台账已固化）：账 A 只认合入后首轮运行、
  任何首轮失败清零；账 B 统计第三方失败率；定时运行只算环境证据；
  升级 required 的门槛与归属写死，避免"感觉差不多了"式决策。
- **安全兜底设施先 ADR 后实现**：把"执行单点、复用既有数据、非目标、
  简单性条款"写进决策记录（ADR-055），实现与付费授权各自独立授权，
  防止兜底设施自身膨胀成子系统。
- **Mimosa 提交门应对**：发现全为既有测试占位符误报时，会话内以
  操作者明示授权 + 透明脚本（内容注释、即用即删、报告披露）通过；
  根治路径与优先级见交接清单第 8 项。该门同时拦截 `git commit` 与
  `git push` 命令串，且按工作区项目扫描而非按改动文件扫描。

## 教训

- CI 门在本地有对应脚本时应作为提交前预检（reachability 门即属此类）。
- 同一工作树被多会话共享时，编辑前重读文件（本会话 README 一次
  freshness 冲突，重读即解）；子代理工作期间不要在同一工作树切分支。
