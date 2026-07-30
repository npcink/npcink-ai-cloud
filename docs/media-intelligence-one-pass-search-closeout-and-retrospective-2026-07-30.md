# Media Intelligence One-Pass Search Closeout And Retrospective — 2026-07-30

Status: development milestone closed on `master`; M4 preview accepted; production
deployment and general availability are not claimed.

## 1. 原定目标

本阶段把媒体智能范围收敛为图片，并让一次结构化视觉识别同时服务两个
明确结果：

1. 为缺失或质量较弱的图片 ALT 提供可审阅的 SEO 建议；
2. 将同一份视觉证据投影为向量和检索文本，支持自然语言搜索媒体库。

最终写入仍由本地 WordPress 用户决定。Cloud 只负责视觉执行、规范化证据、
可重建索引、检索与只读质量汇总，不拥有附件、ALT、文章、审批或删除真相。

本阶段继承以下边界：

- [Media Intelligence And Attachment Indexing Next-Stage Plan v1](media-intelligence-and-attachment-indexing-next-stage-plan-v1.md)
- [Media Intelligence Milestone A Inventory And Gate](media-intelligence-milestone-a-inventory-and-gate-2026-07-29.md)
- [Cloud Image Context Evidence Runtime Contract v1](cloud-image-context-evidence-runtime-contract-v1.md)
- [Site Knowledge Runtime Contract v1](site-knowledge-runtime-contract-v1.md)
- [Media Runtime Boundary v1](media-runtime-boundary-v1.md)

## 2. 完成情况

### 2.1 能力闭环

```text
WordPress 图片与附件真相
  -> 有界枚举、校验和媒体指纹
  -> 一次结构化视觉识别
  -> image_context_evidence.v1
       -> ALT 建议依据
       -> 检索文本与向量投影
  -> 特色图/段落配图自然语言候选
  -> 本地人工采用或修改
  -> 仅元数据质量反馈
```

已经完成：

- 图片字节未变化时按媒体指纹复用视觉证据，避免重复模型调用；
- 元数据变化时可重建检索投影，不要求重新识别图片；
- 结构化证据同时提供 `visual_summary`、`visible_text`、
  `subject_tags`、`alt_text_basis` 等 ALT 与检索所需依据；
- `site_media` 作为独立媒体来源进入特色图推荐和段落配图建议；
- 搜索结果保持 `suggestion_only`，并明确
  `direct_wordpress_write=false`；
- 开发/测试环境使用 M4 上的无密钥 Ollama 嵌入配置，不引入生产向量
  服务或生产 Provider 元数据；
- 在语义分数之上增加有界词法信号，保留精确查询优先，并折叠 WordPress
  尺寸派生图和 `-scaled` 变体；
- Cloud 汇总搜索成功、候选采用和已保存区块 ALT 修改等元数据指标，不
  保存原始搜索词、ALT 文本或图片内容。

### 2.2 合并证据

| Cloud PR | 结果 | 合并提交 |
| --- | --- | --- |
| [#381 Add media library retrieval projection](https://github.com/npcink/npcink-ai-cloud/pull/381) | 建立站内媒体检索投影 | `93000596b300925ce33a4fec1c06ea87d09cabc4` |
| [#391 Reuse media vision evidence for ALT and search](https://github.com/npcink/npcink-ai-cloud/pull/391) | 一次视觉证据双重复用；20 张真实图片完成证据，重复批次 20/20 复用且零 Provider 调用 | `78f58779f5d005c87f45906902db74708cdc099f` |
| [#399 Add media quality feedback rollups](https://github.com/npcink/npcink-ai-cloud/pull/399) | 增加只读质量汇总，样本不足 20 时明确标记证据不足 | `7fd5489f118e9949cd5ce77ef32c17556ddd287a` |
| [#407 Add M4 semantic media embeddings](https://github.com/npcink/npcink-ai-cloud/pull/407) | M4 开发/测试 Ollama 嵌入、媒体源就绪隔离和失败关闭 | `923f935189ab98aa51cc2c88d09be1198f3c4ee5` |
| [#409 Improve lightweight media search ranking](https://github.com/npcink/npcink-ai-cloud/pull/409) | 有界混合排序、精确查询优先、派生 URL 去重及排序证据 | `b354b747a7a0af554f0c2d9d37a4535353eee696` |

跨仓初始接入还包括 Toolkit PR #103 和 Toolbox PR #93；后续 Toolbox
变更把相同的站内媒体来源延伸到两个编辑器入口。Cloud 合同先合并，再发布
依赖它的 WordPress 消费端，避免消费未合并契约。

### 2.3 实际验证

- PR #391 对 20 张真实本地图片完成结构化证据，第二次运行全部复用；
- PR #407 在 M4 建立 64 个 Ollama 媒体块，旧文章向量不再错误阻塞
  已完整重建的媒体源；
- PR #409 使用真实 `magick-ai.local -> Toolbox -> Addon -> Cloud`
  链路执行固定查询集；
- “猫咪”的 Top-1 为“小猫舔毛”，语义分数约 `0.7603`，有界词法加分
  `0.08`，混合分数约 `0.8403`；
- “小猫舔毛”保持精确查询 Top-1；“报纸新闻”的前两个候选均为报纸图；
- 每次查询评估 64 个候选，并折叠 21 个派生 URL；
- 最终 PR #409 已从干净 `master` 提升到 M4 accepted，HTTP 首页和
  live health 均为 200，数据库版本为 Alembic `20260728_0076`。

这些证据只说明开发主干和 M4 预览已闭环，不等于生产部署或最终搜索质量
承诺。

## 3. 发现的问题

| 严重性 | 具体问题 | 根因 | 已采取或后续改进 |
| --- | --- | --- | --- |
| 高 | 早期界面和契约存在，但 Local Addon 未运行时无法证明真实 Cloud 搜索成功 | 把“入口存在”“聚焦测试通过”和“真实请求闭环”混为一个完成状态 | 分开记录源码、CI、M4、真实 WordPress 链路和生产状态；恢复 Addon 后补真实固定查询集 |
| 高 | 用“猫咪”正例和“火箭发射台”负例拟定 `0.74` 阈值会过拟合 | 样本过少，且真实正负样本分数分布重叠 | 删除实验阈值；至少观察 20 个真实会话并扩大标注查询集后再校准 |
| 中 | 纯语义搜索会把不相关海报等图片作为“猫咪”候选返回 | 小库存仍强制返回 Top-K；旧图片视觉证据覆盖和区分度不足；没有可信拒答阈值 | 先增加有界词法信号、精确查询优先和证据展示；无足够证据时不伪造“无结果”能力 |
| 中 | 初版混合排序在回退路径重复计算词法加分，并可能削弱精确查询优先 | 排序职责分散，语义回退和混合排序共享了不清晰的加分路径 | 将媒体排序集中为单一准备阶段，用独立回归锁定精确优先和无词法时的原语义顺序 |
| 中 | 初版 URL 规范化把完整 URL 转为小写，可能误合并大小写敏感路径 | 把主机名大小写规则错误扩展到了路径 | 只规范化不区分大小写的主机名，保留路径大小写，并增加 `/Cat.jpg` 与 `/cat.jpg` 回归 |
| 中 | 一条媒体断言曾误放进非媒体 `not_ready` 测试场景 | 编辑范围紧凑但场景边界检查不足 | 聚焦测试立即发现并迁移断言；以后先按意图定位测试夹具，再修改断言 |
| 低 | CJK 部分匹配初始加分 `0.04` 无法跨越真实样本约 `0.05` 的语义差 | 只按直觉设定权重，没有用真实库存差值校准 | 在排除低信号单字后把 CJK 有界加分调至 `0.08`，总词法加分仍封顶 `0.20` |
| 低 | 隔离 worktree 缺少 `.env`，组合 seam/perimeter 门禁无法直接启动 | 安全隔离环境不复制凭证，这是预期约束 | 不复制秘密、不用本机 Docker 替代 M4；采用聚焦本地测试、M4 和 GitHub required checks 形成证据链 |

## 4. 做得好的地方

- 从“识别所有附件、自动清理、模型交叉复核、Provider 元数据”等宽范围，
  收敛到图片的一次识别、两个直接用户结果；
- 复用已有 Site Knowledge、视觉证据和 WordPress 编辑器入口，没有创建
  第二个媒体库、向量控制面或工作流注册表；
- 按字节指纹复用昂贵视觉证据，让 ALT 建议和向量检索共享同一事实来源；
- 在没有足够负例证据时主动撤销固定阈值，避免为了消除截图中的坏候选而
  牺牲召回；
- 把自动代码审查发现的大小写路径问题落实为测试和修复，再关闭审查意见；
- 每个阶段保持 WordPress 本地写入权、人工采用权和可回滚性；
- 使用真实库存和真实编辑器链路验证，而不是仅凭模拟数据宣布完成。

## 5. 下次重点关注

1. 先运行 20–50 个真实、去敏后的搜索与采用会话，再讨论阈值、重排器或
   更强模型；
2. 固定查询集必须同时含精确名称、同义词、视觉属性、场景、OCR 文字和
   库存外负例；
3. 重点补齐旧库存的视觉证据覆盖；查询时在线调用视觉模型不是本阶段方案；
4. 观察 Top-1/Top-3、弱候选返回率、候选采用率和 ALT 修改率，不只看
   单一相似度；
5. 只有当轻量排序无法解决已量化问题时，才评估 reranker、生产向量服务
   或 Provider 元数据扩展；
6. 继续只处理图片。PDF、Office、音频和视频必须由独立需求、隐私分类和
   成本证据重新打开；
7. 任何生产落地都需要单独选择正式嵌入/向量服务、容量与删除策略，并走
   `production` 发布政策。

## 6. 阶段结论

当前阶段可以停止继续扩张。它已经证明：

- 一次图片视觉识别可以合理地同时支撑 ALT 建议和自然语言检索；
- M4 本地 Ollama 足以承担前期开发验证；
- 轻量混合排序和派生图去重能带来可见收益；
- 质量数据可以进入 Cloud 做只读聚合，同时不转移 WordPress 写入所有权。

尚未证明：

- 库存外查询能够可靠返回空结果；
- 当前质量足以自动写 ALT 或自动选择图片；
- 非图片附件值得扫描；
- M4 配置可以直接作为生产向量方案；
- 该能力已经部署到生产。

后续工作必须遵循
[Media Intelligence Lightweight Validation Standard v1](media-intelligence-lightweight-validation-standard-v1.md)，
用观察数据触发，而不是继续凭功能想象扩张。
