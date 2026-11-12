# 连接维护发布与会话收尾 — 2026-11-12

本记录接续[发布准备记录](../../engineering/2026/connection-maintenance-release-closeout-2026-11-12.md)，
仅更新本批维护、连接验收和资源处置事实，不改写旧回执。

## 实际发布身份

| 状态 | 证据 |
| --- | --- |
| 开发集成 | reviewed master `dc72f1e766ed52204db136c8b3d9a79cebd6aaf5` |
| 授权候选 | `e1bd30916ac715b9370b2dc610b941fc560b11ff` |
| 生产晋级 | [#1427](https://github.com/npcink/npcink-ai-cloud/pull/1427) 已合并；生产源 `6ef9e100b62ce591855c15d5eb3db56b922f2cce` |
| tree 对账 | 候选、reviewed master 和生产源均为 `dbf41a572eef053ed1a628992e7df6e87f3036dc` |
| 精确 CI / CodeQL | [Cloud CI 43169993011](https://github.com/npcink/npcink-ai-cloud/actions/runs/43169993011)、[CodeQL 43169993147](https://github.com/npcink/npcink-ai-cloud/actions/runs/43169993147) 成功 |
| 发布包 | artifact `13921841937`，242,522,120 bytes；Actions archive SHA256 `501dd2e151305f273de911fb21dae437d4253a810e0e4dd85abccf6034c0eae6`，构建与扫描成功；该 digest 不冒充包内 manifest hash |
| 生产部署 | 操作者独立批准精确版本后，[Deploy 43171431374](https://github.com/npcink/npcink-ai-cloud/actions/runs/43171431374) 成功 |
| 主机安装 | `release-391f4703e388b928-20261112065524-2514`；installed source 与批准的生产源相同 |
| 回退基线 | 保留原已验收 `35bb9908e262b1e1c2be3938bdfa9bc5a1daba77`；本次未执行回退 |

本次为 full runtime lane，更新前后端；无新增迁移、业务配置或暂停功能恢复。
正常发布仍运行既有 Alembic 检查/升级入口，不能把“无新增迁移”写成“未运行迁移工具”。
未手改服务器应用代码，未调用付费模型或修改 WordPress 文章。

## 生产和编辑端验收

- 七个容器运行，restart=0、OOM=false；有 Docker healthcheck 的四个服务为
  healthy。三个 worker 没有 Docker healthcheck，部署流程另证明其心跳晚于
  cutover cutoff，且在恢复公共流量前稳定、operational-ready。
- 公共 live、内部就绪、小客户公开入口和未认证拒绝检查通过；部署锁、失败标记、
  one-off 锁及临时容器已清除。未把小客户 preflight 写成完整 formal smoke。
- device 使用 Addon [#357](https://github.com/npcink/npcink-cloud-addon/pull/357)
  / `f5dbf29c5a97f6d88b6e965e5aa2bcacb3cab8b9` 的已验收包。
  此前 inactive readiness 恢复入口、Cloud 确认和自动返回已真实验收；本次发布后
  再运行详细检查，连接正常、文字已配置、详细排查就绪。图片/识图既有
  `no_eligible_model` 限制保留，没有为截图开启功能或运行模型。
- Portal device 改名弹窗输入聚焦、Enter 打开、取消和关闭后回到改名按钮通过。
  自动化 Escape 在隔离键盘页面中没有产生 keydown，而 Enter 有可信事件，故不能
  由该自动化结果判定产品失败。操作者手动按 Esc 后确认关闭并回到原按钮，代理
  随后读取同一生产页面，确认弹窗消失、改名按钮聚焦；未点击保存。
- 既有真实草稿摘要和改写验收继续引用[前轮记录](../../engineering/2026/activation-flow-closeout-and-lessons-2026-11-11.md#51-接回执行更新2026-11-11)，本轮不重复付费。
  完整 formal authenticated smoke 本次未运行，受保护凭据名称齐全不代表验证码
  仍有效或 smoke 通过；若后续发布/正式开放要求完整 smoke，使用既有独立入口补验。

## 耗时和经验

发布 phase receipt 记录总计 3,060 秒，其中包上传 2,826 秒（47 分 6 秒），
远端发布序列 244 秒（4 分 4 秒）。其余包含传输准备、校验等；阶段分类与嵌套
序列不可重复相加。上传期间旧版本继续服务，不能把总上传时间当成停机时间。
本次远端四个镜像均装载，复用字节为零；没有为缩短等待取消后重发或重复构建。
后续仅在实际发布频率和同类耗时需要时评估传输优化，不由一次维护扩大平台建设。

本轮可复用的做法：

1. 分开记录源码合并、精确包、installed manifest、页面行为及人工结果；一个绿灯
   不能替代其他层。晋级与 Deploy 的授权也分别留证。
2. 自动化按键无效时先隔离检查是否向页面发送事件，再做最小人工确认；不要用
   工具限制制造产品 bug、修改线上代码或把未运行检查改为通过。
3. 部署成功后验证终态清理，避免健康服务被残留失败标记或锁阻止下次发布。
4. 统计读取减少、worker 重试和 ECS 高读盘根因分别判断；源码优化与健康现状不
   证明事故归因，也不授权调整数据库/宿主机资源。

## 资源及外部事项

本会话 Addon topic、旧摘要 topic 和生产晋级 topic 均已备份退役；当前收尾文档
不改变已部署应用，也不再触发一次应用晋级。发布工作区在完成文档合并后按 App
管理能力尝试归档；若被识别为 primary/workspace-protected，保留干净检出和明确
角色，不绕过保护强删。其他聊天、M4 运维及有交付的工作区不在本次删除范围。

高读盘根因由既有定时排查接续，owner 为该排查任务，触发点为下次采样复核或
同类异常；数据库续费由操作者安排，下次复核为其续费确认。两项均未被标记为
已解决，不阻塞本批维护收尾。后续 Cloud Docker/集成验证沿用 M4 和既有隧道；
本次生产部署和 device WordPress 验收不依赖本机旧 Cloud dev Compose。

本地受限证据目录为 `~/.codex/task-evidence/editor-release-closeout-20261111/`，
包含精确授权、CI/plan/artifact、部署日志/时序、只读主机状态、device 截图、
资源审计和最终收尾回执。原始凭据、真实 SSH 目标及完整敏感配置不进入 Git。
