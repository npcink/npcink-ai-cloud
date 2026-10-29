# 外部能力三页签修复记录 — 2026-10-29

状态：10 项问题已完成本地修复、提交与隔离回归；M4 candidate 同步受共享操作锁阻挡，尚未应用。不是 CI、GitHub 合并、M4 accepted、生产或人工验收。

对应 [外部能力三页签审查](external-capabilities-audit-2026-10-29.md)。范围为模型供应商、搜索与图片、站点向量的配置正确性和 PC 使用体验，保留既有布局及 Cloud 运行配置边界。不新增外部服务、WordPress 控制面或付费观测样本。

## 逐项修复

| 项目 | 修复后的行为 | 本地验证 |
| --- | --- | --- |
| E01 | 搜索/向量首次读取失败或响应结构无效时保持未知，只提供重试；同范围旧快照明确标记陈旧，读恢复前禁止写入 | 首次 503、malformed 响应与旧快照恢复回归 |
| E02 | 配置、启用和验证分别表达；失败及错误码持久展示，未验证不冒充通过；摘要只计算启用且验证通过、就绪、无关注项的服务 | failed / not_observed 行、明暗主题与摘要回归 |
| E03 | 保存成功、回读失败给出独立回执；旧行不称当前状态，重试只发 GET，恢复后清除旧警告 | 单次写入、失败回读及恢复回归 |
| E04 | 向量服务端快照与 Endpoint/凭据草稿分开；dirty 草稿不被后台轮询覆盖 | 定时轮询及草稿保留回归 |
| E05 | 保存与重建互斥，提交中禁用相关输入，远端索引进行中禁止再次保存/重建；请求版本与在途读取防护避免迟到响应覆盖状态 | 延迟保存、禁用与并发排除回归 |
| E06 | 后端顶层透传 awaiting_site_sync；前端同时依据索引生命周期和顶层状态轮询，兼容旧服务端顶层 ready | 向量服务测试及嵌套生命周期浏览器回归 |
| E07 | not_ready 显示等待连接配置；重建中、失败、未知分别表达，操作与前置条件一致 | 连接前置条件和状态文案回归 |
| E08 | no_hit 显示“已检索，零命中”、实际时间及 0 结果，并提供检查资料/索引范围的下一步 | 零命中证据断言与 900px 截图 |
| E09 | 搜索/图库分类使用 URL category 参数，刷新、分享、前进/后退可恢复分类 | URL、reload、history 回归 |
| E10 | 搜索分类和模型供应商工作区补齐方向键、Home/End、单一 tab stop 与 tab/tabpanel 关联 | 键盘切换及既有模型目录、草稿、工作区回归 |

同时落实三条文案建议：验证区明确称“生产连接与索引验证”，与本地 runtime 分开；分步保存回执使用中英文文案；未满足测试前置条件的连接提供先启用并保存的说明。测试失败后回读持久验证状态。未修改共享凭据组件或新增依赖。

## 本地验证

- `tests/domain/test_site_knowledge_vector_profile.py`：**25 passed**；定向 Ruff 与 mypy 通过。
- `frontend:type-check`、`check:admin-ui`、三个页面及三个 spec 的精确 ESLint、中英文 i18n 契约通过；本地前端构建通过。
- 三个目标浏览器 spec 最终一次执行 **55 passed**：external-services、vector-settings、provider-directory-v2。主题截图稳定性调整后另跑 **2 passed**；不将重叠测试相加。
- `check:admin-ui:visual` 完整门禁 **170 passed**，结构化视觉治理通过。未新增或更新 golden baseline。
- PC 检查覆盖 1440px 和 900px 窄窗口；已查看向量状态与零命中窄窗口截图、搜索验证状态深色截图。未扩展移动端/平板验收。
- 模型供应商结构化回执 12 条规则通过，收集到的 console_errors / network_failures 为空；主观视觉项仍需人工判断，fixture 的 human_acceptance 字段不代表用户验收。
- 浏览器请求使用 loopback Mock；没有真实配置保存、外部服务测试、索引重建或为证明修复执行付费 Provider 调用。
- 本地工件保留于忽略目录 `.tmp/external-capabilities-browser-final/`、`.tmp/external-capabilities-theme-final/` 和 `frontend/test-results/`；日志为 `.tmp/external-capabilities-browser-final.log` 与 `.tmp/external-capabilities-admin-visual.log`，不是 CI 上传证据。

初轮两条新增浏览器用例存在测试同步问题，分别通过等待 router.push 的 URL 提交、在导航前安装虚拟时钟修正；之后最终 55 条完整通过。最初深色截图捕获了入场动画，已使用 reducedMotion 和禁用截图动画重拍并检查。代码自审核对未知状态、迟到请求、草稿、写互斥及边界；未把工具时序问题计为产品缺陷。

## Git 与环境证据

| 层级 | 本轮状态 |
| --- | --- |
| 分支 | `codex/observation-evidence-fixes-20261029`，保留前序观测与诊断修复 |
| master 基线 | `d9185146c5c0592a6d1a01ceeafc1b12e7665b0b`；通过本地 merge 提交 `91b34431` 纳入，并非 GitHub 合并 |
| 搜索服务与工作区修复 | `718b9c13` |
| 向量草稿、互斥与状态修复 | `ebb87a20` |
| 稳定主题截图回归 | `3e4fd0ac6b4f72c99412ca4fc7b237f590bbbc73` |
| 本地源码与回归 | 通过，详情见上文 |
| M4 candidate | 未应用；干净源码 `3e4fd0ac` 的同步被具名操作锁阻挡 |
| CI / push / PR / GitHub 合并 | 本轮未执行 |
| M4 accepted / 生产 / 人工验收 | 本轮未取得 |

同步前只读 M4 status 显示 backend/frontend source 均为上述 master，source dirty=false、acceptance_state=accepted；这是共享预览原有状态，不能作为本次修复证据。

依照 [M4 标准 §5.1](../../../m4-preview-ai-development-standard-v1.md#51-default-task-checkpoint-dispatch) 执行候选同步。首次分支保护拒绝后，采用工具明确支持的 `NPCINK_CLOUD_M4_ALLOW_NON_MASTER_CANDIDATE=1 pnpm run m4:preview:sync`。随后一次尝试及本地视觉完成后的一次复查均返回 75，锁所有者为 `codex:m4-disk-reclamation-20261029`，操作为 `verified-archive-and-reclaim`；在应用前停止。未抢锁、删除锁、修改主机或覆盖共享运行环境，未继续循环重试。

因此 `127.0.0.1:18010` 尚不代表这些修复，后续仍需锁释放后的候选同步和只读页面复核。同步包也会包含同分支前序修复，不能将本次局部回归代替全部候选联调。生产部署仍需单独明确授权。

本记录与文档索引单独提交；文档可达性 **592/592** 与 diff 格式检查通过。
