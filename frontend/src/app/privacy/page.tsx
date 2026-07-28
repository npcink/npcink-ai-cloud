'use client';

import { DocumentSection, PublicDocument } from '@/components/public/PublicDocument';
import { PublicComplianceDetails } from '@/components/public/PublicComplianceDetails';
import { useLocale } from '@/contexts/LocaleContext';

export default function PrivacyPage() {
  const { locale } = useLocale();
  const zh = locale === 'zh-CN';

  if (!zh) {
    return (
      <PublicDocument eyebrow="Legal" title="Privacy Policy" summary="How Npcink AI Cloud handles information used to provide the public website, Portal, and QQ login.">
        <DocumentSection title="Information we process">
          <p>We process account identifiers, email addresses you provide, connected-site records, service usage, support records, and security logs needed to operate the service.</p>
          <p>When you use QQ login, we receive the QQ account identifier required for authentication and may receive public profile information such as nickname and avatar. We do not store your QQ access token as an account credential.</p>
        </DocumentSection>
        <DocumentSection title="Why we use it">
          <p>We use this information to authenticate you, create or maintain your Free account, provide hosted runtime and usage records, prevent abuse, diagnose service issues, and respond to support requests.</p>
        </DocumentSection>
        <DocumentSection title="Storage and sharing">
          <p>We retain information only as needed for service operation, security, accounting, dispute handling, and legal obligations. Retention periods vary by record type; payment, security, and audit evidence may need to remain after account closure.</p>
          <p>We do not sell personal information. Authentication, email delivery, payment, infrastructure, and model providers receive only the information needed to perform their contracted function.</p>
        </DocumentSection>
        <DocumentSection title="Security and cross-service processing">
          <p>We use access controls, scoped credentials, transport security, and operational logging to protect service data. No internet service can guarantee absolute security.</p>
          <p>When a requested AI operation uses a model provider, the content and instructions needed for that operation may be sent to the selected provider. The connected WordPress site remains responsible for deciding what content to submit.</p>
        </DocumentSection>
        <DocumentSection title="Your choices">
          <p>You can unbind QQ login in the Portal account page. For access, correction, account closure, deletion, or other privacy requests, sign in and submit a ticket. We may verify identity and retain records that must be kept for security, payment, dispute, or legal reasons.</p>
        </DocumentSection>
        <PublicComplianceDetails surface="privacy" />
      </PublicDocument>
    );
  }

  return (
    <PublicDocument eyebrow="法律说明" title="隐私政策" summary="说明 Npcink AI Cloud 在提供官网、服务中心与 QQ 登录时如何处理信息。">
      <DocumentSection title="我们处理的信息">
        <p>我们会处理提供服务所需的账号标识、您主动提供的邮箱、已连接站点记录、服务用量、支持记录及安全日志。</p>
        <p>当您使用 QQ 登录时，我们会接收完成身份认证所需的 QQ 账号标识，也可能接收昵称、头像等公开资料。QQ access token 不会作为账号凭据长期保存。</p>
      </DocumentSection>
      <DocumentSection title="使用目的">
        <p>这些信息用于完成身份认证、创建或维护 Free 账号、提供托管运行与用量记录、防止滥用、诊断服务问题，以及处理支持请求。</p>
      </DocumentSection>
      <DocumentSection title="保存与共享">
        <p>我们只在服务运营、安全、账务、争议处理与法定义务所需的期限内保存信息。不同记录的期限可能不同；账号关闭后，支付、安全和审计证据仍可能依法或为处理争议继续保存。</p>
        <p>我们不出售个人信息。身份认证、邮件发送、支付、基础设施和模型服务提供方，仅在履行其受托功能所必需的范围内处理数据。</p>
      </DocumentSection>
      <DocumentSection title="安全与跨服务处理">
        <p>我们通过访问控制、限定范围的凭据、传输安全与运营日志保护服务数据，但任何互联网服务都无法保证绝对安全。</p>
        <p>当您发起的 AI 操作需要使用模型提供方时，完成该次操作所需的内容与指令可能会发送给所选提供方。连接的 WordPress 站点仍负责决定提交哪些内容。</p>
      </DocumentSection>
      <DocumentSection title="您的选择">
        <p>您可以在服务中心的账号页面解除 QQ 登录绑定。如需访问、更正、关闭账号、删除信息或提出其他隐私请求，请登录后提交工单。我们可能需要验证身份，并保留因安全、支付、争议或法定义务必须继续保存的记录。</p>
      </DocumentSection>
      <PublicComplianceDetails surface="privacy" />
    </PublicDocument>
  );
}
