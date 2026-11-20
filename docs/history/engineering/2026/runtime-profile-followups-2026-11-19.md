# 运行配置后续问题处理 — 2026-11-19

状态：导航修复完成本地与 M4 候选验证；2026-11-20 已在 M4 对 mqzj/Grok 生图完成一次授权验证并成功。
用户要求处理上次收口登记的两个独立问题，本次按 development lane 执行；不自动
进入 merge/release，不进行生产部署。基线 master `04ac239e`。

## 取消草稿后跳转供应商

旧 M4 accepted `620e65b7` 首次复测通过，随后连续 8 次中 1 次失败、7 次通过。
失败时最终仍停在 `/admin/runtime-profiles?profile=route.classification`。
trace 显示每次打开弹窗均对同一带 profile 参数地址发起 RSC 导航；供应商跳转后，
先前的同页 replace 尚未完成，浏览器又导航至旧配置文档。不是仅凭状态 200 就
认定导航成功，也不是 API 502 或残留草稿确认弹窗。

`selectProfile` 的参数仅由客户端工作台使用。改为 Next 集成的原生 History API
更新：相同地址直接返回，不同选择只 replace 当前历史项，保留其它查询与 hash。
真实跨页仍使用原路由器。保留草稿保存、取消、刷新深链及浏览器返回确认保护；
不改共享导航 hook、API、供应商/模型绑定、目录能力或界面布局。

新增请求级回归在原取消/重开场景中断言不产生带选中参数的 RSC 导航，随后检查
供应商地址。将新测试运行于未修复 M4 时，明确捕获旧请求并失败；本地修复后
整页 39 项通过，含刷新深链、浏览器返回/取消/确认、失败恢复、1440/900 PC 截图。
Admin UI 静态契约/类型、定向 ESLint、build 与差异检查通过。未更新 golden。

常显：状态、工作面和供应商入口；按需：原配置/确认弹窗；技术证据：原验证记录；
删除重复：无新增搬迁或去重。配置表用途保持配置编辑，内容与视觉结构没有改变。

## grok-imagine-image 上游失败

本次在 M4 只读事务核对真实记录：该精确实例最新仍为
2026-11-17 11:48:22 +08:00 `verification_failed / provider.upstream_unavailable`。
现存 `error_detail` 只有统一的 `image generation provider request failed`。
适配器将上游 502/503/504 映射为此错误码，并对图片上游消息统一脱敏；该证据
无法恢复确切状态、供应商账户原因或当时的原始请求 ID。不能猜测余额、认证、
供应商渠道、模型名称或切换模型来代替根因修复。

对已保存 `mqzj` 连接执行只读目录读取成功，返回 148 项，包含精确
`grok-imagine-image`。现有路由为 `image_generations`，连接采用 `b64_json`；
未发现凭据无法解密/目录认证失败/型号消失。目录存在不等于生图可用，也不把
其它 Grok 或 Flare 的历史 verified 复制到本型号。

截至 2026-11-19，没有写数据库或改 Provider 配置，也没有付费调用、重试、回退
或新增 verified；旧记录不能证明供应商当前仍不可用。2026-11-20 在已授权的单次
验证窗口内，通过现有能力探测接口对 `mqzj` 的精确实例执行 1 次 `grok-imagine-image`
生图：`timeout_ms=90000`、`n=1`、无重试、无回退。M4 返回 HTTP 200，状态
`verified`，耗时约 5.696 秒，`cache_hit=false`；数据库新证据时间为
2026-11-20 09:22:40 +08:00，错误码为空。该结果说明当前连接与该实例的
`image_generations` 路由在本次探测时可用，但不替代人工产品验收或生产证据；供应商
实际计费金额未由 Cloud 返回。由于 Grok 已成功，本次未调用用户指定的
`gpt-image-2.5-flare` 备选模型。若未来重新验证，仍须单独取得明确的调用授权。

## 2026-11-20 单次供应商验证回执

- 目标：`mqzj` / `openai-global-grok-imagine-image` / `image_generations`
- 请求：1 张简单蓝色方块，`timeout_ms=90000`，一次调用，无重试、无回退
- 结果：M4 candidate `a9763851c848` 返回 HTTP 200，`verified`，`cache_hit=false`
- 时间：请求开始 `2026-11-20 09:22:32 +08:00`；证据落库 `2026-11-20 09:22:40 +08:00`
- 备选：`gpt-image-2.5-flare` 未调用，因为 Grok 本次成功
- 证据：外部回执 `20261120-grok-imagine-image-intent.json`、
  `20261120-grok-imagine-image-result.jsonl`

## 验证层次与接续

本地已通过；CI/PR/merge 不属于本轮 development 授权，尚无新增结果。
M4 同步前核对为 accepted、干净 master `620e65b7`，没有另一活动 Cloud 聊天
承载候选。候选同步及专项连续复测结果由本节后继补充和 worktree 外回执记录。
本地证据不表示 M4 accepted、人工验收或生产结果。

分支 `codex/runtime-profile-followups` 留作本轮交付，主工作目录继续受保护并锁定；
待明确接续/合并后按生命周期规范收尾，不沿用上一轮“任务已关闭”的旧锁说明。

## M4 候选实际结果

干净提交 `a9763851c848e0a850215ba7e1aba01b066bb2a2` 已通过正式
`m4:preview:sync` 同步，状态为 `candidate`，前后端 source revision 均一致，
`source_dirty=false`、frontend production 模式。该变更只涉及前端源码；镜像输入、
迁移与 worker 源码未变，迁移和 worker restart 跳过，前端重建工作面完成。
API/proxy/frontend 健康；部署后的页面源文件 SHA256 与本地相同。

M4 模拟 API 的真实浏览器回归：原取消/重开/供应商跳转场景连续 **10/10** 通过，
请求级断言亦通过；URL 深链/刷新保留与浏览器返回草稿确认专项 **2/2** 通过。
这 12 项只证明已部署前端在相应模拟 API 下的行为，不冒充真实供应商生图、
人工视觉验收或全 M4 页面矩阵结果。本地整页仍是独立的 39/39 结果。

worktree 外证据目录为
`/Users/muze/.codex/visualizations/2026/11/17/01a1e794-512a-7c82-aa7b-1ab027cea30c/runtime-profile-followups-20261119/`，
包括旧版本反例、静态门禁/浏览器日志、M4 同步、PC 截图、脱敏诊断与状态回执。
本文件的后继提交仅补文档，不改变已验证的应用源码。尚未发布 PR/CI 或合并，
不把本轮候选称作 accepted；保留本地分支与锁等待接续。

## 2026-11-20 收口状态

本轮实现、回归、M4 candidate 同步、供应商单次验证、证据回执和文档记录均已完成；
当前工作树干净，分支 `codex/runtime-profile-followups` 保留 3 个未合并提交，
用于后续人工决定是否创建 PR。未创建 PR、未跑 CI、未合并 `master`、未发布生产，
也未删除受保护的主工作目录或其他 worktree。归档本会话不会改变这些 Git 或发布状态。

后续仅有三个独立门禁：

1. 若要进入共享开发分支，创建 PR 并完成 CI、代码审查和人工合并。
2. 若要把 candidate 标记为 accepted，完成要求的 M4 人工 PC 验收并记录证据。
3. 若要进入生产，另行取得明确的生产发布授权并执行发布流程。

在没有这些新授权前，本轮没有必须继续执行的代码或供应商调用工作；不再自动调用
`gpt-image-2.5-flare`，也不重复 Grok 探测。

## 可复用经验

仅记录选择的 URL 不应触发昂贵且可能延迟完成的页面导航。间歇性失败要同时
保留最终结果和请求级反例，不能靠延长等待、重试 click 或更新截图基线消除。
供应商目录、精确路由验证、已保存用途和真实调用成功是不同证据；脱敏后的
统一错误能保护数据，但不能凭空还原供应商内部原因。
