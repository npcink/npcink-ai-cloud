'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { AdminWorkbenchDialog } from '@/components/admin/AdminWorkbenchDialog';
import { useLocale } from '@/contexts/LocaleContext';
import { ApiError, resolveUiErrorMessage } from '@/lib/errors';
import { formatUsdAmount } from '@/lib/format-usd';
import { aiResourcesClient } from './directory';
import { upstreamModelId } from './model-reference-identity';

const ModelTestOutput = dynamic(() => import('./ModelTestOutput').then(module => module.ModelTestOutput));

export type ModelTestTarget = {
  connectionId: string;
  supplierName: string;
  modelId: string;
  displayModelId: string;
  namespacePrefix?: string;
  capability: 'text' | 'vision';
};

type TestResult = {
  test_id: string;
  provider_id: string;
  model_id: string;
  requested_model_id?: string;
  reported_model_id?: string | null;
  reasoning_tokens?: number;
  max_output_tokens?: number;
  output_text: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  finish_reason: string;
  cost?: {
    amount_usd: number | null;
    basis: 'unavailable' | 'catalog' | 'reference' | 'provider_reported';
    source?: string;
    overridden?: boolean;
    price_checked_at?: string;
    rates?: { input: number | null; output: number | null; cache_read: number | null; cache_write: number | null };
    conservative_cache_rate?: boolean;
  };
};

export function ModelTestDialog({ target, onClose }: { target: ModelTestTarget; onClose: () => void }) {
  const { t } = useLocale();
  const text = (key: string) => t(`admin.model_test.${key}`);
  const [capability, setCapability] = useState(target.capability);
  const [prompt, setPrompt] = useState(text(target.capability === 'vision' ? 'example_vision' : 'example_text'));
  const [image, setImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState('');
  const [errorId, setErrorId] = useState('');
  const pending = useRef(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  const clearResult = () => { setResult(null); setError(''); setErrorId(''); };

  async function run() {
    if (pending.current || reading || !prompt.trim()) return;
    pending.current = true;
    setBusy(true);
    clearResult();
    try {
      const response = await aiResourcesClient.request<TestResult>(
        `/api/admin/provider-connections/${encodeURIComponent(target.connectionId)}/model-tests`,
        { method: 'POST', timeoutMs: 75_000, body: {
          model_id: target.modelId, capability, prompt,
          ...(capability === 'vision' && image ? { image_data_url: image } : {}),
        } },
      );
      setResult(response.data);
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.errorCode : '';
      const specific: Record<string, string> = {
        'model_test.model_not_enabled': 'not_enabled',
        'model_test.catalog_unconfirmed': 'catalog_unconfirmed',
        'model_test.invalid_image': 'invalid_image',
        'model_test.empty_output': 'empty_output',
      };
      setError(specific[code] ? text(specific[code]) : resolveUiErrorMessage(caught, text('failed'), t));
      if (caught instanceof ApiError) {
        const data = caught.details as { test_id?: string } | undefined;
        setErrorId(data?.test_id || '');
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    clearResult();
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 512 * 1024) {
      setError(text('invalid_image'));
      return;
    }
    setReading(true);
    try {
      const value = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('image read failed'));
        reader.readAsDataURL(file);
      });
      setImage(value);
      setImageName(file.name);
    } catch { setError(text('invalid_image')); }
    finally { setReading(false); }
  }

  const locked = busy || reading;
  const cost = result?.cost;
  const amount = cost?.amount_usd;
  const hasCost = typeof amount === 'number' && Number.isFinite(amount) && amount >= 0;
  const dollars = formatUsdAmount(amount);
  const control = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white';
  return <AdminWorkbenchDialog
    open title={text('title')} titleId="model-test-title" width="compact" density="compact"
    saving={locked} closeLabel={text('close')} cancelLabel={text('close')}
    saveLabel={text('run')} savingLabel={text('running')} footerNotice={text('notice')}
    error={error} onClose={onClose} onSubmit={() => void run()}
    footerActions={<div className="flex shrink-0 gap-2">
      <button type="button" className="btn btn-secondary" disabled={locked} onClick={onClose}>{text('close')}</button>
      <button type="submit" className="btn btn-primary" disabled={locked || !prompt.trim()}>{busy ? text('running') : text('run')}</button>
    </div>}
  >
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <strong>{target.supplierName}</strong><span className="break-all">{target.displayModelId}</span>
      <span className="text-xs text-slate-500">{text('saved_model')}</span>
    </div>
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="grid gap-3">
        <label className="grid gap-1 text-sm">{text('mode')}
          <select aria-label={text('mode')} className={control} value={capability} disabled={locked} onChange={event => {
            const mode = event.target.value as 'text' | 'vision';
            setCapability(mode); setPrompt(text(mode === 'vision' ? 'example_vision' : 'example_text')); clearResult();
          }}><option value="text">{text('text')}</option><option value="vision">{text('vision')}</option></select>
        </label>
        <label className="grid gap-1 text-sm">{text('input')}
          <textarea aria-label={text('input')} className={`${control} min-h-32 resize-y`} value={prompt} maxLength={4000} required disabled={locked} onChange={event => { setPrompt(event.target.value); clearResult(); }} />
        </label>
        <div className="flex flex-wrap gap-2">
          {['text', 'summary', ...(capability === 'vision' ? ['vision'] : [])].map(example => <button key={example} type="button" disabled={locked} className="text-xs text-blue-700 underline dark:text-blue-300" onClick={() => { setPrompt(text(`example_${example}`)); clearResult(); }}>{text(`sample_${example}`)}</button>)}
        </div>
        {capability === 'vision' ? <div className="grid gap-2 text-xs">
          <span>{imageName || text('default_image')}</span>
          {image ? <Image src={image} unoptimized width={112} height={80} alt={text('uploaded_image')} className="h-20 w-28 rounded border object-contain" /> : <div role="img" aria-label={text('default_image')} className="h-16 w-16 rounded border bg-[#ff0000]" />}
          <span>{text('upload')}</span>
          <button type="button" className="btn btn-secondary btn-sm w-fit" disabled={locked} onClick={() => uploadInput.current?.click()}>{text('choose_image')}</button>
          <input ref={uploadInput} hidden type="file" aria-label={text('upload')} accept="image/png,image/jpeg,image/webp" disabled={locked} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} />
          {image ? <button type="button" className="w-fit underline" disabled={locked} onClick={() => { setImage(null); setImageName(''); clearResult(); }}>{text('reset_image')}</button> : null}
        </div> : null}
      </div>
      <section className="grid gap-2 text-sm min-w-0" aria-live="polite" aria-busy={busy}>
        <h3 className="font-semibold">{text('output')}</h3>
        {result ? <>
          <span className="text-xs text-emerald-700 dark:text-emerald-300">{text(result.output_text ? 'succeeded' : 'completed')}</span>
          {result.output_text ? <ModelTestOutput>{result.output_text}</ModelTestOutput> : <p className="min-h-32 text-slate-500">{text('no_visible_output')}</p>}
          {result.finish_reason === 'length' ? <p className="text-xs text-amber-700 dark:text-amber-300">{text('truncated')}</p> : null}
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            <dt>{text('requested_model')}</dt><dd className="break-all">{result.provider_id} · {upstreamModelId(result.requested_model_id ?? result.model_id, target.namespacePrefix ?? result.provider_id)}</dd>
            <dt>{text('reported_model')}</dt><dd className="break-all">{result.reported_model_id || text('not_reported')}</dd>
            <dt>{text('latency')}</dt><dd>{(result.latency_ms / 1000).toFixed(2)} s</dd>
            <dt>{text('tokens')}</dt><dd>{result.tokens_in} / {result.tokens_out}{result.reasoning_tokens ? ` · ${text('reasoning')} ${result.reasoning_tokens}` : ''}</dd>
            <dt>{text('cost')}</dt><dd data-ui="model-test-cost">{hasCost ? `${cost?.basis === 'provider_reported' ? '' : '≈ '}${dollars} USD` : text('cost_unknown')}</dd>
            <dt>{text('test_id')}</dt><dd className="break-all">{result.test_id}</dd>
          </dl>
          <details className="text-xs text-slate-500">
            <summary className="w-fit cursor-pointer">{text('cost_details')}</summary>
            <div className="mt-1 grid gap-1">
              <p>{text(hasCost ? `cost_${cost?.basis}` : 'cost_missing')}</p>
              {hasCost && cost?.rates ? <p>{text('cost_rates')}: {(['input', 'output', 'cache_read', 'cache_write'] as const).map(key => cost.rates?.[key] == null ? '—' : `$${cost.rates[key]}`).join(' / ')} USD</p> : null}
              {hasCost && cost?.source ? <p>{cost.source}{cost.overridden ? ` · ${text('cost_overridden')}` : ''}</p> : null}
              {hasCost && cost?.price_checked_at ? <p>{text('cost_checked')}: {new Date(cost.price_checked_at).toLocaleString()}</p> : null}
              {hasCost && cost?.conservative_cache_rate ? <p>{text('cost_cache')}</p> : null}
            </div>
          </details>
          <p className="text-xs text-slate-500">{text('scope')}</p>
        </> : <p className="min-h-32 border-l-2 border-slate-200 pl-3 text-slate-500 dark:border-slate-700">{text(busy ? 'waiting' : 'empty')}</p>}
        {errorId ? <p className="break-all text-xs text-slate-500">{text('test_id')}: {errorId}</p> : null}
      </section>
    </div>
  </AdminWorkbenchDialog>;
}
