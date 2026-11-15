import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Loader2, Mail, Sparkles } from 'lucide-react';
import { GLOBAL_COUNTRIES } from '../data/globalMarkets';
import { OPERATING_NICHES } from '../data/operatingNiches';
import { EmailRecipientContext } from '../lib/emailTemplates';
import { buildOutreachBundle, OutreachTone } from '../lib/outreachGenerator';
import { safeCopyText, safeReadJsonResponse } from '../lib/appUtils';

interface Props {
  initialCountryId?: string;
  initialNicheId?: string;
  initialBusinessName?: string;
  initialContactName?: string;
  initialServiceSummary?: string;
  onOpenGmailModal?: (ctx: EmailRecipientContext) => void;
}

export const OutreachGeneratorView: React.FC<Props> = ({
  initialCountryId,
  initialNicheId,
  initialBusinessName,
  initialContactName,
  initialServiceSummary,
  onOpenGmailModal,
}) => {
  const [countryId, setCountryId] = useState(initialCountryId || 'usa');
  const [cityName, setCityName] = useState('');
  const [nicheId, setNicheId] = useState(initialNicheId || OPERATING_NICHES[0].id);
  const [serviceType, setServiceType] = useState(
    initialServiceSummary || 'Web Dev + Local Map Pack SEO + AI Text-Back'
  );
  const [businessName, setBusinessName] = useState(initialBusinessName || '');
  const [contactName, setContactName] = useState(initialContactName || '');
  const [tone, setTone] = useState<OutreachTone>('Funnel Strategy (Pain-Desire)');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiCustomScript, setAiCustomScript] = useState('');
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (initialCountryId) {
      setCountryId(initialCountryId);
      setCityName('');
    }
  }, [initialCountryId]);

  useEffect(() => {
    if (initialNicheId) setNicheId(initialNicheId);
  }, [initialNicheId]);

  useEffect(() => {
    if (initialBusinessName !== undefined) setBusinessName(initialBusinessName);
  }, [initialBusinessName]);

  useEffect(() => {
    if (initialContactName !== undefined) setContactName(initialContactName);
  }, [initialContactName]);

  useEffect(() => {
    if (initialServiceSummary) setServiceType(initialServiceSummary);
  }, [initialServiceSummary]);

  const country = useMemo(
    () => GLOBAL_COUNTRIES.find((c) => c.id === countryId) || GLOBAL_COUNTRIES[0],
    [countryId]
  );

  const cities = useMemo(
    () =>
      country.statesOrRegions.flatMap((s) =>
        s.cities.map((ct) => ({
          ...ct,
          stateCode: s.code,
          stateName: s.name,
          uniqueKey: `${country.id}-${s.code}-${ct.name}`,
        }))
      ),
    [country]
  );

  const selectedCity = useMemo(
    () =>
      cities.find((c) => c.uniqueKey === cityName || c.name === cityName) || cities[0],
    [cities, cityName]
  );

  const niche = useMemo(
    () => OPERATING_NICHES.find((n) => n.id === nicheId) || OPERATING_NICHES[0],
    [nicheId]
  );

  const bundle = useMemo(
    () =>
      buildOutreachBundle({
        country,
        city: selectedCity,
        niche,
        serviceType,
        businessName,
        contactName,
        tone,
      }),
    [country, selectedCity, niche, serviceType, businessName, contactName, tone]
  );

  const copyText = async (key: string, text: string) => {
    const ok = await safeCopyText(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1400);
    }
  };

  const handleAiPersonalize = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiNotice(null);
    try {
      const res = await fetch('/api/outreach/ai-personalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country: country.name,
          city: selectedCity?.name || '',
          niche: niche.name,
          businessName,
          contactName,
          serviceType,
          channel: 'Cold Email + Loom Trojan Horse',
          tone,
          trojanHook: niche.trojanHorseHook,
        }),
      });
      const data = await safeReadJsonResponse<{
        script?: string;
        notice?: string;
        message?: string;
      }>(res);
      if (!res.ok) {
        setAiError(data.message || 'AI personalization failed.');
        return;
      }
      setAiCustomScript(data.script || '');
      setAiNotice(data.notice || null);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#F3F4F1] dark:bg-[#0D0E12] text-[#111214] dark:text-[#F4F5F7] p-5 lg:p-6 space-y-5 transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">
            Automated Outreach Campaign Generator
          </h1>
          <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] mt-0.5">
            Instant ready-to-send Cold Email sequences, LinkedIn DMs, Funnel Strategy scripts, and 90-second Loom Trojan Horse audits.
          </p>
        </div>

        <button
          type="button"
          onClick={handleAiPersonalize}
          disabled={aiLoading}
          className="px-4 py-2 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
        >
          {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {aiLoading ? 'Personalizing via Gemini...' : 'Live AI Web-Grounded Rewrite'}
        </button>
      </div>

      {/* CRITERIA INPUTS */}
      <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3 text-xs">
        <div>
          <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">Country</label>
          <select
            value={country.id}
            onChange={(e) => {
              setCountryId(e.target.value);
              setCityName('');
            }}
            className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7]"
          >
            {GLOBAL_COUNTRIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">City</label>
          <select
            value={selectedCity?.uniqueKey || ''}
            onChange={(e) => setCityName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7]"
          >
            {cities.map((c) => (
              <option key={c.uniqueKey} value={c.uniqueKey}>
                {country.statesOrRegions.length > 1 ? `${c.name}, ${c.stateCode}` : c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">Niche</label>
          <select
            value={niche.id}
            onChange={(e) => setNicheId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7]"
          >
            {OPERATING_NICHES.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">Business Name</label>
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="e.g. Apex HVAC"
            className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] placeholder:text-[#9A9FA8] dark:placeholder:text-[#6B7280]"
          />
        </div>

        <div>
          <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">Contact Name</label>
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="e.g. Marcus"
            className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] placeholder:text-[#9A9FA8] dark:placeholder:text-[#6B7280]"
          />
        </div>

        <div>
          <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">Style / Tone</label>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as OutreachTone)}
            className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7]"
          >
            <option value="Funnel Strategy (Pain-Desire)">Funnel Strategy (Pain-Desire)</option>
            <option value="Executive B2B Direct">Executive B2B Direct</option>
            <option value="Friendly Local Consultant">Friendly Local Consultant</option>
          </select>
        </div>

        <div className="md:col-span-3 xl:col-span-6">
          <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">
            Service / Offer Focus
          </label>
          <input
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7]"
          />
        </div>
      </div>

      {aiError && (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-700/60 px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
          {aiError}
        </div>
      )}

      {aiCustomScript && (
        <div className="bg-[#111214] text-white rounded-3xl border border-transparent dark:border-[#282B35] p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#D9F154]">
              Gemini Live-Grounded Custom Sequence
            </span>
            <button
              type="button"
              onClick={() => copyText('ai-custom', aiCustomScript)}
              className="px-2.5 py-1 rounded-lg bg-[#23252A] text-xs flex items-center gap-1 cursor-pointer"
            >
              <Copy className="w-3 h-3" />
              {copiedKey === 'ai-custom' ? 'Copied' : 'Copy'}
            </button>
          </div>
          {aiNotice && (
            <div className="text-[11px] text-[#C8B6FF]">{aiNotice}</div>
          )}
          <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed text-[#E5E7E2]">
            {aiCustomScript}
          </pre>
        </div>
      )}

      {/* GENERATED TEMPLATES GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* COLD EMAIL SEQUENCE */}
        <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-display font-bold">3-Step Cold Email Sequence</h2>
            {onOpenGmailModal && (
              <button
                type="button"
                onClick={() =>
                  onOpenGmailModal({
                    contactName: contactName || 'Owner',
                    businessName: businessName || `${selectedCity?.name || country.name} ${niche.name}`,
                    email: '',
                    address: `${selectedCity?.name || ''}${selectedCity ? ', ' : ''}${country.name}`,
                    city: selectedCity?.name || country.name,
                    country: country.name,
                    niche: niche.name,
                    serviceInterest: serviceType,
                    opportunitySignals: [niche.trojanHorseHook],
                  })
                }
                className="px-3 py-1.5 rounded-xl bg-[#D9F154] text-[#111214] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5" />
                Send via Gmail (AI + Templates)
              </button>
            )}
          </div>
          {bundle.coldEmailSequence.map((em, i) => (
            <div key={em.step} className="rounded-2xl bg-[#FAFAF8] dark:bg-[#1C1F26] border border-[#E5E7E2] dark:border-[#2C2F3A] p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold">{em.step}</span>
                <button
                  type="button"
                  onClick={() => copyText(`em-${i}`, `Subject: ${em.subject}\n\n${em.body}`)}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#23262F] border border-[#D9DBD5] dark:border-[#323643] text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  {copiedKey === `em-${i}` ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="text-xs font-semibold text-[#555963] dark:text-[#A1A6B3]">Subject: {em.subject}</div>
              <pre className="text-xs whitespace-pre-wrap font-sans text-[#111214] dark:text-[#E5E7E2] leading-relaxed">
                {em.body}
              </pre>
            </div>
          ))}
        </div>

        {/* LINKEDIN + FUNNEL STRATEGY WHATSAPP + LOOM TROJAN HORSE */}
        <div className="space-y-5">
          <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 space-y-3">
            <h2 className="text-base font-display font-bold">LinkedIn Connection & Follow-Up DM</h2>
            <div className="rounded-2xl bg-[#FAFAF8] dark:bg-[#1C1F26] border border-[#E5E7E2] dark:border-[#2C2F3A] p-3.5 space-y-1.5">
              <div className="flex justify-between items-center text-xs font-bold">
                <span>Connection Request (&lt;300 chars)</span>
                <button
                  type="button"
                  onClick={() => copyText('li-conn', bundle.linkedinMessages.connectionNote)}
                  className="text-[11px] underline cursor-pointer"
                >
                  {copiedKey === 'li-conn' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-[#3D404A] dark:text-[#C9CDD4]">{bundle.linkedinMessages.connectionNote}</p>
            </div>
            <div className="rounded-2xl bg-[#FAFAF8] dark:bg-[#1C1F26] border border-[#E5E7E2] dark:border-[#2C2F3A] p-3.5 space-y-1.5">
              <div className="flex justify-between items-center text-xs font-bold">
                <span>Post-Accept Value DM</span>
                <button
                  type="button"
                  onClick={() => copyText('li-dm', bundle.linkedinMessages.followUpDm)}
                  className="text-[11px] underline cursor-pointer"
                >
                  {copiedKey === 'li-dm' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-[#3D404A] dark:text-[#C9CDD4]">{bundle.linkedinMessages.followUpDm}</p>
            </div>
          </div>

          <div className="bg-[#D9F154] text-[#111214] rounded-3xl p-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-display font-bold">
                Funnel Strategy — WhatsApp / Local DM
              </h2>
              <button
                type="button"
                onClick={() => copyText('funnel-strategy', bundle.funnelStrategyScript)}
                className="px-2.5 py-1 rounded-lg bg-[#111214] text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                {copiedKey === 'funnel-strategy' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed text-[#111214]">
              {bundle.funnelStrategyScript}
            </pre>
          </div>

          <div className="bg-[#C8B6FF] text-[#111214] rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-display font-bold">
                90-Second Trojan Horse Loom Audit Script
              </h2>
              <button
                type="button"
                onClick={() =>
                  copyText(
                    'loom',
                    bundle.trojanHorseLoomScript
                      .map((s) => `${s.section} (${s.timing})\n${s.script}`)
                      .join('\n\n')
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-[#111214] text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                {copiedKey === 'loom' ? 'Copied' : 'Copy All'}
              </button>
            </div>
            <div className="space-y-2.5">
              {bundle.trojanHorseLoomScript.map((part) => (
                <div key={part.section} className="bg-white/80 text-[#111214] rounded-2xl p-3 text-xs space-y-1">
                  <div className="flex justify-between font-bold">
                    <span>{part.section}</span>
                    <span className="font-mono-tabular">{part.timing}</span>
                  </div>
                  <p className="text-[#111214]/90">{part.script}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
