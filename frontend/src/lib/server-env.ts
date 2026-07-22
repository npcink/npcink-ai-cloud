import 'server-only';
import { readFileSync } from 'node:fs';
import { getEnv } from '@/lib/env';

const NON_DEVELOPMENT_ENVS = new Set(['production', 'staging']);

function isNonDevelopmentEnvironment(): boolean {
  const explicitEnv = String(process.env.NEXT_PUBLIC_ENV || '').trim().toLowerCase();
  const runtimeEnvironment = explicitEnv || String(process.env.NODE_ENV || 'development').trim().toLowerCase();
  return NON_DEVELOPMENT_ENVS.has(runtimeEnvironment);
}

export function getInternalAuthToken(): string {
  const env = getEnv();
  const tokenFile = env.NPCINK_CLOUD_INTERNAL_AUTH_TOKEN_FILE.trim();
  try {
    const token = readFileSync(tokenFile, 'utf8').trim();
    if (token) {
      return token;
    }
  } catch {
    if (isNonDevelopmentEnvironment()) {
      throw new Error('Cloud frontend internal authentication is unavailable');
    }
  }

  if (isNonDevelopmentEnvironment()) {
    throw new Error('Cloud frontend internal authentication is unavailable');
  }

  const token = env.NPCINK_CLOUD_INTERNAL_AUTH_TOKEN.trim();
  if (!token) {
    throw new Error('NPCINK_CLOUD_INTERNAL_AUTH_TOKEN is not configured for frontend admin proxy');
  }
  return token;
}

export function getDevAdminKey(): string {
  if (isNonDevelopmentEnvironment()) {
    throw new Error('development admin key is not available outside development');
  }
  const adminKey = getEnv().NPCINK_CLOUD_DEV_ADMIN_KEY.trim();
  if (!adminKey) {
    throw new Error('NPCINK_CLOUD_DEV_ADMIN_KEY is not configured for frontend development login');
  }
  return adminKey;
}
