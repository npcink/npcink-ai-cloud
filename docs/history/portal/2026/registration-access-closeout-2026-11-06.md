# 注册准入开发收口与经验 — 2026-11-06

Status: dated closeout; only this registration-access session. 时间采用 Asia/Shanghai。
不代表全仓历史问题清零，也不授权生产发布。当前行为以
[注册准入合同](../../../portal-registration-access-v1.md)为准。

## 1. 决策与实现

内测入口公开时，先增加开放注册开关和完整邮箱白名单，不引入邀请码生命周期、
审批或新的商业资格系统。复用 `ServiceSetting.portal_registration` 和原服务设置
工作台，无新表或迁移。缺配置默认开放以兼容已安装环境；保存后的无效策略阻止
新开户，Admin 显示错误并允许保存修复。生产限制必须在单独授权发布后明确设置，
不能把源码合并误认为线上已关闭注册。

邮箱签发验证码和实际开户均读取当前策略；名单仍需邮箱验证码证明所有权。
关闭公开注册时 QQ 首次开户被拒绝，已有 QQ 登录、邮箱账号及商业资格不变。
QQ 资料邮箱不是本系统验证过的邮箱。白名单仅供 Admin 读取，不写入设置审计摘要。

## 2. 历史事项逐项处置

| 原问题或中途阻塞 | 当前处置 | 证据和剩余边界 |
| --- | --- | --- |
| 注册地址公开，内测新用户准入不可控 | 已交付开关和邮箱白名单 | PR #1380；`app/domain/portal_registration.py`、Portal mixin 和 Admin 设置 |
| 已发验证码可能绕过后来关闭/移出名单 | 开户时复查当前策略 | `test_outstanding_code_cannot_bypass_current_policy`；关闭、移除、损坏三种反例 |
| QQ 第三方资料邮箱可能被误当验证证明 | 关闭模式拒绝 QQ 首次开户，已有绑定可登录 | QQ HTML/JSON 两类反例；邮箱注册后可走原绑定流程 |
| 无效持久化策略可能静默恢复开放 | 新开户失败关闭，Admin 错误可修复 | 无效策略 API 与投影反例；缺配置兼容开放另测 |
| 文本框被共享紧凑 `.input` 样式压为单行 | 限定 textarea 高度覆盖 | 1440×1050、1280×800 PC 截图及至少 144px 高度断言 |
| 保存成功但回读失败可能重复写或展示旧值 | 保留原写锁、待确认、只读重试 | 定向浏览器断言只写一次；草稿、导航、URL/键盘/历史均保留 |
| 本地依赖软链接越过 Turbopack 根目录 | 工作树独立冻结离线安装 | 未改 lockfile；构建和浏览器通过 |
| Next 构建生成 next-env 导入影响 ESLint | 仅清除构建生成的额外行 | 工作树干净；不删除用户改动、不调整 lint 门禁 |
| master 前进两次、台账追加冲突 | 整合 7aa03daa，保留两边台账 | range-diff 证明功能源码补丁未变 |
| 初始 M4 是其他任务 dirty candidate | 当时不覆盖；待其合并接受后同步 | 本功能 candidate 与 accepted 分开记录 |
| 新增目录导致 Darwin/Linux golden 失配 | 人工验收后更新各平台自己的 actual | 2970/3270 像素约 1%；未跨平台复制、未放宽阈值 |
| 首轮无关插件观测用例偶发失败 | 原轮重试通过，最终矩阵一次通过；保留失败 | 未修改该模块，未声称根因已修复；再现时由后续维护任务复现和定位 |
| 生产部署、线上关闭注册、真实邮件/交易验收 | 尚未执行，独立等待项 | owner：操作者；触发：明确生产发布/配置授权；下次发布前按合同核对 |

原先不完整或失败的快照保留在[落实台账](../../../admin-information-hierarchy-implementation-ledger.md)，
后继最终状态由本文补正，不把旧失败改写成成功。

## 3. 交付与证据分层

- 功能 PR：[#1380](https://github.com/npcink/npcink-ai-cloud/pull/1380)。
  2026-11-06 16:02:07 合并，master `7f70e1fb2f902c2863fab098dbbf9a9e3420a54e`。
- 本地：整合后的 `verify:local` 通过；更早后端定向回归 76 通过、
  相关前端单元 55 通过。不是全仓所有历史测试重跑。
- M4 candidate：`e504786b`，干净源码；注册准入与投影 15 通过。
  编译前端定向四场景 4 通过（19.3 秒，API Mock）。
- 首轮 CI `42181513868`：后端通过；视觉矩阵 240 通过、1 基线失败、
  1 无关用例重试通过。保留原失败，不称全绿。
- 操作者明确验收目录与注册准入面板，授权更新基线且门禁通过后合并。
  `042ec1b6` 只补两平台基线与台账。
- 最终 PR CI `42183443809` 必需检查通过：后端 impacted 2402 通过/4 跳过，
  contract 三片 347/421/451 通过；后台视觉矩阵 242 通过，无该轮重试记录；
  Portal 关键路径 4 通过，TOTP/BFF 9 通过。
- clean-master M4：`promotion_pr=1380`、`acceptance_state=accepted`、
  `source_branch=master`、`source_dirty=false`，运行版本为 `7f70e1fb`。
  合并后 5 项定向浏览器 31.9 秒通过，包含完整设置场景和 golden 比较。
  结构化回执确认本地干净合并 SHA 与前端运行版本一致，health 200。
- 生产：未部署、未操作线上注册设置。未制造真实邮件、交易或付费 Provider 数据。

浏览器使用真实编译前端但 API Mock；后端策略由独立受控 API/领域测试验证。
两类证据不合称真实业务端到端。原始截图、actual/diff、CI 日志及结构化回执
保存在本机 `/Users/muze/.codex/evidence/registration-access-20261106-pr1380/`，
不向 Git 提交重复成功截图、原始日志或本地连接配置。

## 4. 可复用方法

1. 准入与已有账号资格分开。只拦新开户，不把内测名单复用为购买、试用或权益名单。
2. 在不可逆业务动作前重新核对当前策略。签发时允许不等于未来开户必然允许；
   兼容缺配置和无效配置的失败策略必须分别定义和测试。
3. 白名单不是身份验证。完整地址匹配、控制输入上限、验证邮箱所有权和
   QQ 资料可信度是不同约束，不能互相替代。
4. 新目录即使不改主体表单也会改变 golden。先跑具名既有视觉用例，保留
   actual/diff，人工验收后分别核对平台变体；不等宽 CI 才发现已知基线变化。
5. 只有被批准的视觉变化才更新基线；行为断言和阈值保持。规则遵循
   [UI Standard](../../../cloud-admin-ui-standard-v1.md)与
   [PC 选择检查](../../../frontend-pc-scope-and-selective-verification-v1.md)，不另立第二套门禁。
6. 收口必须对齐本地、CI、M4 candidate、merged、M4 accepted、生产与人工状态。
   完整回执在仓库历史索引可达，不能只存在忽略目录或聊天结论中。
7. Git worktree 共用引用数据库；不同 checkout 的 fetch/pull 顺序执行，避免
   同时更新 origin/master 的 ref lock 竞争。此前一次竞争由顺序 fetch 完成，未改源码。
8. 分支删除与 worktree 退休分别核实。squash 后比较完整树和 PR，不能只以
   `--merged` 判断；主检出受保护时记录保留原因，不强拆。

## 5. 资源与会话关闭条件

本次复核时 GitHub `codex/registration-access` 已不存在，本地分支 tip
`042ec1b6` 与 #1380 合并树完全一致，无同名开放 PR，故删除该本地分支
及陈旧 remote-tracking 引用。收口文档用最新 master 的独立文档分支提交，
该分支须在文档 PR 合并后单独清理。

当前 `/Users/muze/.codex/worktrees/registration-access/npcink-ai-cloud` 是
Codex 受保护的当前主检出。归档工具明确拒绝：
`The task's primary checkout cannot be removed.` 保留登记与锁，不强制删除；
只要已合并、干净、证据保全且无活跃任务，该保留不妨碍关闭聊天。
其他会话的分支、工作树、锁和长期 M4 operations checkout 不在本次清理范围。
按[生命周期](../../../single-session-worktree-lifecycle-v1.md)继续保留其归属。

本文及索引合并、文档分支清理、当前工作树恢复为干净接受版本后，当前会话可关闭。
再次修改注册准入时从最新 master 开始；生产等待项由操作者在明确授权时启动，
偶发插件观测仅在自然再现后进入独立定位任务。关闭此会话不宣称全仓历史清零。
