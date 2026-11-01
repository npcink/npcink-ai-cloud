# 客户证据与普通草稿本地交付记录（2026-11-01）

## 范围

本地分支 `codex/admin-account-evidence-drafts` 从 `190d2e2ea0f99ae1317f67286075056863858e5d` 开始，执行“系统检查管理后台问题”派单中的 B4-06–10：

- 客户运营资料与站点 datetime-local 普通草稿使用共享导航保护；既有 pending intent 恢复协议保持独立。
- 关联站点、配额和流水投影严格校验。坏证据在所属页面局部显示不可用并提供有界 Retry，客户主资料及其他可用证据继续展示。
- 站点覆盖、配额摘要、流水计数等结论在证据不可用时显示 Unknown，避免把坏读取降格为 0 或绿色状态。
- 更新中英文文案、E2E 夹具、静态契约和信息层级台账。

不包含生产部署、PR、合并、M4、真实客户写入、支付或 Provider 调用，也不改变账务规则、站点生命周期、商业资格或 B4-01/02 的待确认写入协议。

## 验证

通过的本地门禁：

```text
pnpm --dir frontend run type-check
定向 ESLint（客户详情、站点详情、证据/投影/草稿模块、i18n、E2E/unit/fixture）
node frontend/tests/vitest/admin-account-evidence-drafts.test.ts  （由 Vitest 运行，3 tests passed）
node frontend/tests/unit/admin-account-detail-v2-contract.mjs
pnpm --dir frontend run test:e2e -- tests/e2e/admin-account-evidence-drafts.spec.ts
pnpm --dir frontend run test:e2e -- tests/e2e/admin-account-evidence-drafts.spec.ts tests/e2e/admin-customer-detail-v2.spec.ts tests/e2e/admin-account-site-runtime.spec.ts tests/e2e/admin-site-detail-pc-v2.spec.ts
git diff --check
```

新增 E2E 5 项通过；与相关既有 spec 合计 18 项通过。临时截图 spec 另以隔离夹具运行 5 项，生成 1440×900 与 1056×900 PC 截图后删除，不进入源码。

截图证据：`admin-account-evidence-drafts/screenshots/`，覆盖站点证据不可用、配额不可用但客户壳层保留、流水 drawer 局部不可用、客户普通草稿离开确认和站点普通草稿离开确认。未更新 golden，未做移动端适配承诺。

## 失败纠正与限制

- 类型检查会改写 `frontend/next-env.d.ts`；该生成噪音已恢复，不纳入交付。
- 静态契约首轮对站点 pending 状态命名假设过严，已改为验证实际 `intent` 与 `inputDirty` 分离并重新通过。
- 故障态由浏览器 API 夹具注入，证明局部降级和 GET 恢复路径，不证明生产故障频率。
- 本地、CI、M4 candidate、merged、M4 accepted、production 和人工视觉验收分别管理；本记录只声明本地证据。

## 回滚与交接

回滚为恢复本分支提交前的工作树或反向应用本提交；不触碰共享远端。交付时工作树应为 clean，集成会话可从本分支提交 cherry-pick 或按约定合并到其集成分支。未执行 push、PR、merge、M4 或 production。
