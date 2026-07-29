'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';

type PublicSupportContactDetails = {
  support_email?: string;
  support_channel?: string;
  service_hours?: string;
};

function readContact(value: unknown): PublicSupportContactDetails | null {
  if (!value || typeof value !== 'object') return null;

  const source = value as Record<string, unknown>;
  const contact = {
    support_email: typeof source.support_email === 'string' ? source.support_email.trim() : '',
    support_channel: typeof source.support_channel === 'string' ? source.support_channel.trim() : '',
    service_hours: typeof source.service_hours === 'string' ? source.service_hours.trim() : '',
  };
  return contact.support_email || contact.support_channel || contact.service_hours
    ? contact
    : null;
}

export function PublicSupportContact() {
  const { locale } = useLocale();
  const zh = locale === 'zh-CN';
  const [contact, setContact] = useState<PublicSupportContactDetails | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/open/compliance', {
      cache: 'no-store',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]),
      headers: { accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          data?: {
            published?: boolean;
            payload?: { contact?: unknown };
          };
        };
      })
      .then((envelope) => {
        const publishedContact = envelope?.data?.published
          ? readContact(envelope.data.payload?.contact)
          : null;
        if (publishedContact) {
          setContact(publishedContact);
        }
      })
      .catch(() => {
        // Do not replace verified public support facts with frontend defaults.
      });
    return () => controller.abort();
  }, []);

  if (!contact) return null;

  return (
    <section
      className="mt-8 border border-slate-300 bg-white px-5 py-5 dark:border-white/15 dark:bg-white/5"
      aria-labelledby="public-support-contact-title"
    >
      <h2 id="public-support-contact-title" className="text-lg font-bold">
        {zh ? '无法登录时的公开支持渠道' : 'Public support when sign-in is unavailable'}
      </h2>
      <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
        {contact.support_email ? (
          <p>
            {zh ? '支持邮箱：' : 'Support email: '}
            <a
              className="font-bold text-[#2357ff] hover:underline"
              href={`mailto:${contact.support_email}`}
            >
              {contact.support_email}
            </a>
          </p>
        ) : null}
        {contact.support_channel ? (
          <p>{zh ? '支持渠道：' : 'Support channel: '}{contact.support_channel}</p>
        ) : null}
        {contact.service_hours ? (
          <p>{zh ? '服务时间：' : 'Service hours: '}{contact.service_hours}</p>
        ) : null}
      </div>
    </section>
  );
}
