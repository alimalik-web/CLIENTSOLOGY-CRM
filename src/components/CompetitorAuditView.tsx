import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BookmarkCheck,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Gauge,
  Globe,
  Loader2,
  Mail,
  Search,
  Send,
  Smartphone,
  Sparkles,
  Target,
  Trash2,
  XCircle,
} from 'lucide-react';
import { GLOBAL_COUNTRIES } from '../data/globalMarkets';
import { OPERATING_NICHES } from '../data/operatingNiches';
import { ensureHttpUrl, safeCopyText, safeReadJsonResponse } from '../lib/appUtils';
import {
  CompetitorAuditReport,
  SeoHealthCheckReport,
  exportCompetitorKeywordsCsv,
  loadSavedCompetitorAudits,
  normalizeCompetitorUrl,
  persistCompetitorAudits,
} from '../lib/competitorAudit';
import { EmailRecipientContext } from '../lib/emailTemplates';
import { Prospect } from '../types/crm';

interface Props {
  prospects: Prospect[];
  initialProspectId?: string;
  onSaveAngleToProspect: (
    prospectId: string,
    competitorAdvantage: string,
    auditSummaryNote: string
  ) => void;
  onOpenGmailForProspect: (ctx: EmailRecipientContext) => void;
  onOpenOutreachGenerator: (
    countryId: string,
    nicheId?: string,
    prefill?: { businessName?: string; contactName?: string; serviceSummary?: string }
  ) => void;
  onInspectProspectInCrm?: (prospectId: string) => void;
}

const SAMPLE_COMPETITORS_BY_NICHE: { label: string; url: string; niche: string }[] = [
  { label: 'Aspen Dental (Dental Group)', url: 'https://www.aspendental.com', niche: 'Cosmetic & Implant Dentistry' },
  { label: 'One Hour Heating & Air (HVAC)', url: 'https://www.onehourheatandair.com', niche: 'HVAC & Plumbing Contractors' },
  { label: 'Morgan & Morgan (Law Firm)', url: 'https://www.forthepeople.com', niche: 'Law Firms & Personal Injury' },
  { label: 'Ideal Image (Med Spa)', url: 'https://www.idealimage.com', niche: 'Med-Spas & Aesthetic Clinics' },
];

function resolveCountryId(countryName: string): string {
  const lower = (countryName || '').toLowerCase();
  return GLOBAL_COUNTRIES.find((c) => lower.includes(c.name.toLowerCase()))?.id || 'usa';
}

function resolveNicheId(nicheName: string): string {
  const lower = (nicheName || '').toLowerCase();
  return (
    OPERATING_NICHES.find(
      (n) => n.name.toLowerCase().includes(lower) || lower.includes(n.name.toLowerCase())
    )?.id || OPERATING_NICHES[0].id
  );
}

export const CompetitorAuditView: React.FC<Props> = ({
  prospects,
  initialProspectId,
  onSaveAngleToProspect,
  onOpenGmailForProspect,
  onOpenOutreachGenerator,
  onInspectProspectInCrm,
}) => {
  const [selectedProspectId, setSelectedProspectId] = useState<string>(
    initialProspectId || prospects[0]?.id || ''
  );
  const selectedProspect = useMemo(
    () => prospects.find((p) => p.id === selectedProspectId) || null,
    [prospects, selectedProspectId]
  );

  const [activeMode, setActiveMode] = useState<'competitor' | 'health'>('competitor');
  const [competitorUrl, setCompetitorUrl] = useState<string>('');
  const [healthUrl, setHealthUrl] = useState<string>(() =>
    selectedProspect?.website ? ensureHttpUrl(selectedProspect.website) : ''
  );
  const [targetNiche, setTargetNiche] = useState<string>(
    selectedProspect?.categoryNiche || OPERATING_NICHES[0].name
  );
  const [targetLocation, setTargetLocation] = useState<string>(
    selectedProspect
      ? [selectedProspect.city, selectedProspect.stateOrRegion, selectedProspect.country]
          .filter(Boolean)
          .join(', ')
      : 'United States'
  );

  useEffect(() => {
    if (initialProspectId) {
      setSelectedProspectId(initialProspectId);
    }
  }, [initialProspectId]);

  useEffect(() => {
    if (selectedProspect) {
      setTargetNiche(selectedProspect.categoryNiche);
      setTargetLocation(
        [selectedProspect.city, selectedProspect.stateOrRegion, selectedProspect.country]
          .filter(Boolean)
          .join(', ')
      );
      if (selectedProspect.website) {
        const cleanSite = ensureHttpUrl(selectedProspect.website);
        if (cleanSite) setHealthUrl(cleanSite);
      }
    }
  }, [selectedProspect]);

  const prospectsWithWebsites = useMemo(
    () => prospects.filter((p) => Boolean(ensureHttpUrl(p.website))).slice(0, 8),
    [prospects]
  );

  const [savedAudits, setSavedAudits] = useState<CompetitorAuditReport[]>(() =>
    loadSavedCompetitorAudits()
  );
  const [activeReport, setActiveReport] = useState<CompetitorAuditReport | null>(
    () => loadSavedCompetitorAudits()[0] || null
  );

  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [keywordFilter, setKeywordFilter] = useState<
    'all' | 'gap' | 'Transactional' | 'Local' | 'On-Page'
  >('all');
  const [keywordSearch, setKeywordSearch] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [savedToProspectId, setSavedToProspectId] = useState<string | null>(null);

  // One-Click SEO Health Check State
  const [healthReport, setHealthReport] = useState<SeoHealthCheckReport | null>(null);
  const [recentHealthReports, setRecentHealthReports] = useState<SeoHealthCheckReport[]>([]);
  const [isHealthChecking, setIsHealthChecking] = useState<boolean>(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthTagFilter, setHealthTagFilter] = useState<'all' | 'issues' | 'passed'>('all');
  const [healthSavedToProspectId, setHealthSavedToProspectId] = useState<string | null>(null);

  const handleCopy = async (key: string, text: string) => {
    const ok = await safeCopyText(text);
    if (ok) {
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    }
  };

  const handleRunAudit = async (urlOverride?: string) => {
    const rawTarget = (urlOverride ?? competitorUrl).trim();
    const check = normalizeCompetitorUrl(rawTarget);
    if (!check.valid) {
      setAuditError(check.error || 'Enter a valid competitor website URL.');
      return;
    }

    if (urlOverride) {
      setCompetitorUrl(urlOverride);
    }

    setIsAuditing(true);
    setAuditError(null);
    setSavedToProspectId(null);

    try {
      const res = await fetch('/api/competitor/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competitorUrl: check.url,
          prospectId: selectedProspect?.id || '',
          prospectBusinessName: selectedProspect?.businessName || '',
          prospectWebsite: selectedProspect?.website || '',
          targetNiche: targetNiche.trim(),
          targetLocation: targetLocation.trim(),
          prospectServiceInterest: selectedProspect?.serviceInterest || '',
        }),
      });

      const data = await safeReadJsonResponse<
        CompetitorAuditReport & { error?: string; message?: string }
      >(res);

      if (!res.ok) {
        setAuditError(data.message || 'Unable to complete competitor audit.');
        return;
      }

      setActiveReport(data);
      setKeywordFilter('all');
      setKeywordSearch('');

      setSavedAudits((prev) => {
        const filtered = prev.filter((item) => item.domain !== data.domain);
        const next = [data, ...filtered].slice(0, 12);
        persistCompetitorAudits(next);
        return next;
      });
    } catch (err) {
      setAuditError(
        err instanceof Error ? err.message : 'Network error running competitor SEO audit.'
      );
    } finally {
      setIsAuditing(false);
    }
  };

  const handleDeleteAuditFromHistory = (id: string) => {
    setSavedAudits((prev) => {
      const next = prev.filter((a) => a.id !== id);
      persistCompetitorAudits(next);
      if (activeReport?.id === id) {
        setActiveReport(next[0] || null);
      }
      return next;
    });
  };

  const filteredKeywords = useMemo(() => {
    if (!activeReport) return [];
    return activeReport.seoKeywords.filter((kw) => {
      if (keywordFilter === 'gap' && kw.presence !== 'Keyword Gap') return false;
      if (keywordFilter === 'Transactional' && kw.intent !== 'Transactional') return false;
      if (keywordFilter === 'Local' && kw.intent !== 'Local') return false;
      if (keywordFilter === 'On-Page' && kw.presence === 'Keyword Gap') return false;
      if (keywordSearch.trim()) {
        const q = keywordSearch.toLowerCase();
        return (
          kw.keyword.toLowerCase().includes(q) ||
          kw.prospectOpportunity.toLowerCase().includes(q) ||
          kw.intent.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [activeReport, keywordFilter, keywordSearch]);

  const gapCount = useMemo(
    () =>
      activeReport
        ? activeReport.seoKeywords.filter((k) => k.presence === 'Keyword Gap').length
        : 0,
    [activeReport]
  );

  const handleSaveToCrmProspect = () => {
    if (!activeReport || !selectedProspect) return;
    const summaryNote = `[Competitor Audit: ${activeReport.domain} | Est. DA ${activeReport.domainAuthority.score}/100] Value Prop: ${activeReport.valueProposition.headline} — Hook: ${activeReport.valueProposition.outreachHook}`;
    onSaveAngleToProspect(
      selectedProspect.id,
      activeReport.valueProposition.headline,
      summaryNote
    );
    setSavedToProspectId(selectedProspect.id);
  };

  const handleSendViaGmail = () => {
    if (!activeReport) return;
    const target = selectedProspect;
    onOpenGmailForProspect({
      prospectId: target?.id,
      contactName: target?.contactPerson || 'Decision Maker',
      roleTitle: target?.roleTitle || 'Owner',
      businessName: target?.businessName || 'Your Business',
      email: target?.email || '',
      phone: target?.phone || '',
      website: target?.website || '',
      address: targetLocation,
      city: target?.city || '',
      stateOrRegion: target?.stateOrRegion || '',
      country: target?.country || '',
      niche: targetNiche,
      serviceInterest: activeReport.valueProposition.recommendedOffer,
      competitorAdvantage: activeReport.valueProposition.headline,
      opportunitySignals: activeReport.weaknesses.slice(0, 3),
      replyNotes: `${activeReport.valueProposition.coreStatement}\n\nSuggested Subject: ${activeReport.valueProposition.emailSubject}\n\n${activeReport.valueProposition.emailBody}`,
      stage: target?.stage || 'New Lead',
      ticketUsd: target?.ticketUsd || 1500,
      lastContacted: target?.lastContacted || '',
      leadPriority: target?.leadQuality || 'Hot',
    });
  };

  const handleRunHealthCheck = async (urlOverride?: string, prospectOverride?: Prospect) => {
    const targetProspect = prospectOverride || selectedProspect;
    if (prospectOverride) {
      setSelectedProspectId(prospectOverride.id);
    }
    const rawTarget = (urlOverride ?? healthUrl).trim();
    const check = normalizeCompetitorUrl(rawTarget);
    if (!check.valid) {
      setHealthError(check.error || 'Enter a valid prospect website URL (e.g. https://example.com).');
      return;
    }

    setActiveMode('health');
    setHealthUrl(check.url);
    setIsHealthChecking(true);
    setHealthError(null);
    setHealthSavedToProspectId(null);

    try {
      const res = await fetch('/api/seo/health-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          websiteUrl: check.url,
          prospectId: targetProspect?.id || '',
          prospectBusinessName: targetProspect?.businessName || '',
        }),
      });

      const data = await safeReadJsonResponse<
        SeoHealthCheckReport & { error?: string; message?: string }
      >(res);

      if (!res.ok) {
        setHealthError(data.message || 'Unable to run SEO health check on this URL.');
        return;
      }

      setHealthReport(data);
      setHealthTagFilter('all');
      setRecentHealthReports((prev) => [
        data,
        ...prev.filter((item) => item.domain !== data.domain),
      ].slice(0, 8));
    } catch (err) {
      setHealthError(
        err instanceof Error ? err.message : 'Network error running SEO health check.'
      );
    } finally {
      setIsHealthChecking(false);
    }
  };

  const filteredHealthChecks = useMemo(() => {
    if (!healthReport) return [];
    return healthReport.metaTags.checks.filter((item) => {
      if (healthTagFilter === 'issues') return item.status !== 'pass';
      if (healthTagFilter === 'passed') return item.status === 'pass';
      return true;
    });
  }, [healthReport, healthTagFilter]);

  const handleSaveHealthCheckToProspect = () => {
    if (!healthReport || !selectedProspect) return;
    const topFixLine = healthReport.topFixes[0] || 'Improve on-page SEO & mobile conversion funnel';
    const note = `[30s SEO Health Check: ${healthReport.domain} | Score ${healthReport.healthScore}/100] Speed: ${healthReport.loadSpeed.responseTimeMs ?? 'N/A'}ms (${healthReport.loadSpeed.grade}) · Mobile: ${healthReport.mobileFriendliness.grade} · Meta Issues: ${healthReport.metaTags.missingCount} missing, ${healthReport.metaTags.warningCount} warnings. Summary: ${healthReport.thirtySecondSummary}`;
    onSaveAngleToProspect(selectedProspect.id, topFixLine, note);
    setHealthSavedToProspectId(selectedProspect.id);
  };

  const handleSendHealthCheckViaGmail = () => {
    if (!healthReport) return;
    const target = selectedProspect;
    const topFixBullets = healthReport.topFixes.map((f, i) => `${i + 1}. ${f}`).join('\n');
    onOpenGmailForProspect({
      prospectId: target?.id,
      contactName: target?.contactPerson || 'Decision Maker',
      roleTitle: target?.roleTitle || 'Owner',
      businessName: target?.businessName || healthReport.prospectBusinessName || healthReport.domain,
      email: target?.email || '',
      phone: target?.phone || '',
      website: healthReport.normalizedUrl,
      address: targetLocation,
      city: target?.city || '',
      stateOrRegion: target?.stateOrRegion || '',
      country: target?.country || '',
      niche: targetNiche,
      serviceInterest: 'Technical SEO & Conversion Optimization',
      competitorAdvantage: healthReport.topFixes[0] || 'Fix mobile viewport & missing SEO meta-tags',
      opportunitySignals: healthReport.topFixes.slice(0, 3),
      replyNotes: `30-Second SEO Health Check (${healthReport.healthScore}/100):\n${healthReport.thirtySecondSummary}\n\nPriority Fixes:\n${topFixBullets}\n\nOutreach Hook:\n${healthReport.outreachPitchHook}`,
      stage: target?.stage || 'New Lead',
      ticketUsd: target?.ticketUsd || 1500,
      lastContacted: target?.lastContacted || '',
      leadPriority: target?.leadQuality || 'Hot',
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 lg:p-6 bg-[#F3F4F1] dark:bg-[#0D0E12] text-[#111214] dark:text-[#F4F5F7]">
      <div className="max-w-[1440px] mx-auto space-y-5">
        {/* TOP AUDIT CONFIGURATION CARD */}
        <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#ECEEE8] dark:border-[#242731] pb-4">
            <div className="space-y-1 max-w-2xl">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] flex items-center justify-center shrink-0">
                  <Target className="w-4 h-4" />
                </div>
                <h1 className="text-lg sm:text-xl font-display font-bold tracking-tight">
                  Competitor SEO &amp; Domain Authority Audit
                </h1>
              </div>
              <p className="text-xs text-[#555963] dark:text-[#A1A6B3] leading-relaxed">
                Enter any competitor website URL to inspect live on-page SEO signals, fetch
                grounded Domain Authority &amp; ranking keywords, uncover conversion gaps, and
                generate a sharp value proposition tailored to your selected CRM prospect.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center p-1 rounded-xl bg-[#F3F4F1] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#282B35]">
                <button
                  type="button"
                  onClick={() => setActiveMode('competitor')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    activeMode === 'competitor'
                      ? 'bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214]'
                      : 'text-[#555963] dark:text-[#A1A6B3] hover:text-[#111214] dark:hover:text-[#F4F5F7]'
                  }`}
                >
                  <Target className="w-3.5 h-3.5" />
                  Competitor Audit
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode('health')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    activeMode === 'health'
                      ? 'bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214]'
                      : 'text-[#555963] dark:text-[#A1A6B3] hover:text-[#111214] dark:hover:text-[#F4F5F7]'
                  }`}
                >
                  <Gauge className="w-3.5 h-3.5" />
                  One-Click SEO Health Check
                </button>
              </div>

              {selectedProspect && ensureHttpUrl(selectedProspect.website) && activeMode === 'competitor' && (
                <button
                  type="button"
                  onClick={() => handleRunHealthCheck(selectedProspect.website, selectedProspect)}
                  className="px-3.5 py-2 rounded-xl bg-[#D9F154] text-[#111214] text-xs font-semibold hover:bg-[#e5f876] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Gauge className="w-3.5 h-3.5" />
                  30s Health Check ({selectedProspect.businessName})
                </button>
              )}

              {selectedProspect && onInspectProspectInCrm && (
                <button
                  type="button"
                  onClick={() => onInspectProspectInCrm(selectedProspect.id)}
                  className="px-3.5 py-2 rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-xs font-semibold text-[#111214] dark:text-[#F4F5F7] hover:border-[#111214] dark:hover:border-[#D9F154] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Open Prospect in Workbench
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {activeMode === 'competitor' ? (
            <>
              {/* COMPETITOR AUDIT FORM GRID */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleRunAudit();
                }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end"
              >
                <div className="lg:col-span-4 space-y-1">
                  <label className="block text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF]">
                    Competitor Website URL
                  </label>
                  <div className="relative">
                    <Globe className="w-4 h-4 text-[#7A7E87] dark:text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={competitorUrl}
                      onChange={(e) => setCompetitorUrl(e.target.value)}
                      placeholder="https://competitor-domain.com"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] placeholder:text-[#9A9FA8] dark:placeholder:text-[#6B7280] text-xs font-mono-tabular"
                    />
                  </div>
                </div>

                <div className="lg:col-span-3 space-y-1">
                  <label className="block text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF]">
                    Target CRM Prospect
                  </label>
                  <select
                    value={selectedProspectId}
                    onChange={(e) => setSelectedProspectId(e.target.value)}
                    className="w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] px-3 py-2.5 text-xs"
                  >
                    <option value="">Standalone Market Audit (No Prospect)</option>
                    {prospects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.businessName} · {p.city} ({p.stage})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-2 space-y-1">
                  <label className="block text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF]">
                    Target Niche
                  </label>
                  <input
                    value={targetNiche}
                    onChange={(e) => setTargetNiche(e.target.value)}
                    placeholder="e.g. Cosmetic Dentistry"
                    className="w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] px-3 py-2.5 text-xs"
                  />
                </div>

                <div className="lg:col-span-3 flex items-center gap-2">
                  <div className="flex-1 space-y-1 min-w-0">
                    <label className="block text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF]">
                      Target City / Market
                    </label>
                    <input
                      value={targetLocation}
                      onChange={(e) => setTargetLocation(e.target.value)}
                      placeholder="e.g. Austin, TX"
                      className="w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] px-3 py-2.5 text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isAuditing}
                    className="px-4 py-2.5 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                  >
                    {isAuditing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Auditing...
                      </>
                    ) : (
                      <>
                        <Search className="w-3.5 h-3.5" />
                        Run Audit
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* RECENT SAVED AUDITS STRIP */}
              {savedAudits.length > 0 && (
                <div className="pt-2 border-t border-[#ECEEE8] dark:border-[#242731] flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF]">
                    Recent Audits:
                  </span>
                  {savedAudits.map((item) => {
                    const isActive = activeReport?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        className={`inline-flex items-center rounded-lg border text-xs transition-colors ${
                          isActive
                            ? 'bg-[#111214] dark:bg-[#23262F] text-white border-[#111214] dark:border-[#D9F154]'
                            : 'bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#3D404A] dark:text-[#C9CDD4] border-[#E2E4DF] dark:border-[#282B35]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveReport(item);
                            setCompetitorUrl(item.normalizedUrl);
                            setAuditError(null);
                          }}
                          className="px-2.5 py-1 font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <span>{item.domain}</span>
                          <span
                            className={`font-mono-tabular text-[11px] ${
                              isActive ? 'text-[#D9F154]' : 'text-[#666A73] dark:text-[#9CA3AF]'
                            }`}
                          >
                            DA {item.domainAuthority.score}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAuditFromHistory(item.id)}
                          className="pr-2 py-1 opacity-60 hover:opacity-100 cursor-pointer"
                          title="Remove from history"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {auditError && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-700/60 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200">
                  {auditError}
                </div>
              )}
            </>
          ) : (
            <>
              {/* ONE-CLICK SEO HEALTH CHECK FORM */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleRunHealthCheck();
                }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end"
              >
                <div className="lg:col-span-4 space-y-1">
                  <label className="block text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF]">
                    CRM Prospect (Auto-fills Website)
                  </label>
                  <select
                    value={selectedProspectId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedProspectId(nextId);
                      const found = prospects.find((p) => p.id === nextId);
                      if (found?.website) {
                        const clean = ensureHttpUrl(found.website);
                        if (clean) setHealthUrl(clean);
                      }
                    }}
                    className="w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] px-3 py-2.5 text-xs"
                  >
                    <option value="">Custom Website URL (No CRM Prospect)</option>
                    {prospects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.businessName} · {p.website ? p.website.replace(/^https?:\/\/(www\.)?/, '') : 'No website listed'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-5 space-y-1">
                  <label className="block text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF]">
                    Prospect Website URL to Inspect
                  </label>
                  <div className="relative">
                    <Globe className="w-4 h-4 text-[#7A7E87] dark:text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={healthUrl}
                      onChange={(e) => setHealthUrl(e.target.value)}
                      placeholder="https://prospect-website.com"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] placeholder:text-[#9A9FA8] dark:placeholder:text-[#6B7280] text-xs font-mono-tabular"
                    />
                  </div>
                </div>

                <div className="lg:col-span-3 flex items-center justify-end gap-2">
                  <button
                    type="submit"
                    disabled={isHealthChecking}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-60"
                  >
                    {isHealthChecking ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Inspecting HTML...
                      </>
                    ) : (
                      <>
                        <Gauge className="w-3.5 h-3.5" />
                        Run One-Click Health Check
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* 1-CLICK CRM PROSPECT LAUNCHER STRIP */}
              {prospectsWithWebsites.length > 0 && (
                <div className="pt-2 border-t border-[#ECEEE8] dark:border-[#242731] flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF]">
                    1-Click CRM Prospect Checks:
                  </span>
                  {prospectsWithWebsites.map((p) => {
                    const isCurrent =
                      healthReport?.prospectId === p.id ||
                      (selectedProspectId === p.id && healthUrl === ensureHttpUrl(p.website));
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleRunHealthCheck(p.website, p)}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
                          isCurrent
                            ? 'bg-[#111214] dark:bg-[#23262F] text-white border-[#111214] dark:border-[#D9F154]'
                            : 'bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#3D404A] dark:text-[#C9CDD4] border-[#E2E4DF] dark:border-[#282B35] hover:border-[#111214] dark:hover:border-[#D9F154]'
                        }`}
                      >
                        <Activity className="w-3 h-3 text-[#0F5132] dark:text-[#D9F154]" />
                        <span>{p.businessName}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {recentHealthReports.length > 0 && (
                <div className="pt-2 border-t border-[#ECEEE8] dark:border-[#242731] flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF]">
                    Checked This Session:
                  </span>
                  {recentHealthReports.map((item) => {
                    const isActive = healthReport?.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setHealthReport(item);
                          setHealthUrl(item.normalizedUrl);
                          setHealthError(null);
                        }}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                          isActive
                            ? 'bg-[#111214] dark:bg-[#23262F] text-white border-[#111214] dark:border-[#D9F154]'
                            : 'bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#3D404A] dark:text-[#C9CDD4] border-[#E2E4DF] dark:border-[#282B35]'
                        }`}
                      >
                        <span>{item.domain}</span>
                        <span className="font-mono-tabular text-[11px] text-[#0F5132] dark:text-[#D9F154]">
                          {item.healthScore}/100
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {healthError && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-700/60 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200">
                  {healthError}
                </div>
              )}
            </>
          )}
        </div>

        {activeMode === 'competitor' && (
          <>
            {/* LOADING SKELETON */}
            {isAuditing && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className="bg-white dark:bg-[#16181E] rounded-2xl border border-[#E2E4DF] dark:border-[#282B35] p-4 space-y-2 animate-pulse"
                    >
                      <div className="h-3 w-28 bg-[#E5E7E2] dark:bg-[#242731] rounded" />
                      <div className="h-7 w-20 bg-[#E5E7E2] dark:bg-[#242731] rounded" />
                      <div className="h-3 w-40 bg-[#ECEEE8] dark:bg-[#1C1F26] rounded" />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-7 h-72 bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] animate-pulse" />
                  <div className="lg:col-span-5 h-72 bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] animate-pulse" />
                </div>
              </div>
            )}

            {/* POPULATED AUDIT REPORT */}
            {!isAuditing && activeReport && (
          <>
            {/* 4-COLUMN KPI STRIP */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-[#16181E] rounded-2xl border border-[#E2E4DF] dark:border-[#282B35] p-4">
                <div className="text-[11px] font-medium text-[#666A73] dark:text-[#9CA3AF]">
                  Domain Authority (Grounded Est.)
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-display font-bold font-mono-tabular">
                    {activeReport.domainAuthority.score}
                  </span>
                  <span className="text-xs font-mono-tabular text-[#666A73] dark:text-[#9CA3AF]">
                    / 100
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-[#3D404A] dark:text-[#C9CDD4]">
                  {activeReport.domainAuthority.tier} Tier ·{' '}
                  {activeReport.domainAuthority.confidence} Confidence
                </div>
              </div>

              <div className="bg-white dark:bg-[#16181E] rounded-2xl border border-[#E2E4DF] dark:border-[#282B35] p-4">
                <div className="text-[11px] font-medium text-[#666A73] dark:text-[#9CA3AF]">
                  SEO Keywords Analyzed
                </div>
                <div className="mt-1 text-2xl font-display font-bold font-mono-tabular">
                  {activeReport.seoKeywords.length}
                </div>
                <div className="mt-1 text-[11px] text-[#3D404A] dark:text-[#C9CDD4]">
                  {activeReport.seoKeywords.length - gapCount} Targeted ·{' '}
                  <span className="font-semibold text-[#0F5132] dark:text-[#6AE4C0]">
                    {gapCount} Keyword Gaps
                  </span>
                </div>
              </div>

              <div className="bg-white dark:bg-[#16181E] rounded-2xl border border-[#E2E4DF] dark:border-[#282B35] p-4">
                <div className="text-[11px] font-medium text-[#666A73] dark:text-[#9CA3AF]">
                  Live Technical Crawl
                </div>
                <div className="mt-1 text-2xl font-display font-bold font-mono-tabular">
                  {activeReport.onPageSignals.siteReachable
                    ? `${activeReport.onPageSignals.responseTimeMs ?? '—'} ms`
                    : activeReport.onPageSignals.httpStatus
                      ? `HTTP ${activeReport.onPageSignals.httpStatus}`
                      : 'Search Only'}
                </div>
                <div className="mt-1 text-[11px] text-[#3D404A] dark:text-[#C9CDD4]">
                  {activeReport.onPageSignals.isHttps ? 'HTTPS Active' : 'No HTTPS'} ·{' '}
                  {activeReport.onPageSignals.schemaTypes.length > 0
                    ? `${activeReport.onPageSignals.schemaTypes.length} Schema Types`
                    : 'No Schema.org'}
                </div>
              </div>

              <div className="bg-white dark:bg-[#16181E] rounded-2xl border border-[#E2E4DF] dark:border-[#282B35] p-4">
                <div className="text-[11px] font-medium text-[#666A73] dark:text-[#9CA3AF]">
                  Target Prospect Context
                </div>
                <div className="mt-1 text-sm font-display font-bold truncate">
                  {selectedProspect?.businessName ||
                    activeReport.prospectBusinessName ||
                    'Standalone Audit'}
                </div>
                <div className="mt-1.5 text-[11px] text-[#3D404A] dark:text-[#C9CDD4] truncate">
                  {targetNiche} · {targetLocation}
                </div>
              </div>
            </div>

            {/* MAIN 12-COLUMN INTELLIGENCE SPLIT */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* LEFT 7 COLUMNS: SEO KEYWORDS TABLE & ON-PAGE TELEMETRY */}
              <div className="lg:col-span-7 space-y-5">
                {/* SEO KEYWORDS MATRIX */}
                <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-display font-bold">
                        SEO Keywords &amp; Opportunity Gaps
                      </h2>
                      <p className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                        Competitor domain: {activeReport.domain} · Audited{' '}
                        {new Date(activeReport.auditedAt).toLocaleDateString()}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => exportCompetitorKeywordsCsv(activeReport)}
                      className="px-3 py-1.5 rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-xs font-semibold text-[#111214] dark:text-[#F4F5F7] hover:border-[#111214] dark:hover:border-[#D9F154] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export CSV
                    </button>
                  </div>

                  {/* FILTER TABS & SEARCH */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#F3F4F1] dark:bg-[#1C1F26]">
                      {(
                        [
                          { id: 'all', label: `All (${activeReport.seoKeywords.length})` },
                          { id: 'gap', label: `Gaps (${gapCount})` },
                          { id: 'Transactional', label: 'Transactional' },
                          { id: 'Local', label: 'Local' },
                          { id: 'On-Page', label: 'Current Terms' },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setKeywordFilter(tab.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                            keywordFilter === tab.id
                              ? 'bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214]'
                              : 'text-[#555963] dark:text-[#A1A6B3] hover:text-[#111214] dark:hover:text-[#F4F5F7]'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-[#7A7E87] dark:text-[#9CA3AF] absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        value={keywordSearch}
                        onChange={(e) => setKeywordSearch(e.target.value)}
                        placeholder="Search keywords..."
                        className="pl-8 pr-3 py-1.5 rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-xs w-44"
                      />
                    </div>
                  </div>

                  {/* TABLE */}
                  <div className="overflow-x-auto border border-[#E2E4DF] dark:border-[#282B35] rounded-2xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#F8F9F7] dark:bg-[#1C1F26] border-b border-[#E2E4DF] dark:border-[#282B35] text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF]">
                          <th className="py-2.5 px-3.5">Keyword</th>
                          <th className="py-2.5 px-3">Intent / Status</th>
                          <th className="py-2.5 px-3">Difficulty</th>
                          <th className="py-2.5 px-3.5">Prospect Attack Angle</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#ECEEE8] dark:divide-[#242731]">
                        {filteredKeywords.map((kw, idx) => (
                          <tr
                            key={`${kw.keyword}-${idx}`}
                            className="hover:bg-[#FAFAF8] dark:hover:bg-[#1C1F26]/65 transition-colors"
                          >
                            <td className="py-2.5 px-3.5 max-w-[200px]">
                              <div className="font-semibold text-[#111214] dark:text-[#F4F5F7]">
                                {kw.keyword}
                              </div>
                              <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF] font-mono-tabular">
                                {kw.monthlySearchPotential}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <div className="font-medium text-[#111214] dark:text-[#F4F5F7]">
                                {kw.intent}
                              </div>
                              <div
                                className={`text-[11px] font-semibold ${
                                  kw.presence === 'Keyword Gap'
                                    ? 'text-[#0F5132] dark:text-[#6AE4C0]'
                                    : 'text-[#666A73] dark:text-[#9CA3AF]'
                                }`}
                              >
                                {kw.presence}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap font-mono-tabular text-[11px]">
                              {kw.difficulty}
                            </td>
                            <td className="py-2.5 px-3.5 text-[11px] text-[#3D404A] dark:text-[#C9CDD4] leading-relaxed">
                              {kw.prospectOpportunity}
                            </td>
                          </tr>
                        ))}
                        {filteredKeywords.length === 0 && (
                          <tr>
                            <td
                              colSpan={4}
                              className="py-6 text-center text-xs text-[#666A73] dark:text-[#9CA3AF]"
                            >
                              No keywords match the current filter.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* AUTHORITY & ON-PAGE TELEMETRY DIAGNOSTICS */}
                <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2 border-b border-[#ECEEE8] dark:border-[#242731] pb-3">
                    <h2 className="text-base font-display font-bold">
                      Domain Authority &amp; On-Page SEO Signals
                    </h2>
                    {ensureHttpUrl(activeReport.normalizedUrl) && (
                      <a
                        href={ensureHttpUrl(activeReport.normalizedUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-[#0A66C2] dark:text-[#6AE4C0] hover:underline inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        Visit {activeReport.domain}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  {activeReport.onPageSignals.fetchNote && (
                    <div className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/50 rounded-xl px-3 py-2">
                      {activeReport.onPageSignals.fetchNote}
                    </div>
                  )}

                  <div className="divide-y divide-[#ECEEE8] dark:divide-[#242731] text-xs">
                    <div className="py-2.5 grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-4 font-semibold text-[#555963] dark:text-[#9CA3AF]">
                        Authority Rationale
                      </div>
                      <div className="sm:col-span-8 text-[#111214] dark:text-[#F4F5F7] leading-relaxed">
                        {activeReport.domainAuthority.rationale}
                      </div>
                    </div>

                    <div className="py-2.5 grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-4 font-semibold text-[#555963] dark:text-[#9CA3AF]">
                        Indexed &amp; Backlink Footprint
                      </div>
                      <div className="sm:col-span-8 text-[#3D404A] dark:text-[#C9CDD4] space-y-1">
                        <div>{activeReport.domainAuthority.indexedFootprint}</div>
                        <div className="text-[#666A73] dark:text-[#9CA3AF]">
                          {activeReport.domainAuthority.backlinkProfileSummary}
                        </div>
                      </div>
                    </div>

                    <div className="py-2.5 grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-4 font-semibold text-[#555963] dark:text-[#9CA3AF]">
                        Title Tag ({activeReport.onPageSignals.titleLength} chars)
                      </div>
                      <div className="sm:col-span-8 font-medium">
                        {activeReport.onPageSignals.title || 'Not detected'}
                      </div>
                    </div>

                    <div className="py-2.5 grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-4 font-semibold text-[#555963] dark:text-[#9CA3AF]">
                        Meta Description ({activeReport.onPageSignals.metaDescriptionLength} chars)
                      </div>
                      <div className="sm:col-span-8 text-[#3D404A] dark:text-[#C9CDD4]">
                        {activeReport.onPageSignals.metaDescription || 'Missing meta description'}
                      </div>
                    </div>

                    <div className="py-2.5 grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-4 font-semibold text-[#555963] dark:text-[#9CA3AF]">
                        H1 Headings &amp; Structure
                      </div>
                      <div className="sm:col-span-8 text-[#3D404A] dark:text-[#C9CDD4] space-y-1">
                        <div>
                          {activeReport.onPageSignals.h1Headings.length > 0
                            ? activeReport.onPageSignals.h1Headings.join(' · ')
                            : 'No H1 tag detected'}
                        </div>
                        <div className="text-[11px] font-mono-tabular text-[#666A73] dark:text-[#9CA3AF]">
                          Word Count: {activeReport.onPageSignals.wordCount} · Internal Links:{' '}
                          {activeReport.onPageSignals.internalLinksCount} · External:{' '}
                          {activeReport.onPageSignals.externalLinksCount} · Canonical:{' '}
                          {activeReport.onPageSignals.hasCanonical ? 'Yes' : 'No'} · Viewport:{' '}
                          {activeReport.onPageSignals.hasMobileViewport ? 'Mobile-ready' : 'Missing'}
                        </div>
                      </div>
                    </div>

                    <div className="py-2.5 grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-4 font-semibold text-[#555963] dark:text-[#9CA3AF]">
                        Schema.org Structured Data
                      </div>
                      <div className="sm:col-span-8 font-mono-tabular">
                        {activeReport.onPageSignals.schemaTypes.length > 0
                          ? activeReport.onPageSignals.schemaTypes.join(', ')
                          : 'None detected (opportunity for LocalBusiness / FAQ Schema)'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT 5 COLUMNS: TAILORED VALUE PROPOSITION & WEAKNESS EXPLOITATION */}
              <div className="lg:col-span-5 space-y-5">
                {/* VALUE PROPOSITION PLAYBOOK CARD */}
                <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3 border-b border-[#ECEEE8] dark:border-[#242731] pb-3.5">
                    <div>
                      <div className="text-[11px] font-semibold text-[#6D28D9] dark:text-[#C8B6FF]">
                        Value Proposition Crafted for{' '}
                        {selectedProspect?.businessName || 'Your Prospect'}
                      </div>
                      <h2 className="text-base font-display font-bold mt-0.5 leading-snug">
                        {activeReport.valueProposition.headline}
                      </h2>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          'vp',
                          `${activeReport.valueProposition.headline}\n\n${activeReport.valueProposition.coreStatement}\n\nDifferentiators:\n${activeReport.valueProposition.differentiators
                            .map((d) => `- ${d}`)
                            .join('\n')}`
                        )
                      }
                      className="p-2 rounded-xl border border-[#D9DBD5] dark:border-[#323643] hover:border-[#111214] dark:hover:border-[#D9F154] text-[#555963] dark:text-[#9CA3AF] shrink-0 cursor-pointer"
                      title="Copy value proposition"
                    >
                      {copiedKey === 'vp' ? (
                        <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  <p className="text-xs text-[#3D404A] dark:text-[#C9CDD4] leading-relaxed">
                    {activeReport.valueProposition.coreStatement}
                  </p>

                  {/* DIFFERENTIATORS */}
                  <div className="space-y-2 pt-1">
                    <div className="text-xs font-semibold text-[#111214] dark:text-[#F4F5F7]">
                      How Your Prospect Wins Against {activeReport.domain}
                    </div>
                    <ul className="space-y-2 text-xs text-[#3D404A] dark:text-[#C9CDD4]">
                      {activeReport.valueProposition.differentiators.map((diff, idx) => (
                        <li key={idx} className="flex items-start gap-2 leading-relaxed">
                          <span className="font-mono-tabular font-bold text-[#111214] dark:text-[#D9F154] shrink-0">
                            0{idx + 1}.
                          </span>
                          <span>{diff}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* RECOMMENDED OFFER */}
                  <div className="pt-3 border-t border-[#ECEEE8] dark:border-[#242731] space-y-1">
                    <div className="text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF]">
                      Recommended Agency Offer Stack
                    </div>
                    <div className="text-xs font-semibold text-[#111214] dark:text-[#F4F5F7]">
                      {activeReport.valueProposition.recommendedOffer}
                    </div>
                  </div>

                  {/* OUTREACH HOOK & EMAIL DRAFT */}
                  <div className="pt-3 border-t border-[#ECEEE8] dark:border-[#242731] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#111214] dark:text-[#F4F5F7]">
                        Ready-to-Send Prospect Outreach Pitch
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            'email',
                            `Subject: ${activeReport.valueProposition.emailSubject}\n\n${
                              activeReport.valueProposition.emailBody ||
                              activeReport.valueProposition.outreachHook
                            }`
                          )
                        }
                        className="text-[11px] font-semibold text-[#3D404A] dark:text-[#C9CDD4] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === 'email' ? (
                          <>
                            <Check className="w-3 h-3 text-[#16A34A]" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy Pitch
                          </>
                        )}
                      </button>
                    </div>
                    <div className="text-xs bg-[#F8F9F7] dark:bg-[#1C1F26] rounded-2xl p-3.5 space-y-1.5 text-[#3D404A] dark:text-[#C9CDD4] leading-relaxed">
                      <div className="font-semibold text-[#111214] dark:text-[#F4F5F7]">
                        Subject: {activeReport.valueProposition.emailSubject}
                      </div>
                      <p className="whitespace-pre-line">
                        {activeReport.valueProposition.emailBody ||
                          activeReport.valueProposition.outreachHook}
                      </p>
                    </div>
                  </div>

                  {/* CRM & OUTREACH ACTIONS */}
                  <div className="pt-2 space-y-2">
                    {selectedProspect && (
                      <button
                        type="button"
                        onClick={handleSaveToCrmProspect}
                        className="w-full py-2.5 px-4 rounded-xl bg-[#D9F154] text-[#111214] text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-[#e5f876] cursor-pointer"
                      >
                        {savedToProspectId === selectedProspect.id ? (
                          <>
                            <BookmarkCheck className="w-4 h-4" />
                            Saved Angle to {selectedProspect.businessName}
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            Save Value Prop to {selectedProspect.businessName}
                          </>
                        )}
                      </button>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleSendViaGmail}
                        className="py-2 px-3 rounded-xl bg-[#111214] dark:bg-[#23262F] text-white text-xs font-semibold flex items-center justify-center gap-1.5 hover:opacity-90 cursor-pointer"
                      >
                        <Mail className="w-3.5 h-3.5 text-[#D9F154]" />
                        Send Gmail
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenOutreachGenerator(
                            resolveCountryId(selectedProspect?.country || targetLocation),
                            resolveNicheId(targetNiche),
                            {
                              businessName: selectedProspect?.businessName,
                              contactName: selectedProspect?.contactPerson,
                              serviceSummary: activeReport.valueProposition.recommendedOffer,
                            }
                          )
                        }
                        className="py-2 px-3 rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-white dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] text-xs font-semibold flex items-center justify-center gap-1.5 hover:border-[#111214] dark:hover:border-[#D9F154] cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Outreach Scripts
                      </button>
                    </div>
                  </div>
                </div>

                {/* COMPETITOR WEAKNESSES & STRENGTHS */}
                <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-sm font-display font-bold">
                      Exploitable Competitor Weaknesses
                    </h3>
                    <ul className="space-y-1.5 text-xs text-[#3D404A] dark:text-[#C9CDD4]">
                      {activeReport.weaknesses.map((w, idx) => (
                        <li key={idx} className="leading-relaxed">
                          • {w}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {activeReport.strengths.length > 0 && (
                    <div className="pt-3 border-t border-[#ECEEE8] dark:border-[#242731] space-y-2">
                      <h3 className="text-sm font-display font-bold">
                        Competitor Strengths to Match
                      </h3>
                      <ul className="space-y-1.5 text-xs text-[#555963] dark:text-[#9CA3AF]">
                        {activeReport.strengths.map((s, idx) => (
                          <li key={idx} className="leading-relaxed">
                            • {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* GROUNDED WEB SOURCES FOOTER */}
            {activeReport.sources.length > 0 && (
              <div className="bg-white dark:bg-[#16181E] rounded-2xl border border-[#E2E4DF] dark:border-[#282B35] px-5 py-3.5 space-y-2">
                <div className="text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF]">
                  Verified Google Search Sources ({activeReport.sources.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeReport.sources.map((src, i) => {
                    const href = ensureHttpUrl(src.uri);
                    if (!href) return null;
                    return (
                      <a
                        key={`${href}-${i}`}
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-[#FAFAF8] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#282B35] text-[#3D404A] dark:text-[#C9CDD4] hover:border-[#111214] dark:hover:border-[#D9F154] inline-flex items-center gap-1 max-w-[280px] truncate"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">{src.title || href}</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

            {/* EMPTY STATE */}
            {!isAuditing && !activeReport && (
              <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-8 space-y-5">
                <div className="max-w-xl mx-auto text-center space-y-2">
                  <div className="w-11 h-11 rounded-2xl bg-[#F3F4F1] dark:bg-[#1C1F26] text-[#111214] dark:text-[#D9F154] mx-auto flex items-center justify-center">
                    <Target className="w-5 h-5" />
                  </div>
                  <h2 className="text-base font-display font-bold">
                    Audit a Competitor to Unlock a Winning Value Proposition
                  </h2>
                  <p className="text-xs text-[#555963] dark:text-[#A1A6B3] leading-relaxed">
                    Enter any competing local or regional business website above. Clientsology will
                    inspect its live HTML metadata, evaluate grounded Domain Authority and SEO keywords,
                    and write a customized pitch angle for your selected prospect.
                  </p>
                </div>

                <div className="max-w-3xl mx-auto pt-2 border-t border-[#ECEEE8] dark:border-[#242731]">
                  <div className="text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF] mb-2.5 text-center">
                    Or test with a live regional benchmark domain:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {SAMPLE_COMPETITORS_BY_NICHE.map((sample) => (
                      <button
                        key={sample.url}
                        type="button"
                        onClick={() => {
                          setTargetNiche(sample.niche);
                          handleRunAudit(sample.url);
                        }}
                        className="text-left p-3 rounded-xl border border-[#E2E4DF] dark:border-[#282B35] bg-[#FAFAF8] dark:bg-[#1C1F26] hover:border-[#111214] dark:hover:border-[#D9F154] transition-colors cursor-pointer"
                      >
                        <div className="text-xs font-semibold truncate">{sample.label}</div>
                        <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF] font-mono-tabular truncate mt-0.5">
                          {sample.url.replace(/^https?:\/\/(www\.)?/, '')}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ONE-CLICK SEO HEALTH CHECK VIEW */}
        {activeMode === 'health' && (
          <>
            {isHealthChecking && (
              <div className="space-y-4">
                <div className="h-44 bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] animate-pulse" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[0, 1, 2].map((idx) => (
                    <div
                      key={idx}
                      className="h-36 bg-white dark:bg-[#16181E] rounded-2xl border border-[#E2E4DF] dark:border-[#282B35] animate-pulse"
                    />
                  ))}
                </div>
                <div className="h-64 bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] animate-pulse" />
              </div>
            )}

            {!isHealthChecking && healthReport && (
              <div className="space-y-5">
                {/* 30-SECOND EXECUTIVE SUMMARY CARD */}
                <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 sm:p-6 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#ECEEE8] dark:border-[#242731] pb-4">
                    <div className="space-y-1 max-w-3xl">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF]">
                        <span>30-Second SEO Health Summary</span>
                        <span>·</span>
                        <span className="font-mono-tabular">{healthReport.domain}</span>
                        <span>·</span>
                        <span className="font-mono-tabular">
                          {healthReport.httpStatus ? `HTTP ${healthReport.httpStatus}` : 'No HTTP response'}
                        </span>
                        <span>·</span>
                        <span>{new Date(healthReport.checkedAt).toLocaleTimeString()}</span>
                      </div>
                      <h2 className="text-base sm:text-lg font-display font-bold">
                        {selectedProspect?.businessName || healthReport.prospectBusinessName || healthReport.domain}
                      </h2>
                      <p className="text-xs text-[#3D404A] dark:text-[#C9CDD4] leading-relaxed">
                        {healthReport.thirtySecondSummary}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[11px] font-medium text-[#666A73] dark:text-[#9CA3AF]">
                        SEO Health Score
                      </div>
                      <div className="flex items-baseline justify-end gap-1 mt-0.5">
                        <span
                          className={`text-3xl font-display font-bold font-mono-tabular ${
                            healthReport.healthScore >= 80
                              ? 'text-[#0F5132] dark:text-[#6AE4C0]'
                              : healthReport.healthScore >= 55
                                ? 'text-amber-700 dark:text-amber-300'
                                : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {healthReport.healthScore}
                        </span>
                        <span className="text-xs font-mono-tabular text-[#666A73] dark:text-[#9CA3AF]">
                          / 100
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* TOP PRIORITY FIXES + ACTION BAR */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                    <div className="lg:col-span-7 space-y-2">
                      <div className="text-xs font-semibold text-[#111214] dark:text-[#F4F5F7]">
                        Top Priority Fixes Detected
                      </div>
                      <ul className="space-y-1.5 text-xs text-[#3D404A] dark:text-[#C9CDD4]">
                        {healthReport.topFixes.map((fix, idx) => (
                          <li key={idx} className="flex items-start gap-2 leading-relaxed">
                            <span className="font-mono-tabular font-bold text-[#111214] dark:text-[#D9F154] shrink-0">
                              0{idx + 1}.
                            </span>
                            <span>{fix}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="lg:col-span-5 flex flex-wrap lg:justify-end gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            'health-summary',
                            `${healthReport.domain} — 30s SEO Health Check (${healthReport.healthScore}/100)\n\n${healthReport.thirtySecondSummary}\n\nPriority Fixes:\n${healthReport.topFixes.map((f, i) => `${i + 1}. ${f}`).join('\n')}`
                          )
                        }
                        className="px-3.5 py-2 rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-xs font-semibold text-[#111214] dark:text-[#F4F5F7] hover:border-[#111214] dark:hover:border-[#D9F154] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        {copiedKey === 'health-summary' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                            Copied 30s Summary
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copy 30s Summary
                          </>
                        )}
                      </button>

                      {selectedProspect && (
                        <button
                          type="button"
                          onClick={handleSaveHealthCheckToProspect}
                          className="px-3.5 py-2 rounded-xl bg-[#D9F154] text-[#111214] text-xs font-semibold hover:bg-[#e5f876] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          {healthSavedToProspectId === selectedProspect.id ? (
                            <>
                              <BookmarkCheck className="w-3.5 h-3.5" />
                              Saved to {selectedProspect.businessName}
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5" />
                              Save Check to CRM
                            </>
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handleSendHealthCheckViaGmail}
                        className="px-3.5 py-2 rounded-xl bg-[#111214] dark:bg-[#23262F] text-white text-xs font-semibold hover:opacity-90 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Mail className="w-3.5 h-3.5 text-[#D9F154]" />
                        Send Pitch via Gmail
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3 CORE DIAGNOSTIC PILLARS */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* PILLAR 1: SITE LOAD SPEED */}
                  <div className="bg-white dark:bg-[#16181E] rounded-2xl border border-[#E2E4DF] dark:border-[#282B35] p-5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] flex items-center gap-1.5">
                        <Gauge className="w-3.5 h-3.5" />
                        01. Site Load Speed
                      </div>
                      <span
                        className={`text-[11px] font-semibold ${
                          healthReport.loadSpeed.grade === 'Fast'
                            ? 'text-[#0F5132] dark:text-[#6AE4C0]'
                            : healthReport.loadSpeed.grade === 'Moderate'
                              ? 'text-amber-700 dark:text-amber-300'
                              : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {healthReport.loadSpeed.grade}
                      </span>
                    </div>
                    <div className="text-2xl font-display font-bold font-mono-tabular">
                      {healthReport.loadSpeed.responseTimeMs !== null
                        ? `${healthReport.loadSpeed.responseTimeMs} ms`
                        : 'Timeout'}
                    </div>
                    <div className="text-[11px] font-mono-tabular text-[#555963] dark:text-[#9CA3AF]">
                      {healthReport.loadSpeed.payloadKb} KB HTML ·{' '}
                      {healthReport.loadSpeed.isHttps ? 'HTTPS Active' : 'No HTTPS'} ·{' '}
                      {healthReport.loadSpeed.compressed ? 'Gzip/Brotli' : 'Uncompressed'}
                    </div>
                    <p className="text-xs text-[#3D404A] dark:text-[#C9CDD4] leading-relaxed">
                      {healthReport.loadSpeed.summary}
                    </p>
                  </div>

                  {/* PILLAR 2: MOBILE-FRIENDLINESS */}
                  <div className="bg-white dark:bg-[#16181E] rounded-2xl border border-[#E2E4DF] dark:border-[#282B35] p-5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] flex items-center gap-1.5">
                        <Smartphone className="w-3.5 h-3.5" />
                        02. Mobile-Friendliness
                      </div>
                      <span
                        className={`text-[11px] font-semibold ${
                          healthReport.mobileFriendliness.mobileFriendly
                            ? 'text-[#0F5132] dark:text-[#6AE4C0]'
                            : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {healthReport.mobileFriendliness.grade}
                      </span>
                    </div>
                    <div className="text-2xl font-display font-bold">
                      {healthReport.mobileFriendliness.mobileFriendly ? 'Passed' : 'Action Needed'}
                    </div>
                    <div className="text-[11px] font-mono-tabular text-[#555963] dark:text-[#9CA3AF]">
                      Viewport: {healthReport.mobileFriendliness.hasViewportTag ? 'Yes' : 'No'} ·{' '}
                      device-width: {healthReport.mobileFriendliness.hasDeviceWidth ? 'Yes' : 'No'} ·{' '}
                      Responsive CSS: {healthReport.mobileFriendliness.responsiveHintsDetected ? 'Yes' : 'No'}
                    </div>
                    <p className="text-xs text-[#3D404A] dark:text-[#C9CDD4] leading-relaxed">
                      {healthReport.mobileFriendliness.summary}
                    </p>
                  </div>

                  {/* PILLAR 3: META-TAG HEALTH */}
                  <div className="bg-white dark:bg-[#16181E] rounded-2xl border border-[#E2E4DF] dark:border-[#282B35] p-5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5" />
                        03. Meta-Tag Breakdown
                      </div>
                      <span className="text-[11px] font-mono-tabular text-[#555963] dark:text-[#9CA3AF]">
                        {healthReport.metaTags.checks.length} Checks
                      </span>
                    </div>
                    <div className="text-2xl font-display font-bold font-mono-tabular">
                      {healthReport.metaTags.missingCount} Missing
                    </div>
                    <div className="text-[11px] font-mono-tabular text-[#555963] dark:text-[#9CA3AF]">
                      <span className="text-[#0F5132] dark:text-[#6AE4C0]">
                        {healthReport.metaTags.passedCount} Passed
                      </span>{' '}
                      ·{' '}
                      <span className="text-amber-700 dark:text-amber-300">
                        {healthReport.metaTags.warningCount} Warnings
                      </span>{' '}
                      ·{' '}
                      <span className="text-rose-700 dark:text-rose-400">
                        {healthReport.metaTags.missingCount} Missing
                      </span>
                    </div>
                    <p className="text-xs text-[#3D404A] dark:text-[#C9CDD4] leading-relaxed">
                      Outreach Hook: {healthReport.outreachPitchHook}
                    </p>
                  </div>
                </div>

                {/* 10-POINT META-TAG & ON-PAGE CHECKLIST TABLE */}
                <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-display font-bold">
                        Meta-Tag &amp; Technical SEO Inspection
                      </h3>
                      <p className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                        Live HTML inspection for {healthReport.finalUrl}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F3F4F1] dark:bg-[#1C1F26]">
                      {(
                        [
                          { id: 'all', label: `All (${healthReport.metaTags.checks.length})` },
                          {
                            id: 'issues',
                            label: `Missing & Warnings (${healthReport.metaTags.missingCount + healthReport.metaTags.warningCount})`,
                          },
                          { id: 'passed', label: `Passed (${healthReport.metaTags.passedCount})` },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setHealthTagFilter(tab.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                            healthTagFilter === tab.id
                              ? 'bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214]'
                              : 'text-[#555963] dark:text-[#A1A6B3] hover:text-[#111214] dark:hover:text-[#F4F5F7]'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-[#E2E4DF] dark:border-[#282B35] rounded-2xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#F8F9F7] dark:bg-[#1C1F26] border-b border-[#E2E4DF] dark:border-[#282B35] text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF]">
                          <th className="py-2.5 px-3.5">Status</th>
                          <th className="py-2.5 px-3.5">Meta Tag / Signal</th>
                          <th className="py-2.5 px-3.5">Observed Value</th>
                          <th className="py-2.5 px-3.5">Recommended Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#ECEEE8] dark:divide-[#242731]">
                        {filteredHealthChecks.map((check) => (
                          <tr
                            key={check.id}
                            className="hover:bg-[#FAFAF8] dark:hover:bg-[#1C1F26]/65 transition-colors"
                          >
                            <td className="py-2.5 px-3.5 whitespace-nowrap">
                              {check.status === 'pass' ? (
                                <span className="inline-flex items-center gap-1.5 font-semibold text-[#0F5132] dark:text-[#6AE4C0]">
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  Pass
                                </span>
                              ) : check.status === 'warning' ? (
                                <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                  Warning
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 font-semibold text-rose-700 dark:text-rose-400">
                                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                                  Missing
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3.5 font-semibold text-[#111214] dark:text-[#F4F5F7] whitespace-nowrap">
                              {check.label}
                            </td>
                            <td className="py-2.5 px-3.5 font-mono-tabular text-[11px] text-[#3D404A] dark:text-[#C9CDD4] max-w-[260px] break-words">
                              {check.observedValue}
                            </td>
                            <td className="py-2.5 px-3.5 text-[11px] text-[#3D404A] dark:text-[#C9CDD4] leading-relaxed">
                              {check.recommendation}
                            </td>
                          </tr>
                        ))}
                        {filteredHealthChecks.length === 0 && (
                          <tr>
                            <td
                              colSpan={4}
                              className="py-6 text-center text-xs text-[#666A73] dark:text-[#9CA3AF]"
                            >
                              No checks match the selected filter.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {!isHealthChecking && !healthReport && (
              <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-8 space-y-5">
                <div className="max-w-xl mx-auto text-center space-y-2">
                  <div className="w-11 h-11 rounded-2xl bg-[#F3F4F1] dark:bg-[#1C1F26] text-[#111214] dark:text-[#D9F154] mx-auto flex items-center justify-center">
                    <Gauge className="w-5 h-5" />
                  </div>
                  <h2 className="text-base font-display font-bold">
                    One-Click 30-Second Prospect SEO Health Check
                  </h2>
                  <p className="text-xs text-[#555963] dark:text-[#A1A6B3] leading-relaxed">
                    Select any CRM prospect above or paste a business website URL to get an instant
                    summary of live server load speed, mobile viewport readiness, and missing SEO
                    meta-tags—ready to save to CRM or send in a cold email.
                  </p>
                </div>

                {prospectsWithWebsites.length > 0 && (
                  <div className="max-w-3xl mx-auto pt-3 border-t border-[#ECEEE8] dark:border-[#242731]">
                    <div className="text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF] mb-2.5 text-center">
                      Click any CRM prospect below to run an instant check:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {prospectsWithWebsites.slice(0, 6).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleRunHealthCheck(p.website, p)}
                          className="text-left p-3 rounded-xl border border-[#E2E4DF] dark:border-[#282B35] bg-[#FAFAF8] dark:bg-[#1C1F26] hover:border-[#111214] dark:hover:border-[#D9F154] transition-colors cursor-pointer"
                        >
                          <div className="text-xs font-semibold truncate">{p.businessName}</div>
                          <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF] font-mono-tabular truncate mt-0.5">
                            {p.website.replace(/^https?:\/\/(www\.)?/, '')}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
