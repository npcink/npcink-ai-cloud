'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { DocumentSection } from '@/components/public/PublicDocument';

type PublicCompliancePayload = {
  brand_name: string;
  operator: {
    entity_name: string;
    entity_type: string;
    public_name: string;
    registration_or_filing: string;
    service_region: string;
  };
  contact: {
    support_email: string;
    support_channel: string;
    service_hours: string;
  };
  refund: {
    auto_renewal: boolean;
    refund_window_days: number;
    processing_business_days: number;
    refund_channel: string;
    request_path: string;
    conditions: string;
  };
  retention: Array<{
    record_id: string;
    label: string;
    public_description: string;
  }>;
  third_parties: Array<{
    service_id: string;
    service_name: string;
    operator_name: string;
    category: string;
    purpose: string;
    data_categories: string;
    privacy_url: string;
    processing_region: string;
  }>;
};

type PublicCompliance = {
  published: boolean;
  version_id: string;
  effective_at: string;
  payload: PublicCompliancePayload;
};

type PublicComplianceEnvelope = {
  data?: PublicCompliance;
};

export function PublicComplianceDetails({
  surface,
}: {
  surface: 'privacy' | 'terms' | 'help';
}) {
  const { locale } = useLocale();
  const zh = locale === 'zh-CN';
  const [compliance, setCompliance] = useState<PublicCompliance | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/open/compliance', {
      cache: 'no-store',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as PublicComplianceEnvelope;
      })
      .then((envelope) => {
        if (envelope?.data?.published) {
          setCompliance(envelope.data);
        }
      })
      .catch(() => {
        // The maintained baseline copy remains usable when the projection is unavailable.
      });
    return () => controller.abort();
  }, []);

  if (!compliance?.published) return null;
  const { payload } = compliance;

  if (surface === 'help') {
    return (
      <DocumentSection title={zh ? '运营主体与联系方式' : 'Operator and contact'}>
        <OperatorSummary payload={payload} zh={zh} />
        <ContactSummary payload={payload} zh={zh} />
      </DocumentSection>
    );
  }

  if (surface === 'terms') {
    const refund = payload.refund;
    return (
      <>
        <DocumentSection title={zh ? '已发布的退款说明' : 'Published refund policy'}>
          <p>
            {zh
              ? `当前退款申请窗口为 ${refund.refund_window_days} 天，提交后预计在 ${refund.processing_business_days} 个工作日内处理。${refund.auto_renewal ? '当前套餐包含自动续费。' : '当前套餐不自动续费。'}`
              : `The current refund request window is ${refund.refund_window_days} days, with processing expected within ${refund.processing_business_days} business days. ${refund.auto_renewal ? 'Current plans auto-renew.' : 'Current plans do not auto-renew.'}`}
          </p>
          <p>
            {zh
              ? `申请方式：${refund.request_path}；退款渠道：${refund.refund_channel}。`
              : `Request path: ${refund.request_path}. Refund channel: ${refund.refund_channel}.`}
          </p>
          {refund.conditions ? <p>{refund.conditions}</p> : null}
        </DocumentSection>
        <DocumentSection title={zh ? '运营主体' : 'Operator'}>
          <OperatorSummary payload={payload} zh={zh} />
          <ContactSummary payload={payload} zh={zh} />
        </DocumentSection>
      </>
    );
  }

  return (
    <>
      <DocumentSection title={zh ? '运营主体与联系渠道' : 'Operator and contact'}>
        <OperatorSummary payload={payload} zh={zh} />
        <ContactSummary payload={payload} zh={zh} />
      </DocumentSection>
      <DocumentSection title={zh ? '已发布的数据保留说明' : 'Published retention details'}>
        <ul className="list-disc space-y-2 pl-5">
          {payload.retention.map((item) => (
            <li key={item.record_id}>
              <strong>{item.label}：</strong>
              {item.public_description}
            </li>
          ))}
        </ul>
      </DocumentSection>
      {payload.third_parties.length ? (
        <DocumentSection title={zh ? '第三方服务清单' : 'Third-party services'}>
          <p>
            {zh
              ? '以下服务仅在完成相应功能所需的范围内处理信息。'
              : 'These services process information only as needed for the relevant function.'}
          </p>
          <div className="space-y-5">
            {payload.third_parties.map((item) => (
              <div key={item.service_id}>
                <h3 className="font-bold text-slate-950 dark:text-white">
                  {item.service_name}
                  {item.operator_name ? ` · ${item.operator_name}` : ''}
                </h3>
                <p>
                  {zh ? '用途' : 'Purpose'}：{item.purpose}
                </p>
                {item.data_categories ? (
                  <p>
                    {zh ? '涉及信息' : 'Data'}：{item.data_categories}
                  </p>
                ) : null}
                {item.processing_region ? (
                  <p>
                    {zh ? '处理地区' : 'Region'}：{item.processing_region}
                  </p>
                ) : null}
                {item.privacy_url ? (
                  <a
                    href={item.privacy_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-[#2357ff] hover:underline"
                  >
                    {zh ? '查看该服务的隐私政策 →' : 'View provider privacy policy →'}
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </DocumentSection>
      ) : null}
    </>
  );
}

function OperatorSummary({
  payload,
  zh,
}: {
  payload: PublicCompliancePayload;
  zh: boolean;
}) {
  const operator = payload.operator;
  return (
    <p>
      {zh ? '本服务由' : 'This service is operated by'}{' '}
      <strong>{operator.entity_name}</strong>
      {operator.entity_type ? `（${operator.entity_type}）` : ''}
      {zh ? '运营' : ''}
      {operator.service_region
        ? `${zh ? '，服务地区：' : '. Service region: '}${operator.service_region}`
        : ''}
      {operator.registration_or_filing
        ? `${zh ? '，备案或登记信息：' : '. Filing or registration: '}${operator.registration_or_filing}`
        : ''}
      。
    </p>
  );
}

function ContactSummary({
  payload,
  zh,
}: {
  payload: PublicCompliancePayload;
  zh: boolean;
}) {
  const contact = payload.contact;
  return (
    <p>
      {contact.support_email ? (
        <>
          {zh ? '支持邮箱：' : 'Support email: '}
          <a className="font-bold text-[#2357ff] hover:underline" href={`mailto:${contact.support_email}`}>
            {contact.support_email}
          </a>
          。
        </>
      ) : null}{' '}
      {contact.support_channel
        ? `${zh ? '支持渠道：' : 'Support channel: '}${contact.support_channel}。`
        : ''}
      {contact.service_hours
        ? `${zh ? '服务时间：' : 'Service hours: '}${contact.service_hours}。`
        : ''}
    </p>
  );
}
