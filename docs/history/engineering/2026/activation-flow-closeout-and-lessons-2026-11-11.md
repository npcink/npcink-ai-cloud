# 激活流程、伪需求审查与会话收尾 — 2026-11-11

状态：已批准应用改动均有合并/后继记录，激活修复已生产安装；四项接续事项仍待授权或验收。
可以按本台账关闭聊天，不能宣称全部历史问题解决、全部候选上线或全仓资源清零。
日期按 Asia/Shanghai；原始生产收据保留 UTC。

## 1. 范围、来源与事实基线

本记录是本次激活发布会话的唯一接续台账，承接伪需求盘点、局部清理、激活修复、
生产安装及资源收尾；不重开全仓审计、不扩大功能、不执行新部署或模型调用。
已分页读完会话 `01a1c831-cfd8-7f41-828a-5bdb2c50c7a3` 的10轮历史。
邻接会话 `01a1bf16-bba3-7cd1-93b8-2de1c62793d4` 的四项交接来自其本地
`editor-release-closeout-20261111/session-closeout-review.md`，没有据此声称读完邻接会话。

核对时 GitHub master 为 `0e8b57e841a4ce81e4cd1973183f2c5947c9ec06`，
production 和实际安装均为 `15ae3f4efc7bf41f3ab42b6b71b9458a16a3b90c`。
本地旧分支与 API 提交可能不同；以精确 PR head、文件/树等价及安装身份分别对账，
不能只看 ancestry 或旧 `origin/master`。

这是[生产发布收据](../../production/2026/activation-flow-release-2026-11-11.md)的
后继收尾记录；不改写密封的原部署事实。规则见
[收尾规范](../../../engineering/zero-backlog-closeout-efficiency-standard-v1.md)、
[工作树生命周期](../../../single-session-worktree-lifecycle-v1.md)及
[清理规范](../../../repository-stage-transition-cleanup-standard-v1.md)。

## 2. 原始11项建议的逐项处置

候选清单不是批准删除清单；“做1到3”在当时指提交、本地审查和PR/CI/合并交付步骤，
不是批准关停最初清单的前三个功能。

| 原项 | 当前处置与收益判断 | 后续触发 |
| --- | --- | --- |
| 1 本地监控摘要镜像 | 已由 Addon #349 删除未用镜像，减少重复统计/维护路径；647行生产代码移除，历史13项检查通过 | 有实际消费者再按契约评估，不恢复镜像 |
| 2 简易生成弹窗 | 保留。最初把 Ability Explorer JSON 调试入口当作等价替代，忽略普通站长操作成本；已纠正，未删除 | 有加载性能证据再做小范围懒加载；本轮未实施 |
| 3 高级媒体处理 | 保持既有可恢复暂停，暂不扩张；不删除共享安全、交付和历史恢复接口 | 依 Phase 1 价值决定重新授权 |
| 4 文章音频 | 保持暂停和历史结果，避免新增处理/维护投入 | 同上 |
| 5 夜间巡检/运营分析 | 保持暂停，保留历史读和共享基础能力 | 同上 |
| 6 SEO specialist | 保持暂停，不借设置重新启用 | 同上 |
| 7 多重观测链 | 冻结扩张；未证明各链有稳定读者，未批准整体删除 | 真实消费证据和必要 usage/error/provider/quality 边界 |
| 8 第三方本地化 | 限制新增翻译面，不删已有高频中文 | 真实界面或用户反馈触发 |
| 9 老API/helpers | 不做批量退休，避免误伤调用方 | 明确无消费者及兼容迁移证据 |
| 10 重型CI | 保留强制门禁，选择性验证建议不等于全局减门 | 具名耗时/风险证据与批准的分层方案 |
| 11 按行数拆文件/源码形状测试 | 不立独立工程，改动触及时优先行为验证 | 实际可维护性或回归问题 |

第1项不影响 Cloud 事件采集、同意控制、缓冲、Cron上传或 Toolbox 直读摘要 API；
清理的是 Addon 本地镜像。旧 Cloud OCR 工作流已在 GitHub 停用，遗留源码/文档可后续
按触发清理，不作为当前仍在持续运行的浪费。暂停不等于删除、冻结不等于未维护。

## 3. 原交付与后继映射

| 仓库/PR | 对账结果 |
| --- | --- |
| Addon #349 | 已合并；本地监控镜像退休 |
| Cloud #1407 + Addon #350 | 已合并；注册保留返回上下文、显式绑定/激活、容量替换及 WordPress 返回状态处理 |
| Cloud #1409 | 已关闭未合并，由 #1414 的已审查树集成承接；不重放旧候选 |
| Cloud #1410 | 已合并；静态/安全门禁修正 |
| Cloud #1411/#1412 | 已合并的误报处理历史；其中过宽规则排除由 #1415/#1416 纠正 |
| Cloud #1414 | 已合并至 production；激活修复发布集成 |
| Cloud #1415/#1416 | master/production 已合并；恢复默认全扫描，仅按文件hash、路径、规则和位置精确过滤已审查误报 |
| Cloud #1417 | 已合并 master；兼容矩阵及生产收据 |
| Cloud #1413（邻接交付） | 摘要默认非推理修复已合并 master、M4 accepted；不在此次生产包内 |

其他 Portal 状态/容量/焦点交付见邻接审计，不把本轮安装成功外推为所有弹窗和业务验收成功。
Addon 当前本机挂载检出为 `4758074177e3ab8300f85d5d16d704939d1b6f79`；
源代码合并不等于另行发放插件版本或每个客户已更新。

## 4. 生产证据与限制

[Deploy run 42977066716](https://github.com/npcink/npcink-ai-cloud/actions/runs/42977066716)
成功，release 为 `release-7476f023a6a038e7-20261111070654-2275`。
七服务精确镜像运行、零重启/无OOM、内外健康、完成标记及锁清除均已核对。
回退包保留且hash验证通过。完整bundle/manifest hash与回退身份在生产收据中。

上传5160秒（86分钟），远端sequence313秒；二者都不是精确停机时间。
本轮未产生新模型调用、购买、文章或绑定写入；既有签名权益读取不证明新绑定流程。
本地、CI、M4 accepted、源码合并、生产安装和人工价值验收分别记账。

## 5. 四项接续台账

本节统一登记邻接交接的四项，不创建重复实施队列，也不扩大先前生产授权。
接续执行者先读本节和精确候选，再按当前事实更新后继记录。

收尾期间邻接会话 `01a1bf16-bba3-7cd1-93b8-2de1c62793d4` 明确接回实际执行，
报告顺序为 A3→A1→A2→A4；本会话仅维护文档，不并发操作。以下仍记录尚未完成的
证据/发布状态，接回不等于完成，也不作为本会话新生产权限；后继结果由该执行会话核销。

| ID / 状态 | Owner与边界 | 下一触发/最小动作与复核点 |
| --- | --- | --- |
| A1 `WAITING_HUMAN_AUTHORITY` 摘要修复发布 | 操作者授权；接续发布代理执行。保留本地候选 `cf527db58e610128c5dd332de30614a78be5f6ef`，分支 `release-fix/wordpress-excerpt-after-security-20261111`，parent15ae，树等于冻结master cf5886cf | 明确授权该候选晋级/部署后，走现行发布门禁；尚未push、PR、晋级、部署。不得静默加入更新master文档或重新固定上游镜像 |
| A2 `WAITING_EXTERNAL_EVENT` 真实编辑验收补项 | 操作者限定样本/调用；接续验收代理执行，人工审阅。保留 device 草稿10和原文 | A1上线并获得限定业务测试范围后，仅补 `post_excerpt` 与整段改写各一次；不重复已完成标题和技术QA，不发布文章。技术审阅不冒充自然价值采用 |
| A3 `MERGED_PENDING_ACCEPTANCE` 新绑定闭环 | 操作者确定账号/站点及允许变更；接续验收代理执行 | 在正常入口验证“新站点链接→Cloud绑定提示→确认绑定/激活→返回WordPress→状态回写”，记录各端持久状态；健康或旧权益读取不能替代。测试范围明确时复核 |
| A4 `EVIDENCE_PENDING` 详情重命名弹窗 | 接续Portal修复代理；本轮仅登记，未修复 | device详情取消关闭且不保存，但焦点BODY，Escape未观察关闭；下次具名修复先复现。缺显式returnFocusRef/input autoFocus只是线索，不是完整根因；不泛化到已有显式refs的列表/生命周期弹窗 |

## 6. 资源清理与明确保留

本次为会话范围收尾，非全仓阶段迁移。私有保全根目录为
`~/.codex/task-evidence/activation-production-release-20261111/session-closeout/`，
目录0700，归档/bundle0600；不在Git内复制凭据、ignored材料及敏感文件清单。

| 资源 | 已做/保留条件 |
| --- | --- |
| 旧 `addon-activation-flow` worktree | 全目录284749857字节、7003项逐文件hash/链接目标验证；SHA256 `c062854fa5b2ecd6cc315c7065356a50b3df0ca18dc63d11be007d0ef3017390`。完成App可恢复归档；精确核对残留gitdir及单一prune dry-run后清除登记 |
| Cloud旧本地refs 3个 | `codex/addon-activation-flow`、`codex/activation-flow-static-safety`、`release-fix/activation-flow-20261111` 已保全后退休；后两者本地候选不等于API PR head，不声称祖先合并 |
| Addon旧本地refs 2个 | `codex/retire-local-monitoring-summaries`、`codex/activation-return-flow` 已保全后退休 |
| Git恢复证据 | 两仓refs在 `refs/archive/local-branches/20261111/activation-closeout/`，Cloud bundle39164176字节/hash `606ea183eafbfe9ff6c7195ecc6959f3fc16afb8572948dae3f31eb7e91a3ab3`；Addon bundle14969064字节/hash `90ca088bcb7927df7b5e2a7e73dc18bb10388755dfa1d1c6ca4a092d3c242bca`，均已bundle verify |
| Cloud远端8个交付topic refs | 分页API分支库存确认均已不存在；保护master/production及其他会话refs；不是从单次请求失败推断删除 |
| Addon #349远端 | 精确head607c1fcc、merged及无open PR核对；单独保全远端bundle14915870字节/hash `470305f8be13bb33c378b64d207f0e7e16e7632fbdeaf9aa9314ae7e84c1c0c4` 后删除，404复核 |
| Addon #350远端 | 保留 `codex/activation-return-flow@9d3a95e6`。本地仅b360旧候选，精确远端对象缺失；Git传输连续超时已停止，REST可读不等于完整Git历史已保全；一次有界REST替代尝试未通过精确commit hash校验，未删除。后续完整保全精确head、复核接续owner不再需要后才退休 |
| 当前 `activation-release-scan-fix` | App主检出，保留锁；不能绕过主检出保护删除、切换或重置。发布收据/兼容矩阵副本与master相同，本次文档提交后另存本地保全。关闭聊天不代表该checkout已与最新master同SHA |
| 其他资源 | 邻接验收root与A1候选保留至验收/发布交接完成；WordPress挂载Addon、M4与其他会话受保护worktrees均不动 |

旧worktree退休后全Cloud库存16个；`worktree:audit -- --require-locked`通过，
不表示16个都是本会话创建或可清除。本会话旧实验worktree已退休，当前1个保留。
Git fetch失败后本地master/production及跟踪refs可能陈旧；本轮以GitHub API读出的SHA为准，
未强行更新其他会话分支。最终清理分类为 `KEEP_ACTIVE`（受保护主检出及明确接续资源），
不能称 `CLEANUP_READY` 或“本地/云端全部清空”。

## 7. 复盘与方法入库

目标：只关停低收益重复路径，修复客户激活闭环，并留下可恢复、可接续的交付。
已达成：镜像清理、激活实现、扫描范围修正、生产身份核验、旧资源保全退休。
未达成：第5节四项；自然用户价值及所有新业务变更未验收。

| 具体偏差 | 原因 | 更正及下次控制 |
| --- | --- | --- |
| 初始建议退休简易生成弹窗 | 把同接口误当同用户价值，低估JSON操作成本 | 删除前纠正；按用户、任务、输入成本与可达性证明替代等价 |
| 误报处理扩大成全局规则排除 | 以通过门禁代替限定误报身份 | #1415/#1416恢复；固定hash/path/rule/location且变化失效，不削弱全扫描 |
| 占位SSH失败被当作真实主机诊断 | 未先核对loader占位与实际严格wrapper | 先核目标来源、known-host及既有部署命令，不暴露真实目标或凭据 |
| 合并后仍留实验目录和文档副本 | 合并、安装、资源退休混为一次完成 | 本次补保全/精确退休；受保护主检出写明释放条件，不强拆 |

保留的好做法：发现过宽扫描规则后在生产前修正；按精确制品验证安装和回退；
不制造付费观测；保全ignored材料和不同候选后再退休；没有对受保护目录强制清理。
总活跃工时未记录，不用墙钟推算效率；传输与远端执行时间分开计量。
可复用控制写入[既有规范§6.5](../../../engineering/zero-backlog-closeout-efficiency-standard-v1.md#65-价值等价扫描误报与发布收尾的限定控制)，
不新立重复标准或扩大生产权限。四项执行由邻接会话按其核实的授权推进，本会话不重跑模型或部署。
