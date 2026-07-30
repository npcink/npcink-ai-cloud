'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/errors';

function normalizeCooldownSeconds(value: unknown): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }
  return Math.ceil(seconds);
}

export function readVerificationCodeRetryAfterSeconds(error: unknown): number {
  if (!(error instanceof ApiError) || !error.details || typeof error.details !== 'object') {
    return 0;
  }
  return normalizeCooldownSeconds(
    (error.details as Record<string, unknown>).retry_after_seconds
  );
}

export function useVerificationCodeCooldown() {
  const [deadlineMs, setDeadlineMs] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const resetCooldown = useCallback(() => {
    setDeadlineMs(0);
    setRemainingSeconds(0);
  }, []);

  const startCooldown = useCallback((seconds: unknown) => {
    const normalizedSeconds = normalizeCooldownSeconds(seconds);
    if (normalizedSeconds === 0) {
      resetCooldown();
      return;
    }
    setDeadlineMs(Date.now() + normalizedSeconds * 1_000);
    setRemainingSeconds(normalizedSeconds);
  }, [resetCooldown]);

  const startCooldownFromError = useCallback((error: unknown) => {
    const retryAfterSeconds = readVerificationCodeRetryAfterSeconds(error);
    if (retryAfterSeconds > 0) {
      startCooldown(retryAfterSeconds);
    }
    return retryAfterSeconds;
  }, [startCooldown]);

  useEffect(() => {
    if (deadlineMs <= 0) {
      return;
    }

    const updateRemaining = () => {
      const nextRemaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1_000));
      setRemainingSeconds(nextRemaining);
      if (nextRemaining === 0) {
        setDeadlineMs(0);
      }
    };
    const interval = window.setInterval(updateRemaining, 250);
    updateRemaining();
    return () => window.clearInterval(interval);
  }, [deadlineMs]);

  return {
    isCoolingDown: remainingSeconds > 0,
    remainingSeconds,
    resetCooldown,
    startCooldown,
    startCooldownFromError,
  };
}
