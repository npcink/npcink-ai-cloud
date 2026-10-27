import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ModelTestOutput } from '@/features/admin/ai-resources/ModelTestOutput';

describe('bounded model output Markdown', () => {
  it('renders emphasis, lists, code and GFM tables', () => {
    const html = renderToStaticMarkup(<ModelTestOutput>{'**Strong**\n\n- One\n- Two\n\n```js\nconst x = 1;\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |'}</ModelTestOutput>);
    expect(html).toContain('<strong>Strong</strong>');
    expect(html).toContain('<li>One</li>');
    expect(html).toContain('<pre><code');
    expect(html).toContain('<table>');
  });
  it('never executes HTML, loads images or makes unsafe links clickable', () => {
    const html = renderToStaticMarkup(<ModelTestOutput>{'<script>alert(1)</script>\n\n<img src="https://tracker.invalid/pixel">\n\n![tracker](https://tracker.invalid/pixel)\n\n[unsafe](javascript:alert%281%29)\n\n[relative](/api/admin/logout)\n\n[safe](https://example.com)'}</ModelTestOutput>);
    expect(html).not.toMatch(/<script|<img|javascript:|href="\/api/i);
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('<span>unsafe</span>');
  });
});
