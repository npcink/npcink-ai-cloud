# 运行配置与服务设置修复记录 — 2026-10-29

状态：14 组问题已完成本地修复和回归，代码已提交，最新干净源码已同步 M4 candidate；两个真实页面完成只读复查。尚非 CI、GitHub 合并、M4 accepted、生产或人工验收。

## 范围与边界

检查 `/admin/runtime-profiles` 的托管用途目录、候选链、能力验证历史和媒体识别策略，以及 `/admin/service-settings` 的门户地址、QQ 登录、邮件、支付、财务核算、Provider 预算、站点重连和系统设置。界面范围仅 PC，包含 900px 窄窗口；保留现有布局和已有测试，不扩展移动端验收。

本轮修复配置读取、草稿保护、操作互斥、回执、导航与错误表达。不增加服务、商业能力或 WordPress 控制面，不改变 Provider 执行实现。没有实际保存共享配置、发送邮件、支付交易、索引重建或为观测制造付费模型调用。写入、失败和恢复路径使用本地隔离 Mock；真实 M4 只读检查不能替代真实生成和 WordPress 采纳证据。

## 逐项问题与修复

下表为后台使用和正确性问题分组，不代表生产安全漏洞定级。异常路径通过隔离回归复现，真实环境事实另见下文。

| 编号 | 问题 | 修复后的行为与验证 |
| --- | --- | --- |
| R01 | 运行配置首次读取失败，目录摘要仍显示四个 0 | 未知显示 `—`，不冒充空目录；覆盖首次读取失败。开工 M4 502 时实际观察到旧表现 |
| R02 | 媒体识别策略读取失败或结构无效后，仍可能编辑默认值，重试误走保存 | 校验启用、时段、限额和时区；未加载时隐藏可写表单，重试仅 GET；覆盖失败与 malformed 响应 |
| R03 | 提交期间仍能修改草稿或发起竞争操作，回读可能覆盖新输入 | 两模块锁定在途操作涉及的表单，ref 防重入；用途保存、能力验证、媒体策略互斥；服务保存/测试期间锁工作区及页签；覆盖延迟请求和重复操作 |
| R04 | 保存成功但回读失败，状态混乱并可能诱导重复保存 | 明确“设置已保存，最新状态读取失败”，页签标为“待确认”，旧快照冻结；重试只 GET；不再同时显示保存失败或未保存；覆盖深色截图与单次写入断言 |
| R05 | 服务设置响应 HTTP 200 但配置结构无效时，页面可能在渲染中崩溃 | 在接纳快照前校验 required settings、config、secrets、enabled、status；无效数据进入有界重试。保留 accounting_fx/provider_budget 的既有缺省兼容行为；覆盖结构无效响应 |
| R06 | 服务连接测试失败后，不刷新服务端持久验证状态 | 失败同样回读最新状态，保留本次操作错误；覆盖失败后状态更新 |
| R07 | 能力验证历史失败、配置重试或零样本时，统计会误导或一直加载 | 配置重试不清空已加载历史，验证失败也刷新历史；malformed 记录不可用，零样本验证率为 `—`，独立 GET 重试；覆盖失败与恢复 |
| R08 | 媒体识别的“配置并验证模型”只改变同路径 URL，没有打开工作区 | 直接打开视觉用途候选链弹窗，URL 变化同步用途上下文；覆盖入口和弹窗行为 |
| R09 | 服务设置分类与同路径链接、浏览器历史不同步 | URL query 驱动页签，修正 Next history 状态传递，保留未保存草稿切换保护；覆盖同路径导航和前进/后退 |
| R10 | 服务页签键盘操作和 tab/tabpanel 关联不完整 | 单一 tab stop，方向键、Home/End 切换，补齐 id、aria-controls、aria-labelledby；共享组件当前仅该页使用，覆盖键盘和面板关联 |
| R11 | 切换语言重新加载配置，丢失未保存草稿 | 稳定读取回调，翻译引用独立更新；两个模块切换语言均保留输入；覆盖 locale 切换且不重新 GET |
| R12 | 邮件预览固定中文、复用旧发件人，错误显示在弹窗后面 | 使用当前语言，每次打开重新生成；独立 loading/error，在弹窗内反馈；关闭后忽略迟到响应；覆盖语言、重新预览及错误位置 |
| R13 | 已保存的非常用时区不在选项中，选择器显示错误 | 将当前保存值纳入选项，例如 Australia/Sydney，保持显示和草稿一致；覆盖非常用时区 |
| R14 | 会话/上游 502、503、504 被误导为数据库迁移问题 | 上游故障给出准确的稍后重试说明，保留真实 service_settings.* 错误的定向提示；覆盖代理错误表达 |

## 本地验证

- 两个目标浏览器 spec 最终 **37 passed（36.5s）**，包含最终“待确认”补丁。日志：`.tmp/runtime-settings-final.log`；工件：`.tmp/runtime-settings-final/`。
- 后端既有契约 **39 passed、242 deselected**，覆盖 service-settings、admin runtime profile、capability probe summary；使用测试客户端及隔离数据库，没有改后端源码。日志：`.tmp/runtime-settings-backend.log`。一条既有 TestClient 依赖弃用警告，不影响通过。
- 最终完整 `check:admin-ui:visual` **188 passed（2.9m）**，视觉治理 12 rules / 9 pilots 通过，未更新 golden baseline。日志：`.tmp/runtime-settings-visual-final.log`。37 项与该门禁有重叠，不相加。
- `check:admin-ui`（含类型检查）、精确文件 ESLint、`test:i18n-contract`、前端构建和 diff 格式检查通过；最终日志 `.tmp/runtime-settings-admin-ui-last.log`、`.tmp/runtime-settings-i18n-last.log`。
- 检查 PC 1440px / 900px；已查看窄窗口 SMTP 表单、候选链弹窗和最终深色“已保存、待确认”截图，确认表单操作可达、提示无矛盾。既有测试内的移动尺寸检查保留，不计为本轮移动适配承诺。
- 运行配置 `runtime-visual-receipt.json` 与服务设置 `admin-visual-receipt.json` 保留结构化回执；运行配置回执 12 条规则通过，收集到的 console_errors / network_failures 为空。human_acceptance 仍为 pending，不代表用户已验收。
- 自审核对状态未知、保存后回读失败、并发、迟到响应、草稿、URL、兼容缺省和边界；没有新增依赖。最初新增用例的定位/同步问题已修正，未将测试工具问题计入产品缺陷。

主要执行入口：

```sh
NPCINK_CLOUD_FRONTEND_PORT=3309 pnpm --dir frontend run test:e2e tests/e2e/admin-runtime-profiles-workspace.spec.ts tests/e2e/admin-service-settings-v2.spec.ts --output=../.tmp/runtime-settings-final
python -m pytest tests/api/test_service_settings_routes.py tests/api/test_service_provider_routes.py tests/api/test_wordpress_ai_connector_runtime.py -k 'service_settings or admin_runtime_profile or capability_probe_summary' -q
pnpm run check:admin-ui
pnpm --dir frontend run test:i18n-contract
NPCINK_CLOUD_FRONTEND_BASE_URL=http://127.0.0.1:3309 pnpm run check:admin-ui:visual
```

## M4 实测与证据分层

开工时两页实际 GET 返回 `502 proxy.admin_session_unreachable`：运行配置误显示四个 0，服务设置误提示迁移；未据此宣称生产故障，也未重启或修改主机修复。共享预览初始身份为 master `d9185146c5c0592a6d1a01ceeafc1b12e7665b0b`、dirty=false、accepted，属于此前状态。

前序外部能力同步曾受共享磁盘整理操作锁阻挡，本轮锁已释放，按既有 M4 候选通道同步成功。保留前序日期记录，不改写当时的阻塞事实。最终使用：

```sh
NPCINK_CLOUD_M4_ALLOW_NON_MASTER_CANDIDATE=1 pnpm run m4:preview:sync
pnpm run m4:preview:status
```

| 层级 | 本轮状态 |
| --- | --- |
| master 基线 | `d9185146c5c0592a6d1a01ceeafc1b12e7665b0b`；本轮 fetch 核对未变化 |
| 工作分支 | `codex/observation-evidence-fixes-20261029`，保留前序观测、诊断、外部能力修复 |
| 主要代码提交 | `0e10b0178e8ae00b57857fef2509e20567fa59da`，protect runtime and service configuration state |
| 最终提示修正 | `4a677b13d45e946c2e3fb42511e86d3222e8f73c`，label saved settings awaiting readback confirmation |
| 本地源码与回归 | 上述最终业务源码通过，详见本地验证 |
| M4 candidate | 同步 exit 0；backend source_revision 与 frontend_source_revision 均为 `4a677b13d45e946c2e3fb42511e86d3222e8f73c`，source_dirty=false，acceptance_state=candidate |
| M4 页面只读 | 运行配置读取正常，查看候选链后取消；服务设置 8 个页签在 900px / 1440px 均可切换、一个活动面板，无整页横向溢出，Home 返回门户地址；写请求监听为空 |
| CI / push / PR / GitHub 合并 | 本轮未执行 |
| M4 accepted / 生产 / 人工验收 | 本轮未取得 |

M4 现有媒体识别为启用但显示“需验证”，该状态属于现存证据，不因本次页面修复自动认定可用。未点击真实能力验证，避免改变验证事实或引发后台任务；真实模型生成、连接有效性和 WordPress 采纳不在已验证结论中。

最终 M4 只读截图保留在忽略目录 `.tmp/runtime-settings-m4-runtime-900.png`、`.tmp/runtime-settings-m4-service-900.png` 和 `.tmp/runtime-settings-m4-service-1440.png`。状态与同步日志也仅保留忽略目录，不公开连接目标或认证信息。候选包包含同分支前序修复，不代表这些均已 GitHub 合并或 M4 accepted。

本记录与索引单独提交；文档可达性检查 **593/593** 和 diff 格式检查通过。文档提交不改变已同步的业务源码版本。
