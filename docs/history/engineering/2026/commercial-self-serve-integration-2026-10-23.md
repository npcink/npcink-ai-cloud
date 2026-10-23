# 全用户购买与 14 天试用：本地组合交付（2026-10-23）

状态：development lane，本地组合候选。操作者在 A02 确认所有正常账户均可付费，
Plus/Pro 共享 14 天试用也开放；三人 Free 验证并行。本文不证明生产已开启。

## 范围与来源

- 复用交接的工作树 `/Users/muze/.codex/worktrees/b01-commercial-guards/npcink-ai-cloud`，
  branch=`codex/b01-commercial-guards`，锁=`codex:b01-commercial-guards`。
- 本地整合 `origin/master=6f651189`、#1205 候选 `6afcba90` 与 B01 `6cbfb642`；
  不修改原 #1205 分支，不发布重复 PR，不覆盖主工作区的账户删除、通知、Provider 等混合改动。
- #1205 保留数据库上架/下架真值；B01 补账户共享 3 次/60 秒限流和紧急停止。
  本批增加两者组合回归、全用户购买/试用契约和 PostgreSQL 并发验证目标。
- 同步 AGENTS、README、Phase 1 范围、商业下一阶段与三人试用计划；保持现价、
  试用一次性约束、3000/5000 试用积分上限、WordPress 最终写入边界。

## 诊断结论

M4 公开 `/open/plan-catalog` 的本次只读响应中，Plus/Pro 为 available，分别
CNY 15/29、monthly/self_serve、trial_enabled=true、trial_days=14，五项比较权益
均已配置。没有复现“所有 CTA 都因缺 seed 不可用”，也没有把此公开响应当作
账户态界面或生产证据。账户套餐查询本来就会初始化缺失标准报价并 commit。

积分包有效目录合并 ServiceSetting 覆盖；支付宝配置由加密 ServiceSetting 解析，
不是直接按旧文档往 .env 写六个值。已有 B01 只读核对显示 M4 配置就绪，本批
没有重新读取密钥或执行真实网关请求。真实网关模式与当前生产状态仍待验收。

本批不创建 pre-seed migration，不修改共享数据库销售行，不启用微信真实支付，
不新增白名单、账号年龄门槛、日订单限额或报表系统。

## 本地验证

| 验证 | 结果 |
| --- | --- |
| 合并后既有商业域、支付网关、支付域、签名通知、Portal API、Admin 销售 API 基线 | 189 passed、1 skipped；SQLite/TestClient 与本地 RSA 密钥，不是外部交易 |
| 新增全用户/组合恢复用例所在文件与 PostgreSQL 目标 | 16 passed、1 skipped；两个新账号分别立即购买或开启 Plus/Pro，验证 14 天、3000/5000 积分及升级不延长；暂停恢复不重新激活下架商品，原订单仍可结算 |
| 最终 `pnpm run verify:local` | 退出 0；158 passed、2 skipped；差异检查、release-policy、Ruff、targeted mypy、TypeScript、定向 ESLint、16 项 Vitest、Admin 契约通过 |
| 前端单元测试 | 43 文件、327 项通过 |
| 正式前端构建 | `pnpm --dir frontend exec next build --webpack` 通过 |
| 正式构建浏览器回归 | 6 passed：3 项 Admin 套餐测试；紧急停止禁用三个 CTA 并恢复；支付宝回跳轮询及余额刷新失败重试 |
| 文档可达性 | 修复 B01 历史记录漏索引后通过 |

正式构建通过 standalone server 在本机 loopback 3312 提供，仅前端执行，API 为
测试 mock；没有在本机启动 Cloud Docker。浏览器暂停/恢复截图保留于该工作树
`frontend/test-results/portal-workspace-path-comm-3acbb-and-trial-CTAs-and-recovers/`。
已人工查看恢复截图，三个入口显示正常；没有将 mock 界面称为真实支付验收。

首次新增测试因错误导入不存在的 `portal_bearer` 模块失败；确认异常定义实际在
`app.api.auth` 后修正，聚焦测试和最终门禁通过。未修改支付业务以迁就测试。
文档检查首次发现 B01 closeout 缺索引，已补链接并复验。

## 自审与证据边界

按 code-review-and-quality 检查测试、合并后 ensure 的暂停/缺省初始化/下架保留
顺序、路由鉴权与幂等重放顺序、域层防绕过、回调/退款保留、错误与前端投影。
Cloud 仍拥有账单/权益；没有迁移 WordPress 能力、审批或最终写入权，无新增基础设施。
本地组合未发现阻断问题；PostgreSQL 并发、M4 环境切换和外部交易仍未验证，
不据此宣称可直接合并或生产就绪。#1207 的全量 Admin 视觉证据属于独立分支，
本批没有挪用它，也没有把本批 6 项浏览器测试称为全量视觉验收。

M4 本次只读状态：acceptance_state=candidate，promotion_pr=none，
source_revision=`3b299634602ccbed0580eebb7c09c2f1dde8914f`，
source_branch=`codex/portal-breadcrumb-top-off-20261022`，dirty=true，dirty_paths=99，
deployed_at_utc=`2026-10-23T07:40:01Z`，Alembic=`20261017_0088 (head)`。
这属于另一未验收候选；没有覆盖、同步、重启、切环境变量或执行 migration。

- 本地：组合候选验证通过并保留交付。
- CI：本批未发起；#1205 的 CI 不作为组合证据。
- 合并：仅本地整合，未合入 GitHub master。
- M4 candidate/accepted：本批均未取得；需先明确共享通道切换。
- 生产：未修改、未部署、未开启销售、未支付/退款；人工/外部验收待完成。

## 下一步的具体验收

1. 确认将 M4 从上述 Portal 候选切到本组合候选，再执行 source sync。
   不删除其工作树或未提交源码；如果 fingerprint 要求重建，按 M4 门禁处理。
2. 运行商业聚焦测试，并单独执行 PostgreSQL 并发目标
   `tests/api/test_commercial_order_postgres.py`：仅接受显式
   `NPCINK_TEST_DISPOSABLE_POSTGRES_URL` 和 Docker `postgres` 主机，创建随机 schema，
   12 个并发请求应仅 3 个通过、9 个限流；另一账户独立，窗口过后恢复，结束删除
   本测试 schema。常规本地/CI 缺少该 opt-in 时跳过，不连接操作者数据库。
3. 在 M4 对 API 实际重建并切换紧急停止，核对套餐/积分包/试用、历史读取、已有订单
   结算与退款；停止恢复后核对下架状态未变。不修改真实 Provider 配置，不触发模型调用。
4. 另行确认真实交易环境与授权。建议用专用账户按正常现价购买 Plus 一笔 CNY 15，
   经支付宝真实通知结算后全额退 CNY 15；保留订单/事件标识与脱敏状态证据，核对
   重复通知不重复到账、订阅退出与退款到账。试用账户没有付款，不能拿其试用记录退款。
   积分包真实验收若需要，另列现有最小包 CNY 99，不暗改价格制造 CNY 0.01 订单。
5. 完成对应验收后再进入 PR/合并；生产 promotion、配置与部署各按明确授权执行。

无 schema 迁移；源码回退按两批精确提交处理。旧版本可能重新激活已下架报价，
回退前先确认实际销售状态与是否需要保持紧急停止。环境开关回退不能替代源码
版本核验；解除停止不能用 SQL 全量 ACTIVE。

工作树由 A02 接手保留，维持锁定；交付尚未合并，不能清理。

M4_OBSERVATION_RECEIPT date=2026-10-23; route=existing-preview-status-and-loopback; sync=not occurred; focused=not occurred; promotion=not occurred; operations=0 sync/0 deploy; stable_502=not measured; m4_only=not measured; coordination=other dirty Portal candidate retained
