export type CurrencyCode = 'USD' | 'PKR' | 'EUR' | 'GBP' | 'AED' | 'SAR';

export type LeadQuality = 'Hot' | 'Warm' | 'Cold' | 'Dead';

export type PipelineStage =
  | 'New Lead'
  | 'Contacted'
  | 'Proposal Sent'
  | 'Negotiating'
  | 'Closed Won'
  | 'Closed Lost'
  | 'Follow Up';

export type OutreachChannel =
  | 'WhatsApp'
  | 'Email'
  | 'LinkedIn'
  | 'Instagram DM'
  | 'Phone'
  | 'Fiverr';

export type AgencyTier =
  | 'Tier 1'
  | 'Tier 2A'
  | 'Tier 2B'
  | 'Tier 3'
  | 'Tier 4';

export type MacroRegion =
  | 'North America'
  | 'UK & Western Europe'
  | 'Nordics & Baltics'
  | 'Southern & Central Europe'
  | 'Balkans & Eastern Europe'
  | 'Middle East & South Asia';

export interface Prospect {
  id: string;
  businessName: string;
  contactPerson: string;
  roleTitle: string;
  email: string;
  phone: string;
  website: string;
  country: string;
  stateOrRegion: string;
  city: string;
  categoryNiche: string;
  leadQuality: LeadQuality;
  stage: PipelineStage;
  serviceInterest: string;
  ticketUsd: number;
  dateAdded: string;
  nextFollowUp: string;
  lastContacted: string;
  lastMessageSent: string;
  replyNotes: string;
  competitorAdvantage: string;
  status: 'Active' | 'Archived';
  linkedinUrl?: string;
}

export interface FollowUpItem {
  id: string;
  prospectId: string;
  businessName: string;
  followUpDate: string;
  followUpTime: string;
  followUpType: string;
  messageScript: string;
  stage: PipelineStage;
  priority: 'High' | 'Mid' | 'Low';
  done: boolean;
  outcome: string;
  nextStep: string;
  calendarEventId?: string;
}

export interface ChatLogItem {
  id: string;
  prospectId: string;
  businessName: string;
  date: string;
  time: string;
  channel: OutreachChannel;
  direction: 'Outbound' | 'Inbound';
  messageContent: string;
  responseSummary: string;
}

export interface WeeklyTaskRow {
  day: string;
  date: string;
  morningTask: string;
  afternoonTask: string;
  outreachTarget: number;
  outreachActual: number;
  callsScheduled: number;
  callsDone: number;
  done: boolean;
  notes: string;
}

export interface WeeklyGoalMetric {
  id: string;
  label: string;
  target: number;
  helper: string;
}

export interface MonthlyGoalRow {
  id: string;
  metric: string;
  goal: number;
  actual: number;
  isCurrency?: boolean;
}

export interface WeekBreakdownRow {
  week: string;
  outreachSent: number;
  callsDone: number;
  proposals: number;
  clientsClosed: number;
  revenueUsd: number;
}

export interface RoadmapPhase {
  id: string;
  phase: string;
  timeline: string;
  actions: string[];
  expectedOutput: string;
  kpiTarget: string;
  done: boolean;
}

export interface FunnelSettings {
  monthlyGoalUsd: number;
  ticketPriceUsd: number;
  paidAdsCplUsd: number;
  paidAdsLeadToCallRate: number;
  paidAdsCallToCloseRate: number;
  coldOutreachReplyRate: number;
  coldOutreachReplyToCallRate: number;
  coldOutreachCallToCloseRate: number;
  toolsCostMonthlyUsd: number;
  adSpendMonthlyUsd: number;
  staffCount: number;
  staffCostPerPersonUsd: number;
}

export interface CityMarket {
  name: string;
  tier: AgencyTier;
  medianIncomeUsd: number;
  population?: number;
  competition: 'Low' | 'Low-Med' | 'Medium' | 'High' | 'Very High';
  topNiches: string[];
  winningOffer: string;
  lat: number;
  lng: number;
}

export interface StateOrProvinceMarket {
  name: string;
  code: string;
  tier: AgencyTier;
  medianIncomeUsd: number;
  yoyGrowth?: string;
  estSmallBusinesses: number;
  competition: 'Low' | 'Low-Med' | 'Medium' | 'High' | 'Very High';
  retainerRangeUsd: string;
  bestOfferSummary: string;
  cities: CityMarket[];
}

export interface CountryMarket {
  id: string;
  name: string;
  isoCode: string;
  macroRegion: MacroRegion;
  tier: AgencyTier;
  tierLabel: string;
  medianIncomeUsd: number;
  purchasingPowerNote: string;
  competition: 'Low' | 'Low-Med' | 'Medium' | 'High' | 'Very High';
  retainerRangeUsd: [number, number];
  topOperatingNiches: string[];
  futureNicheOpportunities: string[];
  requiredSkills: string[];
  serviceSuitability: {
    seo: { score: number; note: string };
    webDev: { score: number; note: string };
    automation: { score: number; note: string };
  };
  businessPotentialSummary: string;
  lat: number;
  lng: number;
  statesOrRegions: StateOrProvinceMarket[];
}

export interface OperatingNiche {
  id: string;
  name: string;
  marketFit: 'Global High-Ticket' | 'Local Rapid-Close' | 'International E-Com';
  bestTargetTiers: string;
  clientJobValue: string;
  competitionLevel: string;
  painPoints: string[];
  fearsDesires: {
    fear: string;
    frustration: string;
    desire: string;
  };
  offerStack: {
    seo: string;
    webDev: string;
    automation: string;
  };
  baseRetainerUsd: [number, number];
  baseSetupUsd: number;
  leadGenPlaybook: string[];
  trojanHorseHook: string;
  requiredSkills: string[];
}

export type ActiveWorkspaceView =
  | 'workbench'
  | 'sheets'
  | 'pipeline'
  | 'followups'
  | 'globe'
  | 'markets'
  | 'pricing'
  | 'outreach'
  | 'funnel'
  | 'roadmap'
  | 'preview'
  | 'analytics'
  | 'linkedin'
  | 'competitor-audit';

export type ClientMilestoneStatus = 'completed' | 'in_progress' | 'upcoming';

export interface ClientRoadmapMilestone {
  id: string;
  phaseLabel: string;
  title: string;
  summary: string;
  deliverables: string[];
  status: ClientMilestoneStatus;
  targetDate: string;
}

export type ClientStatusUpdateCategory = 'Milestone' | 'Deliverable' | 'Discovery' | 'Update';

export interface ClientStatusUpdate {
  id: string;
  date: string;
  time?: string;
  title: string;
  summary: string;
  category: ClientStatusUpdateCategory;
  author: string;
}

export interface ClientPortalConfig {
  prospectId: string;
  projectGoal: string;
  welcomeNote: string;
  agencyContactName: string;
  agencyContactEmail: string;
  showInvestment: boolean;
  milestones: ClientRoadmapMilestone[];
  updates: ClientStatusUpdate[];
  lastUpdatedAt: string;
}

export interface ClientPreviewSnapshot {
  v: 1;
  generatedAt: string;
  currency: CurrencyCode;
  prospect: {
    id: string;
    businessName: string;
    contactPerson: string;
    roleTitle: string;
    city: string;
    stateOrRegion: string;
    country: string;
    categoryNiche: string;
    stage: PipelineStage;
    serviceInterest: string;
    ticketUsd: number;
    nextFollowUp: string;
    website: string;
  };
  portal: ClientPortalConfig;
}

export interface WorksheetPersistedPayload {
  weeklyStartDate: string;
  weeklyTasks: WeeklyTaskRow[];
  weeklyGoalTargets: WeeklyGoalMetric[];
  monthlyGoals: MonthlyGoalRow[];
  weekBreakdown: WeekBreakdownRow[];
  roadmap: RoadmapPhase[];
  funnelSettings: FunnelSettings;
  syncedSpreadsheetId?: string;
  syncedSpreadsheetUrl?: string;
  lastSyncedAt?: string;
  preferredCurrency: CurrencyCode;
  customMarketNotes?: Record<string, string>;
}
