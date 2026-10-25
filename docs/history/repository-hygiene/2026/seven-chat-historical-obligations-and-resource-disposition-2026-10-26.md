# 七会话历史义务与资源处置：阶段检查点 — 2026-10-26

状态：有界阶段证据记录；source cut 为 master `804a7b9e`、M4 accepted `4401fd23`，
资源处置签收截至 2026-10-25 20:58 UTC。本文后续 PR 的文档合入不构成新增 M4/生产验收。
这不是全部历史清零、全部资源释放或生产准备完成声明；来源是具名源码、
签收收据和有界资源核验。生产、真实使用与历史原件的缺证保持未完成。

## 本次记录的增量

[10 月 24 日七会话记录](../../engineering/2026/seven-chat-phase1-closeout-2026-10-24.md)
已记录原分工和 T2 经验，不在此重抄。继续分别报告 local、CI、merged、M4 candidate、
M4 accepted、production 和 human evidence；旧完成声明只适用于当时获准范围。

| 具名义务 | 本阶段已有签收 | 不能从中推出 |
| --- | --- | --- |
| 文档意图对账 #1283/#1284 | 历史主目录原意图已映射后继；11 个非祖先提交不等于 11 项新欠交付 | 原全文全部入库、旧 active plan 可直接恢复 |
| schema #1285 | merge/M4 accepted 为 `4401fd23`；父签收复用 366 项通过证据 | 新生产版本、自然采用或真实 OAuth/邮件/交易 |
| SELF-09 #1286 | master 合入 `804a7b9e`；原 plan 7,889 bytes、SHA-256/blob、说明与索引已签收 | §6 建议已实施；`804a` 已获新 M4 accepted |
| Core 旧远端/tracking | 12 项已用旧 OID 校验原子退休；13 个归档入口含唯一 `03be509f`，独立恢复和接续责任已签收 | 唯一原件已并入 master；Adapter H03 现行远端可取合同已解除 |
| 三个本地 topic | 原始 commit/tree 与合入树等价；archive 后精确退休，eng08 保留 clean detach `804a` | App primary 目录、锁、ignored 或工具消费者已释放 |
| 四个新 archive 完整恢复 | 无 prerequisites 的 33,819,746-byte full bundle 已独立恢复、strict fsck，原 commit/tree 已核 | WordPress/Cloud/DB/ignored/运行状态回退 |
| A02 六个误改 | 精确逆向回原字节，父独核 primary clean，停止旧商业计划 | 最初误改从未发生，或旧历史任务变成当前指令 |

具体边界复用[原 24 项知识证据](../../engineering/2026/portal-self-service-and-knowledge-delivery-2026-10-26.md)、
[primary source 对账](../../engineering/2026/primary-source-reconciliation-2026-10-26.md)及
[SELF-09 原件处置](../../engineering/2026/provider-model-management-plan-disposition-2026-10-26.md)。
原件入库保持字节身份；P0 已由 #1206 承接，metadata fallback 保留，§6 分项建议不自动实施。

## 资源处置检查点与接续 owner

| 资源/状态 | 当前接续 owner | 释放或后续处理条件 |
| --- | --- | --- |
| eng08 App primary / 锁 / ignored / 注册 | 原任务 owner 保留，parent 统筹 | 支持的 App 角色切换后，重新核 exact path、owner、clean、ignored 保全与消费者，再分别决策目录/锁；不得 CLI 绕过 |
| 四个 archive 与 full bundle | parent 保管 | 既有保留合同：archive 至少至 2026-11-25 且相关义务关闭；ref 后续退休后 bundle 至少再留 90 天，无自动到期删除 |
| 旧 raw capsules、摘要索引及签收包 | 原收据 owner / parent | capsules 不冒充 full bundle；full Git 恢复也不取代状态回退；需要更正时只增 successor |
| Local Addon 源对齐 | A01 | 已有 source `46b11d80` → target `4641ec12` 授权；Mac 锁屏阻塞，先暂停具名系统 cron，再通过 Local 停两站并独核请求/PHP/CLI 消费者静止后换源；不靠杀未知进程代替 |
| Cloud 旧 `tmp_pack` / 私有 vault | C1 本批已交还窗口，parent 保管 | 1,606 项已隔离，235 份重复字节已精确回收；1,494 种内容与 1,760 原路径映射保全，vault 无自动过期 |
| Cloud live `tmp_pack` 153 项 | parent 后续具名调查 | 152 项原年轻文件及 1 项冻结外文件；writer 未确诊，正常 Trace2 窗口未捕获写入，不自动推断可删或归因 |
| 既有 M4/生产准备、其他合同保留资源 | 原登记 owner / parent | 尊重现有租约和合同；不可将远端 fetch 保留义务（如 Adapter H03）误判为漏清理 |

Local 对齐在已读签收中尚未执行：`magick-ai` 仍有站点服务和系统 cron 消费者，
未证明 PHP loaded source 已更新；不能用 target 分支合入或 symlink 存在抵销此项。
C1 的一次流式 hash 覆盖 1,760 项、17,131,634,688 bytes；其中 1,494 种不同内容均保全。
随后同卷隔离 1,606 项旧文件，对精确 235 个副本逐字节比较 canonical 后删除，
逻辑释放 **2,302,410,752 bytes**；vault 保留 1,371 文件 / 13,387,694,080 bytes，
两份已封存 pilot payload 原位保留。Git 状态、refs、config、worktree 与正式 packs/MIDX 未变。
仍有 153 项 live 临时文件，不能宣称对象库临时状态清零；writer 仍未知。

三项初次移动后曾因 `com.apple.provenance` 值差异停下；原始值、后继观测、
停止收据和调整范围均保留，独核数据哈希与 inode/size/mtime 一致后才续批。
仅接受这一具名 opaque 属性差异，不调用 setxattr，不承诺 OS 级属性可重建。
恢复清单保留内容/路径与元数据，已删除副本的原 inode/ctime/birthtime 无法承诺原样重建。
APFS 共享块与并发写入使逻辑 bytes 不等于物理空间收益，不能承诺 df 下降。

七仓 20:19Z（本地 10 月 26 日 04:19）的 10 trees / 13 local heads / 9 remote heads /
0 stash / 0 open PR 只是旧元数据切面；其后已有三个 local head 退休。
20:41Z 直接重读七仓后为 10 trees / 10 local heads / 9 remote heads / 0 stash / 0 open PR。
每仓局部读窗稳定，并非全局同时快照；必要保护资源、使用中资产与安装源阻塞继续保留。

## 少量可复用规则

1. 当前具名 assignment 和已接受 change envelope 定义接手范围；历史聊天是证据。
   编辑前核实际 cwd、HEAD、clean 状态与 expected files，不能只认聊天名或旧目录名。
   发现漂移先停写并保全，只精确撤销自己可识别的 patch，不用全树 reset 覆盖混合工作。
2. 先固定源身份，再复用原证据。patch-id 不同、非祖先、文件缺名都不是欠交付的充分条件；
   要对照真实意图、后继 commit/tree 与原始验收层级。临时 CI 退休不应作为产品欠账恢复。
3. 摘要索引、raw capsule、完整 Git bundle 和状态备份分开命名；每种都写出恢复范围。
   先核 owner/消费者并保全，再分别处理 ref、config、目录、注册、ignored 和运行资源。
4. 已写 FREEZE 后不再改包，即使它只是程序性标记。旧 README hash 失配由后继绑定当前
   字节并说明历史修订，不改旧 manifest；本阶段曾有发布收据封存后文字修订，不能称原包未变。
5. workflow SUCCESS 不等于 substantive review。OCR 的未选文件、额度/认证失败均不计
   交付；本批采用获准的 parent exact-head 独审例外，不重跑服务制造审查证据。

## 仍不能销账的义务

- 原 24 项分层不降低：测试/fixture、受控 live、真实浏览器和自然采用各证明各自范围；
  PDF/video 当前暂停，OCR/ASR 扩展接缝不等于产品交付。
- 三名自然 Free 用户尚未开始；≥10 次自然标题建议样本及实际人工采用/保存/质量反馈分母不能由 fixture 补齐。
- SMTP、真实 OAuth、真实交易/退款、DB 日志与 stale-running 现场库存/根因，按既有
  触发与授权分别补证；本文不授权额外日志查询、重试或生产操作。
- 外部 OCR 的 403/400 没有证明服务恢复；July22 operator 私有原件仍为 NOT_LOCATED。
  两次历史 CI 元数据不能代替 operator proof；保留当时结论，不推断丢失/失败，也不冒称重验。
- 本阶段记录的生产准备仍冻结于 `635de872`，production 为 `16747…`；不是 approval-ready，
  也不因开发 master `804a` 或 M4 accepted `4401` 而自动晋升。

## 私有证据定位与接续

以下为 `task-receipts/npcink-ai-cloud/2026-10-25-zero-backlog/` 下逻辑目录，
不是公开下载链接；正文仅复用父签收，不复制私有运行材料。

- `parent-core12-and-schema1285-independent-adoption-20261026`：core12 与 schema1285。
- `self09-1286-parent-release-adoption-20261026`：原件/索引入库、CI 与无新 M4 边界。
- `parent-three-local-topics-adoption-20261026`：三个 local topic 退休与 protected tree 保留。
- `cloud-four-new-archives-full-recovery-20261026`：四个 archive 的完整 Git 独立恢复。
- `parent-a02-reversal-and-july22-metadata-adoption-20261026`：误改逆向、旧 hash 纠正与原件缺证。
- `parent-tmp-pack-final-batch-adoption-20261026`：235 精确重复回收、1,494 种内容和完整恢复映射独核；封存 manifest 为 `556818845fcef31697382cd883a28f7f1575731e8ca0e545a966bb4f3f0fd879`。
- `parent-local-cron-blocker-adoption-20261026`：锁屏阻塞、独立 CLI cron 控制预案与未执行换源。

本 source cut 中 Local 换源仍阻塞，临时包 writer、现场和外部证据仍未关闭；
后续只由新的具名事实接续，不能因本文合入就宣称全部历史清零。本文不新增产品或审批流程。
