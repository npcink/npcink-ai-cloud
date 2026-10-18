# DeepSeek 标题生产人工验收与正式 smoke 交接 — 2026-10-19

Status: time-bounded production evidence; title generation and operator adoption/save/reload passed; one formal smoke attempt failed at the public/internal health boundary before runtime; no automatic rerun.

日期与时区：2026-10-19，北京时间。适用环境：Cloud生产、WordPress测试站点 `https://test.getimg.net/`。本记录不替代[生产发布策略](../../../cloud-production-release-policy-v1.md)或未来版本验收。

## 1. 本次证据范围

操作员明确报告：SiliconFlow预算已补齐；邮件发送、标题生成、人工采用、保存草稿、刷新回读均通过，标题保留且草稿状态正确。

第一阶段只读定位本站部署后唯一匹配的成功标题运行，并核对Provider、响应模型标识、token、计量与积分账本。生产数据库事务强制READ ONLY。该阶段没有调用模型、发送邮件、登录WordPress、读取文章正文、修改配置、部署或生成新验收流量；随后获授权的一次正式smoke结果另见第8节。邮件和WordPress保存/回读以操作员确认记录，未冒充开发侧独立浏览器复验。

Cloud仅拥有建议生成、执行与用量证据；采用、保存和发布仍由WordPress端人工决定。参见[内容生成边界](../../../cloud-content-generation-boundary-v1.md)。

## 2. 已部署身份与成功运行

| 项目 | 核实结果 |
| --- | --- |
| 生产完整SHA | `b8cc6049da7d1c33cbfffc9f8e5521f332a1adb5` |
| 生产PR / 部署 | [#1142](https://github.com/npcink/npcink-ai-cloud/pull/1142) / [39122857578](https://github.com/npcink/npcink-ai-cloud/actions/runs/39122857578)，2026-10-18 19:24:58 CST完成 |
| run / trace | `run_394719da22e846dc9baa6f30433f9a63` / `98133668ae2f059239fd2d56695bdf53` |
| 起止时间 | 2026-10-19 00:24:06.690168–00:24:08.359067 CST，服务端运行约1.67秒；不是浏览器端耗时测量 |
| 能力 / profile / task | `npcink-cloud/connector-runtime` / `wp-ai.short-text` / `title_generation` |
| 状态 | `succeeded`，无error_code，有非空标题输出，`suggestion_only=true` |
| Provider / 请求模型 | `deepseek` / `deepseek/deepseek-v4-flash` |
| 上游响应模型标识 | `reported_model_id=deepseek-flash`；同时保留请求模型名，不将响应别名改写成另一个模型的证据 |
| 回退 / 重试 | `fallback_used=false`；两条Provider记录的retry_count均0；没有gpt-5.4调用 |
| connector_version | 运行记录为 `0.4.1`；官方WordPress插件版本未由本轮独立核对 |

这次成功发生在旧48-token修复上线后，并由DeepSeek主连接完成，能够证明本次标题场景真实恢复；不是由gpt-5.4回退掩盖主连接失败。不能据此证明其他任务、模型或回退渠道均已通过。

## 3. Token、辅助调用与成本记录

| Provider调用 | 用途 | 输入 | 输出 | 推理 | 本次账内成本记录 |
| --- | --- | ---: | ---: | ---: | --- |
| 332：SiliconFlow / `BAAI/bge-m3` | Site Knowledge向量辅助调用，非标题模型回退 | 316 | 0 | 未单列 | USD0 |
| 333：DeepSeek / `deepseek/deepseek-v4-flash` | 标题生成 | 901 | 14 | **0** | USD0.000130，CNY0.000884 |

DeepSeek响应usage：total_tokens=915，cached_tokens=0。两个调用合计记录1231 token，不能全部标成标题模型token。费用估算模式为 `provider_model_rates`，CNY金额使用已配置汇率；这是Cloud计量记录，不是供应商账单核验。辅助调用成本字段0不等于本轮核实了供应商免费政策。

当前源码的未显式指定标题额度为256；成功响应确认可见输出与推理token0。持久化结果未保留该次完整出站请求报文，因此不把默认源码值冒充本轮抓包观察值。原理与测试见[DeepSeek标题兼容说明](../../../deepseek-title-output-compatibility-v1.md)。

## 4. 积分记录

账本费率版本 `ai-credit-ledger-v2`，本run共三条consume，合计 **-3 AI积分**：

| 计费项 | 数量与规则 | 积分 |
| --- | --- | ---: |
| runs基础项 | 1次运行 | -1 |
| SiliconFlow tokens_total | 316 token，按1000 token向上取整 | -1 |
| DeepSeek tokens_total | 915 token，按1000 token向上取整 | -1 |

三条流水对应三个独立计量项，没有发现本run同一项重复入账；不是重试扣了三次。即使辅助调用的成本字段为0，当前token积分规则仍形成1积分用量。

本期Free总额300，周期2026-10-17 13:47:34–2026-11-16 13:47:34 CST。按当前周期账本和现有计算函数，只读重建：本次前累计净消耗5、本次后8，套餐可用积分 **295 → 292**；核对时仍为292，付费积分grant数量0。这是账本推算，不是操作员屏幕前后截图。

## 5. 人工验收结果及剩余项

| 项目 | 证据来源与状态 |
| --- | --- |
| 邮件发送 | 操作员确认通过；本轮未发送新邮件，不补记完整登录认证smoke已通过 |
| 真实标题 | 操作员报告通过，且Cloud成功运行、DeepSeek主连接和usage可交叉核实 |
| 人工采用、保存、刷新回读 | 操作员确认通过：标题保留、草稿状态正确；Cloud没有代替WordPress写入 |
| SiliconFlow预算 | 只读确认已配置日USD5、月USD100；DeepSeek/OpenAI也是日5、月100，均未达上限 |
| 完整正式smoke | **已执行一次，失败并停止**：操作员已保存新验证码；[39154517793](https://github.com/npcink/npcink-ai-cloud/actions/runs/39154517793)在公网ready检查403处退出，未进入runtime或验证码登录；完整验收尚未通过，见第8节 |
| gpt-5.4渠道/回退 | 本run未使用，恢复情况仍未验收；不能把主连接成功作为回退成功 |
| 长期稳定性 / 其他能力 | 未由单个成功样本证明，留待自然使用观察 |

先前degraded来自10月18日14:20旧失败的24小时评分窗口。新标题成功可证明主路径，但不要求立即清零历史健康标签，不通过付费调用制造“全绿”。

## 6. 完整正式 smoke 的具体操作顺序

**当前阻塞：第8节的一次正式执行已经失败。以下保留原操作清单作交接参考，修复并验证验收入口、重新取得有界执行授权前，不照单再次触发。** 实现以冻结生产版本的 `.github/workflows/release-smoke.yml`、`deploy/release-smoke.sh` 和 `deploy/remote-smoke.sh` 为准。

### 6.1 先确认环境、站点和预算

1. 确认生产仍是上述完整SHA，且成功Deploy Production任务39122857578可查；production若变化，先重新核对新部署身份，不能照抄旧SHA。
2. 在后台确认Provider预算保护启用，SiliconFlow、DeepSeek、OpenAI都具备有效上限。本轮只读已见三者均日5/月100，不修改现有值。
3. 完整smoke默认使用 `text.balanced`，包含一次真实 `/v1/runtime/execute`；按上一次只读路由解析首选SiliconFlow `siliconflow/ByteDance-Seed/Seed-OSS-36B-Instruct`，并存在多候选。一次workflow不承诺只发生一次外部Provider尝试，回退/重试仍可能计费。它不复用这次标题run，也不等于WordPress写作验收。
4. 在GitHub仓库 Settings → Environments → production，核对以下验收secret指向预期的同一账号/站点，已有密钥沿用，不临时新建或轮换：`NPCINK_CLOUD_INTERNAL_AUTH_TOKEN`、`NPCINK_CLOUD_ADMIN_KEY`、`NPCINK_CLOUD_RELEASE_MEMBER_EMAIL`、`NPCINK_CLOUD_RELEASE_SITE_ID`、`NPCINK_CLOUD_RELEASE_KEY_ID`、`NPCINK_CLOUD_RELEASE_KEY_SECRET`。本轮仅验证名称存在，没有读取或声称值有效。

### 6.2 准备只给这次 workflow 使用的新验证码

1. 使用 `NPCINK_CLOUD_RELEASE_MEMBER_EMAIL` 对应邮箱，在Portal登录页请求一枚新的验证码，记下申请/收到时间。
2. 不用这枚码手动完成登录；手动邮箱验收用过的码不能复用。默认有效期约10分钟，应在其他前提准备好后才获取。
3. 在上述production Environment的Environment secrets添加/更新 `NPCINK_CLOUD_PORTAL_LOGIN_CODE`，值仅填这枚验证码。不发到聊天、文档或日志。后续操作员已亲自在受保护输入页保存该secret；开发侧只核对名称和更新时间，没有读取验证码值，也未修改生产应用配置。

### 6.3 立即触发正式 workflow

进入 [GitHub Actions → Release Smoke](https://github.com/npcink/npcink-ai-cloud/actions/workflows/release-smoke.yml) → Run workflow：

| 输入 | 值 |
| --- | --- |
| 分支 | `production` |
| expected_deployed_sha | `b8cc6049da7d1c33cbfffc9f8e5521f332a1adb5` |
| base_url | `https://cloud.npc.ink` |
| require_alipay_enabled | 正式付费试用保留默认 `true`，不为变绿临时跳过检查 |

确认预算和允许真实模型执行后，点击一次Run workflow。不要同时手工重跑 `remote-smoke.sh` 或再次生成标题。本轮已经通过的WordPress标题闭环无需为这份记录重复生成。

### 6.4 按步骤检查结果

- `Bind smoke to successful deployed revision` 必须通过，绑定上述SHA及成功Deploy Production任务。
- `Run formal release smoke` 必须整步成功。其内部先做健康、worker/cadence、Provider新鲜度、callback压力和外部trace配置检查，再做signed runtime生成、运行/结果/统计/用量回读，以及Portal邮件码认证和Admin登录。具体顺序按该版本脚本，不用后面的登录失败否认前面已执行的模型请求。
- 保存workflow URL、完整SHA、开始/结束北京时间、最终结论，以及运行产生的run/trace、最终Provider/模型、token与积分变化。只有整个workflow成功才记“完整正式smoke通过”。

### 6.5 出错时反馈与停止

| 失败位置 | 操作与反馈 |
| --- | --- |
| SHA / deploy绑定 | 停止，反馈workflow链接、所选分支与完整SHA，不换成任意旧绿版本 |
| missing secret / 验证码过期或已用 | 反馈步骤名、错误原文和时间，不发送码；先确认前面的runtime段是否已经执行/扣费，再决定下一次有界重跑 |
| Provider预算 / 上游渠道 / 输出失败 | 停止，不连续重跑；提供run/trace、最终Provider/模型、错误代码和积分变化，不修改预算保护规避错误 |
| health / worker / callback / trace检查 | 反馈失败检查与时间，交给只读排查，不重启生产或改配置 |

## 7. 可复用经验与记录边界

- 主模型、辅助向量调用、回退必须分别统计；同一run下两种Provider不自动意味着发生回退。
- 积分按当前计量组件核对，不能用美元成本0或Provider调用数直接推断积分应为0/1。
- 操作员的WordPress保存回读与Cloud持久化运行证据互相补充，不能互相代替。
- 一次真实主路径成功、完整正式smoke、回退可用和长期稳定是不同证据状态，分别收口。
- 文档和索引为本地开发产物；本次未发PR、合并、部署，未改生产运行配置。获授权的正式smoke在模型调用前失败，Provider增量为0。文档验证使用定向门禁，无M4操作或重复完整CI。
- 在索取短期验证码或安排真实模型执行前，应先以零付费方式核对runner到受保护运维端点的可达性；secret名称齐全不证明网络路径可用。不能为验收变绿开放内部API。


## 8. 一次正式 smoke 的实际结果与阻塞 — 2026-10-19

操作员授权本次只运行1次workflow、沿用既有内部回退，失败不自动重跑。
验证码由操作员在GitHub production Environment的受保护输入页自行保存；开发侧未读取或写入验证码值。
本次没有修改生产应用配置、部署、调整预算或Provider路由。

| 项目 | 实际证据 |
| --- | --- |
| Workflow | [Release Smoke #2 / 39154517793](https://github.com/npcink/npcink-ai-cloud/actions/runs/39154517793) |
| 分支 / 精确版本 | `production` / `b8cc6049da7d1c33cbfffc9f8e5521f332a1adb5` |
| 部署绑定 | 成功绑定Deploy Production `39122857578`，不是对任意旧绿版本验收 |
| 起止 / 结论 | 2026-10-19 02:31:09–02:31:32 CST，GitHub总时长23秒，`failure` |
| 已通过的前置项 | live、公网页面和受保护后台入口、Alipay return/未签名notify行为、所需secret名称存在；不据此认定secret值全部有效 |
| 首个失败 | `ready health should load (expected 200, got 403)` |
| 未执行部分 | operational-ready与后续内部诊断、signed runtime生成及回读、验证码登录与Admin登录；本次验证码未被workflow消费 |
| 付费与积分影响 | 基线至只读复核窗口，Provider调用增量0、正式runtime运行增量0、积分账本增量0；Provider call最大ID保持334 |
| 执行次数 | dispatch 1次，重跑0次；失败后停止 |

### 原因与证据边界

冻结版本 `deploy/release-smoke.sh` 通过公网base URL请求 `/health/ready`，期望带内部认证返回200。
但冻结版本、主机当前release文件，以及运行中proxy容器的Nginx配置均对该路径只允许loopback与私网来源，其余 `deny all`；`/health/operational-ready` 和 `/internal/` 也有同类边界。
GitHub托管runner的公网检查因此与预期的生产访问限制冲突。

只读诊断在容器内使用现有内部凭据对同一路径核对：

- 应用直连 `127.0.0.1:8000/health/ready`：200、JSON、`status=ok`、dependencies ready。
- 公网 `https://cloud.npc.ink/health/ready`：403、Nginx、HTML，未进入应用的正常ready响应。
- 基线之后未发现该路径的应用认证guard事件。未读取或比对GitHub保存的token值，因此不声称该secret已验证有效，也不将此次403归因为密钥过期。

结论是**正式验收入口与内部运维端点访问策略不兼容**，不是本次观察到的DeepSeek输出失败。
已有真实标题及WordPress人工保存回读通过的证据仍成立；完整正式smoke仍未通过。

### 后续最小工作范围（尚未实施）

单独修复验收工具：公网检查保持公网边界，内部ready/worker/观测断言经已有受控运维通道执行，并继续绑定精确部署SHA、保留认证及失败即停。
先以静态断言和假HTTP响应完成零付费回归，再评审适用的正式执行入口。
不开放内部API、不放宽Nginx来源限制、不添加无界回退或自动重跑；本记录不授权新一轮真实模型调用。
短期验证码在重新就绪后另取新码，本次值不再复用。

本地脱敏证据位于开发机任务回执目录 `2026-10-19-formal-smoke`，包括workflow元数据、失败日志、前后只读计量和健康状态；凭据值不进入仓库或回执。
