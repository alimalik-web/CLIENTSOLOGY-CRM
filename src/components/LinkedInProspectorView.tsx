import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  Mail,
  MapPin,
  Play,
  Plus,
  Search,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react';
import { formatMoney } from '../data/currency';
import { GLOBAL_COUNTRIES } from '../data/globalMarkets';
import { OPERATING_NICHES } from '../data/operatingNiches';
import { ensureHttpUrl, safeReadJsonResponse } from '../lib/appUtils';
import { EmailRecipientContext } from '../lib/emailTemplates';
import {
  buildLinkedInSearchUrl,
  LINKEDIN_SEARCH_PRESETS,
  mapLinkedInProfileToProspect,
  normalizeLinkedInUrlKey,
  parseLinkedInSearchUrl,
  ScrapedLinkedInProfile,
} from '../lib/linkedinParser';
import { CurrencyCode, Prospect } from '../types/crm';

interface ScrapedRecordRow {
  profile: ScrapedLinkedInProfile;
  prospect: Prospect;
  inCrm: boolean;
  wasDuplicate: boolean;
}

interface ScrapeApiResponse {
  parsedParams?: {
    searchType: string;
    keywords: string;
    location: string;
  };
  profiles?: ScrapedLinkedInProfile[];
  sources?: { uri: string; title: string }[];
  grounded?: boolean;
  notice?: string;
  error?: string;
  message?: string;
}

interface Props {
  existingProspects: Prospect[];
  currency: CurrencyCode;
  onBatchImportProspects: (prospects: Prospect[]) => void;
  onOpenGmailForLead: (ctx: EmailRecipientContext) => void;
  onOpenOutreachGenerator: (
    countryId: string,
    nicheId?: string,
    prefill?: { businessName?: string; contactName?: string; serviceSummary?: string }
  ) => void;
  onInspectProspectInCrm?: (prospectId: string) => void;
}

function normalizeSigPart(val: string): string {
  return (val || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveCountryIdByName(countryName: string): string {
  const lower = (countryName || '').toLowerCase();
  const hit = GLOBAL_COUNTRIES.find((c) => lower.includes(c.name.toLowerCase()));
  return hit?.id || 'usa';
}

function resolveNicheIdByName(nicheName: string): string {
  const lower = (nicheName || '').toLowerCase();
  const hit = OPERATING_NICHES.find(
    (n) => n.name.toLowerCase().includes(lower) || lower.includes(n.name.toLowerCase())
  );
  return hit?.id || OPERATING_NICHES[0].id;
}

export const LinkedInProspectorView: React.FC<Props> = ({
  existingProspects,
  currency,
  onBatchImportProspects,
  onOpenGmailForLead,
  onOpenOutreachGenerator,
  onInspectProspectInCrm,
}) => {
  const defaultPreset = LINKEDIN_SEARCH_PRESETS[0];

  const [searchUrlInput, setSearchUrlInput] = useState<string>(defaultPreset.url);
  const [nicheOverride, setNicheOverride] = useState<string>(defaultPreset.niche);
  const [locationOverride, setLocationOverride] = useState<string>(defaultPreset.location);
  const [maxProfiles, setMaxProfiles] = useState<number>(10);
  const [autoParseToCrm, setAutoParseToCrm] = useState<boolean>(true);
  const [skipDuplicates, setSkipDuplicates] = useState<boolean>(true);

  const [showSnapshotDrawer, setShowSnapshotDrawer] = useState<boolean>(false);
  const [rawPastedText, setRawPastedText] = useState<string>('');

  const [isScraping, setIsScraping] = useState<boolean>(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeNotice, setScrapeNotice] = useState<string | null>(null);
  const [sources, setSources] = useState<{ uri: string; title: string }[]>([]);
  const [isGrounded, setIsGrounded] = useState<boolean>(false);
  const [records, setRecords] = useState<ScrapedRecordRow[]>([]);

  const [resultFilter, setResultFilter] = useState<'all' | 'hot' | 'warm' | 'in-crm'>('all');
  const [tableSearch, setTableSearch] = useState<string>('');

  const parsedUrl = useMemo(() => parseLinkedInSearchUrl(searchUrlInput), [searchUrlInput]);

  const existingLookup = useMemo(() => {
    const idSet = new Set<string>();
    const liUrlSet = new Set<string>();
    const personCompanySet = new Set<string>();

    existingProspects.forEach((p) => {
      idSet.add(p.id);
      if (p.linkedinUrl) {
        const key = normalizeLinkedInUrlKey(p.linkedinUrl);
        if (key) liUrlSet.add(key);
      }
      const sig = `${normalizeSigPart(p.contactPerson)}::${normalizeSigPart(p.businessName)}`;
      if (sig !== '::') personCompanySet.add(sig);
    });

    return { idSet, liUrlSet, personCompanySet };
  }, [existingProspects]);

  const handleSelectPreset = (presetId: string) => {
    const preset = LINKEDIN_SEARCH_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSearchUrlInput(preset.url);
    setNicheOverride(preset.niche);
    setLocationOverride(preset.location);
    setScrapeError(null);
  };

  const handleBuildUrlFromFilters = () => {
    const combinedKeywords = [nicheOverride.trim(), locationOverride.trim()]
      .filter(Boolean)
      .join(' ');
    if (!combinedKeywords) {
      setScrapeError('Enter a target niche or location before building a LinkedIn search URL.');
      return;
    }
    const generated = buildLinkedInSearchUrl(combinedKeywords, 'people');
    setSearchUrlInput(generated);
    setScrapeError(null);
  };

  const handleRunLinkedInScrape = async (mode: 'url' | 'snapshot' = 'url') => {
    const trimmedUrl = searchUrlInput.trim();
    const trimmedSnapshot = rawPastedText.trim();

    if (mode === 'url' && !trimmedUrl && !trimmedSnapshot) {
      setScrapeError('Paste a LinkedIn search URL or open the snapshot parser to paste search text.');
      return;
    }
    if (mode === 'snapshot' && !trimmedSnapshot) {
      setScrapeError('Paste copied LinkedIn search results text first.');
      return;
    }

    setIsScraping(true);
    setScrapeError(null);
    setScrapeNotice(null);

    try {
      const res = await fetch('/api/linkedin/prospect-scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkedinSearchUrl: trimmedUrl,
          nicheOverride: nicheOverride.trim() || parsedUrl.keywords || parsedUrl.titleFilter,
          locationOverride: locationOverride.trim() || parsedUrl.resolvedLocation,
          searchType: parsedUrl.searchType,
          limit: maxProfiles,
          rawPastedText: mode === 'snapshot' ? trimmedSnapshot : '',
        }),
      });

      const data = await safeReadJsonResponse<ScrapeApiResponse>(res);

      if (res.status === 429 || data.error === 'QUOTA_EXCEEDED') {
        setScrapeError(
          data.message || 'Gemini API rate limit reached. Wait a few seconds and retry.'
        );
        return;
      }

      if (!res.ok) {
        setScrapeError(data.message || 'Unable to scrape LinkedIn prospects for this query.');
        return;
      }

      const incomingProfiles = data.profiles || [];
      const fallbackNiche =
        nicheOverride.trim() || data.parsedParams?.keywords || parsedUrl.keywords || 'B2B Services';
      const fallbackLocation =
        locationOverride.trim() ||
        data.parsedParams?.location ||
        parsedUrl.resolvedLocation ||
        'United States';

      const nextRows: ScrapedRecordRow[] = [];
      const batchToImport: Prospect[] = [];
      const batchSeenKeys = new Set<string>();

      incomingProfiles.forEach((profile) => {
        const prospect = mapLinkedInProfileToProspect(profile, fallbackNiche, fallbackLocation);
        const liKey = normalizeLinkedInUrlKey(profile.linkedinUrl);
        const personCompanySig = `${normalizeSigPart(profile.fullName)}::${normalizeSigPart(
          profile.companyName
        )}`;

        if (batchSeenKeys.has(liKey || personCompanySig)) return;
        batchSeenKeys.add(liKey || personCompanySig);

        const isExistingDup =
          existingLookup.idSet.has(prospect.id) ||
          (Boolean(liKey) && existingLookup.liUrlSet.has(liKey)) ||
          (personCompanySig !== '::' && existingLookup.personCompanySet.has(personCompanySig));

        if (skipDuplicates && isExistingDup) {
          nextRows.push({
            profile,
            prospect,
            inCrm: true,
            wasDuplicate: true,
          });
          return;
        }

        if (autoParseToCrm) {
          batchToImport.push(prospect);
        }

        nextRows.push({
          profile,
          prospect,
          inCrm: autoParseToCrm,
          wasDuplicate: false,
        });
      });

      if (batchToImport.length > 0) {
        onBatchImportProspects(batchToImport);
      }

      setRecords(nextRows);
      setSources(data.sources || []);
      setIsGrounded(Boolean(data.grounded));
      setScrapeNotice(data.notice || null);
    } catch (err) {
      setScrapeError(
        err instanceof Error ? err.message : 'Network error during LinkedIn prospecting.'
      );
    } finally {
      setIsScraping(false);
    }
  };

  const handleImportSingle = (profileId: string) => {
    const target = records.find((r) => r.profile.profileId === profileId);
    if (!target || target.inCrm) return;
    onBatchImportProspects([target.prospect]);
    setRecords((prev) =>
      prev.map((r) => (r.profile.profileId === profileId ? { ...r, inCrm: true } : r))
    );
  };

  const handleImportAllPending = () => {
    const pending = records.filter((r) => !r.inCrm);
    if (pending.length === 0) return;
    onBatchImportProspects(pending.map((r) => r.prospect));
    const pendingIds = new Set(pending.map((r) => r.profile.profileId));
    setRecords((prev) =>
      prev.map((r) => (pendingIds.has(r.profile.profileId) ? { ...r, inCrm: true } : r))
    );
  };

  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      if (resultFilter === 'hot' && rec.profile.leadQuality !== 'Hot') return false;
      if (resultFilter === 'warm' && rec.profile.leadQuality !== 'Warm') return false;
      if (resultFilter === 'in-crm' && !rec.inCrm) return false;

      if (tableSearch.trim()) {
        const q = tableSearch.toLowerCase();
        return (
          rec.profile.fullName.toLowerCase().includes(q) ||
          rec.profile.roleTitle.toLowerCase().includes(q) ||
          rec.profile.companyName.toLowerCase().includes(q) ||
          rec.profile.location.toLowerCase().includes(q) ||
          rec.profile.headline.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [records, resultFilter, tableSearch]);

  const stats = useMemo(() => {
    const total = records.length;
    const withVerifiedUrl = records.filter((r) => Boolean(ensureHttpUrl(r.profile.linkedinUrl))).length;
    const importedCount = records.filter((r) => r.inCrm && !r.wasDuplicate).length;
    const pendingCount = records.filter((r) => !r.inCrm).length;
    return { total, withVerifiedUrl, importedCount, pendingCount };
  }, [records]);

  const previewHref = parsedUrl.isValidLinkedInUrl ? ensureHttpUrl(searchUrlInput) : '';

  return (
    <div className="flex-1 overflow-y-auto p-5 lg:p-6 bg-[#F3F4F1] dark:bg-[#0D0E12] text-[#111214] dark:text-[#F4F5F7]">
      <div className="max-w-[1440px] mx-auto space-y-5">
        {/* HERO / HEADER CARD */}
        <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#ECEEE8] dark:border-[#242731] pb-4">
            <div className="space-y-1 max-w-2xl">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <h1 className="text-lg sm:text-xl font-display font-bold tracking-tight">
                  Automated LinkedIn Prospecting
                </h1>
              </div>
              <p className="text-xs text-[#555963] dark:text-[#A1A6B3] leading-relaxed">
                Paste any LinkedIn People, Company, or Sales Navigator search URL for your target
                niche and city. Clientsology decodes the URL parameters, extracts verified public
                decision-maker profiles via grounded search, and auto-parses leads into your CRM.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {previewHref && (
                <a
                  href={previewHref}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-xs font-semibold text-[#111214] dark:text-[#F4F5F7] hover:border-[#111214] dark:hover:border-[#D9F154] flex items-center gap-1.5 whitespace-nowrap"
                >
                  Preview on LinkedIn
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              )}
              <button
                type="button"
                disabled={isScraping}
                onClick={() => handleRunLinkedInScrape('url')}
                className="px-4 py-2 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-60"
              >
                {isScraping ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Scraping Profiles...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Scrape LinkedIn URL
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 1-CLICK HIGH-TICKET LINKEDIN PRESETS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#111214] dark:text-[#F4F5F7]">
                01. Quick High-Ticket Search Presets
              </span>
              <span className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                Select a preset or paste your own LinkedIn search URL below
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {LINKEDIN_SEARCH_PRESETS.map((preset) => {
                const isActive = searchUrlInput.trim() === preset.url;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id)}
                    className={`text-left px-3 py-2 rounded-xl border text-xs transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#111214] dark:bg-[#23262F] text-white border-[#111214] dark:border-[#D9F154]'
                        : 'bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] border-[#E2E4DF] dark:border-[#282B35] hover:border-[#111214] dark:hover:border-[#3E4352]'
                    }`}
                  >
                    <div className="font-semibold truncate">{preset.label}</div>
                    <div
                      className={`text-[11px] truncate ${
                        isActive ? 'text-[#D9F154]' : 'text-[#666A73] dark:text-[#9CA3AF]'
                      }`}
                    >
                      {preset.niche}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* LINKEDIN SEARCH URL INPUT & LIVE URL INSPECTOR */}
          <div className="space-y-2.5 pt-1 border-t border-[#ECEEE8] dark:border-[#242731]">
            <label className="block text-xs font-semibold text-[#111214] dark:text-[#F4F5F7]">
              02. LinkedIn Search URL
            </label>
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[280px]">
                <Link2 className="w-4 h-4 text-[#7A7E87] dark:text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={searchUrlInput}
                  onChange={(e) => {
                    const nextUrl = e.target.value;
                    setSearchUrlInput(nextUrl);
                    const quickParsed = parseLinkedInSearchUrl(nextUrl);
                    if (quickParsed.keywords) setNicheOverride(quickParsed.keywords);
                    if (quickParsed.resolvedLocation) setLocationOverride(quickParsed.resolvedLocation);
                  }}
                  placeholder="https://www.linkedin.com/search/results/people/?keywords=Cosmetic%20Dentist&geoUrn=%5B%22102257491%22%5D"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] placeholder:text-[#9A9FA8] dark:placeholder:text-[#6B7280] text-xs font-mono-tabular"
                />
              </div>
              <button
                type="button"
                onClick={handleBuildUrlFromFilters}
                className="px-3.5 py-2 rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-white dark:bg-[#23262F] text-[#111214] dark:text-[#F4F5F7] hover:border-[#111214] dark:hover:border-[#D9F154] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#6D28D9] dark:text-[#C8B6FF]" />
                Build URL from Filters
              </button>
            </div>

            {/* LIVE URL INSPECTOR STRIP */}
            {searchUrlInput.trim() && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#282B35] rounded-2xl px-3.5 py-2.5">
                <span className="font-semibold text-[#555963] dark:text-[#9CA3AF]">
                  Decoded URL:
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-[#111214] dark:bg-[#252833] text-[#D9F154] font-semibold capitalize">
                  Scope: {parsedUrl.searchType}
                </span>
                {parsedUrl.keywords && (
                  <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-[#16181E] border border-[#E2E4DF] dark:border-[#2E323F] text-[#111214] dark:text-[#F4F5F7]">
                    Keywords: <strong>{parsedUrl.keywords}</strong>
                  </span>
                )}
                {parsedUrl.titleFilter && (
                  <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-[#16181E] border border-[#E2E4DF] dark:border-[#2E323F] text-[#111214] dark:text-[#F4F5F7]">
                    Title: <strong>{parsedUrl.titleFilter}</strong>
                  </span>
                )}
                {parsedUrl.resolvedLocation && (
                  <span className="px-2 py-0.5 rounded-lg bg-[#6AE4C0]/20 text-[#0F5132] dark:text-[#6AE4C0] font-semibold">
                    geoUrn → {parsedUrl.resolvedLocation}
                  </span>
                )}
                {!parsedUrl.resolvedLocation && parsedUrl.geoUrns.length > 0 && (
                  <span className="px-2 py-0.5 rounded-lg bg-[#C8B6FF]/25 text-[#3B2A7A] dark:text-[#C8B6FF] font-mono-tabular">
                    geoUrn: {parsedUrl.geoUrns.join(', ')}
                  </span>
                )}
                {parsedUrl.warning && (
                  <span className="text-amber-700 dark:text-amber-300 font-medium">
                    · {parsedUrl.warning}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* NICHE / LOCATION REFINEMENT & CRM RULES */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1 border-t border-[#ECEEE8] dark:border-[#242731]">
            <div className="md:col-span-5 space-y-1">
              <label className="block text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF]">
                Target Niche / Role Keywords
              </label>
              <input
                value={nicheOverride}
                onChange={(e) => setNicheOverride(e.target.value)}
                placeholder="e.g. HVAC Owner, Cosmetic Dentist, Law Firm Partner"
                className="w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] px-3 py-2 text-xs"
              />
            </div>

            <div className="md:col-span-5 space-y-1">
              <label className="block text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF]">
                Target City / Region
              </label>
              <input
                value={locationOverride}
                onChange={(e) => setLocationOverride(e.target.value)}
                placeholder="e.g. Austin, Texas, United States or Dubai, UAE"
                className="w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] px-3 py-2 text-xs"
              />
            </div>

            <div className="md:col-span-2 space-y-1">
              <label className="block text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF]">
                Max Profiles
              </label>
              <select
                value={maxProfiles}
                onChange={(e) => setMaxProfiles(Number(e.target.value))}
                className="w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] px-3 py-2 text-xs font-mono-tabular"
              >
                <option value={5}>5 Profiles</option>
                <option value={10}>10 Profiles</option>
                <option value={15}>15 Profiles (Max)</option>
              </select>
            </div>
          </div>

          {/* CHECKBOXES & SNAPSHOT FALLBACK TOGGLE */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoParseToCrm}
                  onChange={(e) => setAutoParseToCrm(e.target.checked)}
                  className="rounded border-[#D9DBD5] dark:border-[#323643] accent-[#111214] dark:accent-[#D9F154]"
                />
                <span className="font-semibold text-[#111214] dark:text-[#F4F5F7]">
                  Auto-parse extracted profiles directly into CRM
                </span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                  className="rounded border-[#D9DBD5] dark:border-[#323643] accent-[#111214] dark:accent-[#D9F154]"
                />
                <span className="text-[#3D404A] dark:text-[#C9CDD4]">
                  Skip existing CRM duplicates
                </span>
              </label>
            </div>

            <button
              type="button"
              onClick={() => setShowSnapshotDrawer((prev) => !prev)}
              className="px-3 py-1.5 rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-xs font-semibold text-[#3D404A] dark:text-[#C9CDD4] hover:border-[#111214] dark:hover:border-[#D9F154] flex items-center gap-1.5 cursor-pointer"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              Paste LinkedIn Search Results Text
              {showSnapshotDrawer ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* COLLAPSIBLE SNAPSHOT TEXT PARSER */}
          {showSnapshotDrawer && (
            <div className="rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#282B35] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-[#111214] dark:text-[#F4F5F7]">
                    Sales Navigator / Logged-In LinkedIn Snapshot Parser
                  </div>
                  <p className="text-[11px] text-[#555963] dark:text-[#9CA3AF]">
                    Behind a LinkedIn login wall or private Sales Navigator list? Select &amp; copy
                    search results straight from your browser tab and paste them here to extract
                    structured CRM leads.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isScraping || !rawPastedText.trim()}
                  onClick={() => handleRunLinkedInScrape('snapshot')}
                  className="px-3.5 py-2 rounded-xl bg-[#D9F154] text-[#111214] text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Parse Pasted Results
                </button>
              </div>
              <textarea
                rows={5}
                value={rawPastedText}
                onChange={(e) => setRawPastedText(e.target.value)}
                placeholder="Paste copied LinkedIn people or company search results text here (names, titles, companies, locations, profile URLs)..."
                className="w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-white dark:bg-[#16181E] text-[#111214] dark:text-[#F4F5F7] placeholder:text-[#9A9FA8] dark:placeholder:text-[#6B7280] p-3 text-xs font-mono-tabular"
              />
            </div>
          )}

          {scrapeError && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-700/60 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200">
              {scrapeError}
            </div>
          )}

          {scrapeNotice && !scrapeError && (
            <div className="rounded-xl bg-[#C8B6FF]/20 border border-[#C8B6FF]/50 px-3.5 py-2.5 text-xs text-[#2B1F5C] dark:text-[#E2D9FF]">
              {scrapeNotice}
            </div>
          )}
        </div>

        {/* RESULTS KPI STRIP + DATA TABLE */}
        {records.length > 0 ? (
          <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 sm:p-6 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-[#FAFAF8] dark:bg-[#1C1F26] border border-[#E5E7E2] dark:border-[#282B35]">
                <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                  Profiles Extracted
                </div>
                <div className="text-lg font-bold font-mono-tabular mt-0.5">{stats.total}</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#FAFAF8] dark:bg-[#1C1F26] border border-[#E5E7E2] dark:border-[#282B35]">
                <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                  Verified LinkedIn URLs
                </div>
                <div className="text-lg font-bold font-mono-tabular mt-0.5">
                  {stats.withVerifiedUrl}
                </div>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#FAFAF8] dark:bg-[#1C1F26] border border-[#E5E7E2] dark:border-[#282B35]">
                <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                  Parsed into CRM
                </div>
                <div className="text-lg font-bold font-mono-tabular mt-0.5 text-[#0F5132] dark:text-[#6AE4C0]">
                  {stats.importedCount}
                </div>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#FAFAF8] dark:bg-[#1C1F26] border border-[#E5E7E2] dark:border-[#282B35]">
                <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                  Pending Manual Import
                </div>
                <div className="text-lg font-bold font-mono-tabular mt-0.5">
                  {stats.pendingCount}
                </div>
              </div>
            </div>

            {/* FILTER & ACTION TOOLBAR */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: `All (${records.length})` },
                    {
                      id: 'hot',
                      label: `Hot (${records.filter((r) => r.profile.leadQuality === 'Hot').length})`,
                    },
                    {
                      id: 'warm',
                      label: `Warm (${records.filter((r) => r.profile.leadQuality === 'Warm').length})`,
                    },
                    {
                      id: 'in-crm',
                      label: `In CRM (${records.filter((r) => r.inCrm).length})`,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setResultFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      resultFilter === tab.id
                        ? 'bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214]'
                        : 'bg-[#F3F4F1] dark:bg-[#23262F] text-[#3D404A] dark:text-[#C9CDD4] hover:bg-[#E5E7E2] dark:hover:bg-[#2C2F3A]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#7A7E87] dark:text-[#9CA3AF] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    placeholder="Filter extracted profiles..."
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] placeholder:text-[#9A9FA8] dark:placeholder:text-[#6B7280] text-xs w-52"
                  />
                </div>

                {stats.pendingCount > 0 && (
                  <button
                    type="button"
                    onClick={handleImportAllPending}
                    className="px-3.5 py-1.5 rounded-xl bg-[#D9F154] text-[#111214] text-xs font-semibold flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Import All Pending ({stats.pendingCount})
                  </button>
                )}
              </div>
            </div>

            {/* DATA TABLE */}
            <div className="overflow-x-auto border border-[#E2E4DF] dark:border-[#282B35] rounded-2xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F8F9F7] dark:bg-[#1C1F26] border-b border-[#E2E4DF] dark:border-[#282B35] text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF]">
                    <th className="py-2.5 px-3.5">Decision Maker &amp; Headline</th>
                    <th className="py-2.5 px-3">Company &amp; Location</th>
                    <th className="py-2.5 px-3">LinkedIn &amp; Website</th>
                    <th className="py-2.5 px-3 text-right">Est. Deal</th>
                    <th className="py-2.5 px-3.5 text-right">CRM &amp; Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECEEE8] dark:divide-[#242731]">
                  {filteredRecords.map((rec) => {
                    const { profile, prospect } = rec;
                    const safeLiUrl = ensureHttpUrl(profile.linkedinUrl);
                    const safeWebUrl = ensureHttpUrl(profile.website);

                    return (
                      <tr
                        key={profile.profileId}
                        className="hover:bg-[#FAFAF8] dark:hover:bg-[#1C1F26]/70 transition-colors"
                      >
                        <td className="py-3 px-3.5 max-w-[280px]">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[#111214] dark:text-[#F4F5F7] truncate">
                              {profile.fullName}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold shrink-0 ${
                                profile.leadQuality === 'Hot'
                                  ? 'bg-[#D9F154] text-[#111214]'
                                  : profile.leadQuality === 'Warm'
                                    ? 'bg-[#C8B6FF] text-[#111214]'
                                    : 'bg-[#E5E7E2] dark:bg-[#2A2D37] text-[#3D404A] dark:text-[#C9CDD4]'
                              }`}
                            >
                              {profile.leadQuality}
                            </span>
                          </div>
                          <div className="text-[11px] font-medium text-[#3D404A] dark:text-[#C9CDD4] truncate mt-0.5">
                            {profile.roleTitle}
                          </div>
                          {(profile.headline || profile.opportunitySignal) && (
                            <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF] truncate mt-0.5">
                              {profile.opportunitySignal || profile.headline}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3 max-w-[230px]">
                          <div className="font-medium text-[#111214] dark:text-[#F4F5F7] flex items-center gap-1 truncate">
                            <Building2 className="w-3.5 h-3.5 text-[#7A7E87] dark:text-[#9CA3AF] shrink-0" />
                            <span className="truncate">{profile.companyName || prospect.businessName}</span>
                          </div>
                          <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF] flex items-center gap-1 truncate mt-0.5">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">
                              {profile.location || `${prospect.city}, ${prospect.country}`}
                            </span>
                          </div>
                          <div className="text-[10px] text-[#6D28D9] dark:text-[#C8B6FF] truncate mt-0.5">
                            {prospect.categoryNiche}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            {safeLiUrl ? (
                              <a
                                href={safeLiUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[#0A66C2] dark:text-[#6AE4C0] hover:underline font-medium"
                              >
                                <ExternalLink className="w-3 h-3 shrink-0" />
                                LinkedIn Profile
                              </a>
                            ) : (
                              <span className="text-[#7A7E87] dark:text-[#6B7280] text-[11px]">
                                Profile URL unindexed
                              </span>
                            )}
                            {safeWebUrl && (
                              <div>
                                <a
                                  href={safeWebUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[#3D404A] dark:text-[#C9CDD4] hover:underline text-[11px]"
                                >
                                  <Globe className="w-3 h-3 shrink-0" />
                                  {safeWebUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                                </a>
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right font-mono-tabular font-semibold whitespace-nowrap">
                          {formatMoney(prospect.ticketUsd, currency)}
                        </td>

                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {rec.inCrm ? (
                              onInspectProspectInCrm ? (
                                <button
                                  type="button"
                                  onClick={() => onInspectProspectInCrm(prospect.id)}
                                  className="px-2.5 py-1 rounded-lg bg-[#6AE4C0]/20 text-[#0F5132] dark:text-[#6AE4C0] text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-[#6AE4C0]/30 cursor-pointer"
                                  title="Open prospect inside CRM Workbench"
                                >
                                  <Check className="w-3 h-3" />
                                  {rec.wasDuplicate ? 'Already in CRM' : 'In CRM'}
                                </button>
                              ) : (
                                <span className="px-2.5 py-1 rounded-lg bg-[#6AE4C0]/20 text-[#0F5132] dark:text-[#6AE4C0] text-[11px] font-semibold inline-flex items-center gap-1">
                                  <Check className="w-3 h-3" />
                                  In CRM
                                </span>
                              )
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleImportSingle(profile.profileId)}
                                className="px-2.5 py-1 rounded-lg bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                Import CRM
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                onOpenOutreachGenerator(
                                  resolveCountryIdByName(prospect.country),
                                  resolveNicheIdByName(prospect.categoryNiche),
                                  {
                                    businessName: prospect.businessName,
                                    contactName: prospect.contactPerson,
                                    serviceSummary: prospect.serviceInterest,
                                  }
                                )
                              }
                              className="px-2.5 py-1 rounded-lg border border-[#D9DBD5] dark:border-[#323643] bg-white dark:bg-[#23262F] text-[#111214] dark:text-[#F4F5F7] text-[11px] font-semibold hover:border-[#111214] dark:hover:border-[#D9F154] cursor-pointer"
                            >
                              Pitch
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                onOpenGmailForLead({
                                  prospectId: prospect.id,
                                  contactName: prospect.contactPerson,
                                  roleTitle: prospect.roleTitle,
                                  businessName: prospect.businessName,
                                  email: prospect.email,
                                  phone: prospect.phone,
                                  website: prospect.website,
                                  address: profile.location,
                                  city: prospect.city,
                                  stateOrRegion: prospect.stateOrRegion,
                                  country: prospect.country,
                                  niche: prospect.categoryNiche,
                                  serviceInterest: prospect.serviceInterest,
                                  competitorAdvantage: prospect.competitorAdvantage,
                                  opportunitySignals: profile.opportunitySignal
                                    ? [profile.opportunitySignal]
                                    : [],
                                  replyNotes: prospect.replyNotes,
                                  stage: prospect.stage,
                                  ticketUsd: prospect.ticketUsd,
                                  lastContacted: prospect.lastContacted,
                                  leadPriority: prospect.leadQuality,
                                })
                              }
                              className="p-1.5 rounded-lg bg-[#D9F154] text-[#111214] hover:bg-[#e5f876] cursor-pointer"
                              title="Send Gmail Outreach"
                            >
                              <Mail className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* GROUNDED GOOGLE SEARCH SOURCES FOOTER */}
            {(isGrounded || sources.length > 0) && (
              <div className="pt-2 border-t border-[#ECEEE8] dark:border-[#242731] space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF]">
                  <UserCheck className="w-3.5 h-3.5 text-[#6AE4C0]" />
                  <span>
                    Verified Public Sources ({sources.length})
                  </span>
                </div>
                {sources.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {sources.map((src, i) => {
                      const href = ensureHttpUrl(src.uri);
                      if (!href) return null;
                      return (
                        <a
                          key={`${href}-${i}`}
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#282B35] text-[#3D404A] dark:text-[#C9CDD4] hover:border-[#111214] dark:hover:border-[#D9F154] inline-flex items-center gap-1 max-w-[280px] truncate"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span className="truncate">{src.title || href}</span>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-8 text-center space-y-2">
            <div className="w-11 h-11 rounded-2xl bg-[#F3F4F1] dark:bg-[#1C1F26] text-[#111214] dark:text-[#D9F154] mx-auto flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-display font-bold">
              Ready to Extract LinkedIn Decision Makers
            </h2>
            <p className="text-xs text-[#555963] dark:text-[#A1A6B3] max-w-md mx-auto">
              Choose one of the high-ticket search presets above or paste a LinkedIn search URL
              for your target niche and city, then click{' '}
              <span className="font-semibold text-[#111214] dark:text-[#F4F5F7]">
                Scrape LinkedIn URL
              </span>
              .
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
