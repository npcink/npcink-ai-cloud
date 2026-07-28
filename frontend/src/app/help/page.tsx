'use client';

import Link from 'next/link';
import { DocumentSection, PublicDocument } from '@/components/public/PublicDocument';
import { PublicComplianceDetails } from '@/components/public/PublicComplianceDetails';
import { useLocale } from '@/contexts/LocaleContext';

export default function HelpPage() {
  const { locale } = useLocale();
  const zh = locale === 'zh-CN';

  return (
    <PublicDocument
      eyebrow={zh ? '使用帮助' : 'Help'}
      title={zh ? '从这里开始' : 'Start here'}
      summary={zh ? '登录、连接 WordPress 站点，以及遇到异常时的最短路径。' : 'The shortest path for signing in, connecting WordPress, and handling service issues.'}
    >
      <DocumentSection title={zh ? '1. 登录服务中心' : '1. Sign in to the Portal'}>
        <p>{zh ? '使用 QQ 可直接登录，邮箱用户也可以继续使用验证码。首次验证只创建账号；WordPress Addon 完成可信连接后，才会激活账户的 Free 服务。' : 'Use QQ to sign in directly, or keep using an email code. First-time verification creates the account only; Free service activates after the WordPress Addon completes a verified connection.'}</p>
        <Link href="/portal/login" className="inline-flex font-bold text-[#2357ff] hover:underline">{zh ? '前往登录 →' : 'Go to sign in →'}</Link>
      </DocumentSection>
      <DocumentSection title={zh ? '2. 连接 WordPress' : '2. Connect WordPress'}>
        <p>{zh ? '在兼容的 WordPress 插件中发起连接，选择当前 Cloud 账号后返回站点完成确认。Cloud 不会替代 WordPress 的本地设置、能力或发布控制。' : 'Start the connection from a compatible WordPress plugin, select your Cloud account, then return to the site to confirm. Cloud does not replace local WordPress settings, abilities, or publishing control.'}</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>{zh ? '确认 WordPress 站点可以使用 HTTPS 访问，并已安装兼容的 Npcink Cloud 插件。' : 'Confirm that the WordPress site is reachable over HTTPS and has a compatible Npcink Cloud plugin installed.'}</li>
          <li>{zh ? '从插件发起连接，不要手工复制 Cloud 内部密钥或回调参数。' : 'Start the connection from the plugin; do not manually copy Cloud internal keys or callback parameters.'}</li>
          <li>{zh ? '连接完成后，在服务中心选择站点并确认状态为“正常”。' : 'After connecting, select the site in the Portal and confirm that its status is operational.'}</li>
          <li>{zh ? 'Free 服务和额度属于所选账户，不属于站点；更换到其他账户时必须遵守 Cloud 显示的站点移除与冷却要求。' : 'Free service and credits belong to the selected account, not the site. Moving a site to another account must follow the removal and cooldown requirements shown by Cloud.'}</li>
        </ul>
      </DocumentSection>
      <DocumentSection title={zh ? '3. 检查服务状态' : '3. Check service status'}>
        <p>{zh ? '如果登录页或公开入口无法访问，先查看服务状态页。站点专属的运行记录和诊断只在登录后的服务中心展示。' : 'If the login or public entry is unavailable, check the service status page first. Site-specific runtime records and diagnostics appear only in the authenticated Portal.'}</p>
        <Link href="/status" className="inline-flex font-bold text-[#2357ff] hover:underline">{zh ? '查看服务状态 →' : 'View service status →'}</Link>
      </DocumentSection>
      <DocumentSection title={zh ? '4. 获取支持' : '4. Get support'}>
        <p>{zh ? '登录后从服务记录或支持入口提交问题，并附上站点名称、发生时间和可复现步骤。请勿提交密码、密钥或完整访问令牌。' : 'After signing in, submit a request from the service records or support area with the site name, time, and reproduction steps. Do not include passwords, keys, or full access tokens.'}</p>
        <Link href="/portal/support?new=1" className="inline-flex font-bold text-[#2357ff] hover:underline">{zh ? '提交工单 →' : 'Submit a ticket →'}</Link>
      </DocumentSection>
      <DocumentSection title={zh ? '常见问题' : 'Frequently asked questions'}>
        <div>
          <h3 className="font-bold text-slate-950 dark:text-white">{zh ? '收不到邮箱验证码怎么办？' : 'What if the email code does not arrive?'}</h3>
          <p>{zh ? '先确认邮箱拼写并检查垃圾邮件；等待一分钟后再重发。开发环境如果未配置邮件，会明确显示配置错误，不代表账号密码错误。' : 'Confirm the address, check spam, and resend after one minute. A development environment without email delivery reports a configuration error; it does not mean the account password is wrong.'}</p>
        </div>
        <div>
          <h3 className="font-bold text-slate-950 dark:text-white">{zh ? '为什么套餐页要求先选择站点？' : 'Why does the package page ask for a site?'}</h3>
          <p>{zh ? '服务中心用当前站点确认您对所属账号的权限。只有一个正常站点时会自动选择；多个站点时请先选择当前站点。' : 'The Portal uses the current site to verify access to its account. A sole active site is selected automatically; with multiple sites, choose the current site first.'}</p>
        </div>
        <div>
          <h3 className="font-bold text-slate-950 dark:text-white">{zh ? 'QQ 登录后会接管 WordPress 吗？' : 'Does QQ login take over WordPress?'}</h3>
          <p>{zh ? '不会。QQ 仅用于 Cloud 服务中心身份认证；WordPress 内容、配置、最终确认与发布仍留在站点。' : 'No. QQ is only an identity method for the Cloud Portal. WordPress content, settings, final approval, and publishing remain in the site.'}</p>
        </div>
        <div>
          <h3 className="font-bold text-slate-950 dark:text-white">{zh ? '可以把站点连接到另一个账户吗？' : 'Can I connect a site to another account?'}</h3>
          <p>{zh ? '可以，但必须先由原账户在 Cloud 中移除站点。同一账户可以随时重新连接；其他账户只能在站点显示的冷却期结束后、且跨账户重连开放时，通过已验证的 Addon 完成连接。冷却结束后由系统在新的可信连接中自动校验，无需单独提交人工审核；具体可连接时间以 Cloud 页面显示为准。套餐和额度不会随站点转移。' : 'Yes, but the previous account must remove the site in Cloud first. The same account may reconnect at any time; another account can connect through a verified Addon only after the site cooldown ends and cross-account relinking is available. Cloud checks the new verified connection automatically after the cooldown, so no separate manual review request is required; use the availability time shown by Cloud. Plans and credits do not move with the site.'}</p>
        </div>
      </DocumentSection>
      <PublicComplianceDetails surface="help" />
    </PublicDocument>
  );
}
