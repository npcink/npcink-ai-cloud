'use client';

import { DocumentSection, PublicDocument } from '@/components/public/PublicDocument';
import { useLocale } from '@/contexts/LocaleContext';

export default function TermsPage() {
  const { locale } = useLocale();
  const zh = locale === 'zh-CN';

  return (
    <PublicDocument
      eyebrow={zh ? '法律说明' : 'Legal'}
      title={zh ? '服务条款' : 'Terms of Service'}
      summary={zh ? '使用 Npcink AI Cloud 公共网站、服务中心与托管运行服务时适用的基本规则。' : 'Basic rules for the Npcink AI Cloud public website, Portal, and hosted runtime service.'}
    >
      <DocumentSection title={zh ? '服务范围' : 'Service scope'}>
        <p>{zh ? 'Cloud 提供托管 AI 运行、提供方适配、用量与套餐记录、站点连接详情和服务诊断。WordPress 站点仍负责本地内容、配置、最终确认和发布。' : 'Cloud provides hosted AI execution, provider adapters, usage and plan records, site-connection detail, and service diagnostics. WordPress remains responsible for local content, configuration, final approval, and publishing.'}</p>
      </DocumentSection>
      <DocumentSection title={zh ? '账号与安全' : 'Accounts and security'}>
        <p>{zh ? '您应妥善保护登录设备和已连接站点。不得绕过访问控制、干扰服务、批量滥用资源，或利用服务处理违法、有害或侵犯他人权益的内容。' : 'You must protect your login devices and connected sites. Do not bypass access controls, disrupt the service, abuse resources at scale, or use the service for unlawful, harmful, or infringing content.'}</p>
      </DocumentSection>
      <DocumentSection title={zh ? 'AI 输出' : 'AI output'}>
        <p>{zh ? 'AI 输出可能不准确或不完整。您应在使用或发布前进行人工审查，并对最终内容和使用方式负责。' : 'AI output may be inaccurate or incomplete. You must review it before use or publication and remain responsible for the final content and how it is used.'}</p>
      </DocumentSection>
      <DocumentSection title={zh ? '套餐、支付与退款' : 'Plans, payment, and refunds'}>
        <p>{zh ? '当前已发布套餐页和付款确认页展示的价格、周期与权益为该次购买依据。付款订单会保存金额与目标套餐快照；历史订单不会因后续调价而改写。' : 'The current published plan page and payment confirmation show the price, period, and rights that govern that purchase. Payment orders retain an amount and target-plan snapshot; later price changes do not rewrite historical orders.'}</p>
        <p>{zh ? '除付款页明确说明外，套餐不会被视为已自动续费。退款、撤销或支付争议按照付款时展示的规则、适用法律及实际服务使用情况处理；请通过登录后的工单提交订单号。' : 'Unless the checkout clearly states otherwise, a plan is not treated as automatically renewed. Refunds, cancellations, and payment disputes are handled under the rules shown at payment, applicable law, and actual service use; submit the order number in an authenticated ticket.'}</p>
      </DocumentSection>
      <DocumentSection title={zh ? '暂停与账号关闭' : 'Suspension and account closure'}>
        <p>{zh ? '为保护账号、站点或服务安全，我们可能限制异常访问或滥用行为。您可以通过工单申请关闭账号；因支付、安全、争议处理或法定义务必须保留的记录可能不会立即删除。' : 'We may limit anomalous access or abuse to protect accounts, sites, and the service. You can request account closure by ticket; records required for payment, security, dispute handling, or legal obligations may not be deleted immediately.'}</p>
      </DocumentSection>
      <DocumentSection title={zh ? '变更与中断' : 'Changes and interruptions'}>
        <p>{zh ? '我们可能为安全、维护或产品改进调整服务。计划性变更会尽量提前说明；紧急安全处置可能立即执行。' : 'We may adjust the service for security, maintenance, or product improvement. Planned changes will be announced where practical; urgent security measures may take effect immediately.'}</p>
      </DocumentSection>
    </PublicDocument>
  );
}
