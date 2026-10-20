# Portal 安静状态 UX、面包屑与骨架屏 — 交付复盘（2026-10-20）

Status: time-bounded Portal historical evidence; not current Portal authority.

Current authority:

- 布局与验收：[Portal UI Spec](../../../portal-ui-spec.md)（含 §7 验收清单、**§9 交付门禁 / 自检**）
- 客户工作区标准：[Cloud Portal Customer Workspace UI Standard](../../../cloud-portal-customer-workspace-ui-standard-v1.md)

Protected PR: [#1165](https://github.com/npcink/npcink-ai-cloud/pull/1165)  
Squash on `master`: `a18b71b293dec0ef4d3c8efd2f642a9206eb0f48`  
Merged: 2026-10-20（Asia/Shanghai 约 13:17）

## 1. 本轮做了什么

在「少打扰、同因不重复提醒」前提下，收紧站点详情与首页状态呈现，并补齐导航与加载态：

| 切片 | 结果 |
| --- | --- |
| 状态文案 / 黄徽 | 注意力收进 `#service-status`；同因不在 Header 与服务卡双黄；知识软失败用「知识库可用」，硬失败才「更新失败」 |
| 缺插件 | Portal 仅警告 Cloud Addon 基线；可选插件不警告 |
| 空服务状态 | 无待办时不渲染空「服务状态」卡 |
| 介绍与偶发失败 | 知识介绍进标题旁 ⓘ；偶发更新失败说明进「最近更新」旁 ⓘ（不进正文、不进标题 ⓘ） |
| 面包屑 | 站点详情：`服务 / 我的站点 / 当前站点名` |
| 容量告警 | 告警在「我的站点」卡顶时，标题旁不再挂同因黄徽 |
| 加载 | 首页与门户页级加载改为 `PortalLoadingState` / 骨架，禁止沙漏居中 |

产品行为以 Spec §7 清单为准；本文件只记取舍与过程教训。

## 2. 可复用的产品思路

1. **安静默认**：没有可行动待办时，少占版面；空状态卡直接不渲染，优于放「一切正常」占位。
2. **同因只说一次**：容量已在卡顶 → 藏 Header 同因徽章；注意力已在服务区 → 服务运行徽章改中性「见上方说明」。
3. **说明进 ⓘ，指标留数字**：「最近更新」旁 ⓘ 承载偶发失败说明；介绍句不常驻正文。
4. **危险操作进 ⋯**：停用 / 移除等不进主行；确认由父级 modal 管。
5. **大 IA 先确认再动**：本轮未做 Spec 未列的整页迁徙。

## 3. 工程与合并教训

1. **从 `origin/master` 开题分支**  
   勿在暂停/旁路分支上直接 commit 再硬合并；应 stash → 从 `origin/master` 拉分支 → 只回收本切片冲突。

2. **UI 交付门禁（已写入 Spec §9）**  
   m4 sync 后打开预览，对照 §7 目视自检并先修残留；contracts / type-check 绿 ≠ 可向用户宣称完成。

3. **Playwright 跟产品语义，不跟旧文案**  
   本轮 CI 连续失败点与修复：
   - 页标题 / 面包屑：`Service|服务`
   - 容量告警断言落在站点卡，而非仅 Header
   - ⋯ 按钮 `aria-label`：`More actions|更多操作`（兼容旧「其他操作」）
   - 打开一行 ⋯ 后须 `Escape` 再点另一行，否则第二行超时
   - 同行多控件同 href → 用 `data-portal-sites="site-name"` 收窄，避免 strict mode
   - Billing「Manage package」已是 Link 到 account hash，再在 account 上点 button 打开对话框

4. **合并车道**  
   保护分支要求 checks 绿 + 会话解决；e2e 失败时优先改测试选择器与步骤顺序，避免为过 CI 回退已验收 UX。

## 4. 收尾检查清单（本 PR 相关）

- [x] `#1165` squash 合入 `master`（`a18b71b2`）
- [x] 远端题分支 `codex/portal-ui-status-ux-20261020` 已删除
- [x] 本地题分支已删除；主工作区对齐 `origin/master`（`a18b71b2`）
- [ ] 其他 Codex **locked** worktree / 陈旧本地 `master` 指针（由别的会话占用）不在本 PR 清理范围，需各自会话收尾或显式解锁后再 `git -C <worktree> pull`

## 5. 权威落点

| 内容 | 位置 |
| --- | --- |
| 验收与反模式 | `docs/portal-ui-spec.md` §7 |
| 交付门禁 / 自检 | `docs/portal-ui-spec.md` §9 |
| 本轮过程与教训 | 本文 |

