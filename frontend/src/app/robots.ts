import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.CLOUD_PUBLIC_BASE_URL || 'https://cloud.npc.ink').replace(/\/+$/, '');
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/status', '/help', '/privacy', '/terms', '/portal/login', '/portal/register'],
        disallow: ['/admin/', '/portal/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
