# 后台通知、身份与共享版式整改收尾 — 2026-11-05

Status: time-bounded closeout and lessons; not production or human acceptance.

范围：本会话由通知页面难读，扩展到可读身份、共享页头和后台信息层级，随后
关闭旧截图基线差异，按操作者批准的「先做1」完成已有改动的审查、CI、合并与
M4 验收。不是全项目缺陷清零，也不启动下一阶段产品能力。

## 历史问题处置

| 本会话的问题 | 最终处置与入口 |
| --- | --- |
| 通知页信息太多、主次不清、数据含义不明 | 任务与发送对象优先，保留预览、二次确认、草稿与未知发送结果回读；完整编号/原始错误留技术详情和记录入口 |
| 不存在的运营人员概念 | 当前仅平台管理员与客户；后台登录、总览和诊断相关文案校正，不新增岗位或分派流程 |
| 客户/站点/审计原码难懂 | 名称/邮箱及同名区分信息先行，完整编号、原始类型与错误码按需可查；缺资料和未知类型诚实回退；展示资料不拥有鉴权、历史归属或收件人选择 |
| 全后台布局及信息层级混乱 | 五阶段落实12项建议，复用页头范围/更新时间、处理建议与已有表框/检查器/设置工作台；成熟队列核对后保留。逐页清单、迁移入口和代表 PC 证据见[台账](../../../admin-information-hierarchy-implementation-ledger.md#全后台信息层级分阶段整改--2026-11-04五阶段完成m4代表检查通过) |
| 侧栏改名导致旧截图失败 | 服务设置 Darwin/Linux 两份既有基线分别取原生 actual 审查后同步，完整长流程两平台各1项通过；原失败不删除 |
| 合并检查暴露客户详情旧截图及旧定位 | 客户详情四类截图共8份逐图审查并按平台同步；客户字段、邮箱、提醒、标题数量、折叠标识断言同步，保留请求、原 payload、精确 URL、只读重试与禁写检查 |
| 复核新增展示/范围正确性问题 | 未知字典键不再误取对象继承属性；编辑质量筛选发生时旧导出立即失效，等待新范围；仍保留原码和导出 filters 证据 |
| GitHub故障使分支新提交未挂到PR | 分支与PR SHA分别核对；服务恢复后关闭/重开原PR修复head同步，再运行最终CI。未制造空提交、强推或重跑旧HEAD充当证明 |

没有以统一版式恢复重复内容、隐藏动态限制、改变价格/资格/暂停边界或复制第二套
组件库。只做PC开发与验收；沿用旧测试的窄屏名称不代表扩展移动开发范围。

## 代码与证据状态

| 状态 | 结果 |
| --- | --- |
| 本地 | merge lane通过：Python质量、后端3文件32项、前端类型/lint、静态契约、身份单元5项；完整共享矩阵首轮227通过/7失败，逐项处置并保留失败与复验，不改写为一次全绿 |
| 最终PR CI | [Cloud CI 41946703428](https://github.com/npcink/npcink-ai-cloud/actions/runs/41946703428)及CodeQL通过；51项关键路径通过；234项共享矩阵233直接通过、1插件筛选用例重试通过；Portal4项、TOTP9项及compiled BFF通过 |
| 合并 | [PR #1370](https://github.com/npcink/npcink-ai-cloud/pull/1370)，2026-11-05 09:29:40 CST；master `1b0e8f90fcb2dee0ea964b63e384478221384572`；任务HEAD `92fe628c`与合并master整树一致 |
| 合并后独立CI | [Cloud CI 41948887602](https://github.com/npcink/npcink-ai-cloud/actions/runs/41948887602)与[CodeQL 41948887611](https://github.com/npcink/npcink-ai-cloud/actions/runs/41948887611)均已completed/success；不与PR门禁混作一次运行 |
| M4 accepted | 干净master推广PR1370，`accepted`、`promotion_pr=1370`、`source_branch=master`、`source_dirty=false`、`source_revision=1b0e8f90`；前后端health同版本，sync48.92秒，无镜像deploy重建 |
| M4定向验收 | 通知预览/草稿/丢失发送回读、中文审计、插件筛选/调查、留存记录展开共4项通过，26.6秒；浏览器写入均模拟响应，没有真实发送、客户修改、交易或付费Provider调用 |
| 人工与生产 | 本批整体验收仍待操作者实际查看；既有基线同步授权不扩大为整批人工验收。生产未部署，未进行真实发送或交易验收 |

原始报告、日志、图片、原生平台SHA收据和首轮失败保存在本机工作树外：
`/Users/muze/.codex/visualizations/2026/11/04/admin-layout-merge-closeout/`。
前期三个目录为同日的 `identity-readability-implementation/`、
`admin-layout-staged-implementation/`、`admin-baseline-sync/`。
默认test-results的250份历史文件亦复制并逐一核对SHA至收尾目录的
`legacy-default-test-results/`；Git不包含这些本机图片和trace。

## 仍保留的事项与关闭条件

- 插件筛选用例首次等候精确site/window请求超时；CI重试和M4完整用例独立复验
  通过，但偶发根因未定位。此前runtime返回历史用例亦曾首轮失败、独立复验
  通过。两者为明确的回归线索，不记为已修复；若再次发生，先保留trace和请求
  时序再定向排查，不靠宽松断言或全量反复重跑关闭。
- 人工视觉/真实使用反馈和生产发布是独立边界；没有这两类证据，不能宣称所有
  状态或生产都通过。这不阻止关闭已完成技术交付的会话，后续反馈按目标页接续。
- 未启动后续产品阶段。没有真实价值证据，不把共享组件交付自动扩张为新运营
  系统、工作流、指标采集或商业功能。

## 分支与工作树收尾

本批功能分支 `codex/notification-layout-20261104`：远端已删除；确认PR merged、
任务树与master整树一致且clean后，本地分支和失效远端跟踪引用也已删除。
本次文档补记通过单独docs分支交付，不把补记说成尚未提交的应用代码。

工作树 `/Users/muze/.codex/worktrees/notification-layout/npcink-ai-cloud`
由Codex应用返回 `The task's primary checkout cannot be removed.`，因此保留，
不绕过保护raw删除。结束时保持clean和保护锁，owner为本聊天的保留记录；
无应用代码待交接，释放条件是应用允许归档或操作者调整主工作区归属。
文档补记的分支/合并/最终detached状态另写本机收尾报告，避免为记录自己的
合并SHA不断再创建文档PR。

其他会话仍有独立保护工作树，生产准备会话还在进行；它们不是本次可删除对象。
稳定M4 ops工作树及master也必须保留。本记录不声称全仓分支/worktree清空。

## 已归纳进现行规范的经验

长期约束见[信息层级规范§12](../../../cloud-admin-visual-information-architecture-review-standard-v1.md#12-共享呈现与回归检查的维护经验)，
与既有§8–11及[UI标准](../../../cloud-admin-ui-standard-v1.md)共用单一入口：

1. 先回答对象、范围、阻塞、下一步，再分常显/按需/证据/重复；减少信息不等于隐藏判断事实。
2. 复用呈现骨架和任务适合的容器，业务判断仍由页面/领域helper持有；不同数据来源不伪造统一口径。
3. 可读名称与精确原码并存，展示缓存不参与权限和归属；未知字典键检查自有属性。
4. 结构变化同时维护关键路径、专项、静态契约与翻译注册；测试查实际可见性，仍保留请求和状态约束。
5. 截图先审查actual/diff、平台及访问来源，再按授权范围同步；更新后跑完整失败用例。
6. 保留首轮失败、定向复验和retry区别，分别记录local/CI/merged/M4/human/production；重试通过不代表根因消失。

M4_OBSERVATION_RECEIPT date=2026-11-05; route=LAN; sync=48.92s; focused=26.6s; promotion=48.92s; operations=1 promotion sync/0 deploy; stable_502=0 observed non-health during focused smoke; m4_only=not observed; coordination=single-session
