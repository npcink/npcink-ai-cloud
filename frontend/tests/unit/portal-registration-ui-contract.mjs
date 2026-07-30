import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const clientPath = resolve(process.cwd(), 'src/lib/portal-client.ts');
const proxyPath = resolve(process.cwd(), 'src/proxy.ts');
const loginPagePath = resolve(process.cwd(), 'src/app/portal/login/page.tsx');
const registerPagePath = resolve(process.cwd(), 'src/app/portal/register/page.tsx');
const authShellPath = resolve(process.cwd(), 'src/components/portal/PortalAuthShell.tsx');
const cooldownHookPath = resolve(process.cwd(), 'src/hooks/useVerificationCodeCooldown.ts');

const clientSource = readFileSync(clientPath, 'utf8');
const proxySource = readFileSync(proxyPath, 'utf8');
const loginSource = readFileSync(loginPagePath, 'utf8');
const registerSource = readFileSync(registerPagePath, 'utf8');
const authShellSource = readFileSync(authShellPath, 'utf8');
const cooldownHookSource = readFileSync(cooldownHookPath, 'utf8');

assert.match(
  clientSource,
  /PortalRegistrationCodeRequest/,
  'portal client must expose a registration code request contract'
);
assert.match(
  clientSource,
  /interface PortalRegistrationCodeRequest \{\s*email: string;\s*locale\?: 'en' \| 'zh-CN';\s*\}/,
  'portal registration request must accept identity fields only'
);
assert.doesNotMatch(
  clientSource,
  /interface PortalRegistrationCodeRequest \{[^}]*site_url|interface PortalRegistrationCodeRequest \{[^}]*site_name|interface PortalRegistrationCodeRequest \{[^}]*use_case/,
  'portal registration request must not retain site-provisioning fields'
);

assert.match(
  clientSource,
  /'\/register\/code\/request'/,
  'portal client must call the registration code request endpoint'
);

assert.match(
  clientSource,
  /'\/register\/verify'/,
  'portal client must call the registration verify endpoint'
);

assert.match(
  proxySource,
  /pathname === '\/portal\/login'[\s\S]*pathname === '\/portal\/register'[\s\S]*pathname === '\/portal\/dev-entry'/,
  'portal registration must remain a public entry page, not redirect to login'
);

assert.match(
  loginSource,
  /href="\/portal\/register"/,
  'portal login page must link new users to the registration page'
);
assert.match(
  loginSource,
  /<PortalAuthShell[\s\S]*portal\.login\.existing_label[\s\S]*href="\/portal\/register"[\s\S]*<form/,
  'portal login page must put the email form and account-registration entry in the shared authentication shell'
);
assert.doesNotMatch(
  loginSource,
  /BackofficePrimaryPanel|BackofficeLayer/,
  'portal login page must not push the real login form below large explanatory panels'
);

assert.match(
  registerSource,
  /portalClient\.requestRegistrationCode/,
  'portal registration page must request registration codes through the shared client'
);
assert.match(
  loginSource,
  /useVerificationCodeCooldown/,
  'portal login must use the shared verification-code resend cooldown'
);
assert.match(
  registerSource,
  /useVerificationCodeCooldown/,
  'portal registration must use the shared verification-code resend cooldown'
);
assert.match(
  cooldownHookSource,
  /retry_after_seconds[\s\S]*Date\.now\(\)[\s\S]*remainingSeconds/,
  'the shared cooldown must honor backend retry-after evidence and use an absolute deadline'
);

assert.match(
  registerSource,
  /const handleResendCode = async \(\) =>[\s\S]*portalClient\.requestRegistrationCode[\s\S]*portal\.register\.code_resent/,
  'portal registration verification step must allow resending the email verification code'
);

assert.match(
  registerSource,
  /auth\.resend_code/,
  'portal registration verification step must show a resend-code action'
);

assert.match(
  registerSource,
  /portalClient\.verifyRegistration/,
  'portal registration page must verify registration codes through the shared client'
);
assert.match(
  registerSource,
  /useSession/,
  'portal registration page must use the shared session controller after verification'
);
assert.match(
  registerSource,
  /const \{ isAuthenticated, isLoading, refresh \} = useSession\(\);[\s\S]*const postRegistrationTarget = requestedPlan[\s\S]*!isLoading && isAuthenticated[\s\S]*router\.replace\(postRegistrationTarget\)/,
  'authenticated users must leave registration for the default workspace or preserved package intent'
);
assert.match(
  registerSource,
  /if \(isAuthenticated\) \{[\s\S]*return <LoadingFallback \/>;/,
  'the registration form must stay available during session discovery and hide only after authentication is confirmed'
);
assert.match(
  registerSource,
  /await portalClient\.verifyRegistration\([\s\S]*await refresh\(\)[\s\S]*window\.location\.replace\(postRegistrationTarget\)/,
  'portal registration must refresh the cookie-backed session and preserve package intent during full-page navigation'
);
assert.match(
  registerSource,
  /searchParams\.get\('plan'\)[\s\S]*<QqLoginButton returnTo=\{postRegistrationTarget\}/,
  'portal registration must preserve a valid paid-plan intent through QQ authentication'
);
assert.match(
  registerSource,
  /<PortalAuthShell[\s\S]*portal\.register\.chip[\s\S]*portal\.register\.already_title[\s\S]*<form/,
  'portal registration page must put the account signup form and sign-in return path in the shared authentication shell'
);
assert.match(loginSource, /PortalAuthShell/, 'portal login must use the shared authentication shell');
assert.match(registerSource, /PortalAuthShell/, 'portal registration must use the shared authentication shell');
assert.match(
  authShellSource,
  /data-portal-auth="shell"[\s\S]*<header>[\s\S]*\{children\}[\s\S]*<aside/,
  'shared authentication shell must own the common title, form, and supporting-content layout'
);
assert.doesNotMatch(
  registerSource,
  /BackofficePrimaryPanel|BackofficeLayer|portal\.register\.use_case|portal\.register\.site_url|portal\.register\.site_name|siteUrl|siteName/,
  'portal registration page must only ask for email by default and leave site binding to the WordPress plugin'
);

assert.match(
  registerSource,
  /<QqLoginButton/,
  'portal registration must expose QQ as a first-class registration entry'
);
assert.match(
  registerSource,
  /aria-invalid=\{form\.status === 'error'[\s\S]*portal-register-form-message[\s\S]*role=\{form\.status === 'error' \? 'alert' : 'status'\}/,
  'portal registration errors must be announced and associated with the active field'
);
assert.match(
  clientSource,
  /startQqLogin[\s\S]*intent: 'login'/,
  'portal client must start the QQ login and first-registration flow explicitly'
);

console.log('portal_registration_ui_contract: ok');
