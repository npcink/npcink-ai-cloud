# 套餐草稿与原操作证据：1B 本地交付 — 2026-11-02

范围是 B5-02 套餐编辑、B5-03、B5-04、B5-05 套餐目录。
既有价格／资格／默认额度、账务／订阅、版本移动、Plan→Version→Offer CAS锁序和
metadata epoch均保持；未操作客户数据、Provider、PR/push、CI、M4或生产。

分支 `codex/admin-plan-evidence-drafts`，从最新 master
`42fef5409423fb6dc403b1ebfd3304feda5dbd28` 起步。
前组 1A PR#1346 已集成并 M4 accepted，真实PG10/10与浏览器3/3不再pending；
这些验收不计入本组。当前契约见
[原操作证据与草稿](../../../admin-plan-parameter-evidence-drafts-v1.md)，
[逐项信息层级处置](../../../admin-information-hierarchy-implementation-ledger.md)。

## 实现与边界

提交前保存原key／Plan／Version／revision／九字段快照；未知状态常显并冻结，
关闭／重开／刷新恢复。普通草稿有离开保护，不能用放弃草稿清除已发送意图。
缺失／歧义／旧或错证据均不释放未知意图，不重发PATCH。
确认GET严格绑定同actor／key／route／action／Plan／Version的单一成功审计及当前规范值。
授权成功读链仅SELECT且测试禁止commit；原401/403拒绝安全审计保持。
确认后仅更新本地投影，无普通detail/catalog/accounts/sites/ledger重型refetch。
共享receipt增加可选摘要，实际event_kind仍保留，draft更新不冒称已发布。
坏目录和合法空分开，坏背景读保留最后成功数据／时间，恢复操作在坏目录仍可进入。

## 本地验证与证据

原始证据根（开发者本机）：
`/Users/muze/.codex/visualizations/2026/11/02/01a1929f-2271-7550-b73e-07abd2a0a629/admin-plan-evidence-drafts/`。
`local-ready.md`、`source-manifest.json`、`artifact-manifest.json`及
`validation-receipt.json`保存最终源码身份、命令argv／cwd／退出码、覆盖矩阵和SHA256。
每个命令的原始全文在同名log，不能把多次重叠运行相加为用例数。

- `backend-final`: API及SQLite/CAS 31项通过。包括真实签名Admin cookie／内部token的授权读、同值无证据、19种证据／当前值损坏；现有10项CAS/API回归保留。
- `frontend-unit-final`: 投影／原意图／回执及代理能力共19项通过。
- Python ruff／mypy、前端类型／窄lint、i18n1891键、`check:admin-ui`及文档门禁均独立记录。
- PC真实Chromium＋模拟API，宽1440／1056明色与1440暗色；断线前后、真实12秒超时、replay／408／409／500、坏PATCH／确认、同值无审计、存储写／删失败、刷新恢复、目标／迟到隔离、普通草稿导航与目录坏读／合法空均覆盖。`browser-closeout` 单次33项通过（25项本批行为、1项既有销售读保护、3项CAS、4项目录／维护回归），没有把重叠运行相加。排除的旧目录首项含移动端验收，PC焦点／刷新由本批定向覆盖。
- `screenshots/pc-*-{unknown,restored,confirmed}*.png`、`discard-dialog`、`catalog-stale`及`concurrency-screenshots/`保留。本轮代理已目检明暗、窄PC和恢复入口；无golden更新、移动端／平板或全后台视觉复验。

## 失败与纠正

初期类型、lint的React ref写入位置和测试import排序问题已修正，原日志保留。
`browser-1`退出130：5通过／7失败／1中断／3未跑，因已知错误测试导航／定位主动中止；
raw history.replaceState未通知Next对象切换，改用真实受保护链接；alert避开Next announcer，空态使用实际文案。
`browser-2`为18通过／1失败：取消beforeunload后Playwright reload等待超时；改成真实dialog取消及有界reload等待，草稿仍保留。
`browser-3`27通过。自查发现临时工作台提取误删高级维护区，已从HEAD原样恢复；
`admin-gate`另发现静态PATCH断言仍指向旧组件，更新为实际hook而非删除断言，`admin-gate-2`通过。
`browser-final`30通过／1失败：旧目录测试把空PATCH body当“写入已成功”，与本批修复目标矛盾；改为断言始终待确认、GET失败／unconfirmed不释放且只一次PATCH。
上述运行都保留其原状态，不能改写成一次全绿。随后补测当前draft成功更新不宣称publication。最终自查恢复了提取状态时遗漏的既有销售成功后read gate：详情失败仍冻结参数，成功读取才解除；`browser-closeout`追加此回归并33项通过，窄lint与typecheck再次通过。

## 独立状态与下一步

Local-ready仅表示本地实现与证据可审核。1B CI、M4 candidate、M4 accepted、合并、
人工产品／视觉接受、production均未执行。真实PostgreSQL读语义／候选部署由integrator
在准入后决定；本组无新迁移，SQLite只证明本地行为，不替代PG或生产。
自动plan将shared receipt命中L2宽泛建议；按PC选择规范§2／4，本次可选summary只有套餐调用，所有其他调用保留默认摘要，未改共享几何／焦点／主题，因此本地选择套餐明暗＋窄PC及33项相关行为、check:admin-ui，未运行跨页面visual矩阵。它仍是L2，强制CI与集成门禁不减免。

回滚可撤回本组提交；新增审计payload为兼容性字段，无历史回填，旧记录不会作为本次成功证明。
未知操作若无唯一持久证据，仍保留待确认；跨设备恢复及人工裁决界面不在本组范围。
交付后冻结，等待原集成会话独立审核；不用生产或付费调用制造证据。
