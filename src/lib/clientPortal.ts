import {
  ChatLogItem,
  ClientMilestoneStatus,
  ClientPortalConfig,
  ClientPreviewSnapshot,
  ClientRoadmapMilestone,
  ClientStatusUpdate,
  CurrencyCode,
  FollowUpItem,
  PipelineStage,
  Prospect,
} from '../types/crm';
import { resolveNicheProfile } from './emailTemplates';
import { addDaysUtc, getLocalIsoDate } from './appUtils';

const PORTALS_STORAGE_KEY = 'clientsology_client_portals_v1';

export function loadSavedClientPortals(): Record<string, ClientPortalConfig> {
  try {
    const raw = localStorage.getItem(PORTALS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ClientPortalConfig>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function persistClientPortals(portals: Record<string, ClientPortalConfig>): void {
  try {
    localStorage.setItem(PORTALS_STORAGE_KEY, JSON.stringify(portals));
  } catch {
    // Ignore quota errors
  }
}

export function getClientStageDisplay(stage: PipelineStage): {
  label: string;
  description: string;
} {
  switch (stage) {
    case 'New Lead':
      return {
        label: 'Discovery & Audit',
        description: 'Initial market diagnostics and baseline opportunity review.',
      };
    case 'Contacted':
      return {
        label: 'Audit Shared',
        description: 'Custom conversion findings prepared for leadership review.',
      };
    case 'Proposal Sent':
      return {
        label: 'Roadmap & Proposal Review',
        description: 'Tailored scope, deliverables, and timeline ready for approval.',
      };
    case 'Negotiating':
      return {
        label: 'Scope Alignment & Kickoff Prep',
        description: 'Finalizing integration priorities ahead of launch sprint.',
      };
    case 'Follow Up':
      return {
        label: 'Active Review',
        description: 'Awaiting feedback on open milestones and next kickoff window.',
      };
    case 'Closed Won':
      return {
        label: 'Active Delivery',
        description: 'Implementation sprint underway with scheduled milestone drops.',
      };
    case 'Closed Lost':
      return {
        label: 'Archived Scope',
        description: 'Reference roadmap archived for future reactivation.',
      };
    default:
      return {
        label: 'In Progress',
        description: 'Project scope and delivery schedule active.',
      };
  }
}

function addDays(baseIso: string, days: number): string {
  return addDaysUtc(baseIso, days);
}

function getMilestoneStatusesForStage(stage: PipelineStage): ClientMilestoneStatus[] {
  switch (stage) {
    case 'New Lead':
      return ['in_progress', 'upcoming', 'upcoming', 'upcoming'];
    case 'Contacted':
      return ['completed', 'in_progress', 'upcoming', 'upcoming'];
    case 'Proposal Sent':
    case 'Follow Up':
      return ['completed', 'in_progress', 'upcoming', 'upcoming'];
    case 'Negotiating':
      return ['completed', 'completed', 'in_progress', 'upcoming'];
    case 'Closed Won':
      return ['completed', 'completed', 'in_progress', 'upcoming'];
    case 'Closed Lost':
      return ['completed', 'upcoming', 'upcoming', 'upcoming'];
    default:
      return ['in_progress', 'upcoming', 'upcoming', 'upcoming'];
  }
}

export function buildDefaultClientPortal(
  prospect: Prospect,
  followUps: FollowUpItem[],
  chatLogs: ChatLogItem[],
  agencyContactName = 'Clientsology Delivery Team',
  agencyContactEmail = ''
): ClientPortalConfig {
  const niche = resolveNicheProfile(prospect.categoryNiche);
  const statuses = getMilestoneStatusesForStage(prospect.stage);
  const baseDate = prospect.dateAdded || getLocalIsoDate();
  const cityLabel = prospect.city || prospect.country || 'Local Market';
  const seoItem =
    niche?.offerStack.seo || `Google Map Pack & local keyword visibility across ${cityLabel}`;
  const webItem =
    niche?.offerStack.webDev || `High-converting web experience built for ${prospect.businessName}`;
  const automationItem =
    niche?.offerStack.automation || 'Automated inquiry capture & instant appointment follow-up';

  const milestones: ClientRoadmapMilestone[] = [
    {
      id: `${prospect.id}-ms-1`,
      phaseLabel: 'Phase 01 · Week 1',
      title: `Market Audit & Conversion Architecture for ${cityLabel}`,
      summary: `Baseline audit of ${prospect.businessName}'s search footprint, customer intake flow, and local competitive gaps in ${cityLabel}.`,
      deliverables: [
        `Competitive Map Pack & organic search benchmark in ${cityLabel}`,
        'Conversion leak & speed-to-lead diagnostic',
        `Custom implementation blueprint for ${prospect.serviceInterest || 'Growth Stack'}`,
      ],
      status: statuses[0],
      targetDate: addDays(baseDate, 5),
    },
    {
      id: `${prospect.id}-ms-2`,
      phaseLabel: 'Phase 02 · Weeks 1–2',
      title: 'Core Web Experience & Tracking Foundation',
      summary: `Build and configure the primary digital conversion layer tailored to ${prospect.categoryNiche} buyers.`,
      deliverables: [
        webItem,
        'Mobile-first booking & inquiry routing setup',
        'Call, form, and conversion attribution instrumentation',
      ],
      status: statuses[1],
      targetDate: addDays(baseDate, 14),
    },
    {
      id: `${prospect.id}-ms-3`,
      phaseLabel: 'Phase 03 · Weeks 2–3',
      title: 'Search Authority & Automated Lead Capture',
      summary: `Activate ongoing customer acquisition and response automation for ${prospect.businessName}.`,
      deliverables: [seoItem, automationItem, 'Google Business Profile optimization & review workflow'],
      status: statuses[2],
      targetDate: addDays(baseDate, 24),
    },
    {
      id: `${prospect.id}-ms-4`,
      phaseLabel: 'Phase 04 · Day 30+',
      title: 'Launch Review & Monthly Growth Optimization',
      summary:
        'Validate live conversion performance, refine messaging based on buyer response, and lock in recurring KPI cadence.',
      deliverables: [
        '30-day lead volume & conversion performance readout',
        'Keyword & landing page split-test refinements',
        'Next-quarter growth expansion plan',
      ],
      status: statuses[3],
      targetDate: addDays(baseDate, 32),
    },
  ];

  const updates: ClientStatusUpdate[] = [];

  // Pull prospect's relevant open/completed follow-ups into sanitized client updates
  const matchingFollowUps = followUps
    .filter((f) => f.prospectId === prospect.id)
    .sort((a, b) => b.followUpDate.localeCompare(a.followUpDate));

  matchingFollowUps.forEach((fu) => {
    updates.push({
      id: `upd-fu-${fu.id}`,
      date: fu.followUpDate,
      time: fu.followUpTime,
      title: fu.done ? `Completed: ${fu.followUpType}` : `Scheduled: ${fu.nextStep || fu.followUpType}`,
      summary: fu.done
        ? fu.outcome || `Completed milestone checkpoint for ${prospect.businessName}.`
        : `${fu.followUpType} scheduled for ${fu.followUpDate}${fu.followUpTime ? ` at ${fu.followUpTime}` : ''}. ${fu.nextStep ? `Focus: ${fu.nextStep}.` : ''}`.trim(),
      category: fu.done ? 'Milestone' : 'Update',
      author: agencyContactName,
    });
  });

  // Pull outbound shared messages (excluding internal-only notes)
  const matchingOutbound = chatLogs
    .filter((c) => c.prospectId === prospect.id && c.direction === 'Outbound')
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
    .slice(0, 3);

  matchingOutbound.forEach((msg) => {
    updates.push({
      id: `upd-chat-${msg.id}`,
      date: msg.date,
      time: msg.time,
      title: `Deliverable & Brief Shared via ${msg.channel}`,
      summary: msg.messageContent.length > 260 ? `${msg.messageContent.slice(0, 257)}...` : msg.messageContent,
      category: 'Deliverable',
      author: agencyContactName,
    });
  });

  // Always include a clean baseline discovery update so the portal is never sparse
  updates.push({
    id: `upd-init-${prospect.id}`,
    date: prospect.lastContacted || baseDate,
    title: `Project Workspace Prepared for ${prospect.businessName}`,
    summary: `Initialized the ${prospect.serviceInterest || 'Growth & Automation'} roadmap for ${prospect.city || prospect.country}, tailored to ${prospect.categoryNiche}.`,
    category: 'Discovery',
    author: agencyContactName,
  });

  updates.sort((a, b) => `${b.date} ${b.time || ''}`.localeCompare(`${a.date} ${a.time || ''}`));

  return {
    prospectId: prospect.id,
    projectGoal: prospect.serviceInterest || 'Digital Growth & Lead Conversion System',
    welcomeNote: `Prepared specifically for ${prospect.contactPerson || prospect.businessName}. Track current implementation phases, upcoming deliverables, and live status updates shared directly from our delivery workspace.`,
    agencyContactName,
    agencyContactEmail,
    showInvestment: true,
    milestones,
    updates,
    lastUpdatedAt: getLocalIsoDate(),
  };
}

export function buildClientPreviewSnapshot(
  prospect: Prospect,
  portal: ClientPortalConfig,
  currency: CurrencyCode
): ClientPreviewSnapshot {
  return {
    v: 1,
    generatedAt: new Date().toISOString(),
    currency,
    prospect: {
      id: prospect.id,
      businessName: prospect.businessName,
      contactPerson: prospect.contactPerson,
      roleTitle: prospect.roleTitle,
      city: prospect.city,
      stateOrRegion: prospect.stateOrRegion,
      country: prospect.country,
      categoryNiche: prospect.categoryNiche,
      stage: prospect.stage,
      serviceInterest: prospect.serviceInterest,
      ticketUsd: portal.showInvestment ? prospect.ticketUsd : 0,
      nextFollowUp: prospect.nextFollowUp,
      website: prospect.website,
    },
    portal,
  };
}

export function encodeClientPreviewSnapshot(snapshot: ClientPreviewSnapshot): string {
  const json = JSON.stringify(snapshot);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeClientPreviewSnapshot(token: string): ClientPreviewSnapshot | null {
  try {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((token.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as ClientPreviewSnapshot;
    if (!parsed || parsed.v !== 1 || !parsed.prospect || !parsed.portal) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function buildShareablePreviewUrl(snapshot: ClientPreviewSnapshot): string {
  const token = encodeClientPreviewSnapshot(snapshot);
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('clientPreview', token);
  return url.toString();
}
