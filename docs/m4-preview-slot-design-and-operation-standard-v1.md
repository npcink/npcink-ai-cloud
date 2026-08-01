# M4 预览槽位设计与操作规范 v1

状态：active。

## 1. 目的与适用范围

本规范统一 M4 并行预览槽位的设计模型、任务分流、状态语义、资源边界、
所有权、验证证据和故障处理。它适用于多个 AI 会话在同一台 M4 上并行开发
Npcink AI Cloud 的场景。

本规范解决的是开发预览并发，不扩大产品边界。槽位 MUST NOT 成为：

- 第二套 Cloud 产品运行时或部署控制面；
- Git、合并、发布或生产事实来源；
- WordPress ability、workflow、approval、preflight、prompt、preset、router
  或最终写入事实来源；
- 绕过主 M4 候选接受与 promotion 流程的捷径；
- 无上限复制完整运行栈的资源池。

规范性设计决策见
[ADR-035](decisions/035-ephemeral-m4-frontend-preview-slots.md) 与
[ADR-038](decisions/038-tiered-m4-parallel-preview-capacity.md)。2026-08-01
的实测证据与开发复盘见
[M4 Parallel Preview Capacity Validation](m4-parallel-preview-capacity-validation-2026-08-01.md)。

## 2. 历史演进与问题归纳

### 2.1 单一主候选阶段

最初只有一个 M4 候选运行时和一个浏览器入口 `18010`。它适合 API、迁移、
worker、数据库和接受态验证，但任何候选同步都会替换上一项任务的预览。
多个 AI 会话同时开发时，视觉修改也必须排队。

### 2.2 前端槽位阶段

为降低纯前端任务的冲突，引入了三个临时前端槽：两个正常槽和一个显式溢出
槽。它们拥有独立 Next 进程和 `.next` 缓存，但共享主 M4 API、数据库和
worker，并通过只读代理阻止产品写操作。

这个设计解决了多个视觉任务互相覆盖的问题，但暴露了两个系统性缺陷：

1. `state=available` 只表示“没有租约”，却容易被理解为“当前可以启动”；
2. 任何主状态为 `candidate` 都被整体拒绝，即使候选只改了前端、后端实际未变。

因此“再增加几个槽号”不能解决问题。瓶颈不是编号数量，而是共享后端、状态
语义和资源模型。

### 2.3 分层容量阶段

2026-08-01 的实际测量显示 M4 Docker VM 为 4 CPU、约 8 GiB 内存，而不是
旧 ADR 假设的 16 GB。主栈首次采样约占 2.55 GiB，其中 Next 开发服务约
1.85 GiB。这排除了“每个 AI 会话一个完整栈”，但允许增加一个受限的独立
全栈槽。

最终采用两层槽位容量：

| 层级 | 数量 | API/数据 | 允许的任务 | 不负责 |
| --- | ---: | --- | --- | --- |
| 前端槽 | 2 个正常 + 1 个显式溢出 | 共享兼容的主 API，只读 | 样式、布局、组件和前端交互 | 后端、迁移、持久化、worker、接受态 |
| 隔离全栈槽 | 1 个 | 独立 API、PostgreSQL、Redis、镜像和数据卷 | API、迁移、写操作、持久化和代理候选 | worker、Cloudflare、promotion、接受态 |
| 主 M4 通道 | 1 个串行候选 | 主运行栈 | worker、完整集成、合并后 promotion | 并行覆盖其他所有者候选 |

## 3. 核心容量模型

槽位容量 MUST 由三个独立事实组成：

```text
可用容量 = 租约可用性 + 运行时兼容性 + 资源可承载性
```

- 租约可用性回答：槽位是否已有所有者？
- 运行时兼容性回答：当前源码能否安全使用目标后端和镜像？
- 资源可承载性回答：M4 是否允许启动这一层级的容器？

任何状态命令都不得再用单一 `available` 同时代表三项事实。

## 4. 状态契约

前端槽状态 MUST 至少输出：

| 字段 | 含义 |
| --- | --- |
| `state` | 兼容旧调用方的总体状态，不单独作为启动依据 |
| `lease_state` | `available`、`active` 或 `expired` |
| `startable` | 当前工作树是否可以领取并启动该槽 |
| `block_reason` | 稳定、机器可读的单一主要阻塞原因 |
| `backend_compatibility` | `accepted`、`candidate_compatible`、`incompatible` 或 `unknown` |
| `primary_acceptance_state` | 主预览记录的接受状态 |
| `primary_api_health` | 共享 API 当前健康状态 |

管理员和 AI 会话 MUST 以 `startable` 为启动判断，以 `block_reason` 选择下一步，
不能只看 `state=available`。

常见阻塞原因与处理如下：

| `block_reason` | 含义 | 正确动作 |
| --- | --- | --- |
| `slot_leased` | 槽位已有未过期所有者 | 使用其他槽或联系所有者 |
| `primary_operation_active` | 主 M4 正在部署或同步 | 等待主操作结束 |
| `primary_state_missing` | 主状态记录不存在 | 修复或重新部署主预览 |
| `primary_api_unhealthy` | 共享 API 不健康 | 先诊断主运行时 |
| `dependency_fingerprint_mismatch` | 镜像或依赖输入不同 | 使用正确 revision 执行 deploy |
| `config_fingerprint_mismatch` | Compose、代理或预览配置不同 | 执行受控 deploy |
| `accepted_backend_anchor_missing` | 旧状态没有兼容锚点 | 用新工具部署或 promotion 一次 |
| `primary_candidate_backend_changed` | 主候选修改了后端 | 使用隔离全栈槽或主通道 |
| `worktree_backend_changed` | 当前任务修改了后端 | 使用隔离全栈槽或主通道 |
| `accepted_base_revision_mismatch` | 任务基线与接受版本不同 | 更新干净基线并重新判断 |

缺少证据 MUST 返回 `unknown` 或不可启动，不得乐观推断兼容。

## 5. 任务选槽规则

### 5.1 先分类变更，不先抢槽

每个会话在操作 M4 前 MUST 检查变更范围：

1. 只有 `frontend/**` 的展示和前端交互变化：检查前端槽；
2. 修改 `app/**`、`migrations/**`、API、代理或持久化行为：检查隔离全栈槽；
3. 修改 worker、依赖、Dockerfile、锁文件，或需要接受态：使用主通道；
4. 纯文档或本地静态检查：默认不占用任何 M4 槽。

任务分类必须以实际 changed files 和验证目标为依据，不能只根据任务名称或
“看起来像 UI”判断。

### 5.2 最小有效通道

选择顺序 SHOULD 为：

```text
本地源代码门禁
  -> 前端槽（纯前端且 startable=true）
  -> 隔离全栈槽（需要独立 API/数据）
  -> 主 M4 通道（worker、接受态或无法隔离的完整集成）
```

不得为了“验证更完整”而无条件选择更重的通道。

## 6. 前端槽的后端兼容规则

主部署状态记录以下兼容证据：

- 当前 `backend_input_sha256`；
- 最近接受的 `accepted_backend_input_sha256`；
- 最近接受的 `accepted_source_revision`；
- 当前 source、dependency 和 config fingerprints。

后端输入指纹覆盖 `app/**`、`migrations/**` 与 `alembic.ini`。

主状态为 `accepted` 时，前端槽只有在源码基线、后端指纹、依赖指纹、配置
指纹、API 健康和 operation lock 全部一致时才可启动。

主状态为 `candidate` 时，只有满足下列全部条件才是
`candidate_compatible`：

1. 主候选后端指纹等于最近接受的后端锚点；
2. 当前前端任务的后端指纹也等于该锚点；
3. 当前任务基线等于最近接受的 source revision；
4. dependency/config fingerprints 一致；
5. API 健康且没有主操作锁。

这允许“主候选只改前端”的并发预览，同时继续拒绝 UI/API 契约漂移。

`--allow-candidate-primary` 只用于验证槽位基础设施本身，MUST NOT 成为普通
开发的跳过参数。

## 7. 隔离全栈槽规范

隔离槽固定为一个，不得通过复制项目编号扩容。固定资源如下：

| 项目 | 值 |
| --- | --- |
| Compose project | `npcink-ai-cloud-m4-fullstack-1` |
| M4 HTTP | `127.0.0.1:8031` |
| 本地浏览器隧道 | `127.0.0.1:18031` |
| PostgreSQL | `127.0.0.1:15434` |
| Redis | `127.0.0.1:16381` |
| Runtime image | `npcink-ai-cloud-runtime:m4-fullstack-1` |
| Frontend image | `npcink-ai-cloud-frontend:m4-fullstack-1` |

服务和内存上限：

| 服务 | 上限 |
| --- | ---: |
| proxy | 64 MiB |
| frontend | 1536 MiB |
| API | 768 MiB |
| PostgreSQL | 384 MiB |
| Redis | 128 MiB |
| 合计 | 2880 MiB |

全部服务 MUST 使用 `restart: "no"`。隔离槽 MUST NOT 启动 runtime worker、
callback worker 或 ops worker。它不得获得 Cloudflare 域名，也不得修改主候选
的源码目录、镜像标签、数据库、数据卷或接受状态。

主通道与隔离槽的 build/start 操作 MUST 通过 peer operation lock 互斥，避免
冷构建和启动峰值同时争用 M4。

## 8. 租约、锁与释放

所有槽位必须有显式 owner。owner 应使用稳定的任务标识，例如
`codex:<task-name>`，不能使用“我”“临时”等不可追踪值。

- TTL 范围为 1–24 小时，默认 8 小时；
- 未过期租约不能被其他 owner 同步、释放或覆盖；
- 过期只表示可以由下一位 owner 显式回收，不触发 watcher、cron 或 daemon；
- claim、sync 和 release 必须有原子 operation/lease lock；
- release 必须在锁内再次验证 owner；
- 活跃 deployment operation 存在时必须拒绝 release；
- 清理只能针对精确 Compose project label；
- 禁止使用 `docker system prune`、`docker volume prune` 或宽泛目录删除。

源码中继的短生命周期 `run_id` 不是任务 owner。时间戳加本地 PID 在多个
authoring 会话之间可能相同，排障时 MUST 同时核对锁的开始时间、远端活动
进程、目标 source/project、分支或 revision，以及槽位的稳定 owner。不得仅凭
一个相同的 `run_id` 判定“脚本自锁”，也不得据此删除仍有传输服务的中继锁。

槽位不是源码存储。authoring Mac 的 worktree 和 Git 始终是源码事实，M4 只
接收一次 coherent checkpoint 的私有中继包。

## 9. 标准操作命令

### 9.1 前端槽

```bash
pnpm run m4:frontend:status
pnpm run m4:frontend:up -- --slot 1 --owner codex:<task>
pnpm run m4:frontend:sync -- --slot 1 --owner codex:<task>
pnpm run m4:frontend:tunnel -- --slot 1 --auto
pnpm run m4:frontend:logs -- --slot 1
pnpm run m4:frontend:release -- --slot 1 --owner codex:<task>
```

槽 3 必须增加 `--allow-third`，表示操作者确认额外 Next 进程带来的内存压力。

### 9.2 隔离全栈槽

```bash
pnpm run m4:fullstack:status
pnpm run m4:fullstack:up -- --owner codex:<task>
pnpm run m4:fullstack:sync -- --owner codex:<task>
pnpm run m4:fullstack:tunnel -- --auto
pnpm run m4:fullstack:logs -- api
pnpm run m4:fullstack:release -- --owner codex:<task>
```

首次使用或 build/runtime inputs 变化时使用 `up`；同一租约内普通源码 checkpoint
使用 `sync`。如果 `sync` 报 dependency/config fingerprint 变化，必须回到受控
build 路径，不能跳过检查。

### 9.3 主通道

```bash
pnpm run m4:preview:status
pnpm run m4:preview:sync
pnpm run m4:preview:deploy
pnpm run m4:preview:promote -- --pr <merged-pr-number>
```

不得在未确认 owner、source revision、branch 和 dirty paths 的情况下替换主候选。

## 10. 验证与证据等级

槽位验证至少记录：

- owner、TTL、slot/project；
- source revision、source branch、source dirty；
- source base revision 与相关 fingerprints；
- 容器服务、health、restart policy 和端口绑定；
- HTTP 根路径与 live health；
- 迁移 head（使用隔离全栈槽时）；
- 资源限制和实际内存；
- worker 数量；
- release 后容器和数据卷数量。

证据等级必须分开报告：

| 等级 | 能证明 | 不能证明 |
| --- | --- | --- |
| 本地门禁 | 源码、静态或合同检查 | M4 行为 |
| 前端槽候选 | 指定前端 against 指定兼容 API 的浏览器行为 | 后端、merge、接受态 |
| 隔离全栈候选 | 指定源码的独立 API/迁移/持久化行为 | worker、主 promotion、生产 |
| PR/CI | 评审与 required checks | M4 accepted、生产 |
| 主 M4 accepted | merged master 的受控运行时证据 | 生产、人类验收 |
| 生产验证 | 指定生产 revision 的行为 | 未执行的人类业务验收 |

HTTP 200、候选槽健康或代码已 push 都不能单独称为“已发布”或“已接受”。

## 11. 失败关闭与恢复

遇到以下情况必须停止占用或变更共享状态：

- owner、锁或主候选来源不清楚；
- 状态记录缺失关键 fingerprint；
- 主候选 dirty paths 持续变化；
- 端口、镜像或 Compose project 与规范不符；
- Docker 内存压力持续接近约 70%；
- release 不能证明只删除精确项目资源；
- M4 不可用且有人建议静默改用 M5 Docker。

恢复顺序 SHOULD 为：

1. 只读运行 `status`；
2. 检查 owner、TTL、operation lock 和 source evidence；
3. 检查精确项目的容器、镜像、网络和数据卷；
4. 由记录 owner 执行 repository-controlled release；
5. 再次证明目标资源为 0 或状态可用；
6. 从 authoring worktree 重新 claim/deploy。

当私有源码中继返回退出码 `75` 时，按以下顺序处理：

1. 读取中继 `operation.lock/owner.txt`，但不把 `run_id` 当成唯一身份；
2. 只读检查中继 HTTP 服务和 M4 侧同步进程是否仍活动；
3. 用目标目录、Compose project、source revision/branch 和命令参数确认真实任务；
4. 活跃传输存在时等待所有者自然完成；
5. 仅在传输服务和对应 M4 操作均不存在时，才按现有恢复 runbook 判断锁是否
   stale；
6. 锁显示可用后，从原 authoring worktree 重试同一受控命令。

直传模式不是锁冲突的自动降级路径。只有操作者为一次有界恢复明确选择时才可
使用，且必须在证据中标记传输模式。

任何恢复都不得以覆盖其他 owner 候选或清理全局 Docker 状态为代价。

## 12. 开发经验与方法论

### 12.1 从操作员问题反推系统模型

“为什么显示有空闲却不能用”不是文案问题，而是状态模型遗漏。管理员页面和 CLI
都应直接表达可行动事实，而不是要求操作者从内部实现推理。

### 12.2 先找共享可变面，再谈槽位数量

并发隔离的关键不是容器名字，而是 API、数据库、Redis、镜像标签、源码目录、
端口、状态文件和 operation lock。只要其中一个可变面仍共享，增加槽号就可能
产生覆盖或污染。

### 12.3 用最小兼容指纹代替粗粒度状态

`candidate`、`dirty` 等标签是风险信号，不足以表达具体 seam 是否兼容。应该
对真正共享的 seam 建立稳定指纹，并保留已接受锚点；同时对缺失证据失败关闭。

### 12.4 容量设计必须基于实测

宿主机配置、旧文档和 Docker VM 可用资源可能不同。必须测量 Docker memory、
当前容器占用、构建峰值和 Next 实际内存，再决定是否增加完整栈。

### 12.5 测试真实操作路径

脚本直调通过不等于 `pnpm run ... --` 通过；本次实际验证捕获了参数分隔符、
SSH 空参数、Docker stats 过滤能力和命令清单遗漏。CLI 包装层也是公共接口，
必须进入契约测试。

### 12.6 清理是状态机的一部分

release 不是附加脚本，而是 owner、锁、运行状态和精确资源标签共同约束的状态
迁移。必须验证释放后的容器与数据卷数量，而不能只相信命令退出码。

### 12.7 文档必须区分规则、决策和证据

- 本文档：当前必须如何设计和操作；
- ADR：为什么选择该方案、拒绝了什么；
- validation record：某次 revision 和环境实际验证了什么；
- Git/CI/M4/production receipt：各自独立的交付证据。

后续修改槽位数量、资源上限、共享 seam 或接受态边界时，必须先更新 ADR，
再修改本规范和实现；一次运行数据变化只更新 validation record，不能静默改变
规范。

### 12.8 从真实候选使用验证操作模型

槽位基础设施的合同测试只能证明脚本结构。至少一次后续产品任务应使用真实
authoring worktree、真实源码中继、真实槽位同步和真实认证浏览器完成闭环，
以验证：

- owner 和 TTL 可以阻止其他任务覆盖候选；
- 中继锁竞争能够失败关闭并在所有者结束后恢复；
- 独立 source、API、PostgreSQL、Redis、镜像和端口不会改写主候选；
- 页面可见结果能够关联到槽位的 source revision；
- 候选报告没有被误写成主 M4 accepted 或生产证据。

## 13. 变更验收清单

任何槽位实现变更在提交前 MUST 确认：

- [ ] 保留主通道、前端槽和隔离槽的职责边界；
- [ ] 没有新增未分类的 package command；
- [ ] 状态同时表达 lease、startability 和 block reason；
- [ ] compatibility 缺失或不一致时失败关闭；
- [ ] owner、TTL、claim、sync、release 和竞态有契约覆盖；
- [ ] 独立槽使用独立 image/data/source/state/port；
- [ ] 内存上限、restart policy 和 worker 数量有 M4 证据；
- [ ] 真实 `pnpm run ... --` 调用经过验证；
- [ ] 主候选在前后保持相同 source evidence，或变更有明确授权；
- [ ] release 后精确项目容器和数据卷为 0；
- [ ] 报告明确区分本地、候选、CI、accepted、production 和 human acceptance；
- [ ] 未把 M5 Docker 当成 M4 的静默替代。
