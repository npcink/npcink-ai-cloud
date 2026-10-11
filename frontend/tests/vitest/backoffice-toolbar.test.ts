import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BackofficePageHeader } from '@/components/backoffice/BackofficeScaffold';
import { LocaleProvider } from '@/contexts/LocaleContext';

describe('shared page header toolbar', () => {
  it.each(['default', 'compact'] as const)('renders toolbar-only controls in %s density', density => {
    const html = renderToStaticMarkup(createElement(LocaleProvider, null, createElement(BackofficePageHeader, {
      title: 'Runtime diagnostics', density,
      toolbarControls: createElement('button', null, 'Window filter'),
    })));
    expect(html).toContain('Window filter');
  });
});
