# 工单草稿与目录本地候选 — 2026-11-02

范围仅 B6-01/02/07/08；builder「执行」，integrator「系统检查管理后台问题」。
基线 `9765c0ba4af99a88b4633145f01526b8aa93a983`，tree
`7166c2960f1fec8d67a3d2d7974d57dd8f11f02b`，与首组最终合并树一致。
branch `codex/admin-support-drafts-directory`；复用原工作树与生命周期锁。

证据根（外置，未写入 Git）：
`/Users/muze/.codex/visualizations/2026/11/02/01a1929f-2271-7550-b73e-07abd2a0a629/admin-support-drafts-directory/`。
每个正式检查含 `*.command.json` 的 argv/cwd/time/exitCode 和 `*.log` 原始输出；
browser 子目录保存 PNG、结构化 JSON、严格事件清单与原始 test-results/trace。

## 逐项交付

| 项 | 本地行为及证据 |
| --- | --- |
| B6-01 | 详情复用首组输入＋handler 锁，不重复重写；队列接入同一锁。浏览器 normal/double-click、queue-pending；成功只清提交字段。 |
| B6-02 | 真实普通草稿导航确认；公开/内部/状态/文件逐项取消及丢弃；侧栏/历史/原生刷新取消；弹窗取消与 Escape；未知旁普通草稿丢弃后存储逐字不变。 |
| B6-07 | 真实 Python serializer fixture 双向校验；必需 envelope/摘要/分页；坏行局部隔离与全坏未知；同范围失败和旧筛选页禁写，GET 恢复。 |
| B6-08 | 新备注初始空，历史在 Inspect；状态-only 无新增消息；新备注原意图丢响应后关闭重开及 GET 确认，不重复写。 |

实现与边界见 [当前契约](../../../../admin-support-drafts-directory-v1.md)。
仅调整工单既有界面/消费层和测试；后端业务、共享壳层及导航实现未修改。

## 检查与失败历史

- `unit-initial` 26通过；`frontend-unit-final` 四文件49通过（包括真实 fixture 和
  既有 Unicode/详情回执回归）。正式命令日志区分，不累计重复运行。
- `domain-initial` 状态/note3通过；`domain-serializer` 加真实目录 fixture 后4通过，
  均 SQLite 功能检查，不声称 PG 行锁证明。首组 PG 由 integrator 已有证据复用。
- `governed-static` 的 `pnpm run check:admin-ui` 通过；`visual-governance` 通过。
  `verify-local-final` 全部通过：领域19、受影响单测37、类型/lint/源契约、release-policy与Admin治理；增补结果以外置 `verification.json` 为准。
- `browser-initial`：7通过、2失败、1中断、5未跑，exit130。定位为新脚本等待已取消
  reload 的 load 和错误的 Inspect 名称；停止该次以保留证据，修正脚本后定向重跑。
- `browser-second`：21通过、7失败。Next 空路由播报与页面 alert 的定位冲突、
  textarea 隐式 label 的定位不稳定，改为 main 内 alert 和相同可访问名称的 textbox；
  collector/阈值/断言目标保持。旧 closure 选了未提交附件，新 guard 正确拦截 Back，
  测试增加显式丢弃后仍验证原返回筛选/focus，不绕过保护。
- `browser-third`：17通过（本组15＋closure2）；队列既有11项在 second 中通过。
- `browser-fourth`：11通过（本组增补4＋首组受影响回归7）。覆盖队列明确拒绝/坏
  成功体、全坏目录、urgent，及四写/丢响应/串行/迟到/历史状态/存储快照/恢复摘要。
- `browser-visual-states`：2通过；补拍队列未知和双层退出确认，行为重复不计独立场景。

`verify-local` 首次在 diff-check 因三个文件尾部空行退出，尚未执行后续门禁；
清理空行并仅恢复 build 自动生成的 next-env import 后重跑，原日志保留。

截图复查发现先前一次保存toast会遮住下一次编辑未知状态；局部保存toast ID在
打开下一次编辑时移除（不清其他通知、不改共享Toast）。全坏记录提示移除无依据的
“上次记录”描述。`browser-visual-correction` 2通过并重拍，原图保留。

探索期首次 type-check 因 summary 的空对象 fallback 类型失败，已改为经过验证的
可选 summary；正式 `types-initial` 和治理检查通过。生成 fixture 的直接脚本首次未
指定 test Settings 被配置守卫拒绝，随后仅对隔离临时库显式使用 test Settings；
真实 fixture 由 pytest 检查，不修改默认生产守卫。
最终视觉微调后 types-closeout/lint-closeout/contract-closeout 定向检查通过，未重复无关全后台浏览器。

## PC 证据与限制

browser-3：1440/1056 的 draft-exit、queue-pending、directory-row-issues、
directory-retained；browser-4：全坏记录；browser-5：queue-draft-exit；browser-6：最终queue-unknown、全坏记录。
包含视口和全页原图、几何与提示文本。检查阻塞原因、目标、恢复/取消按钮常显，
没有页面横向溢出；1056队列表格保留既有横向滚动。原有历史备注仍在 Inspect。
这里只是代理本地视觉复查；没有更改 golden，不等于操作者视觉验收。

状态：local candidate；本组 CI/M4 candidate/merged/M4 accepted 均未执行；
人工产品验收 pending；production untouched。无客户、SMTP、支付或付费 Provider 操作。
builder clean committed local-ready 后冻结，由 integrator 审查及推进下一阶段；第三组未开始。
