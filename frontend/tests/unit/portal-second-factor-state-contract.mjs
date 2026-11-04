import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const sessionSource = readFileSync(resolve(process.cwd(), 'src/hooks/useSession.ts'), 'utf8');
const clientSource = readFileSync(resolve(process.cwd(), 'src/lib/portal-client.ts'), 'utf8');
const wireSource = readFileSync(resolve(process.cwd(), 'src/lib/portal-auth-wire.ts'), 'utf8');
const pageSource = readFileSync(resolve(process.cwd(), 'src/app/portal/second-factor/page.tsx'), 'utf8');

assert.match(
  clientSource,
  /PORTAL_SECOND_FACTOR_STATUS_PATH[\s\S]*getSecondFactorStatus\(\): Promise<PortalEnvelope<unknown>>[\s\S]*return this\.request\('GET', PORTAL_SECOND_FACTOR_STATUS_PATH/,
  'the client must expose the cookie-bound challenge status bootstrap'
);
assert.match(
  sessionSource,
  /portalClient\.getSecondFactorStatus\(\)[\s\S]*const status = parsePortalSecondFactorStatus\(statusResponse\.data\)[\s\S]*challenge = status\.challenge/,
  'session discovery must recover challenge metadata after a full document navigation'
);
assert.match(
  sessionSource,
  /parsePortalSecondFactorFailure\(error\)[\s\S]*failure\.disposition === 'terminal'[\s\S]*secondFactor: null/,
  'terminal factor failures must clear the stale challenge state'
);
assert.match(
  sessionSource,
  /failure\.disposition === 'retryable' && failure\.challenge[\s\S]*secondFactor: failure\.challenge/,
  'retryable factor failures may refresh metadata without blocking another attempt'
);
assert.match(
  sessionSource,
  /challengeResolution === 'terminal' \? null : previous\.secondFactor/,
  'an uncertain status/network failure must preserve an existing cookie-bound challenge'
);
assert.match(
  sessionSource,
  /secondFactorResolution: challengeResolution === 'terminal'[\s\S]*challengeResolution \?\? previous\.secondFactorResolution/,
  'session state must preserve the difference between terminal and uncertain challenge status'
);
assert.match(
  sessionSource,
  /status\.challenge_status === 'expired'[\s\S]*challengeResolution = 'terminal'[\s\S]*challengeResolution = 'unknown'/,
  'an incomplete successful status projection must remain unknown unless a terminal status is explicit'
);
assert.match(
  sessionSource,
  /const transportFailure = error instanceof ApiError[\s\S]*const shouldBootstrapChallenge = sessionInvalid[\s\S]*transportFailure && !currentSessionRef\.current[\s\S]*getSecondFactorStatus\(\)/,
  'an initial transport or 5xx failure must bootstrap status only when no full session is retained'
);
assert.match(
  sessionSource,
  /currentSessionRef\.current = previous\.session[\s\S]*currentSessionRef\.current = null/,
  'ordinary refresh failures with an existing session must not be treated as challenge bootstrap failures'
);
assert.match(
  wireSource,
  /auth\.portal_factor_invalid[\s\S]*disposition: 'terminal'/,
  'factor-invalid without lifecycle metadata must fail closed as terminal'
);
assert.match(
  pageSource,
  /if \(!secondFactor\)[\s\S]*second_factor_unavailable_title[\s\S]*portal\/login/,
  'the challenge page must stop submission and offer a fresh primary sign-in when metadata is unavailable'
);
assert.match(
  pageSource,
  /secondFactorResolution === 'unknown'[\s\S]*second_factor_status_unknown[\s\S]*refresh/,
  'an uncertain bootstrap must show an explicit unknown-state retry instead of an expired message'
);
assert.match(
  pageSource,
  /parsePortalSecondFactorFailure\(verificationError\)[\s\S]*second_factor_result_unknown/,
  'an uncertain completion must explain that acceptance or consumption is unconfirmed'
);
assert.doesNotMatch(
  `${sessionSource}\n${clientSource}\n${wireSource}\n${pageSource}`,
  /challenge_(?:secret|token)|mfa_ok/,
  'challenge credentials must stay out of the frontend wire and UI'
);

console.log('portal_second_factor_state_contract: ok');
