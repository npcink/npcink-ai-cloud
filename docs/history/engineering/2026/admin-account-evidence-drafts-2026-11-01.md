# 客户证据与普通草稿本地交付记录（2026-11-01）

## 范围与交付状态

执行“系统检查管理后台问题”的 dispatch-3 / B4-06–10 及独立审核 R1–R6。
分支 `codex/admin-account-evidence-drafts`，集成基线
`190d2e2ea0f99ae1317f67286075056863858e5d`。首轮提交
`7833d53616dc868ce7530ccaf49324ba93a2e152` 被 request changes，不能作为
已 admission 的源码。本次在其上新增修正提交；准确 HEAD、文件 SHA256、原始日志
及截图索引保存在任务证据目录 `review-2/` 的最终 receipt 中。

本记录只声明 builder 本地证据。PR/CI、M4 candidate、merged、M4 accepted、
production 均未由本会话执行；人工视觉／产品验收仍 pending。集成会话接手后再
分别记录状态。无真实客户、支付、Provider 或主机操作。

## 修正与内容层级

- R1/R2：按 `_admin_mixin.py` 的真实 serializer 校验 quota/ledger。quota
  核对客户 ID 与 `ai_credits` key/unit；关联站点及每个流水条目核对归属。
  必需汇总及 pagination 不再缺省为 0。summary 的 breakdown、event/category
  maps 分别校验，未知扩展保留。合法空、全零、负调整、limit<=0 unlimited、
  remaining/usage_ratio=0 和可选 null 保留。流水实际展示的 rate/net delta
  缺失也进入局部错误。
- R3：坏／正在重读的额度阻止新调整与 topup，入口、表单及最终提交均检查当前
  证据。原 pending 调整精确 GET 独立可用，不清原 key。topup 额度失效时撤下
  submit 并显示 unknown/error。站点读取失败不抹掉已知 uncovered 商业事实，
  依赖站点的结论保持 unavailable。
- R4：流水首次读取和 retry 等待明确 loading；等待／错误／合法空三态分开，
  不显示绿色完成或无流水。drawer 不再依赖 quota 成功才能渲染。
- R5：资料和站点输入使用 saved baseline；同对象 clean 回填更新基准，dirty
  回填保留草稿；切对象重新初始化，确认保存／读取后建立干净基准。原 pending
  持久化、operation key、revision 和迟到隔离沿用。
- R6：补实际导航、刷新、字段冻结、上下文竞态和新写请求数量断言。发现客户
  原生 hash 页签会触发 popstate 及离开保护，改为页面局部 replaceState，保留
  hash 重放及页签草稿；共享 useAdminNavigationGuard 未修改。

| 内容层级 | 保留的事实／入口 |
| --- | --- |
| 常显 | 对象、当前状态、已知商业事实、局部不可用、写阻塞原因、GET 恢复；原跨页签 pending 提示保留 |
| 按需 | 原资料 disclosure、quota 详情、流水 drawer 和 topup 弹窗；没有新增浮层 |
| 技术证据 | 原 operation ID／快照继续在原恢复入口；流水条目和汇总在原 drawer |
| 删除重复／迁移 | 不适用；未复制状态机、未迁走原判断事实。流水 drawer 仅移出 quota 成功条件，原入口不变 |

页面模型沿用所选客户／站点详情，按信息层级规范 §8–11 核对未知、草稿、待确认
和原入口。只检查受影响 PC，不更新 golden，不新增移动端适配。

## 派单场景与可复查测试

以下路径均相对 `frontend/tests/`；完整用例名、结果、时间和附件见 Playwright JSON。

| 派单 | 场景 → 测试入口 |
| --- | --- |
| B4-06 | 创建姓名／邮箱、资料两字段 × held 成功／明确拒绝／未知：`e2e/admin-customer-confirmation.spec.ts` 的 `delayed ... keeps both fields equal to the submitted snapshot`。提交期间两字段 disabled 且等于派发快照；创建 email 使用既有小写规范化。拒绝可编辑且值保留，未知原 intent 不变；成功后干净导航 |
| B4-07 | `admin-account-evidence-drafts.spec.ts` 两项显式返回 cancel/confirm；`admin-account-evidence-review.spec.ts` 的 `real dirty guard...` 覆盖客户／站点内部链接、back/forward cancel、forward confirm、真实 beforeunload reload dismiss、无修改自由导航及客户 tab 保留。`same-customer delayed refresh...` 与 `saved baseline...` 分别验证 clean/dirty 回填、切对象和保存后 clean。`pending intent survives...` 验证离开返回仍为原 key，无业务写 |
| B4-08 | `site evidence case ... rejects...` 覆盖 null、null 行、缺归属和错客户，保留独立 uncovered；合法 [] GET 恢复，写请求 0。`associated site retry...` 验证旧客户迟到响应隔离。unit 补 name/status/归属缺失 |
| B4-09 | `bad quota...`、`quota re-read freezes...`、`bad quota does not block pending adjustment exact GET...`、`adjustment final submit...`、`open top-up reflects quota loss...` 验证坏结构／错目标／错指标、held refetch、原 pending GET 和最终提交阻止，新写 0。`late valid/malformed quota and ledger...` 验证切客户旧返回不覆盖新证据 |
| B4-10 | `ledger first load and held retry...` 验证等待／失败／retry 等待／合法空；`ledger ... stays local...` 四项验证 null 行、错客户、缺 summary/pagination → 真实非空 serializer 恢复、负调整和写 0；quota 摘要保持可用。unit 覆盖真实 maps/breakdown、必需汇总和非有限数值 |
| 前两组协议回归 | `admin-customer-confirmation.spec.ts` 和 `admin-account-write-safety.spec.ts` 的原 key、实际超时、replay/408/409、读失败、重载及迟到旧意图隔离；`admin-site-confirmation.spec.ts` 选择 explicit rejection/late/primary read 及 set lost，未重跑完整站点故障矩阵 |

浏览器使用隔离 API 夹具。新增 review spec 使用 critical-network-fixture，未放松
未处理 API、网络和 pageerror 断言；源 hook harness 使用真实 hook，无新产品路由。
GET-only 只指 HTTP 方法，**不证明 live 数据库零写**：既有客户 ledger GET 可能
backfill topup 并 commit，普通站点详情 GET 也可能 reconciliation。本次未调用
真实客户 ledger 或 M4 来制造只读证明。

## 验证与原始证据

任务证据根目录：
`/Users/muze/.codex/visualizations/2026/11/01/01a1929f-2271-7550-b73e-07abd2a0a629/admin-account-evidence-drafts/`。

本次 `review-2/` 保留命令输出、Playwright JSON、错误截图／trace、成功 PC 截图、
时间和 SHA256 索引。最终结果由同目录 `handoff.md` 与 `receipt.json` 列出，
不以此处清单代替实际结果。

已执行门禁：40 项 unit；返修及原资料／积分协议浏览器 91 passed、0 skipped；
站点协议选择回归 15 passed、0 skipped。PC 页面回归 32 passed / 1 failed，
唯一失败是旧 credits golden：原图带顶部路由进度线和 opacity=.76，
本次 hash 页签修正后无虚假 loading，内容／布局和后续行为断言通过；差异
2949px 的 actual/expected/diff/trace 保留，未更新 golden 或阈值，
**该截图门禁仍 failed，不能称本地全绿**。类型、定向 ESLint、`check:admin-ui`、
`check:admin-ui:visual-governance`、`check:release-policy`、`git diff --check`；
PC 最终取证 8 passed、0 skipped，8 张 1440/1056 及局部 loading/topup
截图已由 builder 逐张检查，状态／原因／恢复和离开按钮可读，无水平溢出。
人工视觉接受仍 pending。受影响浏览器及 PC 证据另见最终 receipt。

旧证据独立保留在 `review-2/old-evidence/`，从原会话 JSONL 提取工具原始输出：
首轮 5、合并回归 18 和Admin 浏览器门禁 224 等仅属于旧源码阶段，不扩大为修正版
224 项通过。原输出本身的截断边界保留；未为补日志机械重复全部 224。

## 失败纠正及限制

- 首轮 review 测试出现语言定位、初始夹具未触发 Refresh 和原生 hash 导航缺陷；
  修正 locale／初始状态以及产品页签 hash 处理。失败与中断输出仍保留。
- 后续两项返回链接匹配漏了英文 Customers 的大写；三项创建字段测试误取了
  其他字段，修为姓名／邮箱，并按原派发规则对照规范化 email。属于测试错误，
  未为通过测试改变创建语义。逐轮结果不合并伪称一次全绿。
- 类型检查生成的 `frontend/next-env.d.ts` 噪音交付前恢复。
- 不把 mock 故障验证当作生产故障频率，不代签人工视觉／产品验收。无后端或
  依赖改动，未跑 API 全套、完整后台视觉矩阵或生产部署。Playwright webServer 按仓库配置执行 pnpm build
  并启动隔离 loopback standalone；该构建不是生产运行证据。

## 回滚与移交

本地两提交按逆序 revert 可恢复基线；不 reset 混合树、不触碰共享远端。
最终 clean committed local-ready 后冻结，由派单会话承担 admission、PR/CI、
M4 候选、开发合并及 accepted。临时浏览器服务退出后记录端口检查结果。
