import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const supportPageSource = readFileSync(
  resolve(__dirname, '../../src/app/portal/support/page.tsx'),
  'utf8'
);

describe('Portal support PC tickets table width', () => {
  it('keeps the quieter table floor and title/site cell caps', () => {
    expect(supportPageSource).toMatch(
      /data-portal-support="tickets-table"[\s\S]*min-w-\[720px\]/
    );
    expect(supportPageSource).not.toMatch(/min-w-\[980px\]/);
    expect(supportPageSource).toMatch(/max-w-\[16rem\][\s\S]*max-w-\[10rem\]/);
    expect(supportPageSource).not.toMatch(/max-w-\[26rem\]|max-w-\[14rem\]/);
  });
});
