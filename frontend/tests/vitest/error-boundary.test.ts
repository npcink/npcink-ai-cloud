import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LocaleContext } from '@/contexts/LocaleContext';
import { translate } from '@/lib/i18n';

describe('error boundary presentation', () => {
  it('shows translated recovery copy while retaining the captured error', () => {
    const error = new Error('Cannot read properties of undefined');
    const boundary = new ErrorBoundary({ children: null });
    const context = {
      locale: 'zh-CN' as const,
      mounted: true,
      setLocale: () => {},
      t: (key: string, params?: Record<string, string>, fallback?: string) => translate('zh-CN', key, params, fallback),
    };
    boundary.context = context;
    boundary.state = ErrorBoundary.getDerivedStateFromError(error);
    const html = renderToStaticMarkup(React.createElement(LocaleContext.Provider, { value: context }, boundary.render()));
    expect(html).toContain(translate('zh-CN', 'error.unexpected'));
    expect(html).toContain(translate('zh-CN', 'common.retry'));
    expect(html).not.toContain(error.message);
    expect(boundary.state.error).toBe(error);
  });
});
