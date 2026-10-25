# Portal 自助开通与文本/图片知识库交付证据 — 2026-10-26

Status: dated development evidence. 本文修正活动文档残留的“候选/待实施”状态，
不是七会话全部历史事项清零、正式安装包发布或生产验收声明。
当前合同以 [TOTP](../../../portal-totp-v1.md)、
[知识库运行契约](../../../site-knowledge-runtime-contract-v1.md)与
[最低配兼容表](../../../compatibility-matrix.md)为准。

## 已交付身份

| 批次 | 候选 → 合入 | 已取得证据 | 未由本批证明 |
| --- | --- | --- | --- |
| TOTP SELF06/07，Cloud #1279 | `a9c2036a26f8af8ca5d2c06e9645ebc4b41e7a00` → `ade8acc5275a6a83bdf6fa287d14def7d6cf54b3`，整树相同 | PG104、受控live、独立审查、六项必需CI、M4 accepted及合后六项窄读 | 真实SMTP、生产、新的人工验收 |
| typed lifecycle，Cloud #1280/#1281 | #1281候选`15b3e91cb1c39d28243e05690576ba8baf420ec2` → `7390fa0532b3d14de8355b1d6cdea92c5f544d35`，整树相同 | 六项必需CI、M4 accepted、合后八项窄测 | live Zilliz、付费Provider、生产或自然采用 |
| WordPress原生降量，Addon #331 | `133d44760748f7544e51a28a4df54c0cb50453a4` → `1b2d305acb5c40294b1b258e877fef7b4073316e`，整树相同 | 16项适用检查成功，三项必需CI通过；原始实施/浏览器矩阵后续对账 | 版本号相同不证明已安装这些源码；纯PHP未另走M4 |
| G1/G2/G3补测，Addon #332 | `0d157021cc96dd0884c1082b68c9d764ce1999d6` → `4641ec1218fdb8106995b5f793d10844e8bde543`，整树相同 | 3401项本地断言，14项适用检查成功，三项必需CI；四个针对性mutant均在对应新增组失败 | 测试补强不代表新增产品行为或外部服务恢复 |

TOTP 的PG104实际执行于`346ab4cf2ba2fbb8a821b9af39a510f57ded75f7`，
通过未变源码绑定复用到最终a9候选，没有声称在a9重跑。受控live使用真实临时
API/PostgreSQL，但邮件为进程内测试发送器，安装状态为测试覆盖。
M4合入晋升复用同树的a9编译产物，未重新构建；其served BUILD_ID、CI构建和
受控live构建分别记录，不能互换。自动合入授权未产生新的人工体验验收。

## 知识库原24项的签收范围

原矩阵是23项实施/测试义务加1项有界浏览器义务，不是24项全live要求。
19项已有证据，余下5行归并为G1、G2、G3、G5四个后继；没有降低原验收层级。

- G1补完整媒体抑制状态；pending_delete/restore_pending仍阻止full start，
  只有excluded场景要求full完成，不能为凑测试而改状态机。
- G2补不确定派发错误：未知run保持未知，已知run读取既有状态，不重发执行。
- G3补矛盾summary缓存不能取代fresh presence的回归。
- G5复用八种已有Portal容量场景及未变源码，另用真实WordPress页面原生混选
  post/page/media，EXCLUDE后仅一次原生POST，三项显示Checking removal。
  生命周期回读为同一operation、三项pending_delete、dispatch_count=0，
  证明本次UI/意图，不是新的三类型worker删除全链路。

真实R/F/B/S的既有有界证据使用PostgreSQL、Redis及确定性embedding fixture。
这不能推广成live向量厂商、物理故障/竞争、付费模型或生产证明。
PDF/视频/OCR/ASR当前均不交付，保留扩展接缝；Portal保持只读，
排除/恢复控制与最终WordPress对象真值留在WordPress。

截图必须实看。G5的`mixed-checking-removal-collapsed.png`含导航重绘残影，
已由独立后继更正收据排除视觉验收；采用清晰的提交前与展开后画面及实际POST/
状态证据。DOM默认折叠观察仍成立，不能继续引用原“全部无遮挡”声明。
Portal裁剪图也不证明当前完整壳宽、暗色主题或整套构建。

## 私有证据索引与资源处置

以下是本地私有task-receipts的逻辑目录名，不是仓库内文件或公开下载地址。
原件与敏感运行材料不复制到Git；复核先验证各自manifest，再核精确源绑定。

| 私有收据目录 | 用途/manifest SHA256 |
| --- | --- |
| `z21-totp-final-admission-current` | #1279分层验收、PG/live来源绑定、M4编译身份及审查服务失败限制 |
| `knowledge24-parent-original-level-acceptance-20261026` | 原24项签收及源码池消费者结束决定；`1a5dac02d58a2ac552acecee0eef468dba8ebf28e10400ed89c376baffa78ed1` |
| `knowledge-addon-residual-g123-delivery-20261026` | #332合入/CI与作者资源退休；`cc49c504e3367d528667c9029cc67b81dd430cc999860a1320ef6ca31a52096d` |
| `knowledge-g5-parent-real-mixed-ui-20261026` | 真实原生UI/POST/状态与精确清理；`cb455ae4e44599bdab0998c408bee5e1bad9613313aacad1224ee1bc1e33cb06` |
| `knowledge-g5-parent-visual-correction-20261026` | 覆盖原截图无遮挡断言；`47526ccc9faea3c2ee9c1947ca97975dace3fe74c38561620e8e284c809f651f` |
| `knowledge-addon-sourcepool133d-final-retirement-20261026` | 最后源码池非force退休；`d4e81d6d934bb98075c68f88f8f14e1c89ba47bee2e6121f26e5b67688b47926` |

Cloud/Addon作者topic已可恢复退休。最后133d源码池在当前runner/WP执行消费者
明确结束、160份ignored资产完整归档和解包核验后，才移除目录及注册。
历史exact-root pin继续作为复现元数据保留，不构成无限活跃租约；未来重放需
显式恢复或经过审查的后继。既有release树、primary、Local symlink、恢复refs/
bundles及其他仓义务分别保留，不因这批目录消失就宣称全仓清理完成。

## 可复用方法与仍未完成事项

1. 复用证据前核HEAD/tree/逐文件身份与适用范围，避免相同源码反复跑宽门。
   状态迁移遵循[开发/集成/发布车道](../../../development-validation-operating-model-v1.md)，
   local、CI、merged、M4 accepted、production和human evidence分别报告。
2. 以原义务设计正负行为与针对性mutant；未知run、状态抑制和响应丢失不能用
   自动重发、虚构ID或放宽断言换绿灯。验证脚本自身失败应先修取证缺口。
3. 截图更正写独立后继，不改旧seal；读原件、校验manifest与实看图片各有职责。
4. 资源按当前消费者和精确路径释放，保全ignored原件后非force移除；archive
   证明可恢复，不证明功能交付。遵循[阶段清理标准](../../../repository-stage-transition-cleanup-standard-v1.md)。

全历史目标仍未完成。三位Free试用者尚未开始；自然样本、人工采用/保存/反馈、
metadata-only连接阻断与stale-running当前库存、外部OCR恢复、生产部署和真实
交易/退款/邮件仍分别待办。July22私有验收原件在有界查找中NOT_LOCATED，
保留当时已交付文档结论，不推断历史失败或丢失，也不冒称本轮重验。
完整跨仓资源与最终经验签收须在剩余原义务核清后另行完成。
