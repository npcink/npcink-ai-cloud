# Portal 站点知识失败与更新时间纠正 — 2026-11-10

## Scope / Boundary

操作者同意处理站点知识面板的四类状态/时间误导后，在既有
`codex/portal-site-dialog-clarity` 工作区继续开发，基于
`45e3a24a0d5630b1998420a08b2173744d59308a`，保留前两轮未提交工作。
本轮代码仅修改 `PortalSiteKnowledgePanel.tsx`、中英翻译和原Portal浏览器spec。
development lane，route-local material/L1展示判断修复；没有改API契约、后端健康
评分、写入权限、索引任务、重试机制或数据库。没有运行模型、交易、同步或真实站点写入。

## 事实和修正

后端 `site_knowledge/metrics.py::_build_health` 是多个原因的汇总评分；失败次数
不直接等于某个固定健康等级。前端原来将health.error且已有内容的情况泛化为
偶发更新失败，同时只在health.warning且hasKnowledge时显示具体原因。
`last_index_job_finished_at`是所有更新尝试结束时间的最大值，包含失败；索引快照
`last_indexed_at`来自repository.last_sync_at，两者不等价。

| 反例 | 修正 |
| --- | --- |
| 已有86页且检索失败、未命中偏高，health.error | 显示检索失败、期间/次数、已收录页保留和支持入口；不以有内容推导检索正常 |
| 首次3次更新全部失败，0页，health.warning | 显示更新失败、0页、最近尝试及WordPress内容更新检查/支持下一步 |
| 0页、无更新任务但已有5次失败检索 | 具体错误不再被尚未建立空态覆盖；保留0页和检索使用统计 |
| 86页历史内容，近期3次更新失败，快照无成功更新时间 | 最近更新待确认；尝试结束时间单独命名并说明不代表成功更新；不宣称历史页面被删除 |

部分更新失败且已有页面、无检索或其他真实故障时，保留原“知识库可用”中性标记及
最近更新帮助中的偶发更新说明；混合故障的具体原因常显。未知健康不默认正常；
无近期活动不升级为错误。慢响应的历史范围、最近检索和开发环境限制保持。

## 信息层级与视觉决定

| 类别 | 处置与入口 |
| --- | --- |
| 常显 | 更新/检索失败的具体次数和期间、0页或历史页面保留、故障下一步和支持入口；失败场景中的最近尝试与成功时间不确定性 |
| 按需 | 标题帮助只讲知识用途/站点范围；非阻塞的部分更新失败与尝试记录留在原“最近更新”指标帮助，支持focus/Escape |
| 技术证据 | 既有API监测窗口、任务/检索计数与索引快照；没有增加运行配置、模型参数、原始JSON或新的诊断平台 |
| 删除重复 | 移除把严重检索错误泛化为更新偏慢的分支；故障区已说明的尝试时间不在指标帮助重复，空态不覆盖/重复具体故障 |

页面仍为单站点详情，知识区承载已有内容、期间故障和下一步。使用既有指标网格和
正文/帮助，没有新增表格、Tab、drawer、卡片层或主操作。表格用途不适用。
用户确认的原有去重及偶发失败帮助取舍已核对；本轮将适用条件收紧，而非全量展开帮助。

## Verification

证据目录（工作树外）：
`/Users/muze/.codex/visualizations/2026/11/09/01a1bf16-bba3-7cd1-93b8-2de1c62793d4/portal-knowledge-state-20261110/`。

- 修改前先添加4个反例，4项均失败，保留`before/`的错误截图/context/trace与
  `before.log`。前三项分别未显示具体故障/正确失败状态；时间场景先在更新失败标签
  断言停止，未执行后续时间断言，但实际截图确认失败时间被放在最近更新。
- 首轮修正版10项通过（7.9秒）：新增8项，连同既有普通慢检索和开发环境慢检索。
  严重检索夹具随后统一为64次检索、20次失败、32次无命中，避免将32次检索中
  20次失败与16次无命中的不清晰组合用作最终证据；其他三个前后反例的输入不变。
  首版失败结果保持，不冒充同一输入的像素对照。
- 为可读性将状态及下一步的多层条件改为显式分支后，最终本地28项通过（19.7秒）：
  新8项、原慢检索2项、上轮站点状态9项、安全恢复4项、故障动作4项和报告缺口1项。
- 类型检查、定向ESLint、site-status-attention/usability-closeout/
  professional-info-simplification/customer-correctness契约、i18n完整性
  （1990 keys）、copy-surface、`git diff --check`通过；旧契约没有因改动失败而被删除。
- 选取原spec及精确grep，不跑全Admin视觉矩阵，不更新golden，不以截图基线变化代替审查。
  计划器为development/L1，PR和生产均非当前要求。没有本地Docker替代M4。

本地浏览器命令：

```sh
NPCINK_CLOUD_FRONTEND_BASE_URL=http://127.0.0.1:3317 pnpm --dir frontend run test:e2e tests/e2e/portal-workspace-path.spec.ts --grep 'knowledge state:|slow knowledge searches|local knowledge latency guidance|site detail state|has its own safe recovery|site warning gives a concrete next step|successful AI requests keep'
```

M4对应base URL为`http://127.0.0.1:18010`，并须在测试进程设置
`NEXT_PUBLIC_ENV=development`，与`docker-compose.m4-preview.yml`的前端环境一致；
production-mode描述Next构建模式，不代表产品环境为生产。
测试数据/业务请求由既有只读夹具隔离，
新增用例核对零pageerror和零外域/非GET请求，不涉及真实客户动作。

### PC视觉回执

| 项目 | 结果 | 范围/证据 |
| --- | --- | --- |
| 路由/模型、单一主标题、工作区首屏 | pass | `/portal/sites/site_clear`；原站点详情模型及知识区 |
| 视口、换行/无横向溢出 | pass | 中文1440×1200、英文深色1056×900；4个反例及英文均有浏览器断言 |
| 状态文字与强调 | pass | 更新/检索失败红色文本徽标，未知和无活动中性；正常与部分更新不添加重复警告 |
| 对象、范围、动作就近 | pass | 近7天统计、保留页/0页、下一步/支持链接在原知识区；没有新增主操作竞争 |
| 帮助键盘/关闭行为 | pass | 部分更新帮助focus可读，Escape关闭；技术时间解释仍可达 |
| 加载/失败/重试上下文 | pass | 原组件读失败保护未变；站点失败恢复及未知刷新入口用例通过；不将刷新写成重试索引 |
| 无非预期页面错误和业务写入 | pass | 新8项的只读夹具verify；API错误场景为隔离数据，不代表生产健康 |
| 五秒状态/下一步扫描 | pass | 目视核对旧空态与新检索失败、首次更新失败、时间缺失、英文窄PC、部分更新帮助 |
| 新弹窗/选择/禁用状态 | not_applicable | 本轮未增加这些交互 |
| 人工接受、真实生产数据、全Portal矩阵 | unmeasured | 本轮未执行，不由局部截图推导 |

### M4 candidate

已同步上述dirty分支的source-only候选，production-mode前端，无依赖/镜像输入变化：

- source_bundle_sha256: `06fdb584196c1dbdad726ac117c738e6927a915e7ba3e350fb6998251b6b38b8`
- frontend_source_sha256: `6a0bef87269a33d1ac6a6f3a42ad128a5e483998891a991b76dac5d8ded37af5`

M4首轮28项中27项通过、1项失败（2.8分钟）。失败项是既有开发环境慢检索说明：
测试进程未设置`NEXT_PUBLIC_ENV`，按非开发环境断言；实际M4前端明确为development，
页面显示的开发环境限制正确。保留`m4-final/`及`m4-browser.log`中的首轮失败证据。
按实际环境设置`NEXT_PUBLIC_ENV=development`后，仅复验该项，1项通过（9.1秒），
记录于`m4-environment-recheck/`和对应日志；不是一次28项全绿运行。
同步及健康记录分别为`m4-sync.log`、`m4-status.log`；API/frontend容器healthy，
`/health/live=200`，不由此推导其他探针或所有业务路径通过。

本文/台账在同步后更新，不包含在该包中；前端源码在同步后未修改。
M4仅证明真实前端渲染隔离夹具，不证明生产数据或实际检索质量。

## Risk / rollback / 状态

无新请求、轮询、依赖或后端状态拥有者；没有改变告警阈值、计费或WordPress写入边界。
缺失成功时间现在显示待确认，可能比旧页面少一个日期，这是防止错误确定性的修正。
本期全部更新失败不意味着历史页面被删除，页面明确保留这一事实。
回滚只需回退本轮面板、翻译及新增回归用例，无数据库步骤；前轮改动应单独保留。

本地verified；M4候选已完成上述定向浏览器验证；未提交/PR/CI/合并/M4 accepted/生产，
人工接受待定。工作区原有改动保持，未操作生产主机或配置。

## Merge lane 接续（2026-11-10）

操作者随后授权依次收口、合并、M4验收及准备具体生产候选。为控制审查范围，
确认框/生命周期/活动事实修复先经PR #1401合入`dabb3326a2ba31a18a18056beb60439f584c7cd1`；
本知识区批次从该干净最新master创建`codex/portal-knowledge-state-correction-20261110`，
仅恢复上述面板、六个中英键、八项用例和对应台账/本文。前轮误加的测试变量已在
#1401改为明确的`zh-CN`；恢复本批没有覆盖这项纠正或其它已合入内容。

#1401首轮CI在中文试用用例遇到作用域外`language`变量（64项通过、1项失败）；
纠正后CI的65项关键页面、248项Admin视觉、4项Portal主路径和9项TOTP通过。
等待期间master合入无前端重叠的文档PR #1402，保护规则要求更新分支并重新CI，
更新后全部必需检查通过并合并；前端字节一致，未重复本地/M4整组检查。
第一次M4 relay SSH在源应用前超时；操作者明确授权本次两批及合并后验收走LAN直连，
直连候选成功。首次单项复验误在前端重启期间启动，截图是502；服务就绪后
26项定向浏览器通过（3.2分钟）。这些失败/成功日志分别保存在工作树外
`~/.codex/task-evidence/portal-clarity-merge-20261110/`，不合并为一次全绿运行。

共享i18n文件使现行CI选中16组Admin视觉（248项，上一轮9.3分钟）；这是交付耗时
证据，不在本批修改CI选择器或门禁。两批合入后的clean-master M4验收及精确生产
候选另记收尾回执；上述开发夹具不替代真实生产或人工采用证据。
