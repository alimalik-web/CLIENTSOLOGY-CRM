import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Globe2,
  Search,
  Send,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { formatMoney } from '../data/currency';
import { resolveNicheProfile } from '../lib/emailTemplates';
import {
  ChatLogItem,
  CurrencyCode,
  FollowUpItem,
  OperatingNiche,
  PipelineStage,
  Prospect,
} from '../types/crm';

interface Props {
  prospects: Prospect[];
  followUps: FollowUpItem[];
  chatLogs: ChatLogItem[];
  currency: CurrencyCode;
  onInspectProspect: (prospectId: string) => void;
  onNavigateToPricing: (nicheId: string) => void;
  onNavigateToOutreach: (nicheId: string) => void;
  onNavigateToMarkets: () => void;
}

type ChartMetric = 'profitability' | 'conversion' | 'ticket' | 'engagement';
type SortMetric = 'profitability' | 'conversion' | 'ticket' | 'engagement' | 'leads';
type MarketFitFilter = 'all' | OperatingNiche['marketFit'];

interface NicheSegmentRow {
  key: string;
  nicheName: string;
  matchedNiche?: OperatingNiche;
  marketFit: string;
  prospects: Prospect[];
  leadCount: number;
  hotCount: number;
  warmCount: number;
  contactedCount: number;
  advancedCount: number; // Proposal Sent + Negotiating + Closed Won
  wonCount: number;
  lostCount: number;
  closeRatePct: number;
  advancementRatePct: number;
  avgTicketUsd: number;
  minTicketUsd: number;
  maxTicketUsd: number;
  pipelineUsd: number;
  wonRevenueUsd: number;
  weightedPipelineUsd: number;
  totalExpectedValueUsd: number;
  outboundCount: number;
  inboundCount: number;
  followUpCount: number;
  followUpsCompleted: number;
  totalTouches: number;
  engagedLeadCount: number;
  engagementRatePct: number;
  replyRatioPct: number;
  avgTouchesPerLead: number;
  benchmarkMidUsd: number | null;
}

const STAGE_PROBABILITY: Record<PipelineStage, number> = {
  'New Lead': 0.1,
  Contacted: 0.2,
  'Follow Up': 0.3,
  'Proposal Sent': 0.5,
  Negotiating: 0.75,
  'Closed Won': 1.0,
  'Closed Lost': 0,
};

export const NichePerformanceDashboardView: React.FC<Props> = ({
  prospects,
  followUps,
  chatLogs,
  currency,
  onInspectProspect,
  onNavigateToPricing,
  onNavigateToOutreach,
  onNavigateToMarkets,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [marketFitFilter, setMarketFitFilter] = useState<MarketFitFilter>('all');
  const [sortBy, setSortBy] = useState<SortMetric>('profitability');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('profitability');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedNicheKey, setSelectedNicheKey] = useState<string>('');
  const [hoveredScatterKey, setHoveredScatterKey] = useState<string | null>(null);
  const [compareKeyA, setCompareKeyA] = useState<string>('');
  const [compareKeyB, setCompareKeyB] = useState<string>('');

  const scopedProspects = useMemo(
    () => (includeArchived ? prospects : prospects.filter((p) => p.status === 'Active')),
    [prospects, includeArchived]
  );

  // Aggregate real CRM telemetry segmented by niche
  const allNicheRows = useMemo<NicheSegmentRow[]>(() => {
    const groups = new Map<
      string,
      { nicheName: string; matchedNiche?: OperatingNiche; items: Prospect[] }
    >();

    scopedProspects.forEach((p) => {
      const matched = resolveNicheProfile(p.categoryNiche);
      const canonicalName = matched?.name || p.categoryNiche?.trim() || 'General Local Service';
      const key = matched?.id || canonicalName.toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(p);
      } else {
        groups.set(key, {
          nicheName: canonicalName,
          matchedNiche: matched,
          items: [p],
        });
      }
    });

    const rows: NicheSegmentRow[] = [];

    groups.forEach((group, key) => {
      const items = group.items;
      const prospectIds = new Set(items.map((p) => p.id));
      const nicheChats = chatLogs.filter((c) => prospectIds.has(c.prospectId));
      const nicheFollowUps = followUps.filter((f) => prospectIds.has(f.prospectId));

      const leadCount = items.length;
      const hotCount = items.filter((p) => p.leadQuality === 'Hot').length;
      const warmCount = items.filter((p) => p.leadQuality === 'Warm').length;
      const wonCount = items.filter((p) => p.stage === 'Closed Won').length;
      const lostCount = items.filter((p) => p.stage === 'Closed Lost').length;
      const advancedCount = items.filter((p) =>
        ['Proposal Sent', 'Negotiating', 'Closed Won'].includes(p.stage)
      ).length;
      const contactedCount = items.filter(
        (p) => p.stage !== 'New Lead' || Boolean(p.lastContacted)
      ).length;

      const closeRatePct = leadCount > 0 ? Math.round((wonCount / leadCount) * 100) : 0;
      const advancementRatePct =
        leadCount > 0 ? Math.round((advancedCount / leadCount) * 100) : 0;

      const ticketSum = items.reduce((acc, p) => acc + (Number(p.ticketUsd) || 0), 0);
      const avgTicketUsd = leadCount > 0 ? Math.round(ticketSum / leadCount) : 0;
      const tickets = items.map((p) => Number(p.ticketUsd) || 0);
      const minTicketUsd = tickets.length ? Math.min(...tickets) : 0;
      const maxTicketUsd = tickets.length ? Math.max(...tickets) : 0;

      const pipelineUsd = items
        .filter((p) => p.stage !== 'Closed Lost')
        .reduce((acc, p) => acc + (Number(p.ticketUsd) || 0), 0);

      const wonRevenueUsd = items
        .filter((p) => p.stage === 'Closed Won')
        .reduce((acc, p) => acc + (Number(p.ticketUsd) || 0), 0);

      const weightedPipelineUsd = items
        .filter((p) => p.stage !== 'Closed Won' && p.stage !== 'Closed Lost')
        .reduce(
          (acc, p) => acc + (Number(p.ticketUsd) || 0) * (STAGE_PROBABILITY[p.stage] ?? 0.2),
          0
        );

      const totalExpectedValueUsd = Math.round(wonRevenueUsd + weightedPipelineUsd);

      const outboundCount = nicheChats.filter((c) => c.direction === 'Outbound').length;
      const inboundCount = nicheChats.filter((c) => c.direction === 'Inbound').length;
      const followUpCount = nicheFollowUps.length;
      const followUpsCompleted = nicheFollowUps.filter((f) => f.done).length;

      // Also count prospects with logged lastContacted when no explicit chat log exists
      const implicitTouches = items.filter(
        (p) =>
          Boolean(p.lastContacted) &&
          !nicheChats.some((c) => c.prospectId === p.id)
      ).length;

      const totalTouches = nicheChats.length + followUpCount + implicitTouches;
      const engagedLeadCount = items.filter(
        (p) =>
          ['Proposal Sent', 'Negotiating', 'Closed Won', 'Follow Up'].includes(p.stage) ||
          nicheChats.some((c) => c.prospectId === p.id && c.direction === 'Inbound')
      ).length;

      const engagementRatePct =
        leadCount > 0 ? Math.round((engagedLeadCount / leadCount) * 100) : 0;
      const replyRatioPct =
        outboundCount > 0
          ? Math.min(100, Math.round((inboundCount / outboundCount) * 100))
          : engagementRatePct;
      const avgTouchesPerLead =
        leadCount > 0 ? Number((totalTouches / leadCount).toFixed(1)) : 0;

      const benchmarkMidUsd = group.matchedNiche
        ? Math.round(
            (group.matchedNiche.baseRetainerUsd[0] + group.matchedNiche.baseRetainerUsd[1]) / 2
          )
        : null;

      rows.push({
        key,
        nicheName: group.nicheName,
        matchedNiche: group.matchedNiche,
        marketFit: group.matchedNiche?.marketFit || 'Custom Segment',
        prospects: items,
        leadCount,
        hotCount,
        warmCount,
        contactedCount,
        advancedCount,
        wonCount,
        lostCount,
        closeRatePct,
        advancementRatePct,
        avgTicketUsd,
        minTicketUsd,
        maxTicketUsd,
        pipelineUsd,
        wonRevenueUsd,
        weightedPipelineUsd: Math.round(weightedPipelineUsd),
        totalExpectedValueUsd,
        outboundCount,
        inboundCount,
        followUpCount,
        followUpsCompleted,
        totalTouches,
        engagedLeadCount,
        engagementRatePct,
        replyRatioPct,
        avgTouchesPerLead,
        benchmarkMidUsd,
      });
    });

    return rows;
  }, [scopedProspects, chatLogs, followUps]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = allNicheRows.filter((r) => {
      if (marketFitFilter !== 'all' && r.marketFit !== marketFitFilter) return false;
      if (
        q &&
        !r.nicheName.toLowerCase().includes(q) &&
        !r.marketFit.toLowerCase().includes(q) &&
        !r.prospects.some((p) => (p.city || '').toLowerCase().includes(q))
      ) {
        return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'conversion':
          return (
            b.closeRatePct - a.closeRatePct ||
            b.advancementRatePct - a.advancementRatePct ||
            b.totalExpectedValueUsd - a.totalExpectedValueUsd
          );
        case 'ticket':
          return b.avgTicketUsd - a.avgTicketUsd || b.totalExpectedValueUsd - a.totalExpectedValueUsd;
        case 'engagement':
          return (
            b.engagementRatePct - a.engagementRatePct ||
            b.totalTouches - a.totalTouches
          );
        case 'leads':
          return b.leadCount - a.leadCount || b.totalExpectedValueUsd - a.totalExpectedValueUsd;
        case 'profitability':
        default:
          return (
            b.totalExpectedValueUsd - a.totalExpectedValueUsd ||
            b.avgTicketUsd - a.avgTicketUsd
          );
      }
    });
  }, [allNicheRows, marketFitFilter, searchQuery, sortBy]);

  // Global summary metrics across filtered segments
  const overallSummary = useMemo(() => {
    if (filteredRows.length === 0) return null;
    const byProfit = [...filteredRows].sort(
      (a, b) => b.totalExpectedValueUsd - a.totalExpectedValueUsd
    )[0];
    const byTicket = [...filteredRows].sort((a, b) => b.avgTicketUsd - a.avgTicketUsd)[0];
    const byConversion = [...filteredRows].sort(
      (a, b) =>
        b.closeRatePct - a.closeRatePct || b.advancementRatePct - a.advancementRatePct
    )[0];
    const byEngagement = [...filteredRows].sort(
      (a, b) => b.engagementRatePct - a.engagementRatePct || b.totalTouches - a.totalTouches
    )[0];

    const totalLeads = filteredRows.reduce((s, r) => s + r.leadCount, 0);
    const totalWon = filteredRows.reduce((s, r) => s + r.wonCount, 0);
    const totalAdvanced = filteredRows.reduce((s, r) => s + r.advancedCount, 0);
    const totalTicketSum = filteredRows.reduce(
      (s, r) => s + r.avgTicketUsd * r.leadCount,
      0
    );
    const overallAvgTicket = totalLeads > 0 ? Math.round(totalTicketSum / totalLeads) : 0;
    const overallAdvancementPct =
      totalLeads > 0 ? Math.round((totalAdvanced / totalLeads) * 100) : 0;

    return {
      byProfit,
      byTicket,
      byConversion,
      byEngagement,
      totalLeads,
      totalWon,
      overallAvgTicket,
      overallAdvancementPct,
    };
  }, [filteredRows]);

  // Selected drill-down niche
  const activeNiche = useMemo(() => {
    return (
      filteredRows.find((r) => r.key === selectedNicheKey) ||
      filteredRows[0] ||
      null
    );
  }, [filteredRows, selectedNicheKey]);

  // Head-to-head comparison niches
  const nicheA = useMemo(
    () => filteredRows.find((r) => r.key === compareKeyA) || filteredRows[0] || null,
    [filteredRows, compareKeyA]
  );
  const nicheB = useMemo(() => {
    const preferredSecond =
      filteredRows.find((r) => r.key === 'cosmetic-dentistry' && r.key !== nicheA?.key) ||
      filteredRows.find((r) => r.key !== nicheA?.key) ||
      filteredRows[0] ||
      null;
    return filteredRows.find((r) => r.key === compareKeyB) || preferredSecond;
  }, [filteredRows, compareKeyB, nicheA?.key]);

  // Bar chart scale max
  const chartMaxVal = useMemo(() => {
    if (filteredRows.length === 0) return 1;
    switch (chartMetric) {
      case 'conversion':
        return 100;
      case 'ticket':
        return Math.max(
          100,
          ...filteredRows.map((r) => Math.max(r.avgTicketUsd, r.benchmarkMidUsd || 0))
        );
      case 'engagement':
        return Math.max(100, ...filteredRows.map((r) => r.engagementRatePct));
      case 'profitability':
      default:
        return Math.max(100, ...filteredRows.map((r) => r.totalExpectedValueUsd));
    }
  }, [filteredRows, chartMetric]);

  // Scatter plot bounds
  const scatterBounds = useMemo(() => {
    const maxTicket = Math.max(
      1000,
      ...filteredRows.map((r) => r.avgTicketUsd)
    );
    const maxLeads = Math.max(1, ...filteredRows.map((r) => r.leadCount));
    return { maxTicket: Math.ceil(maxTicket / 500) * 500, maxLeads };
  }, [filteredRows]);

  return (
    <div className="h-full overflow-y-auto bg-[#F3F4F1] dark:bg-[#0D0E12] text-[#111214] dark:text-[#F4F5F7] p-5 lg:p-6 space-y-5 transition-colors">
      {/* HEADER + CONTROLS */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">
            Niche Performance Dashboard
          </h1>
          <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] mt-0.5">
            Compare conversion velocity, average ticket size, engagement volume, and expected profitability across every business niche in your CRM.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#7A7E87] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter niche or city..."
              className="h-9 bg-white dark:bg-[#16181E] border border-[#E2E4DF] dark:border-[#282B35] rounded-xl pl-8 pr-3 text-xs placeholder-[#7A7E87] focus:outline-none focus:border-[#111214] dark:focus:border-[#D9F154]"
            />
          </div>

          <select
            aria-label="Filter by Market Fit"
            value={marketFitFilter}
            onChange={(e) => setMarketFitFilter(e.target.value as MarketFitFilter)}
            className="h-9 bg-white dark:bg-[#16181E] border border-[#E2E4DF] dark:border-[#282B35] rounded-xl px-3 text-xs font-semibold cursor-pointer"
          >
            <option value="all">All Market Fits</option>
            <option value="Global High-Ticket">Global High-Ticket</option>
            <option value="Local Rapid-Close">Local Rapid-Close</option>
            <option value="International E-Com">International E-Com</option>
          </select>

          <select
            aria-label="Sort Niche Segments"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortMetric)}
            className="h-9 bg-white dark:bg-[#16181E] border border-[#E2E4DF] dark:border-[#282B35] rounded-xl px-3 text-xs font-semibold cursor-pointer"
          >
            <option value="profitability">Sort: Most Profitable</option>
            <option value="ticket">Sort: Highest Avg Ticket</option>
            <option value="conversion">Sort: Highest Conversion %</option>
            <option value="engagement">Sort: Highest Engagement</option>
            <option value="leads">Sort: Lead Volume</option>
          </select>

          <label className="h-9 px-3 rounded-xl bg-white dark:bg-[#16181E] border border-[#E2E4DF] dark:border-[#282B35] text-xs font-medium flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-[#111214] dark:accent-[#D9F154]"
            />
            <span>Include Archived</span>
          </label>
        </div>
      </div>

      {filteredRows.length === 0 || !overallSummary ? (
        <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-10 text-center space-y-3">
          <div className="text-base font-display font-bold">
            No niche performance records match your current filters
          </div>
          <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] max-w-md mx-auto">
            Reset search or market-fit filters, or import new niche prospects via the Automated Niche Prospector in Global Markets + Maps.
          </p>
          <div className="flex justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setMarketFitFilter('all');
                setIncludeArchived(true);
              }}
              className="px-4 py-2 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-xs font-semibold cursor-pointer"
            >
              Reset Filters
            </button>
            <button
              type="button"
              onClick={onNavigateToMarkets}
              className="px-4 py-2 rounded-xl border border-[#D9DBD5] dark:border-[#323643] text-xs font-semibold cursor-pointer"
            >
              Scrape Niche Leads
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 4-COLUMN KPI SUMMARY STRIP */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
            <button
              type="button"
              onClick={() => setSelectedNicheKey(overallSummary.byProfit.key)}
              className="text-left bg-[#111214] dark:bg-[#1B1E28] text-white rounded-3xl border border-[#23252A] dark:border-[#D9F154]/35 p-5 transition-colors hover:border-[#D9F154] cursor-pointer"
            >
              <div className="text-xs text-[#9CA3AF]">Most Profitable Segment</div>
              <div className="mt-1.5 text-2xl font-display font-bold font-mono-tabular text-[#D9F154]">
                {formatMoney(overallSummary.byProfit.totalExpectedValueUsd, currency)}
              </div>
              <div className="mt-1 text-xs font-semibold text-white truncate">
                {overallSummary.byProfit.nicheName}
              </div>
              <div className="mt-1 text-[11px] font-mono-tabular text-[#9CA3AF]">
                Won: {formatMoney(overallSummary.byProfit.wonRevenueUsd, currency, { compact: true })} · Weighted: {formatMoney(overallSummary.byProfit.weightedPipelineUsd, currency, { compact: true })}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedNicheKey(overallSummary.byTicket.key)}
              className="text-left bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 transition-colors hover:border-[#111214] dark:hover:border-[#C8B6FF] cursor-pointer"
            >
              <div className="text-xs text-[#666A73] dark:text-[#9CA3AF]">Highest Avg Ticket Size</div>
              <div className="mt-1.5 text-2xl font-display font-bold font-mono-tabular">
                {formatMoney(overallSummary.byTicket.avgTicketUsd, currency)}
              </div>
              <div className="mt-1 text-xs font-semibold truncate">
                {overallSummary.byTicket.nicheName}
              </div>
              <div className="mt-1 text-[11px] font-mono-tabular text-[#666A73] dark:text-[#9CA3AF]">
                CRM avg across all niches: {formatMoney(overallSummary.overallAvgTicket, currency)}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedNicheKey(overallSummary.byConversion.key)}
              className="text-left bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 transition-colors hover:border-[#111214] dark:hover:border-[#C8B6FF] cursor-pointer"
            >
              <div className="text-xs text-[#666A73] dark:text-[#9CA3AF]">Best Funnel Conversion</div>
              <div className="mt-1.5 text-2xl font-display font-bold font-mono-tabular text-emerald-700 dark:text-[#6AE4C0]">
                {overallSummary.byConversion.closeRatePct}% Won · {overallSummary.byConversion.advancementRatePct}% Late-Stage
              </div>
              <div className="mt-1 text-xs font-semibold truncate">
                {overallSummary.byConversion.nicheName}
              </div>
              <div className="mt-1 text-[11px] font-mono-tabular text-[#666A73] dark:text-[#9CA3AF]">
                {overallSummary.byConversion.advancedCount} of {overallSummary.byConversion.leadCount} leads in proposal+
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedNicheKey(overallSummary.byEngagement.key)}
              className="text-left bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 transition-colors hover:border-[#111214] dark:hover:border-[#C8B6FF] cursor-pointer"
            >
              <div className="text-xs text-[#666A73] dark:text-[#9CA3AF]">Highest Niche Engagement</div>
              <div className="mt-1.5 text-2xl font-display font-bold font-mono-tabular text-[#6D28D9] dark:text-[#C8B6FF]">
                {overallSummary.byEngagement.engagementRatePct}% Engaged
              </div>
              <div className="mt-1 text-xs font-semibold truncate">
                {overallSummary.byEngagement.nicheName}
              </div>
              <div className="mt-1 text-[11px] font-mono-tabular text-[#666A73] dark:text-[#9CA3AF]">
                {overallSummary.byEngagement.totalTouches} touches · {overallSummary.byEngagement.inboundCount} inbound replies
              </div>
            </button>
          </div>

          {/* 2-COLUMN CHARTS ROW (ITEMS-STRETCH) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
            {/* LEFT: COMPARATIVE BAR CHART (7 cols) */}
            <section className="xl:col-span-7 bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 lg:p-6 flex flex-col justify-between space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-display font-bold flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-[#6D28D9] dark:text-[#C8B6FF]" />
                    <span>Segment Comparison Across Niches</span>
                  </h2>
                  <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] mt-0.5">
                    Click any niche bar below to inspect its prospects and deal economics.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#F3F4F1] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#282B35]">
                  {(
                    [
                      { id: 'profitability', label: 'Profitability' },
                      { id: 'conversion', label: 'Conversion %' },
                      { id: 'ticket', label: 'Avg Ticket' },
                      { id: 'engagement', label: 'Engagement' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setChartMetric(tab.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                        chartMetric === tab.id
                          ? 'bg-white dark:bg-[#282B35] text-[#111214] dark:text-[#D9F154] shadow-xs'
                          : 'text-[#666A73] dark:text-[#9CA3AF] hover:text-[#111214] dark:hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* LEGEND */}
              <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#555963] dark:text-[#9CA3AF]">
                {chartMetric === 'profitability' && (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-2.5 rounded-xs bg-[#111214] dark:bg-[#D9F154] inline-block" />
                      Closed Won Revenue
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-2.5 rounded-xs bg-[#C8B6FF] inline-block" />
                      Stage-Weighted Pipeline
                    </span>
                  </>
                )}
                {chartMetric === 'conversion' && (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-2.5 rounded-xs bg-[#111214] dark:bg-[#D9F154] inline-block" />
                      Closed Won %
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-2.5 rounded-xs bg-[#C8B6FF] inline-block" />
                      Proposal / Negotiating Advancement %
                    </span>
                  </>
                )}
                {chartMetric === 'ticket' && (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-2.5 rounded-xs bg-[#111214] dark:bg-[#D9F154] inline-block" />
                      CRM Avg Ticket
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-[#6D28D9] dark:bg-[#C8B6FF] inline-block" />
                      Benchmark Mid Retainer Marker
                    </span>
                  </>
                )}
                {chartMetric === 'engagement' && (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-2.5 rounded-xs bg-[#C8B6FF] inline-block" />
                      Engaged Lead % (Replies / Active Review)
                    </span>
                    <span className="font-mono-tabular">
                      Touches per lead shown on right
                    </span>
                  </>
                )}
              </div>

              {/* HORIZONTAL SEGMENT BARS */}
              <div className="space-y-3 flex-1">
                {filteredRows.slice(0, 8).map((row) => {
                  const isSelected = activeNiche?.key === row.key;
                  const wonWidth =
                    chartMetric === 'profitability'
                      ? Math.round((row.wonRevenueUsd / chartMaxVal) * 100)
                      : chartMetric === 'conversion'
                        ? row.closeRatePct
                        : 0;
                  const weightedWidth =
                    chartMetric === 'profitability'
                      ? Math.round((row.weightedPipelineUsd / chartMaxVal) * 100)
                      : chartMetric === 'conversion'
                        ? Math.max(0, row.advancementRatePct - row.closeRatePct)
                        : 0;
                  const singleBarWidth =
                    chartMetric === 'ticket'
                      ? Math.round((row.avgTicketUsd / chartMaxVal) * 100)
                      : chartMetric === 'engagement'
                        ? row.engagementRatePct
                        : 0;
                  const benchmarkLeftPct =
                    chartMetric === 'ticket' && row.benchmarkMidUsd
                      ? Math.min(98, Math.round((row.benchmarkMidUsd / chartMaxVal) * 100))
                      : null;

                  return (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => setSelectedNicheKey(row.key)}
                      className={`w-full text-left rounded-2xl p-2.5 border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#FAFAF8] dark:bg-[#1E212B] border-[#111214] dark:border-[#D9F154]'
                          : 'border-transparent hover:bg-[#FAFAF8] dark:hover:bg-[#1A1D25]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="font-semibold truncate">{row.nicheName}</span>
                          <span className="text-[11px] text-[#666A73] dark:text-[#9CA3AF] shrink-0">
                            · {row.leadCount} {row.leadCount === 1 ? 'lead' : 'leads'}
                          </span>
                        </div>
                        <div className="font-mono-tabular font-bold shrink-0">
                          {chartMetric === 'profitability' &&
                            formatMoney(row.totalExpectedValueUsd, currency)}
                          {chartMetric === 'conversion' &&
                            `${row.closeRatePct}% Won / ${row.advancementRatePct}% Adv`}
                          {chartMetric === 'ticket' && formatMoney(row.avgTicketUsd, currency)}
                          {chartMetric === 'engagement' &&
                            `${row.engagementRatePct}% · ${row.avgTouchesPerLead} touches/lead`}
                        </div>
                      </div>

                      <div className="relative h-3 w-full rounded-full bg-[#ECEEE8] dark:bg-[#252833] overflow-hidden flex">
                        {(chartMetric === 'profitability' || chartMetric === 'conversion') && (
                          <>
                            {wonWidth > 0 && (
                              <div
                                className="h-full bg-[#111214] dark:bg-[#D9F154] transition-all duration-300"
                                style={{ width: `${Math.max(wonWidth, 3)}%` }}
                              />
                            )}
                            {weightedWidth > 0 && (
                              <div
                                className="h-full bg-[#C8B6FF] transition-all duration-300"
                                style={{ width: `${Math.max(weightedWidth, 3)}%` }}
                              />
                            )}
                          </>
                        )}

                        {chartMetric === 'ticket' && (
                          <div
                            className="h-full bg-[#111214] dark:bg-[#D9F154] rounded-full transition-all duration-300"
                            style={{ width: `${Math.max(singleBarWidth, 3)}%` }}
                          />
                        )}

                        {chartMetric === 'engagement' && (
                          <div
                            className="h-full bg-[#C8B6FF] rounded-full transition-all duration-300"
                            style={{ width: `${Math.max(singleBarWidth, 3)}%` }}
                          />
                        )}

                        {benchmarkLeftPct !== null && (
                          <span
                            title={`Benchmark mid retainer: ${formatMoney(row.benchmarkMidUsd || 0, currency)}`}
                            className="absolute top-0 bottom-0 w-0.5 bg-[#6D28D9] dark:bg-white"
                            style={{ left: `${benchmarkLeftPct}%` }}
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* RIGHT: CONVERSION VS TICKET PROFITABILITY QUADRANT MATRIX (5 cols) */}
            <section className="xl:col-span-5 bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 lg:p-6 flex flex-col justify-between space-y-4">
              <div>
                <h2 className="text-base font-display font-bold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#111214] dark:text-[#D9F154]" />
                  <span>Ticket Size vs. Conversion Quadrant</span>
                </h2>
                <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] mt-0.5">
                  Top-right niches deliver high ticket sizes with strong funnel progression. Node size reflects lead volume.
                </p>
              </div>

              <div className="relative flex-1 min-h-[260px] rounded-2xl bg-[#FAFAF8] dark:bg-[#121419] border border-[#ECEEE8] dark:border-[#242731] p-3">
                <svg
                  viewBox="0 0 420 260"
                  className="w-full h-full overflow-visible"
                  role="img"
                  aria-label="Scatter plot comparing niche conversion rate against average ticket size"
                >
                  {/* Grid lines */}
                  {[0.25, 0.5, 0.75].map((frac) => (
                    <React.Fragment key={frac}>
                      <line
                        x1={46}
                        y1={20 + (1 - frac) * 200}
                        x2={400}
                        y2={20 + (1 - frac) * 200}
                        stroke="currentColor"
                        className="text-black/8 dark:text-white/10"
                        strokeDasharray="3 4"
                      />
                      <line
                        x1={46 + frac * 354}
                        y1={20}
                        x2={46 + frac * 354}
                        y2={220}
                        stroke="currentColor"
                        className="text-black/8 dark:text-white/10"
                        strokeDasharray="3 4"
                      />
                    </React.Fragment>
                  ))}

                  {/* Quadrant highlight: Top-Right Scale Zone */}
                  <rect
                    x={223}
                    y={20}
                    width={177}
                    height={100}
                    rx={8}
                    className="fill-[#D9F154]/14 dark:fill-[#D9F154]/8"
                  />
                  <text
                    x={392}
                    y={35}
                    textAnchor="end"
                    className="fill-[#555963] dark:fill-[#D9F154] text-[9px] font-semibold"
                  >
                    Scale Priority Zone
                  </text>

                  {/* Axes */}
                  <line
                    x1={46}
                    y1={220}
                    x2={400}
                    y2={220}
                    stroke="currentColor"
                    className="text-black/20 dark:text-white/20"
                  />
                  <line
                    x1={46}
                    y1={20}
                    x2={46}
                    y2={220}
                    stroke="currentColor"
                    className="text-black/20 dark:text-white/20"
                  />

                  {/* Y-axis labels */}
                  <text
                    x={40}
                    y={26}
                    textAnchor="end"
                    className="fill-[#666A73] dark:fill-[#9CA3AF] text-[9px] font-mono"
                  >
                    {formatMoney(scatterBounds.maxTicket, currency, { compact: true })}
                  </text>
                  <text
                    x={40}
                    y={123}
                    textAnchor="end"
                    className="fill-[#666A73] dark:fill-[#9CA3AF] text-[9px] font-mono"
                  >
                    {formatMoney(Math.round(scatterBounds.maxTicket / 2), currency, {
                      compact: true,
                    })}
                  </text>
                  <text
                    x={40}
                    y={222}
                    textAnchor="end"
                    className="fill-[#666A73] dark:fill-[#9CA3AF] text-[9px] font-mono"
                  >
                    0
                  </text>

                  {/* X-axis labels */}
                  <text
                    x={46}
                    y={238}
                    textAnchor="start"
                    className="fill-[#666A73] dark:fill-[#9CA3AF] text-[9px] font-mono"
                  >
                    0% Adv
                  </text>
                  <text
                    x={223}
                    y={238}
                    textAnchor="middle"
                    className="fill-[#666A73] dark:fill-[#9CA3AF] text-[9px] font-mono"
                  >
                    50% Funnel Adv
                  </text>
                  <text
                    x={400}
                    y={238}
                    textAnchor="end"
                    className="fill-[#666A73] dark:fill-[#9CA3AF] text-[9px] font-mono"
                  >
                    100%
                  </text>

                  {/* Data Nodes */}
                  {filteredRows.map((row, idx) => {
                    const cx = Math.min(
                      396,
                      Math.max(50, 46 + (row.advancementRatePct / 100) * 340 + ((idx % 5) - 2) * 3.5)
                    );
                    const cy =
                      220 -
                      Math.min(1, row.avgTicketUsd / scatterBounds.maxTicket) * 190;
                    const radius =
                      6 + Math.round((row.leadCount / scatterBounds.maxLeads) * 8);
                    const isSelected = activeNiche?.key === row.key;
                    const isHovered = hoveredScatterKey === row.key;

                    return (
                      <g
                        key={row.key}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredScatterKey(row.key)}
                        onMouseLeave={() => setHoveredScatterKey(null)}
                        onClick={() => setSelectedNicheKey(row.key)}
                      >
                        <circle
                          cx={cx}
                          cy={cy}
                          r={radius}
                          className={
                            isSelected
                              ? 'fill-[#D9F154] stroke-[#111214] dark:stroke-white'
                              : row.wonCount > 0
                                ? 'fill-[#6AE4C0] stroke-[#111214] dark:stroke-[#0D0E12]'
                                : 'fill-[#C8B6FF] stroke-[#111214] dark:stroke-[#0D0E12]'
                          }
                          strokeWidth={isSelected || isHovered ? 2.5 : 1.5}
                        />
                        {(isSelected || isHovered || filteredRows.length <= 7) && (
                          <text
                            x={cx > 310 ? cx - radius - 5 : cx + radius + 5}
                            y={cy + 3}
                            textAnchor={cx > 310 ? 'end' : 'start'}
                            className="fill-[#111214] dark:fill-[#F4F5F7] text-[9px] font-semibold pointer-events-none"
                          >
                            {row.nicheName.split(/[(&,]/)[0].trim()}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>

              {activeNiche && (
                <div className="rounded-2xl bg-[#F3F4F1] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#282B35] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold truncate">{activeNiche.nicheName}</span>
                  <span className="font-mono-tabular text-[#555963] dark:text-[#D9F154]">
                    Avg {formatMoney(activeNiche.avgTicketUsd, currency)} · {activeNiche.advancementRatePct}% Adv · {activeNiche.closeRatePct}% Won
                  </span>
                </div>
              )}
            </section>
          </div>

          {/* HEAD-TO-HEAD NICHE COMPARISON (e.g., HVAC vs. Dentists) */}
          {nicheA && nicheB && (
            <section className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 lg:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-display font-bold">
                    Head-to-Head Segment Comparison
                  </h2>
                  <p className="text-xs text-[#666A73] dark:text-[#9CA3AF]">
                    Compare any two business niches side by side to decide where to concentrate outbound &amp; ad budget.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <select
                    aria-label="Compare Niche A"
                    value={nicheA.key}
                    onChange={(e) => setCompareKeyA(e.target.value)}
                    className="h-9 bg-[#F3F4F1] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#323643] rounded-xl px-3 font-semibold max-w-[220px] truncate cursor-pointer"
                  >
                    {filteredRows.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.nicheName}
                      </option>
                    ))}
                  </select>
                  <span className="text-[#666A73] dark:text-[#9CA3AF] font-semibold">vs</span>
                  <select
                    aria-label="Compare Niche B"
                    value={nicheB.key}
                    onChange={(e) => setCompareKeyB(e.target.value)}
                    className="h-9 bg-[#F3F4F1] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#323643] rounded-xl px-3 font-semibold max-w-[220px] truncate cursor-pointer"
                  >
                    {filteredRows.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.nicheName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                {[
                  {
                    label: 'Expected Value (Won + Weighted)',
                    valA: formatMoney(nicheA.totalExpectedValueUsd, currency),
                    valB: formatMoney(nicheB.totalExpectedValueUsd, currency),
                    winner:
                      nicheA.totalExpectedValueUsd >= nicheB.totalExpectedValueUsd ? 'A' : 'B',
                  },
                  {
                    label: 'Average Ticket Size',
                    valA: formatMoney(nicheA.avgTicketUsd, currency),
                    valB: formatMoney(nicheB.avgTicketUsd, currency),
                    winner: nicheA.avgTicketUsd >= nicheB.avgTicketUsd ? 'A' : 'B',
                  },
                  {
                    label: 'Funnel Advancement %',
                    valA: `${nicheA.advancementRatePct}% (${nicheA.closeRatePct}% won)`,
                    valB: `${nicheB.advancementRatePct}% (${nicheB.closeRatePct}% won)`,
                    winner: nicheA.advancementRatePct >= nicheB.advancementRatePct ? 'A' : 'B',
                  },
                  {
                    label: 'Engagement Rate',
                    valA: `${nicheA.engagementRatePct}% (${nicheA.totalTouches} touches)`,
                    valB: `${nicheB.engagementRatePct}% (${nicheB.totalTouches} touches)`,
                    winner: nicheA.engagementRatePct >= nicheB.engagementRatePct ? 'A' : 'B',
                  },
                  {
                    label: 'Hot Lead Ratio',
                    valA: `${nicheA.hotCount} / ${nicheA.leadCount} leads`,
                    valB: `${nicheB.hotCount} / ${nicheB.leadCount} leads`,
                    winner:
                      nicheA.hotCount / Math.max(nicheA.leadCount, 1) >=
                      nicheB.hotCount / Math.max(nicheB.leadCount, 1)
                        ? 'A'
                        : 'B',
                  },
                ].map((cmp) => (
                  <div
                    key={cmp.label}
                    className="rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#E5E7E2] dark:border-[#282B35] p-3.5 space-y-2"
                  >
                    <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                      {cmp.label}
                    </div>
                    <div className="space-y-1 font-mono-tabular">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-sans text-[#555963] dark:text-[#9CA3AF] truncate">
                          {nicheA.nicheName.split(/[(&,]/)[0].trim()}
                        </span>
                        <span
                          className={`font-bold ${
                            cmp.winner === 'A'
                              ? 'text-[#111214] dark:text-[#D9F154]'
                              : 'text-[#666A73] dark:text-[#9CA3AF]'
                          }`}
                        >
                          {cmp.valA}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-sans text-[#555963] dark:text-[#9CA3AF] truncate">
                          {nicheB.nicheName.split(/[(&,]/)[0].trim()}
                        </span>
                        <span
                          className={`font-bold ${
                            cmp.winner === 'B'
                              ? 'text-[#111214] dark:text-[#C8B6FF]'
                              : 'text-[#666A73] dark:text-[#9CA3AF]'
                          }`}
                        >
                          {cmp.valB}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* FULL NICHE SEGMENT BREAKDOWN TABLE */}
          <section className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EFEFEF] dark:border-[#242731] flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-display font-bold">
                  All Business Niche Segments ({filteredRows.length})
                </h2>
                <p className="text-xs text-[#666A73] dark:text-[#9CA3AF]">
                  Select any row to inspect underlying CRM deals and launch pricing or outreach campaigns.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E5E7E2] dark:border-[#242731] text-[11px] text-[#666A73] dark:text-[#9CA3AF] bg-[#FAFAF8] dark:bg-[#121419]">
                    <th className="py-3 px-4 font-semibold">Business Niche</th>
                    <th className="py-3 px-3 font-semibold text-right">Leads (Hot)</th>
                    <th className="py-3 px-3 font-semibold text-right">Avg Ticket</th>
                    <th className="py-3 px-3 font-semibold text-right">Funnel Adv %</th>
                    <th className="py-3 px-3 font-semibold text-right">Close %</th>
                    <th className="py-3 px-3 font-semibold text-right">Engagement</th>
                    <th className="py-3 px-3 font-semibold text-right">Expected Profit</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEFEF] dark:divide-[#242731]">
                  {filteredRows.map((row) => {
                    const isSelected = activeNiche?.key === row.key;
                    return (
                      <tr
                        key={row.key}
                        onClick={() => setSelectedNicheKey(row.key)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#D9F154]/18 dark:bg-[#D9F154]/10'
                            : 'hover:bg-[#FAFAF8] dark:hover:bg-[#1A1D25]'
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#111214] dark:text-[#F4F5F7]">
                            {row.nicheName}
                          </div>
                          <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                            {row.marketFit}
                            {row.benchmarkMidUsd
                              ? ` · Benchmark ${formatMoney(row.benchmarkMidUsd, currency, { compact: true })}/mo`
                              : ''}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono-tabular">
                          <span className="font-bold">{row.leadCount}</span>{' '}
                          <span className="text-[#666A73] dark:text-[#9CA3AF]">
                            ({row.hotCount})
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono-tabular font-semibold">
                          {formatMoney(row.avgTicketUsd, currency)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono-tabular">
                          {row.advancementRatePct}%
                        </td>
                        <td className="py-3 px-3 text-right font-mono-tabular font-semibold text-emerald-700 dark:text-[#6AE4C0]">
                          {row.closeRatePct}%
                        </td>
                        <td className="py-3 px-3 text-right font-mono-tabular">
                          <div>{row.engagementRatePct}% engaged</div>
                          <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                            {row.totalTouches} touches · {row.inboundCount} replies
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono-tabular font-bold">
                          {formatMoney(row.totalExpectedValueUsd, currency)}
                        </td>
                        <td
                          className="py-3 px-4 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1.5">
                            {row.matchedNiche && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onNavigateToPricing(row.matchedNiche!.id)}
                                  className="px-2.5 py-1 rounded-lg bg-[#F3F4F1] dark:bg-[#23262F] hover:bg-[#D9F154] hover:text-[#111214] text-[11px] font-semibold cursor-pointer"
                                >
                                  Pricing
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onNavigateToOutreach(row.matchedNiche!.id)}
                                  className="px-2.5 py-1 rounded-lg bg-[#111214] dark:bg-[#252833] text-[#D9F154] text-[11px] font-semibold cursor-pointer"
                                >
                                  Outreach
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* SELECTED NICHE DRILL-DOWN INSPECTOR */}
          {activeNiche && (
            <section className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 lg:p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-[#666A73] dark:text-[#9CA3AF]">
                    Selected Niche Drill-Down · {activeNiche.marketFit}
                  </div>
                  <h2 className="text-lg font-display font-bold mt-0.5">
                    {activeNiche.nicheName}
                  </h2>
                  {activeNiche.matchedNiche && (
                    <p className="text-xs text-[#555963] dark:text-[#C9CDD4] mt-1">
                      Client Job Value: {activeNiche.matchedNiche.clientJobValue} · Competition:{' '}
                      {activeNiche.matchedNiche.competitionLevel} · Trojan Hook:{' '}
                      {activeNiche.matchedNiche.trojanHorseHook}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {activeNiche.matchedNiche && (
                    <>
                      <button
                        type="button"
                        onClick={() => onNavigateToPricing(activeNiche.matchedNiche!.id)}
                        className="h-9 px-3.5 rounded-xl bg-[#F3F4F1] dark:bg-[#23262F] border border-[#E2E4DF] dark:border-[#323643] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-[#6D28D9] dark:text-[#C8B6FF]" />
                        Build Niche Offer
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigateToOutreach(activeNiche.matchedNiche!.id)}
                        className="h-9 px-3.5 rounded-xl bg-[#D9F154] text-[#111214] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Launch Outreach Campaign
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={onNavigateToMarkets}
                    className="h-9 px-3.5 rounded-xl bg-[#111214] dark:bg-[#252833] text-[#D9F154] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Globe2 className="w-3.5 h-3.5" />
                    Scrape More Leads
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeNiche.prospects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onInspectProspect(p.id)}
                    className="text-left rounded-2xl border border-[#E5E7E2] dark:border-[#282B35] bg-[#FAFAF8] dark:bg-[#1C1F26] hover:border-[#111214] dark:hover:border-[#D9F154] p-4 transition-colors cursor-pointer space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold truncate">{p.businessName}</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-[#666A73] dark:text-[#9CA3AF] shrink-0" />
                    </div>
                    <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF] truncate">
                      {p.contactPerson} · {p.city}, {p.country}
                    </div>
                    <div className="pt-1 flex items-center justify-between text-[11px] font-mono-tabular">
                      <span className="font-sans font-semibold text-[#111214] dark:text-[#C8B6FF]">
                        {p.stage} · {p.leadQuality}
                      </span>
                      <span className="font-bold text-[#111214] dark:text-[#D9F154]">
                        {formatMoney(p.ticketUsd, currency)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};
