import React, { useEffect, useMemo, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { formatMoney } from '../data/currency';
import { GLOBAL_COUNTRIES } from '../data/globalMarkets';
import { OPERATING_NICHES } from '../data/operatingNiches';
import { generatePricingEnginePlan } from '../lib/pricingEngine';
import { CurrencyCode } from '../types/crm';

interface Props {
  currency: CurrencyCode;
  initialCountryId?: string;
  initialNicheId?: string;
  onSendOfferToOutreach: (countryId: string, nicheId: string, serviceSummary: string) => void;
}

export const PricingEngineView: React.FC<Props> = ({
  currency,
  initialCountryId,
  initialNicheId,
  onSendOfferToOutreach,
}) => {
  const [countryId, setCountryId] = useState(initialCountryId || 'usa');
  const [stateCode, setStateCode] = useState('');
  const [cityName, setCityName] = useState('');
  const [nicheId, setNicheId] = useState(initialNicheId || OPERATING_NICHES[0].id);
  const [serviceFocus, setServiceFocus] = useState<
    'Full Stack (SEO + Web + AI)' | 'Local SEO + Maps' | 'Web Dev + CRO' | 'AI & Lead Automation'
  >('Full Stack (SEO + Web + AI)');

  useEffect(() => {
    if (initialCountryId) {
      setCountryId(initialCountryId);
      setStateCode('');
      setCityName('');
    }
  }, [initialCountryId]);

  useEffect(() => {
    if (initialNicheId) {
      setNicheId(initialNicheId);
    }
  }, [initialNicheId]);

  const country = useMemo(
    () => GLOBAL_COUNTRIES.find((c) => c.id === countryId) || GLOBAL_COUNTRIES[0],
    [countryId]
  );

  const selectedState = useMemo(
    () => country.statesOrRegions.find((s) => s.code === stateCode) || country.statesOrRegions[0],
    [country, stateCode]
  );

  const selectedCity = useMemo(
    () =>
      selectedState?.cities.find((ct) => ct.name === cityName) || selectedState?.cities[0],
    [selectedState, cityName]
  );

  const niche = useMemo(
    () => OPERATING_NICHES.find((n) => n.id === nicheId) || OPERATING_NICHES[0],
    [nicheId]
  );

  const plan = useMemo(
    () =>
      generatePricingEnginePlan({
        country,
        stateOrRegion: selectedState,
        city: selectedCity,
        niche,
        serviceFocus,
      }),
    [country, selectedState, selectedCity, niche, serviceFocus]
  );

  return (
    <div className="h-full overflow-y-auto bg-[#F3F4F1] dark:bg-[#0D0E12] text-[#111214] dark:text-[#F4F5F7] p-5 lg:p-6 space-y-5 transition-colors">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">
          Service Offer & Tiered Pricing Engine
        </h1>
        <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] mt-0.5">
          Calibrates SEO, Web Dev, and AI Automation packages automatically to target country/city income tier, competition, and client job value.
        </p>
      </div>

      {/* CONFIGURATOR BAR */}
      <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 text-xs">
        <div>
          <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">Country</label>
          <select
            value={country.id}
            onChange={(e) => {
              setCountryId(e.target.value);
              setStateCode('');
              setCityName('');
            }}
            className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7]"
          >
            {GLOBAL_COUNTRIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.tier})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">State / Region</label>
          <select
            value={selectedState?.code || ''}
            onChange={(e) => {
              setStateCode(e.target.value);
              setCityName('');
            }}
            className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7]"
          >
            {country.statesOrRegions.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name} ({s.tier})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">Target City</label>
          <select
            value={selectedCity?.name || ''}
            onChange={(e) => setCityName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7]"
          >
            {(selectedState?.cities || []).map((ct, idx) => (
              <option key={`${selectedState?.code || 'st'}-${ct.name}-${idx}`} value={ct.name}>
                {ct.name} ({ct.tier})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">Business Niche</label>
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
          <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">Service Stack</label>
          <select
            value={serviceFocus}
            onChange={(e) => setServiceFocus(e.target.value as typeof serviceFocus)}
            className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7]"
          >
            <option value="Full Stack (SEO + Web + AI)">Full Stack (SEO + Web + AI)</option>
            <option value="Local SEO + Maps">Local SEO + Maps</option>
            <option value="Web Dev + CRO">Web Dev + CRO</option>
            <option value="AI & Lead Automation">AI & Lead Automation</option>
          </select>
        </div>
      </div>

      {/* POSITIONING BRIEF */}
      <div className="bg-[#111214] text-white rounded-3xl border border-transparent dark:border-[#282B35] p-5 grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
        <div>
          <div className="text-[#D9F154] font-semibold">Calibrated Target Profile</div>
          <div className="text-sm font-bold mt-1">{plan.geoLabel}</div>
          <div className="text-[#9A9FA8] mt-1">
            Effective Tier: {plan.effectiveTier} · Competition: {plan.competitionLevel}
          </div>
        </div>
        <div>
          <div className="text-[#C8B6FF] font-semibold">Recommended Wedge Positioning</div>
          <p className="text-[#C9CDD4] mt-1 leading-relaxed">{plan.positioningAngle}</p>
        </div>
        <div>
          <div className="text-[#6AE4C0] font-semibold">Land & Expand Upsell Path</div>
          <p className="text-[#C9CDD4] mt-1 leading-relaxed">{plan.upsellPath}</p>
        </div>
      </div>

      {/* 3 PRICING TIER CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {plan.packages.map((pkg) => {
          const isFeatured = pkg.recommendedBestValue;
          return (
            <div
              key={pkg.tierId}
              className={`rounded-3xl p-6 border flex flex-col justify-between space-y-5 ${
                isFeatured
                  ? 'bg-[#C8B6FF] text-[#111214] border-[#B49DF8]'
                  : 'bg-white dark:bg-[#16181E] text-[#111214] dark:text-[#F4F5F7] border-[#E2E4DF] dark:border-[#282B35]'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-display font-bold">{pkg.name}</h2>
                  {isFeatured && (
                    <span className="px-2.5 py-0.5 rounded-full bg-[#111214] text-[#D9F154] text-[10px] font-bold">
                      Best Margin
                    </span>
                  )}
                </div>
                <p className="text-xs opacity-80">{pkg.tagline}</p>

                <div
                  className={`pt-2 border-t ${
                    isFeatured ? 'border-black/15' : 'border-black/10 dark:border-white/10'
                  }`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-display font-bold font-mono-tabular">
                      {formatMoney(pkg.monthlyRetainerUsd, currency)}
                    </span>
                    <span className="text-xs opacity-75">/ month</span>
                  </div>
                  <div className="text-xs font-mono-tabular opacity-80 mt-0.5">
                    + {formatMoney(pkg.setupUsd, currency)} one-time setup
                  </div>
                </div>

                <div className="space-y-3 pt-2 text-xs">
                  <div>
                    <div className="font-bold mb-1">SEO & Maps</div>
                    <ul className="space-y-1">
                      {pkg.deliverables.seo.map((d) => (
                        <li key={d} className="flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div className="font-bold mb-1">Web Development & CRO</div>
                    <ul className="space-y-1">
                      {pkg.deliverables.webDev.map((d) => (
                        <li key={d} className="flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div className="font-bold mb-1">AI & Workflow Automation</div>
                    <ul className="space-y-1">
                      {pkg.deliverables.automation.map((d) => (
                        <li key={d} className="flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div
                  className={`rounded-2xl p-3 text-[11px] font-medium ${
                    isFeatured ? 'bg-black/10' : 'bg-black/5 dark:bg-white/5'
                  }`}
                >
                  ROI Case: {pkg.roiPitch}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onSendOfferToOutreach(
                      country.id,
                      niche.id,
                      `${pkg.name} (${formatMoney(pkg.monthlyRetainerUsd, currency)}/mo)`
                    )
                  }
                  className={`w-full py-2.5 rounded-2xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    isFeatured
                      ? 'bg-[#111214] text-[#D9F154] hover:bg-[#23252A]'
                      : 'bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] hover:bg-[#23252A] dark:hover:bg-[#E4FA6C]'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate Outreach for This Package
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
