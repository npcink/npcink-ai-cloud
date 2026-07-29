# 豆包搜索与外部服务凭据入口收口及开发复盘 — 2026-07-29

状态：开发阶段已收口，代码已合并到 `master`，合并后的开发预览已在 M4
接受。生产未变更，真实豆包账号连接和搜索质量仍属于运营/外部验收。

范围：记录从“Cloud 外部服务能否增加豆包搜索”到“为所有需要凭据的外部
服务补充官方获取或管理入口”的调查、实现、验证、合并和 M4 验收过程。

本文是时间有界的开发历史和方法记录，不替代
[Cloud Web Search Runtime Contract v1](cloud-web-search-runtime-contract-v1.md)、
[Cloud Admin UI Standard v1](cloud-admin-ui-standard-v1.md) 或
[M4 Preview AI Development Standard v1](m4-preview-ai-development-standard-v1.md)。
本文不批准生产发布，不创建新的 Provider 注册表，不改变凭据所有权，也不
赋予 Cloud WordPress 写入权。

## 1. 原始问题与拆分方式

最初的问题包含两个不同层次：

1. Cloud 托管网页搜索是否可以增加豆包搜索；
2. 外部服务配置界面是否应该提供相应凭据的获取入口。

这两个问题不能混成一次纯界面修改：

- 豆包搜索接入涉及 Provider 连接、请求协议、响应归一化、错误处理和搜索
  运行时合同；
- 凭据入口只涉及 Admin 操作路径和静态导航元数据，不应改变 Provider
  执行、凭据存储或 API。

因此工作分成两个独立 PR。前者建立能力，后者缩短配置路径。

## 2. 最终交付

| 阶段 | Git 证据 | 主要结果 | 最高开发证据 |
| --- | --- | --- | --- |
| 豆包搜索接入 | PR `#340`, merge `da56b253` | 增加 `doubao_search` 内置 Provider、Bearer API Key、Custom 搜索请求和 `Result.WebResults` 归一化 | 合并进 `master`；随后包含在 PR `#342` 的 accepted M4 revision 中 |
| 凭据入口 | PR `#342`, merge `075be9d3` | 为 8 个需要凭据的搜索/图片服务增加官方获取或管理链接；Jina Reader 保持无凭据 | GitHub 必需检查通过，合并后 M4 accepted |

最终 M4 状态：

```text
acceptance_state=accepted
promotion_pr=342
source_revision=075be9d3888c48448ed2176d9b6ce2808272872a
source_branch=master
source_dirty=false
source_dirty_paths=0
```

浏览器复验确认豆包配置工作台显示：

```text
获取 API Key ↗
https://console.volcengine.com/search-infinity/api-key
target=_blank
rel=noreferrer noopener
```

这证明合并后的 `master` 已成为可见开发预览，不证明生产发布、真实豆包
账号可用、上游计费正确或搜索结果质量满足真实用户。

## 3. 豆包搜索接入边界

PR `#340` 选择 Doubao Search Custom 网页搜索接口，保持既有
`web_search.v1` 和 `suggestion_only` 合同。

实现边界是：

- Provider ID 固定为 `doubao_search`；
- Cloud 操作者在 Provider connection 中保存 API Key；
- 运行时使用 Bearer 认证；
- 请求固定使用网页搜索，并要求来源 URL；
- 将上游 `Result.WebResults` 归一化到既有搜索证据合同；
- 缺少凭据、HTTP 错误、畸形响应和上游
  `ResponseMetadata.Error` 均 fail closed；
- 运行时请求不携带客户 Provider Key；
- 返回结果不产生 WordPress 直接写入。

明确没有做：

- Doubao Search Global 版；
- 模型内置搜索工具；
- 新公共 Ability；
- 新 Provider 或 Workflow 注册表；
- 数据库迁移；
- 生产部署。

### 3.1 PR `#340` 验证证据

```text
contract + domain: 1478 passed, 3 skipped
focused Provider/API: 57 passed
health contract: 9 passed
Ruff: passed
mypy app: passed
check:anti-drift: passed
frontend contracts: passed
check:admin-ui: passed
check:admin-ui:visual: 22 passed
M4 focused Doubao tests: 3 passed
```

当时没有可用的真实豆包凭据，因此没有把“真实账号、计费和结果质量”写成
已完成。这个限制必须继续保留，直到运营者使用真实账号完成 connection
test 和受控搜索验证。

## 4. 凭据入口的产品与界面决策

### 4.1 为什么放在配置工作台内

外部服务列表的首要任务是比较服务角色、状态、凭据就绪度和运行开关。
如果把 8 个外部文档链接都放入主表，会扩大操作列、增加视觉噪音，并让
低频准备动作与“配置”和“测试连接”竞争。

最终选择：

- 主表保持密集，只保留配置和测试；
- 官方凭据入口放在配置工作台的凭据状态旁；
- 未配置时显示“获取 `<credential>`”；
- 已配置时显示“管理 `<credential>`”；
- 外部链接在新窗口打开；
- 存量密钥继续只显示“已配置/未配置”，绝不回显；
- Jina Reader 标记为 `secretless`，不伪造凭据入口。

这一选择符合 `/admin/external-services` 的 configuration page model，也
保持 `AdminCredentialField` 和现有清除凭据确认流程不变。

### 4.2 固定服务映射

以下入口是 PR `#342` 合并时的代码真相：

| 服务 | 凭据名称 | 获取或管理入口 |
| --- | --- | --- |
| Tavily | API Key | <https://app.tavily.com/home> |
| Bocha | API Key | <https://open.bochaai.com/dashboard> |
| Doubao Search | API Key | <https://console.volcengine.com/search-infinity/api-key> |
| Apify | API Token | <https://console.apify.com/settings/integrations> |
| Zhihu Search | Access Secret | <https://developer.zhihu.com/docs> |
| Unsplash | Access Key | <https://unsplash.com/oauth/applications> |
| Pixabay | API Key | <https://pixabay.com/api/docs/> |
| Pexels | API Key | <https://www.pexels.com/api/key/> |
| Jina Reader | 无需凭据 | 不显示入口 |

Provider 可能调整控制台 URL。测试应保证“Provider ID—凭据名称—URL”
映射不会被无意改写，但不能保证第三方页面永久不迁移。发现失效链接时，应
从官方文档重新确认并通过聚焦 PR 更新。

## 5. PR `#342` 的验证闭环

### 5.1 本地与浏览器

```text
check:admin-ui: passed
full frontend contracts: passed
focused external-services Playwright: 3 passed
check:admin-ui:visual: 22 passed
git diff --check: passed
```

视觉基线覆盖外部服务配置工作台。E2E/contract 覆盖：

- 未配置服务显示“获取”链接；
- 已配置服务显示“管理”链接；
- URL、`target` 和 `rel` 属性正确；
- Jina Reader 不显示凭据链接；
- 每个 Provider ID 保持固定的凭据名称和官方入口。

### 5.2 GitHub

第一次 CodeQL 运行报告 6 个 high 告警，全部来自测试中用动态正则拼接
URL 的写法。运行时代码没有对应告警。

测试原本已经转义 URL，但静态分析无法可靠证明动态构造安全。最终改为
逐行精确字符串包含检查：

- 保持映射断言强度；
- 不再把 URL 解释为正则；
- JavaScript/TypeScript CodeQL 通过；
- PR 级 CodeQL 结论通过；
- frontend、backend-targeted、secret scan、dependency audit、PR body
  contract 和 CI observability 全部通过。

经验是：测试代码同样进入安全分析。对于固定 URL、Provider ID 和配置
常量，优先使用精确字符串比较或结构化解析，不需要为了“一条断言”引入
动态正则。

### 5.3 M4

在候选阶段先验证当前工作树，再在提交、变基或修正后重新同步对应 revision。
合并后从干净、最新的 `master` 执行：

```bash
pnpm run m4:preview:promote -- --pr 342
pnpm run m4:preview:status
```

最终只使用 source promotion，没有因为普通前端源码改动重建镜像。

## 6. 工作审视报告

### 原定目标

1. 增加可治理、fail-closed 的豆包搜索 Provider；
2. 让操作者能从正确位置获取所有外部服务凭据；
3. 保持凭据不回显、Cloud/WordPress 边界不变；
4. 完成源代码、浏览器、CI、合并和 M4 accepted 闭环；
5. 不修改生产，不覆盖原工作区已有改动。

### 完成情况

- [x] `doubao_search` 已合并并进入 Cloud-managed Web Search Provider 集合；
- [x] 8 个凭据型服务均有入口，Jina Reader 保持 secretless；
- [x] Admin contract、E2E、视觉、CodeQL 和必需 CI 通过；
- [x] PR `#340` 和 `#342` 均已合并；
- [x] `master=075be9d3` 已在 M4 accepted；
- [x] 原始脏工作树未被 reset、stash、覆盖或混合暂存；
- [ ] 真实豆包账号 connection test、受控搜索质量和上游计费未验证；
  原因是开发阶段没有被授权使用的真实凭据；
- [ ] 生产未部署；这不属于本阶段授权范围。

### 发现的问题

| 严重程度 | 具体问题 | 根本原因 | 已采取或后续改进 |
| --- | --- | --- | --- |
| 必须改正 | 第一轮 M4 浏览器检查仍显示旧对话框，随后 `m4:preview:status` 显示候选已被另一个分支覆盖 | 把“曾经同步成功”误当成“当前共享 M4 仍运行本候选”，没有在消费侧检查前立即核对来源 | 浏览器验收前后都核对 `source_branch`、`source_revision` 和 dirty state；共享 M4 被覆盖时重新同步，而不是把旧页面误判为代码失败 |
| 必须改正 | PR 发布前和全部 CI 通过后，`origin/master` 两次前进，发布器或自动合并分别阻止落后分支 | 在高并发仓库中，最终基线检查与 8–9 分钟统一门禁之间存在真实竞争窗口 | 发布前最后一次 fetch/rebase；依赖保护分支 fail closed；必要时重新变基并接受新一轮 CI，绝不绕过 latest-base 要求 |
| 应当改正 | 候选同步后浏览器仍保留旧客户端，第一次观察没有新链接 | 浏览器标签页在同步前已加载，前端热更新或缓存状态不能作为 revision 证据 | 同步后先刷新目标标签，再打开对话框并读取链接属性；把刷新和 revision 核对作为固定浏览器步骤 |
| 应当改正 | 初次测试命令从错误 cwd 运行；默认 Playwright 端口 `3301` 已被其他进程占用 | 命令没有显式绑定模块工作目录，也假设本机端口空闲 | 每个命令显式指定 workdir；使用任务专属可配置端口 `3311`，不终止未知进程 |
| 应当改正 | 提交、变基和 CodeQL 修正都会改变 source revision，早先 M4 证据随之过期 | 候选内容相同不等于 revision 相同；验收必须绑定可追踪源码 | 每次源码 SHA 改变后重新运行 `m4:preview:sync`；最终以 merged PR、当前 `origin/master` 和 promotion revision 建立接受链 |
| 应当改正 | 测试使用已转义的动态正则仍触发 6 个 CodeQL high 告警 | 测试实现复杂度超过固定映射断言的实际需要，静态分析无法证明运行时转义 | 固定 URL 使用精确字符串/结构断言；在发布前主动考虑 CodeQL 如何解释测试数据流 |
| 建议改进 | 创建 promotion worktree 后，一组后续命令仍在原始工作目录执行；`git pull --ff-only` 因分支发散安全退出 | 创建 worktree 与切换命令执行上下文被误认为同一动作 | 每次创建 worktree 后单独运行 `pwd`/`git status`，并为后续工具调用显式设置新 workdir；继续保留 `ff-only` 作为防误操作护栏 |

### 做得好的地方

- 原始工作区有用户未提交内容时，另建干净工作树完成两个阶段，没有整理或
  暂存不属于本任务的文件；
- 先区分 Provider runtime 接入与 Admin 导航优化，避免一个界面需求扩大成
  第二套凭据或控制面；
- 官方凭据链接进入服务元数据，不把 URL、凭据名称和条件渲染散落在多个
  JSX 分支；
- Jina Reader 的无凭据事实被显式保留，没有为了视觉一致性伪造操作；
- CodeQL 告警没有被当作误报跳过，而是降低测试实现复杂度后重新跑全套门禁；
- 共享 M4 被其他候选覆盖时，使用状态证据定位，没有修改或清理其他任务；
- 发布器和保护分支阻止落后基线时，没有强制合并或跳过检查；
- 最终报告明确区分 local verified、candidate、PR/CI、merged、accepted
  和 production not changed。

### 下次重点关注

1. 在共享 M4 上，任何浏览器/API 结论都同时记录当前
   `source_branch`、`source_revision` 和 `acceptance_state`；
2. 固定配置映射优先使用结构化或精确字符串测试，减少动态正则和安全扫描
   歧义；
3. PR 发布前执行最终 fetch/rebase，并预留长门禁期间 `master` 再次前进的
   可能；
4. 每次提交、amend 或 rebase 后，将早先候选证据视为过期并重新 dispatch；
5. 新建 worktree 后立即在新目录独立核对 `pwd`、branch、dirty state 和
   `origin/master`；
6. 真实 Provider 凭据只在获授权的运营验证中使用，不写入命令、文档、
   日志、截图或测试 fixture。

## 7. 可复用开发方法

### 7.1 调查

1. 从真实操作者页面和运行合同分别确认问题；
2. 判断请求是能力缺口、配置缺口还是导航摩擦；
3. 从官方文档确认上游协议和凭据入口；
4. 读取当前 Provider connection、凭据生命周期和 Admin 页面模型；
5. 写清能力、UI、生产和真实凭据验证的边界。

### 7.2 实现

1. 在最新 `origin/master` 的干净 `codex/*` 工作树中修改；
2. Provider 接入复用既有 registry、connection secret 和 evidence contract；
3. UI 辅助信息作为静态服务元数据，不增加 API 或凭据存储字段；
4. 正常状态保持安静，低频链接留在配置工作台；
5. 精确覆盖 Provider ID、凭据名称、URL、安全属性和 secretless 例外。

### 7.3 验证

```text
focused contract/type/lint
  -> full frontend contracts when shared Admin behavior is touched
  -> focused Playwright + PC visual
  -> M4 candidate sync
  -> verify status revision
  -> refresh and inspect actual browser consumer
  -> exact-path staging and commit
  -> final fetch/rebase
  -> protected PR publisher and required CI
  -> merge into master
  -> clean master promotion
  -> accepted status + relevant browser smoke
```

Provider runtime 接入还应增加：

```text
request/response fixture
  -> malformed and upstream-error fail-closed cases
  -> Provider registry projection
  -> focused M4 Linux/container test
```

### 7.4 收口

- 最高开发状态绑定 merged PR 和 accepted `origin/master` revision；
- 候选工作树 SHA 只是中间证据，不替代 merge commit；
- docs-only 复盘不重新同步 M4；
- 生产、真实账号、质量、计费和人类验收单独报告；
- 第三方链接失效时用官方来源重新确认，不凭记忆替换。

## 8. 当前遗留与重开条件

以下事项仍未关闭：

1. 真实豆包账号是否已开通对应 Search Custom 权限；
2. 实际 connection test、成功搜索和来源 URL 质量；
3. 上游配额、计费、限流和错误语义；
4. 生产配置与生产验证；
5. 外部控制台 URL 后续是否迁移。

重开 Provider 运行验收时，使用最小受控查询和授权凭据，记录标量状态、
Provider ID、错误代码、结果数和来源域名即可。不得把 API Key、完整请求、
完整响应或用户内容写入文档和日志。

## 9. 回滚

本复盘是 docs-only 记录。回滚方式是回退本次文档提交。

运行时回滚边界分别属于原实现 PR：

- PR `#340`：回退豆包 Provider 实现；无数据库迁移；
- PR `#342`：回退凭据链接元数据、测试和视觉基线；
- 不通过修改 M4 文件、删除 Provider 数据或改变生产配置进行文档回滚。

## 10. 相关记录

- [Development and Validation Operating Model v1](development-validation-operating-model-v1.md)
- [Cloud Web Search Runtime Contract v1](cloud-web-search-runtime-contract-v1.md)
- [Cloud Admin UI Standard v1](cloud-admin-ui-standard-v1.md)
- [Cloud Admin UI Development Retrospective](cloud-admin-ui-development-retrospective-2026-07-27.md)
- [M4 Preview AI Development Standard v1](m4-preview-ai-development-standard-v1.md)
- [ADR-023: M4 Candidate, Acceptance, and Promotion](decisions/023-m4-preview-candidate-acceptance-promotion.md)
- [Provider Connection Production Runbook](provider-connection-production-runbook-2026-06-30.md)
