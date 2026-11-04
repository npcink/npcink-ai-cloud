# Portal Phase 2 e2e 断言批次 — 过程复盘（2026-10-22）

Status: time-bounded Portal historical evidence; not current Portal authority.

Current authority:

- Phase 2–3  backlog：[phase-2-3-follow-on-v1.md](../../../engineering/phase-2-3-follow-on-v1.md) §2.1
- 布局与验收：[Portal UI Spec](../../../portal-ui-spec.md)（含 §7 / §9 自检门禁）
- 会话协议：[AGENTS.md](../../../../AGENTS.md)

## 1. 本轮做了什么

在 Phase 2「让 master e2e 可信」切片里，把**能明确对齐产品语义**的 Playwright 断言债拆成多批小 PR，经聊天点头后逐个 squash 合入 `master`：

| 批次 | 结果（摘要） |
| --- | --- |
| #1189–#1193 一带 | 安静首页 / readiness / usage 路径等与现 UX 对齐 |
| #1194 | 套餐站点用量弹窗路径 |
| #1195 | QQ 登录选项 mock、会话过期/读失败弹窗、活动审计顶栏「账号」、注册 QQ 回跳 |
| #1196 | PC 表格走套餐站点用量弹窗；停用后主 CTA 认「激活」 |

尖端参考：`3009b068`（#1196）。**未**宣称全量套件绿；**未**动 orphan 修复、502/busy UX、Phase 3、Dependabot / #1183。

## 2. 清晰 vs 不清晰

- **清晰（可直接改断言）**：选择器 / 文案 / 导航已随安静计费与顶栏 IA 改完，测试还在盯旧 `view-tabs`、旧 Continue connection、旧账号入口等。
- **不清晰（需产品/视觉验收）**：登录/注册页 `toHaveScreenshot` 约 3% 像素漂移——必须单独「更新快照 + 人眼接受」，不能塞进断言 PR 里顺便 regen。
- **仍闸**：orphan `running` 清理、Portal 502/busy UX、Phase 3；全量失败数需在**当前 master** 上重扫后再报，勿沿用历史「~50」。

## 3. 可复用的协作思路

1. **一批一 PR，聊天显式同意再合**  
   代理只开 PR、报 URL；合并权限留在操作者（`merge-…` 一类明确指令）。禁止代理自称已合或开 auto-merge 默认合掉。

2. **先分簇再动手**  
   「断言过期」与「截图基线 / 产品未决」分开；后者写进 follow-on，不要用测试绿洗产品债。

3. **合完即剪枝**  
   squash 进 `master` 后删本系列 worktree / 题分支并 `fetch --prune`；主检出落后或夹带未提交噪声时单独处理（勿 `reset --hard` 除非点名）。

4. **自检 / Spec 门禁不另造轮子**  
   UI 交付仍走 Spec §9；本文件只记批次协作与边界，不重复 §7 验收条文。

## 4. 收尾状态（写文档当日）

- [x] 断言对齐批次 #1189–#1196 已合入 `master`
- [x] 本系列相关 worktree / 远端题分支已清理（更早无关 worktree 未动）
- [ ] 登录页截图基线：另案更新 + 视觉验收
- [ ] 当前 master 全量 / 窄 shard 失败重扫（数字未刷新前不写死）
- [ ] support PC 表宽与本文档进度：见同日 closeout PR（未合并前以 PR 为准）

## 5. 权威落点

| 内容 | 位置 |
| --- | --- |
| Phase 2 进度与剩余闸 | `docs/engineering/phase-2-3-follow-on-v1.md` §2.1–§2.3 |
| 本轮协作教训 | 本文 |
| UI 验收 / 自检 | `docs/portal-ui-spec.md` §7 / §9 |
