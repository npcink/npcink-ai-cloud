import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const component = readFileSync(
  resolve(process.cwd(), 'src/components/public/PublicComplianceDetails.tsx'),
  'utf8'
);
const privacy = readFileSync(resolve(process.cwd(), 'src/app/privacy/page.tsx'), 'utf8');
const terms = readFileSync(resolve(process.cwd(), 'src/app/terms/page.tsx'), 'utf8');
const help = readFileSync(resolve(process.cwd(), 'src/app/help/page.tsx'), 'utf8');

assert.match(
  component,
  /fetch\('\/open\/compliance',[\s\S]*?cache: 'no-store'/,
  'public compliance details must read the anonymous no-store projection'
);

assert.match(
  component,
  /if \(!compliance\?\.published\) return null/,
  'draft or unavailable compliance data must not replace maintained public copy'
);

assert.doesNotMatch(
  component,
  /draft|validation|review_note|credential/,
  'public compliance rendering must not consume internal draft, validation, or credential fields'
);

assert.match(privacy, /<PublicComplianceDetails surface="privacy" \/>/);
assert.match(terms, /<PublicComplianceDetails surface="terms" \/>/);
assert.match(help, /<PublicComplianceDetails surface="help" \/>/);

