# Media Intelligence Lightweight Validation Standard v1

Status: normative development and evaluation standard for the image-only
media-intelligence validation stage.

Date: 2026-07-30.

## 1. 目的

本规范约束 WordPress 媒体库图片的视觉识别、ALT 建议、向量投影和自然
语言检索验证。目标是以最小成本证明用户价值，同时防止开发验证演变成
Cloud 媒体库、自动写入系统、生产 Provider 控制面或新的基础设施项目。

本规范与以下现有契约共同生效：

- [Cloud Image Context Evidence Runtime Contract v1](cloud-image-context-evidence-runtime-contract-v1.md)
- [Site Knowledge Runtime Contract v1](site-knowledge-runtime-contract-v1.md)
- [Media Runtime Boundary v1](media-runtime-boundary-v1.md)
- [M4 Preview AI Development Standard v1](m4-preview-ai-development-standard-v1.md)
- [Cloud Agent Feedback Quality Gate v1](cloud-agent-feedback-quality-gate-v1.md)

如本规范与上述运行时或所有权契约冲突，以更严格的边界为准。

## 2. 适用范围与非目标

### 2.1 适用范围

- JPEG、PNG、WebP 等已允许的图片；
- 一次结构化视觉识别；
- ALT/说明文字的 suggestion-only 依据；
- Site Knowledge 中可重建的媒体检索投影；
- 特色图和段落配图的自然语言候选；
- 仅元数据、去敏的搜索和采用质量汇总；
- M4 开发/测试 Ollama 嵌入与真实本地 WordPress 链路。

### 2.2 明确非目标

- 自动修改附件 ALT、标题、说明、文章或特色图；
- 自动删除、合并或优化媒体；
- 扫描 PDF、Office、音频、视频、归档或未知二进制；
- 查询时临时调用视觉模型识别每张候选图；
- 新建向量数据库、媒体库、DAM、队列、模型注册表或工作流引擎；
- 配置生产 Provider 元数据或把 M4 Ollama 当作生产方案；
- 根据一个正例和一个负例设定全局阈值；
- 保存原始搜索词、原始 ALT 文本、图片内容或 Provider 凭证到质量事件。

## 3. 所有权与真相边界

| 责任 | WordPress / Toolkit / Toolbox | Cloud |
| --- | --- | --- |
| 附件身份、可见性、权限、当前修订 | 最终真相 | 只接收不透明引用和已校验输入 |
| 图片字节 | 原始真相；按契约临时提供 | 仅短 TTL 运行时输入，不成为永久媒体库 |
| 视觉识别 | 发起有界请求并审阅 | 执行模型并规范化结构化证据 |
| ALT 建议 | 展示、修改、采用和最终写入 | 返回 `alt_text_basis`，不得写 WordPress |
| 向量与检索投影 | 触发显式刷新并复核当前附件 | 保存可重建派生投影和搜索证据 |
| 候选采用 | 人工选择与本地治理 | 只返回 suggestion-only 候选 |
| 质量反馈 | 产生去敏结果元数据 | 聚合只读指标，不成为审批真相 |
| 删除与断连 | 触发本地治理和失效 | 删除或失效派生投影，不删除 WordPress 附件 |

任何响应都必须保持：

- `write_posture=suggestion_only`；
- `direct_wordpress_write=false`；
- 需要人工视觉检查；
- 当前附件、权限和修订在展示或采用前由本地再次校验。

## 4. 一次识别、两类消费

### 4.1 标准流程

```text
有界图片清单
  -> 校验 MIME、尺寸、可见性和当前附件
  -> 计算媒体指纹
  -> 指纹命中且证据版本可接受：复用
  -> 否则执行一次结构化视觉识别
  -> 保存 image_context_evidence.v1
  -> 消费 A：ALT/说明文字审阅依据
  -> 消费 B：检索文本、嵌入和媒体候选
```

### 4.2 证据要求

视觉结果应使用已有 `image_context_evidence.v1`，可包含：

- `visual_summary`；
- `visible_text`；
- `subject_tags`；
- `alt_text_basis`；
- `caption_basis`；
- `confidence`；
- `uncertainty_flags`。

Provider 返回无法解析的结构化证据时必须失败，不得用文件名或旧 ALT
伪装成视觉识别结果。视觉证据复用必须绑定图片字节指纹和证据/模型版本。
只改变标题、ALT 或说明文字时，可更新检索内容哈希和嵌入，不应再次计费
调用视觉模型。

## 5. 索引与排序规则

### 5.1 索引

- `site_media` 必须与文章、外部图库和 AI 生成图片保持独立来源；
- 刷新必须显式、有界、站点隔离且幂等；
- 无视觉证据时只能如实标记 metadata-only，不得宣称视觉语义搜索；
- 嵌入空间必须按所请求的媒体来源检查；混合或陈旧空间应失败关闭；
- 索引是派生缓存，删除、断连、同意撤回或附件修订必须使其失效。

### 5.2 轻量排序

媒体搜索可以采用以下稳定顺序：

1. 精确查询匹配作为硬优先信号；
2. 语义相似度作为基础分；
3. 标题、证据文本和受控 CJK 部分匹配提供有界词法加分；
4. 词法总加分必须封顶，当前验证上限为 `0.20`；
5. 没有词法证据时必须保持原语义顺序；
6. 返回排序策略、语义分、词法分和分组证据，方便解释和评估。

不得为了修复单个截图而无限增加关键词规则，也不得让词法加分绕过精确
查询优先。

### 5.3 派生图片去重

- 可折叠同一 WordPress 原图的 `-NNNxNNN` 和 `-scaled` 派生 URL；
- 主机名可以按大小写不敏感规则规范化；
- URL 路径必须保留大小写，不能误合并大小写敏感主机上的不同资源；
- 去重必须返回折叠数量和分组依据；
- 无法证明同源时宁可保留两个候选，不得仅凭相似图片内容自动合并附件。

## 6. 固定查询集

每次改变嵌入配置、排序、去重或视觉证据投影时，必须在同一冻结真实库存
上运行固定查询集。最小集合应包含：

| 类型 | 至少数量 | 目的 |
| --- | ---: | --- |
| 精确标题或已知名称 | 2 | 锁定精确查询优先 |
| 同义词或口语描述 | 2 | 验证自然语言召回 |
| 视觉属性或场景 | 2 | 验证视觉证据而非只匹配文件名 |
| OCR/图片文字 | 1 | 验证 `visible_text` 的实际价值 |
| 库存外负例 | 3 | 测量弱候选返回，不直接推导阈值 |

查询集必须在调整前冻结；不能看到结果后删除失败查询。每次记录：

- 候选总数和返回数；
- Top-1、Top-3 的附件身份和人工相关性；
- 精确查询是否保持第一；
- 语义分、词法分和混合分；
- 折叠的派生 URL 数；
- source readiness、embedding profile 和证据覆盖；
- 是否仍为 suggestion-only、是否发生任何 WordPress 写入。

## 7. 验证阶梯

### 7.1 本地源码门禁

从最窄门禁开始：

- 领域和 API 聚焦测试；
- 目标文件 Ruff 和 mypy；
- `git diff --check`；
- 契约和边界检查（如改动涉及对应 seam）。

隔离 worktree 缺少 `.env` 时不得复制秘密，也不得用未经授权的本机 Docker
替代 M4。应如实记录本地组合门禁未运行的原因，并由 M4/CI 完成对应证据。

### 7.2 M4 candidate

只有取得 shared M4 ownership 后才可：

1. 从当前候选执行 source-only sync；只有构建输入改变时才 deploy；
2. 探测真实 Ollama 嵌入模型和选定媒体源 readiness；
3. 重建有界真实媒体索引；
4. 运行聚焦测试和固定查询集；
5. 核对状态、HTTP health、Alembic head 和 `source_dirty=false`；
6. 释放 shared M4。

M4 candidate 只证明候选行为，不证明代码已进入 `master`。

### 7.3 PR、CI 与 accepted

1. GitHub required checks 是合并权威，不得绕过取消或失败的 context；
2. 自动或人工审查意见必须经测试验证后解决；
3. 合并后从干净、最新的 `origin/master` 执行 promotion；
4. 最终状态必须包含 `acceptance_state=accepted`、正确 PR、
   `source_branch=master`、`source_dirty=false` 和当前 master revision；
5. 运行最相关的真实链路 smoke 后释放 merge lane 与 shared M4。

生产仍需独立 `production` PR、审批、正式 Provider/向量选择和发布证据。

## 8. 质量指标与调优门槛

### 8.1 必须观察的指标

- 搜索成功率：请求是否正常获得可评估候选，与相关性分开；
- Top-1 / Top-3 相关率；
- 库存外查询的弱候选返回率；
- 候选采用率；
- ALT 修改率：采用后保存的 ALT 与建议是否发生实质修改；
- 装饰性或清空 ALT 的比例；
- 派生候选折叠数；
- 视觉证据覆盖率和复用率；
- 单张识别调用、嵌入重建和搜索的成本/延迟。

### 8.2 数据最小量

- 少于 20 个相关会话：只显示计数并标记 `insufficient_sample`；
- 20–50 个会话：允许形成轻量改进假设，不足以自动写入或全局推广；
- 超过 50 个且查询类型覆盖充分：才可评估阈值、reranker 或模型替换；
- 一个正例与一个负例永远不能决定阈值。

分母必须清楚。运行错误不得混进结果质量率；装饰性和清空 ALT 应与
“修改/未修改”分母分开。

### 8.3 反馈数据最小化

Cloud 质量事件只允许保存评估所需元数据，例如：

- 是否成功、是否返回候选；
- 候选数、采用位置和 source type；
- ALT 结果类别（未改、修改、装饰性、清空）；
- 相关时间、版本和去敏关联 ID。

不得保存原始搜索词、原始 ALT、图片内容、签名 URL、存储键、Provider
请求体或凭证。质量汇总是诊断证据，不是审批或 WordPress 写入真相。

## 9. 停止条件与升级条件

### 9.1 应立即停止并调查

- 附件身份错配或跨站候选；
- Cloud 或消费端发生未授权 WordPress 写入；
- 原始媒体、签名 URL、ALT 或搜索词进入普通日志/反馈；
- 混合嵌入空间仍被当作就绪；
- 指纹未变却重复调用视觉 Provider；
- 精确查询优先被排序更新破坏；
- URL 去重合并了大小写敏感的不同路径；
- M4 候选被错误描述为 accepted 或生产。

### 9.2 允许升级方案的证据

只有出现以下证据之一，才考虑下一层复杂度：

- 20–50 个真实会话显示轻量排序仍有稳定、可分类的失败；
- 固定查询集证明纯视觉问题来自证据质量，而非排序或元数据；
- 库存规模和延迟实测证明现有向量后端不能满足目标；
- 明确的生产容量、隐私、删除和成本要求需要正式向量服务；
- 非图片附件存在独立用户场景、足够数量和可接受数据分类。

升级顺序应为：补证据覆盖 -> 调整有界排序 -> 扩大标注集 -> 评估
reranker/阈值 -> 评估正式向量服务。不得直接跳到更大模型或新基础设施。

## 10. 当前阶段验收清单

- [ ] 图片是唯一 AI 扫描附件类型；
- [ ] 一次视觉证据同时供 ALT 建议和搜索使用；
- [ ] 未变化图片复用证据且无重复视觉调用；
- [ ] 搜索在特色图和段落配图入口可用；
- [ ] 精确查询优先、无词法时语义顺序、派生 URL 去重均有回归；
- [ ] 固定查询集包含多正例、多负例和视觉/OCR 场景；
- [ ] 返回排序与分组证据；
- [ ] 质量反馈去敏且不足 20 个样本时标记证据不足；
- [ ] `suggestion_only` 和 `direct_wordpress_write=false` 未改变；
- [ ] 本地、M4 candidate、CI、master accepted、生产状态分别记录；
- [ ] M4 使用开发/测试 Ollama，生产向量方案未被暗示已确定；
- [ ] 没有新增 Provider 元数据、迁移、Admin、WordPress 写入或生产变更。

达到本清单表示可以进入观察期，不表示允许自动 ALT、自动选图、自动清理
或生产发布。
