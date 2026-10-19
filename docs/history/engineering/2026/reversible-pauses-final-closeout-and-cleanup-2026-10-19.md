# 可恢复暂停功能最终收口、音频播放与工作区清理 — 2026-10-19

状态：已合并到 `master`，M4 开发预览已接受；生产未部署，插件未分发。

这份记录收口 `npcink-ai-cloud`、`npcink-cloud-addon` 与
`npcink-workflow-toolbox` 中可恢复暂停功能的开发、合并、M4 验收、历史音频
播放补充验证和工作区清理。它记录事实和下一阶段入口，不把候选预览、旧分支
或旧聊天收据当成当前运行状态。

## 1. 目标与边界

本批工作的目标是暂停高风险或低频功能的**新执行和使用入口**，同时保留：

- 实现、配置、历史结果、用量/计费证据和必要诊断，便于后续受控恢复；
- 普通文本/图像/ALT、Site Knowledge、已有媒体与已有音频播放；
- WordPress 本地能力、工作流、审批、预检和最终写入控制权。

暂停不通过删除数据库、删除历史结果、重新启用旧配置或建立第二套控制台来
实现。恢复必须是重新评审的源码变更，并针对当前消费者重新验证。生产分支、
生产服务器、插件分发和生产部署不在本批范围内。

## 2. 合并链与当前来源身份

| 范围 | 合并 PR | 合并/当前主干证据 |
| --- | --- | --- |
| Cloud 可恢复暂停功能 | #1155 | `29784e659fb73d5ee0c06fcbe4b18632cf609251` |
| Portal 桌面入口改造阶段一 | #1159 | `c4079f9e59488cd8e2678d9c392ec4086c68fcd4` |
| Portal 桌面入口改造阶段二 | #1160 | `9ea81814ed740b8c3b0aa8032eb961f6f46bc2fd` |
| Addon 运行时暂停 | #296 | `e69879fcc042e16e4d2cae3c489d29e475d32c27` |
| Toolbox 入口与传输暂停 | #281 | `2dfc3fefa4e5c1016ef10d1c6fb945ba988e9f0d` |
| CNA 前置证据更新 | #1153 | `00aa4d80...`（以 GitHub 合并记录为准） |

当前 `origin/master` 精确版本为
`9ea81814ed740b8c3b0aa8032eb961f6f46bc2fd`。Cloud、Addon、Toolbox 的
上述合并链均已完成；没有把未合并候选分支当成发布来源。

## 3. 已完成的行为验证

### 暂停入口和旧路径

M4 实际页面和鉴权消费端完成了有界、零业务模型调用验证：

- Operations Advisor 不再出现在导航、快速命令和诊断目录；旧书签/历史 scope
  只显示暂停状态，不发 Advisor 执行请求。
- 旧 Advisor 执行接口和内部 audio-jobs 入口返回明确、不可重试的
  `409 feature_paused`；匿名访问仍受鉴权保护。
- Cloud 巡检、站点分析、文章音频生成/重生成、高级媒体衍生、批次计划和治理
  审计的 resolve/execute 与重试路径保持拦截，队列没有新执行。
- 历史读取和必要诊断仍可用；M4 API 计数在有界检查前后保持不变。
- Portal 实际页面使用真实 M4 服务而非 mock；本批不写 WordPress 内容。

独立补充收据：
[`receipt.json`](/Users/muze/.codex/artifacts/reversible-pauses-merge-20261019/supplemental/receipt.json)、
[`browser-result.json`](/Users/muze/.codex/artifacts/reversible-pauses-merge-20261019/supplemental/browser-result.json)、
[`live-api-result.json`](/Users/muze/.codex/artifacts/reversible-pauses-merge-20261019/supplemental/live-api-result.json)。

### 测试和门禁证据

- Cloud 最终暂停/普通运行/WordPress connector/Site Knowledge/媒体交付等聚焦套件：
  **555 passed**；M4 合并后聚焦回归：**123 passed**。
- Admin 完整视觉矩阵：95 passed；随后针对入口撤下、暂停页和窄屏行为的聚焦浏览器检查通过。
- Addon 默认暂停、传输鉴权和 WordPress connector 回归通过；Toolbox 静态、Provider
  行为和编辑器 JS 回归通过。
- OCR 曾因预算或不可用而不完整，未被伪装成绿色证据；决定是否补跑属于后续
  成本控制事项。

## 4. 已有音频播放验证

本次没有生成新音频、没有调用付费 Provider、没有写入 WordPress，也没有进行
M4 sync/deploy。验证分成两个事实，避免把历史资源问题误判为暂停逻辑问题：

1. **历史 WordPress 文章的原始音频入口**：文章 `20273` 的 `<audio>` 元素仍在，
   但既有 `tts.baidu.com/text2audio` GET 返回 `application/json`（200，172 字节），
   浏览器保持 `readyState=0`、暂停且无时长。因此该历史 URL 本身不能确认播放；
   证据是 [`historical-audio-playback.json`](/Users/muze/.codex/artifacts/reversible-pauses-merge-20261019/supplemental/historical-audio-playback.json)。
   这是旧 Provider/资源端点问题，不是本批新生成失败，也不是暂停接口响应。
2. **已有有效 artifact 的实际浏览器播放**：复用仓库已有
   [`demo-audio.wav`](/Users/muze/gitee/blog/src/fixtures/npcink/assets/demo-audio.wav)，
   SHA256 为 `8c7cae8fd08ae53261a648fc9e33e949dc710b1edf7efd4db55715b1bea9d89a`，
   时长 4.35 秒。Edge 在临时 localhost-only 播放页中加载 `readyState=4`，播放中
   `paused=false`，到达 `ended` 时 `currentTime=4.35`、`paused=true`、无媒体错误；
   服务端仅收到音频 GET 200。证据是
   [`existing-audio-playback-positive.json`](/Users/muze/.codex/artifacts/reversible-pauses-merge-20261019/supplemental/existing-audio-playback-positive.json)。

M4 当前音频库存查询为 0 条 run、0 个 audio artifact，所以没有可在 M4 内直接播放
的历史音频对象。正向结果证明已有有效 artifact 的浏览器播放链路仍然工作，并且
暂停生成没有破坏播放；它不等同于 M4 中存在一条可复播的历史音频记录。

## 5. 当前 M4 状态

以下状态来自 Portal #1160 合并后的只读 `m4:preview:status`，没有在本收口文档
任务中重新 sync、promote、构建镜像或部署：

```text
acceptance_state=accepted
promotion_pr=1160
source_revision=9ea81814ed740b8c3b0aa8032eb961f6f46bc2fd
source_branch=master
source_dirty=false
frontend_source_revision=0e8fd3490d609e09bff561ec1e4c4ba6d919b405
deployed_at_utc=2026-10-19T04:45:09Z
```

M4 API、前端、代理、数据库和 Redis 健康；Alembic 为
`20261017_0088 (head)`。这只是开发预览的 accepted 状态，不是生产发布或生产
人工验收。完整状态原始输出保留在
[`m4-status-pr1160-current.log`](/Users/muze/.codex/artifacts/reversible-pauses-merge-20261019/supplemental/m4-status-pr1160-current.log)。

## 6. 分支、worktree 和锁清理

按用户授权，已合并暂停功能的专用分支完成清理：

- Cloud 专用合并分支 `codex/reversible-pauses-merge-20261019`：本地分支已删，
  远端同名引用已不存在；其 clean-master checkout 当前仍由 Portal/v2 任务持有，
  因共享 M4 operations 责任暂不归档或解锁。
- Addon `codex/reversible-feature-pauses-20261019`：本地和远端均已删。
- Toolbox `codex/reversible-feature-pauses-20261019`：本地和远端均已删。
- 原 Cloud checkout `/Users/muze/gitee/npcink-ai-cloud` 的
  `codex/reversible-feature-pauses-20261019` 保留，因为其中有其他任务已暂存的
  三份文档；没有 reset、stash、覆盖、提交或删除这些改动。
- 其他锁定 worktree（deepseek-search-plan、milvus-worker-isolation、Portal、
  SEO pause、trial smoke、recommendation-abstention-v2 和当前 docs closeout）
  均保留；未把锁定状态当成删除授权。

因此，暂停功能的专用分支已经清掉；共享 operations worktree 需等 Portal/v2
操作者明确释放后，再按 managed-worktree 归档流程处理。

## 7. 历史经验与规范化结论

后续相同任务应沿用以下顺序：

1. 先声明模块、边界、非目标、预期文件、验证和回滚；把“入口撤下”“执行拦截”
   和“历史结果可读”分成三类验收证据。
2. 代码改动只在干净且带锁的 worktree 进行；原有脏工作区和其他锁定任务不清理。
3. 先跑最窄的 Cloud/Addon/Toolbox 回归，再由 GitHub 必需检查决定合并；候选
   sync、合并 master 和 M4 accepted promotion 分开记录。
4. M4 只负责运行时证据，来源身份必须同时包含 `acceptance_state`、合并 PR、
   `source_branch=master`、`source_dirty=false` 和当前 `origin/master` SHA。
5. 暂停功能要在 ingress/queue/pre-signing 等真实边界拦截，并用不可重试的明确
   错误；旧 URL 显示暂停而不是默默失败。
6. 音频收口必须同时检查“生成被拦截”和“已有对象可播放”；若历史 URL 返回
   Provider 错误，应记录为 artifact/provider 缺口，不通过生成新内容来掩盖。
7. OCR、外部 Access、历史资源和非生产 M4 都要按证据状态单独标注，不能用截图、
   HTTP 200、已合并或候选分支互相替代。

相关长期规范仍以 [`reversible-feature-pauses-v1.md`](../../reversible-feature-pauses-v1.md)、
M4 开发标准和单会话 worktree 生命周期文档为准；本文件是本批最终事实收口。

## 8. 下一阶段建议

按优先级建议：

1. **先完成运营资源释放**：等待 Portal/v2 任务明确释放共享 clean-master
   operations worktree；收到释放后解锁并归档它，再复核所有锁定 worktree 是否仍有
   真实任务，避免误删。
2. **把文档分支纳入正常合并队列**：本文件在独立
   `codex/pause-closeout-docs-20261019` 分支完成，先做文档可达性和 diff 检查；
   如需进入 `master`，单独发布文档 PR，不与下一批产品改造混合。
3. **若要恢复音频产品验收**：先准备一条受控、可长期访问的非生产历史 artifact
   fixture，再做真实 WordPress 播放验证；恢复生成前仍需重新评审 Provider、额度、
   重试和写入边界。本批不建议为了补证据而生成新音频。
4. **保持暂停状态观察**：继续保留普通文本/图像/ALT、Site Knowledge、历史结果、
   诊断和已有播放；对 Advisor、巡检/站点分析、音频生成和高级媒体只做零副作用
   的入口/鉴权回归。
5. **生产发布另立流程**：只有在 operator 明确授权、master CI 和 M4 accepted
   证据齐全、回滚版本明确后，才评估 production promotion；当前不部署生产。

M4_OBSERVATION_RECEIPT date=2026-10-19; route=LAN_192.168.10.200_read_only_status_after_PR1160; sync=not occurred in docs closeout; focused=not measured in docs closeout; promotion=not occurred in docs closeout; operations=read-only status, deploy0; stable_502=not measured; m4_only=not occurred; coordination=Portal PR1160 accepted, shared ops worktree release pending v2 owner
