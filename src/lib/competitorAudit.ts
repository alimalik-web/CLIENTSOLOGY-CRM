import { ensureHttpUrl } from './appUtils';

export type KeywordIntent = 'Transactional' | 'Local' | 'Commercial' | 'Informational';
export type KeywordPresence = 'Ranking' | 'On-Page' | 'Keyword Gap';
export type KeywordDifficulty = 'Low' | 'Medium' | 'High';

export interface CompetitorOnPageSignals {
  siteReachable: boolean;
  httpStatus: number | null;
  responseTimeMs: number | null;
  isHttps: boolean;
  finalUrl: string;
  title: string;
  titleLength: number;
  metaDescription: string;
  metaDescriptionLength: number;
  h1Headings: string[];
  h2Headings: string[];
  metaKeywords: string[];
  schemaTypes: string[];
  hasCanonical: boolean;
  hasOpenGraph: boolean;
  hasMobileViewport: boolean;
  wordCount: number;
  internalLinksCount: number;
  externalLinksCount: number;
  fetchNote?: string;
}

export interface CompetitorDomainAuthority {
  score: number; // 0 - 100 grounded estimate
  tier: 'Strong' | 'Moderate' | 'Vulnerable';
  confidence: 'High' | 'Medium' | 'Low';
  indexedFootprint: string;
  backlinkProfileSummary: string;
  rationale: string;
}

export interface CompetitorSeoKeyword {
  keyword: string;
  intent: KeywordIntent;
  presence: KeywordPresence;
  difficulty: KeywordDifficulty;
  monthlySearchPotential: string;
  prospectOpportunity: string;
}

export interface CraftedValueProposition {
  headline: string;
  coreStatement: string;
  differentiators: string[];
  recommendedOffer: string;
  outreachHook: string;
  emailSubject: string;
  emailBody: string;
}

export interface CompetitorAuditReport {
  id: string;
  auditedAt: string;
  domain: string;
  normalizedUrl: string;
  prospectId?: string;
  prospectBusinessName?: string;
  targetNiche?: string;
  targetLocation?: string;
  onPageSignals: CompetitorOnPageSignals;
  domainAuthority: CompetitorDomainAuthority;
  seoKeywords: CompetitorSeoKeyword[];
  strengths: string[];
  weaknesses: string[];
  valueProposition: CraftedValueProposition;
  sources: { uri: string; title: string }[];
  grounded: boolean;
}

export interface SeoMetaTagCheck {
  id: string;
  label: string;
  status: 'pass' | 'warning' | 'missing';
  observedValue: string;
  recommendation: string;
}

export interface SeoHealthCheckReport {
  id: string;
  checkedAt: string;
  domain: string;
  normalizedUrl: string;
  finalUrl: string;
  prospectId?: string;
  prospectBusinessName?: string;
  reachable: boolean;
  httpStatus: number | null;
  healthScore: number;
  loadSpeed: {
    responseTimeMs: number | null;
    payloadKb: number;
    compressed: boolean;
    isHttps: boolean;
    grade: 'Fast' | 'Moderate' | 'Slow' | 'Unreachable';
    summary: string;
  };
  mobileFriendliness: {
    mobileFriendly: boolean;
    hasViewportTag: boolean;
    hasDeviceWidth: boolean;
    responsiveHintsDetected: boolean;
    grade: 'Mobile-Ready' | 'Needs Viewport Fix' | 'Unverified';
    summary: string;
  };
  metaTags: {
    missingCount: number;
    warningCount: number;
    passedCount: number;
    checks: SeoMetaTagCheck[];
  };
  thirtySecondSummary: string;
  topFixes: string[];
  outreachPitchHook: string;
}

const AUDIT_HISTORY_KEY = 'clientsology_competitor_audits_v1';

export function normalizeCompetitorUrl(rawUrl: string): { valid: boolean; url: string; domain: string; error?: string } {
  const safe = ensureHttpUrl(rawUrl);
  if (!safe) {
    return {
      valid: false,
      url: '',
      domain: '',
      error: 'Enter a valid competitor website URL (e.g. https://example.com).',
    };
  }
  try {
    const parsed = new URL(safe);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('.') || host === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
      return {
        valid: false,
        url: safe,
        domain: host,
        error: 'Enter a public domain name (e.g. apexdental.com).',
      };
    }
    return {
      valid: true,
      url: parsed.toString(),
      domain: host.replace(/^www\./, ''),
    };
  } catch {
    return {
      valid: false,
      url: '',
      domain: '',
      error: 'Unable to parse website URL.',
    };
  }
}

export function loadSavedCompetitorAudits(): CompetitorAuditReport[] {
  try {
    const raw = localStorage.getItem(AUDIT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CompetitorAuditReport[]) : [];
  } catch {
    return [];
  }
}

export function persistCompetitorAudits(reports: CompetitorAuditReport[]): void {
  try {
    localStorage.setItem(AUDIT_HISTORY_KEY, JSON.stringify(reports.slice(0, 12)));
  } catch {
    // Ignore storage quota errors
  }
}

export function exportCompetitorKeywordsCsv(report: CompetitorAuditReport): void {
  const escapeCell = (val: string) => `"${(val || '').replace(/"/g, '""')}"`;
  const headers = ['Domain', 'Keyword', 'Intent', 'Presence', 'Difficulty', 'Search Potential', 'Prospect Opportunity'];
  const rows = report.seoKeywords.map((kw) =>
    [
      report.domain,
      kw.keyword,
      kw.intent,
      kw.presence,
      kw.difficulty,
      kw.monthlySearchPotential,
      kw.prospectOpportunity,
    ]
      .map(escapeCell)
      .join(',')
  );
  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `competitor-seo-keywords-${report.domain.replace(/[^a-z0-9.-]/gi, '_')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
