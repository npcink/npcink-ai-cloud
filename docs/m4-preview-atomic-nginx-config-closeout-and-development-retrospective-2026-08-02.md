# M4 Nginx 原子配置发布收口与开发复盘 — 2026-08-02

状态：运行时修复已通过 PR `#459` 合并，并从 clean current `master`
完成 M4 accepted promotion。本文是历史证据和开发复盘，不是生产发布证明。

范围：PR `#458` 第一次 M4 Preview 部署暴露的 Nginx 单文件 bind mount
非原子更新、根因调查、修复试错、故障注入、PR `#459` 交付与 clean-master
接受链。

当前强制规则以
[M4 Preview Runtime-Bound Configuration Publication Standard v1](m4-preview-runtime-bound-config-publication-standard-v1.md)、
[M4 Preview AI Development Standard v1](m4-preview-ai-development-standard-v1.md)
和 [M4 Preview Development Workflow](m4-preview-development-v1.md) 为准。
本文不修改或授权生产、Cloudflare、DNS、数据库、业务功能、部署锁或第二套
candidate/accepted 控制面。

## 1. 原始现象和目标

PR `#458` 的第一次 `m4:preview:deploy` 中，源码已通过私有 relay 完整
到达 M4，但活动目录的 rsync 更新尚未完成。运行中的 Nginx 容器读取到了
半写入的 `deploy/nginx.m4-preview.conf`。文件在消费者视角中被截断，Nginx
preflight 失败，脚本按既有 fail-closed 规则停止了部分候选服务。第二次
部署因目标文件已经完整而成功。

这个现象说明“压缩包已完整到达”不等于“运行目录中的每个文件对并发消费者
原子可见”。修复目标因此被限定为：

1. 找到 relay、解包、rsync、Compose bind mount 和失败清理的真实顺序；
2. 让 Nginx 永远只看见旧完整文件或新完整文件；
3. 让传输、解包和候选校验失败发生在 live commit 之前；
4. 保持 relay、部署锁、slot、candidate/accepted、promotion 和既有
   post-commit fail-closed 边界不变；
5. 用契约测试和真实 M4 故障注入证明，而不是用重试掩盖竞争条件；
6. 不扩大为整个部署系统或生产部署重构。

## 2. 交付历史和证据状态

| 阶段 | 证据 | 能证明什么 |
| --- | --- | --- |
| 触发变更 | PR `#458`, head `17e648e9`, merge `80158656` | 第一次部署暴露活动 Nginx 配置被 live rsync 半写入；第二次成功不能消除竞争条件 |
| 根因诊断 | `scripts/m4-preview.sh`、Compose bind mount、relay 流程 | relay 和 tar staging 完整，但 staging 随后直接 rsync 到活动目录；Nginx 读取稳定宿主机路径 |
| 修复提交 | `95eacf85905fc5f56df1924a25952d5d269d763c` | staging preflight、延迟 rsync、Nginx 排除、同目录 incoming、校验和原子 rename 已进入候选源码 |
| Candidate | `source_revision=95eacf85`, `source_dirty=false` | 修复提交在真实 M4 开发运行时工作，不等于已合并 |
| 受保护合并 | PR `#459`, merge `ac0405b048d488d0c229d144fd2703558699e2af` | 必需 CI 接受该修订并进入 `master` |
| Accepted promotion | `promotion_pr=459`, `source_branch=master`, `source_dirty=false` | clean current `master` 成为 M4 当前接受源码 |

PR `#459` 的适用 GitHub 检查全部通过，包括 PR body contract、secret
scan、Python dependency audit、frontend、backend targeted、CodeQL 和 CI
observability。生产状态保持不变。

## 3. 根因分析

### 3.1 安全边界止于 staging，没有覆盖 live publication

原流程已经具备两层完整性：

- relay 使用 partial 路径、长度和 SHA-256 校验后发布完整 bundle；
- M4 把 tar 完整解压到活动目录的 sibling staging。

问题发生在下一步：

```text
verified bundle
  -> complete staging tree
  -> rsync directly into live source mirror
  -> stable host file is rewritten in place
  -> running Nginx bind mount observes intermediate bytes
```

这不是 relay 下载不完整，也不是 Nginx 校验过严，而是 live publication
缺少消费者可见的提交点。

### 3.2 单文件 bind mount 放大了普通 rsync 的语义

Compose 把稳定宿主机文件
`./deploy/nginx.m4-preview.conf` 只读挂载到容器。`read-only` 只阻止容器
写宿主机文件，不会给宿主机写入提供快照。rsync 在目标路径上产生的中间状态
仍会立即暴露给容器。

### 3.3 失败清理无法判断配置是否从未变更

旧流程在 live source overwrite 前已经进入 touched/fail-closed 区间。
Nginx 校验失败时，脚本无法安全声称活动源码仍是上一修订，因此停止候选应用
服务是正确的保守行为。真正需要调整的是把可判定的候选校验提前，而不是绕过
失败清理。

## 4. 选择的最小修复

最终方案把运行时配置当作一个有显式提交点的发布对象：

```text
relay verified
  -> extract complete staging tree
  -> staged Compose config
  -> staged network-disabled nginx -t
  -> delayed rsync ordinary source, excluding Nginx file
  -> create same-directory incoming Nginx file
  -> verify staged/incoming SHA-256
  -> atomic rename over stable host path
  -> recreate proxy only when content changed
  -> live preflight, health, state receipt
```

这个方案保留 Compose 的稳定 bind-mount 路径和现有目录结构，只修复真实竞争
点。它没有把 M4 改成 source truth，也没有引入新的 release manager、守护进程、
重试器或生产机制。

被拒绝的方向：

- **简单重试**：第二次成功只说明第一次可能已经写完整，不能证明没有竞争；
- **先停 Nginx**：通过人为停机避开并发读取，增加不必要中断；
- **live rsync 后再校验**：校验开始前消费者已经可能读取坏文件；
- **仅依赖 `--delay-updates`**：缩短窗口但没有为 bind mount 定义独立提交点；
- **立即切换整个运行目录**：会同时改变 `.env`、Compose working directory、
  缓存、恢复和清理边界，超出本次证据支持的范围。

## 5. 实现中的错误、恢复和纠正

第一版修复把 Nginx incoming 文件创建在 live rsync 之前。由于 rsync 使用
`--delete-delay`，这个不属于 staging 源树的 incoming 文件被当作多余目标删除；
后续 `mv` 找不到文件。脚本随即按 fail-closed 停止了相应应用服务。

处理过程没有隐藏或绕过失败：

1. 停止继续部署，不把它解释为偶发网络问题；
2. 复核 primary、slot 和 relay ownership；
3. 使用仓库正式 `m4:preview:recover` 恢复服务；
4. 将 incoming 创建移到 generic rsync 成功之后；
5. 增加动态 fake-rsync 契约测试，约束失败和成功两条路径；
6. 重新完成本地、M4 fault injection、candidate、PR 和 accepted promotion。

根本教训是：临时文件不仅要“在同目录”，还必须考虑同一次同步命令的删除
语义。原子 rename 只保护最后一步，不能自动保护准备该 rename 的全过程。

## 6. 验证结果

### 6.1 聚焦自动化

- 本地完整 M4 development contract 文件：`53 passed`；
- M4 focused contract：`52 passed, 1 skipped`；跳过项是 bundle 按设计不含
  Git 元数据；
- 目标 Ruff、`bash -n scripts/m4-preview.sh`、`git diff --check`：通过；
- GitHub 必需检查：全部适用检查通过；
- 没有为“更完整”而无差别重复本地全量或 M4 full gate。

契约测试约束：

- staged validation 必须早于 touched/live commit；
- live rsync 必须排除 Nginx 文件；
- incoming 必须晚于 rsync 成功；
- 校验和必须早于 rename；
- proxy recreation 必须晚于原子提交；
- 故意让 fake rsync 失败时旧配置保持不变且无 incoming 残留；
- 成功路径发布完整 candidate 并清理 incoming。

### 6.2 真实 M4 故障注入

在候选 Nginx 配置中加入非法指令后：

- staging `nginx -t` 稳定失败；
- live host 和 container 配置 SHA-256 均保持
  `405e4ef2d27acb65bb7420b5dfff600d8ea86d8caa134462d22b335f7502dbc2`；
- proxy 容器 ID 和启动时间不变；
- `/=200`、`/health/live=200`；
- primary、slot 1-3 和 relay 锁最终均不存在。

这证明候选校验失败没有触碰旧配置或旧服务。

### 6.3 成功原子切换

使用有效、仅带标记的候选配置时：

- host 和 mounted-container SHA-256 同步变为
  `28387e1b7eb1168fc6c0ff4243b93c0d3a352d9e299577a513b02ed8688d1288`；
- proxy 仅在内容变化后显式重建；
- 两条 HTTP smoke 均为 `200`；
- 通过同一原子路径恢复正式仓库配置后，两侧 SHA-256 均恢复为
  `405e4ef2d27acb65bb7420b5dfff600d8ea86d8caa134462d22b335f7502dbc2`；
- incoming 文件数为 `0`。

### 6.4 最终接受证据

```text
acceptance_state=accepted
promotion_pr=459
source_revision=ac0405b048d488d0c229d144fd2703558699e2af
source_branch=master
source_dirty=false
source_dirty_paths=0
/=200
/health/live=200
```

这是 2026-08-02 的 M4 开发接受收据，不是持续监控、生产发布或人工验收。

## 7. 工作审视报告

### 原定目标

消除 M4 Preview 中 Nginx bind-mounted 配置的半写入窗口，在传输、解包或
候选校验失败时保留旧完整配置和服务，同时保持所有既有部署与接受边界。

### 完成情况

- [x] 真实 relay、tar、rsync、bind mount 和 cleanup 顺序已查明；
- [x] staging Compose/Nginx preflight 已进入 live commit 之前；
- [x] Nginx 文件采用同目录 checksum + atomic rename；
- [x] 自动契约测试覆盖顺序、失败保留和成功发布；
- [x] 真实 M4 故障注入证明旧配置和服务保留；
- [x] PR `#459` 已通过保护规则合并；
- [x] clean current `master` 已完成 M4 accepted promotion；
- [x] 生产、Cloudflare、DNS、数据库和业务功能未修改；
- [ ] 整个源码树的 generation-level 原子切换未实现，且不属于本次目标。

### 发现的问题

| 严重程度 | 具体问题 | 根本原因 | 改进 |
| --- | --- | --- | --- |
| 必须改正 | 第一版在 live rsync 前创建 `.incoming`，随后被 `--delete-delay` 删除，触发 fail-closed 和服务恢复 | 只考虑了 rename 的文件系统原子性，没有把 rsync 的删除语义纳入完整时序 | incoming 必须在 generic rsync 成功后创建；用动态失败测试约束真实命令顺序 |
| 应当改正 | 初始故障表现为“第二次部署成功”，容易被误判为可接受的偶发失败 | 把最终状态当作过程安全，缺少并发消费者视角 | 任何第二次成功的部署故障都先调查第一次是否暴露中间状态，禁止用重试作为修复 |
| 应当改正 | 旧 preflight 只验证 live 文件，无法在消费者读取前阻止坏候选 | 验证边界晚于 publication 边界 | 所有可离线验证的运行时输入必须在完整 staging 中验证 |
| 建议改进 | “传输失败保留服务”和“live commit 失败 fail closed”容易在报告中被合并 | 没有明确命名 commit point 和 touched boundary | 使用失败矩阵分别报告 pre-commit 与 post-commit 行为 |
| 建议改进 | 整树切换看似更彻底，但会扩大 `.env`、Compose、缓存和恢复责任 | 容易把一个单文件竞争条件升级为没有证据支持的系统重构 | 先修复真实消费者；只有多个文件需要同代可见时再提出 release-directory ADR |

### 做得好的地方

- 先从真实脚本和 bind mount 追踪读写路径，没有把 Nginx 或 relay 当作猜测根因；
- 保留共享 M4 ownership，执行前后均检查 primary、slot 和 relay 锁；
- 使用独立加锁 worktree，没有覆盖主 checkout 或其他 candidate；
- 没有绕过 Nginx 校验、部署锁、fail-closed 或 protected merge；
- 故障注入同时检查配置 digest、容器身份、HTTP 和锁，而不只看命令退出码；
- 精确区分 local、candidate、PR、merged、accepted 和 production 状态；
- 在发现第一版错误后使用正式 recovery，并把经验写进测试和文档。

### 下次重点关注

1. 在设计原子写入时画出所有写入、删除、rename 和 reader 的完整时序；
2. 先定义 publication commit point，再决定哪些失败可以保留服务；
3. 临时文件必须同时满足同文件系统、唯一命名、删除语义安全和失败清理；
4. fault injection 必须验证旧对象仍可读，而不只是新对象没有生效；
5. 对 shared M4 继续先查 owner/locks/candidate，失败不抢锁、不自动重试；
6. 文档 follow-up 进入 docs-only lane，不重复部署已经接受的运行时代码。

## 8. 可复用开发思路

### 8.1 从消费者看到的状态定义原子性

“发送完成”“解压完成”或“rsync 完成”都是生产者视角。真正的正确性问题是：
消费者在任意可观察时刻能读到什么。只要消费者能看到半个文件，前面的完整性
证明就没有覆盖最后一公里。

### 8.2 先把验证移到 commit point 之前

能在 staging 完成的解析、schema、Compose 或应用配置检查，都应在 live
mutation 之前完成。这样失败仍然具有明确含义：旧版本完整、旧服务未触碰。

### 8.3 原子提交和 fail-closed 不是对立面

原子提交解决“消费者不能看到中间字节”；fail-closed 解决“live source 已可能
混合时不能继续冒充旧的 accepted runtime”。前者减少不必要中断，后者保留
剩余失败的安全边界，两者必须同时存在。

### 8.4 故障注入应证明保留了什么

失败测试至少要回答：旧文件 digest 是否相同、旧容器是否同一个、健康路由是否
仍通、是否留下临时文件、是否释放所有锁。只断言部署命令失败不足以证明安全。

### 8.5 到达停止条件后停止扩张

本次单文件 bind mount 已有根因、实现、契约、M4 故障注入、protected merge
和 accepted promotion。继续改成整树目录切换会引入新的主要矛盾，应另开提案，
不能作为“顺便更彻底”的收尾。

## 9. 后续观察和升级条件

后续三次正常 M4 candidate 部署只需观察：

- staged Nginx preflight 在 live commit 前完成；
- host/container digest 一致；
- 校验失败时 proxy 身份和 HTTP 保持；
- 每次结束 primary、slot 和 relay 锁均不存在。

只有出现下列证据之一，才升级为新的架构工作：

- 另一个 runtime-bound 文件出现半写入；
- 多个文件必须作为同一 generation 同时可见；
- generic live rsync 的混合源码造成实际运行故障；
- M4 文件系统变化，无法保证同目录 rename；
- staging validation 的镜像或耗时成为可测量瓶颈。

升级时应单独评估 versioned release directory 和 atomic pointer switch，
并重新定义 `.env`、Compose、缓存、迁移、rollback 和清理责任。

## 10. 权威参考

- [M4 Preview Runtime-Bound Configuration Publication Standard v1](m4-preview-runtime-bound-config-publication-standard-v1.md)
- [M4 Preview AI Development Standard v1](m4-preview-ai-development-standard-v1.md)
- [M4 Preview Development Workflow](m4-preview-development-v1.md)
- [Development and Validation Operating Model v1](development-validation-operating-model-v1.md)
- [ADR-023: M4 Preview Candidate Acceptance Promotion](decisions/023-m4-preview-candidate-acceptance-promotion.md)
- [ADR-024: Risk-Tiered Development Validation Authority](decisions/024-risk-tiered-development-validation-authority.md)
- [ADR-026: Private Source Relay Transfer](decisions/026-private-source-relay-transfer.md)
- [PR #458](https://github.com/npcink/npcink-ai-cloud/pull/458)
- [PR #459](https://github.com/npcink/npcink-ai-cloud/pull/459)
