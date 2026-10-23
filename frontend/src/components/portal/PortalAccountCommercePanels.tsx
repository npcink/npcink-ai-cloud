'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PortalCard } from '@/components/portal/PortalScaffold';
import { PortalCreditPackDialog } from '@/components/portal/PortalCreditPackDialog';
import {
  PortalPackageChangePanel,
  type PortalPackageTier,
} from '@/components/portal/PortalPackageChangePanel';
import {
  isPortalPaymentOrderPending,
  PortalPaymentOrderHistory,
} from '@/components/portal/PortalPaymentOrderHistory';
import { PortalTrialEligibilityPanel } from '@/components/portal/PortalTrialEligibilityPanel';
import { Modal } from '@/components/ui/Modal';
import { useLocale } from '@/contexts/LocaleContext';
import { usePortalCommercialCatalog } from '@/hooks/usePortalCommercialCatalog';
import { usePortalPaymentOrders } from '@/hooks/usePortalPaymentOrders';
import { useSession } from '@/hooks/useSession';
import {
  portalClient,
  type PortalPlanOffer,
} from '@/lib/portal-client';
import { formatPortalWriteErrorMessage } from '@/lib/portal-error';
import { formatDate } from '@/lib/utils';
import { PortalLoadingState } from '@/components/portal/PortalPageState';

type PaymentLaunchState = {
  checkoutUrl: string;
  opened: boolean;
};

function preparePaymentWindow(): Window | null {
  const paymentWindow = window.open('about:blank', '_blank');
  if (paymentWindow) paymentWindow.opener = null;
  return paymentWindow;
}

function closePreparedPaymentWindow(paymentWindow: Window | null): void {
  if (paymentWindow && !paymentWindow.closed) paymentWindow.close();
}

function normalizePaymentText(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '_');
}

export type PortalAccountCommerceSurface = 'account' | 'billing';

type PortalAccountCommercePanelsProps = {
  /** account: payment orders only. billing: package/credit/trial dialogs (no plan summary row). */
  surface: PortalAccountCommerceSurface;
};

export function PortalAccountCommercePanels({ surface }: PortalAccountCommercePanelsProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const { isAuthenticated, refresh } = useSession();
  const catalogEnabled = isAuthenticated && surface === 'billing';
  const {
    entitlements,
    creditPacks,
    planOffers,
    isLoading,
    error,
    load: loadBilling,
  } = usePortalCommercialCatalog({
    isAuthenticated: catalogEnabled,
    t,
  });
  const {
    payload: paymentOrders,
    statusGroup: paymentOrderStatusGroup,
    offset: paymentOrderOffset,
    isLoading: paymentOrdersLoading,
    error: paymentOrderError,
    cancelPendingOrderId,
    cancelConfirmOrderId,
    load: loadPaymentOrders,
    cancel: handleCancelPaymentOrder,
    setStatusGroup: setPaymentOrderStatusGroup,
    setOffset: setPaymentOrderOffset,
    setCancelConfirmOrderId,
  } = usePortalPaymentOrders({
    isAuthenticated,
    t,
  });
  const [creditPackPending, setCreditPackPending] = useState<string | null>(null);
  const [creditPackError, setCreditPackError] = useState<string | null>(null);
  const [packagePending, setPackagePending] = useState<string | null>(null);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [trialTierSelection, setTrialTierSelection] = useState<'plus' | 'pro'>('pro');
  const [activeCommercialDialog, setActiveCommercialDialog] = useState<
    'package' | 'credits' | 'trial' | null
  >(null);
  const [selectedPackageTier, setSelectedPackageTier] = useState<
    PortalPackageTier | null
  >(null);
  const [showOnlyPackageDifferences, setShowOnlyPackageDifferences] = useState(false);
  const [selectedCreditPackId, setSelectedCreditPackId] = useState<string | null>(null);
  const [paymentLaunch, setPaymentLaunch] = useState<PaymentLaunchState | null>(null);
  const handledUpgradeIntentRef = useRef('');

  const clearCommercialActionFromUrl = () => {
    if (surface !== 'billing') return;
    if (!searchParams.get('action')) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('action');
    const qs = params.toString();
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    router.replace(`${pathname}${qs ? `?${qs}` : ''}${hash}`, { scroll: false });
  };

  const closeCommercialDialog = () => {
    setActiveCommercialDialog(null);
    // Keep handledUpgradeIntentRef until `action` leaves the URL so the open
    // effect cannot re-open the dialog during router.replace.
    clearCommercialActionFromUrl();
  };

  useEffect(() => {
    if (surface !== 'billing') return;
    if (searchParams.get('action')) return;
    handledUpgradeIntentRef.current = '';
  }, [surface, searchParams]);

  useEffect(() => {
    if (surface !== 'billing') return;
    const requestedTier = searchParams.get('plan');
    const requestedAction = searchParams.get('action');
    const intentKey = `${requestedAction || ''}:${requestedTier || ''}`;
    if (!requestedAction || handledUpgradeIntentRef.current === intentKey) return;

    if (requestedAction === 'credits') {
      handledUpgradeIntentRef.current = intentKey;
      setCreditPackError(null);
      setActiveCommercialDialog('credits');
      return;
    }

    if (requestedAction !== 'upgrade') return;

    if (requestedTier === 'plus' || requestedTier === 'pro') {
      const offers = planOffers?.items || [];
      if (!offers.some((offer) => offer.tier_id === requestedTier)) {
        // Wait until catalog resolves so a deep-linked tier can preselect when present.
        if (isLoading || planOffers === null) return;
      } else {
        setSelectedPackageTier(requestedTier);
      }
    }

    handledUpgradeIntentRef.current = intentKey;
    setPackageError(null);
    setShowOnlyPackageDifferences(false);
    setActiveCommercialDialog('package');
  }, [surface, planOffers, planOffers?.items, isLoading, searchParams]);

  useEffect(() => {
    const allowedTiers = planOffers?.trial?.allowed_tiers || [];
    if (!allowedTiers.length || allowedTiers.includes(trialTierSelection)) return;
    setTrialTierSelection(allowedTiers.includes('pro') ? 'pro' : allowedTiers[0]);
  }, [planOffers?.trial?.allowed_tiers, trialTierSelection]);


  const handleStartPlanTrial = async (tierId: 'plus' | 'pro') => {
    setPackagePending(`trial:${tierId}`);
    setPackageError(null);
    try {
      await portalClient.startPlanTrial(tierId);
      await refresh();
      await loadBilling();
      closeCommercialDialog();
    } catch (err) {
      setPackageError(formatPortalWriteErrorMessage(err, t, t('error.failed_save')));
    } finally {
      setPackagePending(null);
    }
  };

  const handleCreateSubscriptionOrder = async (offer: PortalPlanOffer) => {
    const paymentWindow = preparePaymentWindow();
    setPackagePending(`order:${offer.tier_id}`);
    setPackageError(null);
    setPaymentLaunch(null);
    try {
      const response = await portalClient.createSubscriptionOrder(offer.offer_id, 'alipay');
      if (response.data.order.checkout_url) {
        if (paymentWindow && !paymentWindow.closed) {
          paymentWindow.location.replace(response.data.order.checkout_url);
          setPaymentLaunch({ checkoutUrl: response.data.order.checkout_url, opened: true });
        } else {
          setPaymentLaunch({ checkoutUrl: response.data.order.checkout_url, opened: false });
        }
        setPaymentOrderStatusGroup('pending');
        setPaymentOrderOffset(0);
        await loadPaymentOrders('pending', 0);
        closeCommercialDialog();
      } else {
        closePreparedPaymentWindow(paymentWindow);
      }
    } catch (err) {
      closePreparedPaymentWindow(paymentWindow);
      setPackageError(formatPortalWriteErrorMessage(err, t, t('error.failed_save')));
    } finally {
      setPackagePending(null);
    }
  };

  const handleScheduleFreeDowngrade = async () => {
    setPackagePending('downgrade:free');
    setPackageError(null);
    try {
      await portalClient.scheduleFreeDowngrade();
      await refresh();
      await loadBilling();
      closeCommercialDialog();
    } catch (err) {
      setPackageError(formatPortalWriteErrorMessage(err, t, t('error.failed_save')));
    } finally {
      setPackagePending(null);
    }
  };

  const handleCreateCreditPackOrder = async (packId: string) => {
    const paymentWindow = preparePaymentWindow();
    setCreditPackPending(packId);
    setCreditPackError(null);
    setPaymentLaunch(null);
    try {
      const response = await portalClient.createAccountCreditPackOrder(packId);
      if (response.data.order.checkout_url) {
        if (paymentWindow && !paymentWindow.closed) {
          paymentWindow.location.replace(response.data.order.checkout_url);
          setPaymentLaunch({ checkoutUrl: response.data.order.checkout_url, opened: true });
        } else {
          setPaymentLaunch({ checkoutUrl: response.data.order.checkout_url, opened: false });
        }
        setPaymentOrderStatusGroup('pending');
        setPaymentOrderOffset(0);
        await loadPaymentOrders('pending', 0);
        closeCommercialDialog();
      } else {
        closePreparedPaymentWindow(paymentWindow);
      }
    } catch (err) {
      closePreparedPaymentWindow(paymentWindow);
      setCreditPackError(formatPortalWriteErrorMessage(err, t, t('error.failed_save')));
    } finally {
      setCreditPackPending(null);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  const currentSubscription = entitlements?.current_subscription || null;
  const currentPlanId = String(currentSubscription?.plan_id || '').toLowerCase();
  const currentStatus = String(currentSubscription?.status || '').toLowerCase();
  const offersByTier = new Map(
    (planOffers?.items || []).map((offer) => [offer.tier_id, offer] as const)
  );
  const plusOffer = offersByTier.get('plus');
  const proOffer = offersByTier.get('pro');
  const agencyOffer = offersByTier.get('agency');
  const trial = planOffers?.trial;
  const trialState = trial?.state
    || (trial?.status === 'active'
      ? 'active'
      : trial?.available === true
        ? 'eligible'
        : trial?.available === false
          ? 'used'
          : 'unavailable');
  const allowedTrialTiers = (trial?.allowed_tiers || []).filter(
    (tier): tier is 'plus' | 'pro' => tier === 'plus' || tier === 'pro'
  );
  const selectedTrialTier = allowedTrialTiers.includes(trialTierSelection)
    ? trialTierSelection
    : allowedTrialTiers.includes('pro')
      ? 'pro'
      : allowedTrialTiers[0];
  const selectedTrialOffer = selectedTrialTier ? offersByTier.get(selectedTrialTier) : null;
  const trialDays = Number(trial?.trial_days || selectedTrialOffer?.trial_days || 14);
  const activeTrialTier = String(trial?.highest_tier_id || trial?.tier_id || currentPlanId || '').toLowerCase();
  const activeTrialTierLabel = activeTrialTier === 'plus' ? 'Plus' : activeTrialTier === 'pro' ? 'Pro' : '';
  const availableCreditPacks = creditPacks?.items || [];
  const selectedPackageOffer = selectedPackageTier && selectedPackageTier !== 'free'
    ? offersByTier.get(selectedPackageTier)
    : null;
  const allPaymentOrders = paymentOrders?.items || [];
  const paymentOrderCounts = paymentOrders?.counts || {
    all: allPaymentOrders.length,
    pending: allPaymentOrders.filter(isPortalPaymentOrderPending).length,
    paid: allPaymentOrders.filter((order) => normalizePaymentText(order.status) === 'paid').length,
    closed: allPaymentOrders.filter((order) => !['pending', 'paid'].includes(normalizePaymentText(order.status))).length,
  };

  const paymentLaunchNotice = paymentLaunch ? (
    <div
      role="status"
      className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-100"
    >
      {paymentLaunch.opened ? (
        t(
          'portal.usage.payment_page_opened',
          {},
          'Alipay opened in a new tab. Return here after payment and the order status will refresh automatically.'
        )
      ) : (
        <span className="flex flex-wrap items-center gap-3">
          <span>
            {t(
              'portal.usage.payment_page_blocked',
              {},
              'Your browser blocked the payment tab. Use the button to open Alipay.'
            )}
          </span>
          <a
            className="btn btn-primary"
            href={paymentLaunch.checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('portal.usage.payment_page_open_action', {}, 'Open Alipay')}
          </a>
        </span>
      )}
    </div>
  ) : null;

  const comparisonTiers = planOffers?.comparison_tiers || [];

  const handleConfirmPackageSelection = () => {
    if (!selectedPackageTier || packagePending !== null) return;
    if (selectedPackageTier === 'free') {
      void handleScheduleFreeDowngrade();
      return;
    }
    const selectedOffer = offersByTier.get(selectedPackageTier);
    if (selectedOffer) void handleCreateSubscriptionOrder(selectedOffer);
  };

  const handleConfirmCreditPackSelection = () => {
    if (!selectedCreditPackId || creditPackPending !== null) return;
    void handleCreateCreditPackOrder(selectedCreditPackId);
  };

  const packageOptions = (
    <PortalPackageChangePanel
      t={t}
      currentPlanId={currentPlanId}
      currentStatus={currentStatus}
      comparisonTiers={comparisonTiers}
      plusOffer={plusOffer}
      proOffer={proOffer}
      agencyOffer={agencyOffer}
      selectedTier={selectedPackageTier}
      showOnlyDifferences={showOnlyPackageDifferences}
      pendingAction={packagePending}
      error={packageError}
      onSelectTier={setSelectedPackageTier}
      onShowOnlyDifferencesChange={setShowOnlyPackageDifferences}
      onConfirm={handleConfirmPackageSelection}
      onAgencyPurchase={(offer) => void handleCreateSubscriptionOrder(offer)}
    />
  );

  const trialStatusTitle = trialState === 'eligible'
    ? t('portal.package.trial_eligible_title', { days: String(trialDays) }, `${trialDays}-day paid-package trial available`)
    : trialState === 'active'
      ? t('portal.package.trial_active_title', { tier: activeTrialTierLabel }, `${activeTrialTierLabel} trial is active`)
      : trialState === 'used'
        ? t('portal.package.trial_used_title', {}, 'Trial already used')
        : trialState === 'blocked'
          ? t('portal.package.trial_blocked_title', {}, 'Trial unavailable with an active paid package')
          : t('portal.package.trial_unavailable_title', {}, 'Trial is not currently offered');
  const trialStatusDescription = trialState === 'eligible'
    ? t('portal.package.trial_shared_desc', {}, 'Each account has one shared paid-package trial. You may move to a higher tier during the trial, but the end date will not be extended.')
    : trialState === 'active'
      ? t(
          'portal.package.trial_active_desc',
          {
            tier: activeTrialTierLabel,
            date: trial?.trial_ends_at ? formatDate(trial.trial_ends_at) : t('common.unknown', {}, 'To confirm'),
          },
          `${activeTrialTierLabel} trial ends ${trial?.trial_ends_at ? formatDate(trial.trial_ends_at) : 'to be confirmed'}. Moving to a higher tier does not extend the end date.`
        )
      : trialState === 'used'
        ? t('portal.package.trial_used_desc', {}, 'This account has already used its paid-package trial. You can still purchase a package.')
        : trialState === 'blocked'
          ? t('portal.package.trial_blocked_desc', {}, 'This account already has an active paid package, so a trial cannot be started. Renew or change the package instead.')
          : t('portal.package.trial_unavailable_desc', {}, 'No self-service trial is available for this account. Package purchase remains available.');

  const trialOptions = (
    <PortalTrialEligibilityPanel
      t={t}
      state={trialState}
      title={trialStatusTitle}
      description={trialStatusDescription}
      allowedTiers={allowedTrialTiers}
      selectedTier={selectedTrialTier}
      trialDays={trialDays}
      pendingAction={packagePending}
      error={packageError}
      onSelectTier={setTrialTierSelection}
      onStartTrial={(tier) => void handleStartPlanTrial(tier)}
    />
  );

  const paymentOrdersCard = (
    <div id="payment-orders" className="scroll-mt-24">
    <PortalPaymentOrderHistory
      t={t}
      payload={paymentOrders}
      counts={paymentOrderCounts}
      statusGroup={paymentOrderStatusGroup}
      offset={paymentOrderOffset}
      isLoading={paymentOrdersLoading}
      error={paymentOrderError}
      cancelPendingOrderId={cancelPendingOrderId}
      cancelConfirmOrderId={cancelConfirmOrderId}
      onStatusGroupChange={setPaymentOrderStatusGroup}
      onOffsetChange={setPaymentOrderOffset}
      onCancelConfirmChange={setCancelConfirmOrderId}
      onCancel={(order) => void handleCancelPaymentOrder(order)}
    />
    </div>
  );



  if (surface === 'account') {
    return (
      <div className="space-y-5" data-portal-account="commerce">
        {paymentOrdersCard}
      </div>
    );
  }

  if (isLoading && !entitlements && !planOffers && !creditPacks) {
    return <PortalLoadingState message={t('portal.billing.loading', {}, 'Loading package details...')} compact />;
  }

  return (
    <div className="space-y-5" data-portal-account="commerce" data-portal-billing="package-commerce">
      <div id="package-options" className="scroll-mt-24" hidden aria-hidden="true" />
      {paymentLaunchNotice}

      {error ? (
        <PortalCard variant="portal" className="border-rose-200 bg-rose-50/80 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
          <p className="font-medium">{t('error.failed_load', {}, 'Failed to load')}</p>
          <p className="mt-1">{error}</p>
          <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => void loadBilling()}>
            {t('common.retry', {}, 'Retry')}
          </button>
        </PortalCard>
      ) : null}

      <Modal
        isOpen={activeCommercialDialog === 'package'}
        onClose={() => closeCommercialDialog()}
        closeLabel={t('common.close', {}, 'Close')}
        title={t('portal.billing.package_dialog_title', {}, 'Choose a package')}
        description={t(
          'portal.billing.package_dialog_desc',
          {},
          'Compare available packages and choose the change you want to make.'
        )}
        size="3xl"
        className="portal-commercial-dialog rounded-[18px] shadow-[0_16px_44px_rgba(15,23,42,0.14)]"
      >
        {packageOptions}
      </Modal>

      <PortalCreditPackDialog
        t={t}
        isOpen={activeCommercialDialog === 'credits'}
        packs={availableCreditPacks}
        selectedPackId={selectedCreditPackId}
        pendingPackId={creditPackPending}
        error={creditPackError}
        onClose={() => closeCommercialDialog()}
        onSelect={setSelectedCreditPackId}
        onConfirm={handleConfirmCreditPackSelection}
      />

      <Modal
        isOpen={activeCommercialDialog === 'trial'}
        onClose={() => closeCommercialDialog()}
        closeLabel={t('common.close', {}, 'Close')}
        title={t('portal.package.trial_dialog_title', {}, 'Trial eligibility')}
        description={t(
          'portal.package.trial_dialog_desc',
          {},
          'Review this account trial status before starting or changing a trial.'
        )}
        size="lg"
        className="portal-commercial-dialog rounded-[18px] shadow-[0_16px_44px_rgba(15,23,42,0.14)]"
      >
        {trialOptions}
      </Modal>
    </div>
  );
}
