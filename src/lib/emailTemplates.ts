import { OPERATING_NICHES } from '../data/operatingNiches';
import { OperatingNiche, PipelineStage } from '../types/crm';

export interface EmailRecipientContext {
  prospectId?: string;
  placeId?: string;
  contactName: string;
  roleTitle?: string;
  businessName: string;
  email: string;
  phone?: string;
  website?: string;
  address: string;
  city: string;
  stateOrRegion?: string;
  country: string;
  niche: string;
  rating?: number | null;
  reviewCount?: number;
  opportunitySignals?: string[];
  serviceInterest?: string;
  competitorAdvantage?: string;
  replyNotes?: string;
  stage?: PipelineStage;
  ticketUsd?: number;
  lastContacted?: string;
  senderName?: string;
  googleMapsUri?: string;
  leadPriority?: 'Hot' | 'Warm' | 'Cold' | 'Dead';
  clientPreviewUrl?: string;
}

export interface MailTemplate {
  id: string;
  name: string;
  category: string;
  bestFor: string;
  nicheIds?: string[];
  subjectTemplate: string;
  bodyTemplate: string;
  isCustom?: boolean;
}

export interface DynamicFieldChip {
  token: string;
  label: string;
  value: string;
}

const CUSTOM_TEMPLATES_STORAGE_KEY = 'clientsology_custom_mail_templates_v1';
const LEGACY_TEMPLATES_STORAGE_KEY = 'brandscove_custom_mail_templates_v1';

export function resolveNicheProfile(nicheName: string): OperatingNiche | undefined {
  const q = (nicheName || '').toLowerCase().trim();
  if (!q) return undefined;

  const direct = OPERATING_NICHES.find(
    (n) => n.name.toLowerCase().includes(q) || q.includes(n.name.toLowerCase())
  );
  if (direct) return direct;

  const keywordMap: [string[], string][] = [
    [['hvac', 'plumb', 'heating', 'cooling', 'air cond', 'furnace'], 'hvac-plumbing'],
    [['roof', 'storm', 'gutter', 'siding'], 'roofing-restoration'],
    [['med spa', 'med-spa', 'botox', 'aesthetic', 'laser', 'skin'], 'med-spas'],
    [['dent', 'implant', 'orthodon', 'veneer'], 'cosmetic-dentistry'],
    [['law', 'attorney', 'legal', 'solicitor', 'advocate'], 'law-firms'],
    [['builder', 'remodel', 'contractor', 'renovat', 'construction'], 'custom-builders'],
    [['wealth', 'cpa', 'account', 'tax', 'financial', 'fiduciary'], 'wealth-cpas'],
    [['manufactur', 'logistic', 'industrial', 'cnc', 'freight'], 'b2b-manufacturing'],
    [['real estate', 'property', 'realtor', 'brokerage'], 'real-estate-mgmt'],
    [['auto', 'detail', 'collision', 'mechanic', 'car wash', 'garage'], 'auto-detailing'],
    [['restaurant', 'cafe', 'coffee', 'bistro', 'pizza', 'bakery', 'hotel'], 'local-restaurants'],
    [['clinic', 'doctor', 'medical', 'dermatol', 'physio', 'hospital'], 'medical-clinics'],
    [['cloth', 'fashion', 'apparel', 'boutique', 'shopify', 'store'], 'fashion-ecommerce'],
    [['supplement', 'pet', 'vitamin', 'nutrition'], 'supplements-pets-ecom'],
    [['tutor', 'coach', 'academy', 'school', 'training', 'ielts'], 'coaching-academies'],
  ];

  for (const [keywords, id] of keywordMap) {
    if (keywords.some((kw) => q.includes(kw))) {
      return OPERATING_NICHES.find((n) => n.id === id);
    }
  }
  return undefined;
}

export const BUILT_IN_MAIL_TEMPLATES: MailTemplate[] = [
  {
    id: 'niche-hvac-dispatch',
    name: 'HVAC & Plumbing Dispatch Leak',
    category: 'Niche: Home Services',
    nicheIds: ['hvac-plumbing'],
    bestFor: 'HVAC, plumbing & emergency dispatch contractors',
    subjectTemplate: 'After-hours emergency calls at {{businessName}} ({{city}})',
    bodyTemplate: `{{personalizedGreeting}}

I noticed {{businessName}} at {{address}}{{ratingSummary}} while looking at top {{niche}} teams in {{city}}.

In emergency home services, {{primaryPainPoint}}. When a homeowner in {{city}} hits voicemail at 6:15 PM, they immediately dial the next Map Pack listing—costing $1,500–$15,000+ per missed replacement job.

We help {{niche}} businesses near {{shortAddress}} capture those calls with {{offerStackAutomation}} plus a fast mobile booking page ({{websiteStatus}}).

Open to a 90-second video showing how this would plug into {{businessName}}?

Best,
{{senderName}}`,
  },
  {
    id: 'niche-roofing-storm',
    name: 'Roofing Speed-to-Lead & Claim Capture',
    category: 'Niche: Roofing',
    nicheIds: ['roofing-restoration'],
    bestFor: 'Roofing & storm restoration contractors',
    subjectTemplate: '60-second quote speed for {{businessName}} in {{city}}',
    bodyTemplate: `{{personalizedGreeting}}

Looking at {{businessName}} ({{address}}){{ratingSummary}}, you already have the local credibility homeowners in {{city}} trust.

The biggest revenue leak we see in {{city}} right now is simple: {{primaryPainPoint}}. At $12k–$35k per roof, losing even two inspections a month to a faster-responding competitor adds up fast.

We install {{offerStackAutomation}} alongside {{offerStackSeo}} tailored specifically to {{businessName}}.

Mind if I send over a quick 90-second teardown showing what we spotted on {{businessName}}'s listing?

Best,
{{senderName}}`,
  },
  {
    id: 'niche-medspa-dental',
    name: 'Clinic, Dental & Med-Spa Patient Intake',
    category: 'Niche: Clinics & Med-Spa',
    nicheIds: ['med-spas', 'cosmetic-dentistry', 'medical-clinics'],
    bestFor: 'Dentists, med-spas, aesthetic & private medical clinics',
    subjectTemplate: 'New patient bookings for {{businessName}} ({{shortAddress}})',
    bodyTemplate: `{{personalizedGreeting}}

I came across {{businessName}} at {{address}}{{ratingSummary}} while researching leading {{niche}} practices in {{city}}.

Right now, {{primaryPainPoint}}. Every unreturned daytime inquiry or high-friction booking step quietly sends high-LTV patients to competing clinics in {{city}}.

We help clinics like {{businessName}} fix that with {{offerStackWeb}} paired with {{offerStackAutomation}}—without adding extra work for your front desk.

Would you like a 2-minute walkthrough tailored specifically to {{businessName}}?

Best,
{{senderName}}`,
  },
  {
    id: 'niche-law-wealth',
    name: 'Law Firm & Advisory Authority Intake',
    category: 'Niche: Legal & Finance',
    nicheIds: ['law-firms', 'wealth-cpas'],
    bestFor: 'Law firms, CPAs, and wealth advisory practices',
    subjectTemplate: 'Client intake & search visibility for {{businessName}}',
    bodyTemplate: `{{personalizedGreeting}}

Prospects in {{city}} almost always research credentials on Google before contacting a firm near {{shortAddress}}.

Reviewing {{businessName}} ({{address}}){{ratingSummary}}, one clear lever stood out: {{primaryPainPoint}}. Closing that gap protects high-value retainers that otherwise go to firms ranking spots #1–#3 in {{city}}.

We build {{offerStackWeb}} paired with {{offerStackAutomation}} built for {{businessName}}'s exact practice focus.

Can I share a brief 90-second audit of {{businessName}}'s local search & intake flow?

Best,
{{senderName}}`,
  },
  {
    id: 'niche-restaurant-hospitality',
    name: 'Restaurant & Cafe Map Pack Bookings',
    category: 'Niche: Hospitality',
    nicheIds: ['local-restaurants'],
    bestFor: 'Local restaurants, cafes & hospitality venues',
    subjectTemplate: 'Direct bookings & Google Maps traffic for {{businessName}}',
    bodyTemplate: `{{personalizedGreeting}}

I spotted {{businessName}} over on {{address}}{{ratingSummary}} while checking popular {{niche}} spots in {{city}}.

Right now, {{primaryPainPoint}}—and your profile shows {{websiteStatus}}. That means hungry diners searching nearby in {{city}} often end up booking competitors or paying 25% aggregator fees instead of ordering from {{businessName}} directly.

We set up {{offerStackWeb}} plus {{offerStackAutomation}} so locals in {{city}} find your menu and reserve in two taps.

Would you like to preview a quick concept built for {{businessName}}?

Best,
{{senderName}}`,
  },
  {
    id: 'niche-b2b-builders-ecom',
    name: 'Real Estate, Builders, Auto & B2B Growth',
    category: 'Niche: B2B & High-Ticket',
    nicheIds: [
      'custom-builders',
      'b2b-manufacturing',
      'real-estate-mgmt',
      'auto-detailing',
      'fashion-ecommerce',
      'supplements-pets-ecom',
      'coaching-academies',
    ],
    bestFor: 'Real estate, custom builders, B2B industrial, auto & e-commerce',
    subjectTemplate: 'Fixing lead qualification for {{businessName}} in {{city}}',
    bodyTemplate: `{{personalizedGreeting}}

I was reviewing {{niche}} leaders around {{city}} and pulled up {{businessName}} at {{address}}{{ratingSummary}}.

Noticeably, {{primaryPainPoint}}—and {{gapSignal}}. Fixing that single bottleneck turns existing {{city}} search demand into qualified, high-margin pipeline for {{businessName}}.

Specifically, we combine {{offerStackWeb}} with {{offerStackAutomation}} customized to your team at {{shortAddress}}.

Open to seeing a short 90-second breakdown tailored to {{businessName}}?

Best,
{{senderName}}`,
  },
  {
    id: 'no-website-map-rescue',
    name: 'No-Website Map Pack Rescue',
    category: 'Missing Website',
    bestFor: 'Scraped leads with no website listed on Google Maps',
    subjectTemplate: 'Quick question about {{businessName}} on {{shortAddress}}',
    bodyTemplate: `{{personalizedGreeting}}

I was searching for top {{niche}} options around {{city}} and spotted {{businessName}} at {{address}}{{ratingSummary}}.

One thing jumped out right away: your Google Business Profile currently has {{websiteStatus}}, and {{primaryPainPoint}}.

We build fast, mobile-first websites wired directly to your Google Business Profile at {{shortAddress}} so local searches in {{city}} convert into booked calls automatically.

Would you be open to seeing a quick 90-second mockup created for {{businessName}}?

Best,
{{senderName}}`,
  },
  {
    id: 'funnel-strategy-conversion',
    name: 'Funnel Strategy Conversion',
    category: 'High-Converting Cold',
    bestFor: 'CRM prospects needing Website + SEO + AI Lead Capture',
    subjectTemplate: '{{businessName}} + {{city}} Google search traffic',
    bodyTemplate: `{{personalizedGreeting}}

When someone in {{city}} searches for a trusted {{niche}} near {{shortAddress}}, they compare the top 3 map results before calling anyone.

Looking at {{businessName}}{{ratingSummary}}, {{primaryPainPoint}}—and {{gapSignal}}. Every week those searches go unanswered, high-intent buyers in {{city}} book with a competitor down the street instead.

We help {{niche}} teams in {{city}} fix that leak with {{serviceInterest}} tailored to {{businessName}}.

Mind if I send over 3 specific fixes spotted for {{businessName}}?

Best,
{{senderName}}`,
  },
  {
    id: 'reputation-review-engine',
    name: 'GMB Rating & Review Velocity Engine',
    category: 'Reputation & SEO',
    bestFor: 'Businesses with <4.5★ rating or fewer than 35 Google reviews',
    subjectTemplate: 'Boosting {{businessName}} past competitors in {{city}}',
    bodyTemplate: `{{personalizedGreeting}}

I came across {{businessName}} ({{address}}) while researching {{niche}} providers in {{city}}. Right now your Google listing shows {{ratingInline}}, while top map-pack competitors in {{city}} pull ahead mainly on automated post-visit review velocity.

Combined with the fact that {{primaryPainPoint}}, installing a lightweight SMS/WhatsApp review & lead-capture engine turns happy customers visiting {{shortAddress}} into 5-star Google reviews every week.

Want me to share how that would look for {{businessName}}?

Best,
{{senderName}}`,
  },
  {
    id: 'warm-followup-nudge',
    name: 'CRM Follow-Up & Proposal Nudge',
    category: 'CRM Follow-Up',
    bestFor: 'Active CRM deals (Contacted, Proposal Sent, Negotiating)',
    subjectTemplate: 'Following up on {{businessName}} — {{serviceInterest}}',
    bodyTemplate: `{{personalizedGreeting}}

Circling back on {{serviceInterest}} for {{businessName}} in {{city}} ({{address}}).

Because {{primaryPainPoint}}, getting this live sooner helps {{businessName}} capture the {{niche}} demand already searching in {{city}}. {{crmNoteSentence}}

If you'd prefer a streamlined Phase 1 rollout focused first on {{shortAddress}}, reply "Phase 1" and I'll send the updated scope over.

Best,
{{senderName}}`,
  },
  {
    id: 'client-portal-share',
    name: 'Client Preview: Live Project Roadmap',
    category: 'Client Portal',
    bestFor: 'Sharing read-only project roadmap & status portal link',
    subjectTemplate: '{{businessName}} — Live Project Roadmap & Status Preview',
    bodyTemplate: `{{personalizedGreeting}}

We put together a dedicated read-only Client Preview portal for {{businessName}} so you and your team can review our proposed {{serviceInterest}} roadmap, phase deliverables, and latest status updates in one place:

{{clientPreviewUrl}}

Key focus for {{city}}: {{primaryPainPoint}}.

Take a quick look whenever you have two minutes and let me know if you'd like any milestone timelines adjusted ahead of kickoff.

Best,
{{senderName}}`,
  },
];

export const DYNAMIC_TEMPLATE_TOKENS = [
  '{{contactName}}',
  '{{businessName}}',
  '{{address}}',
  '{{shortAddress}}',
  '{{city}}',
  '{{country}}',
  '{{niche}}',
  '{{primaryPainPoint}}',
  '{{ratingInline}}',
  '{{websiteStatus}}',
  '{{gapSignal}}',
  '{{serviceInterest}}',
  '{{crmNoteSentence}}',
  '{{senderName}}',
] as const;

export function loadCustomMailTemplates(): MailTemplate[] {
  try {
    const raw =
      localStorage.getItem(CUSTOM_TEMPLATES_STORAGE_KEY) ??
      localStorage.getItem(LEGACY_TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomMailTemplates(templates: MailTemplate[]) {
  try {
    localStorage.setItem(CUSTOM_TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Ignore storage quota errors
  }
}

export function pickRecommendedTemplateId(ctx: EmailRecipientContext): string {
  if (ctx.clientPreviewUrl) {
    return 'client-portal-share';
  }
  if (
    ctx.stage &&
    ['Contacted', 'Proposal Sent', 'Negotiating', 'Follow Up'].includes(ctx.stage)
  ) {
    return 'warm-followup-nudge';
  }
  const nicheProfile = resolveNicheProfile(ctx.niche);
  if (nicheProfile) {
    const matchedTemplate = BUILT_IN_MAIL_TEMPLATES.find((t) =>
      t.nicheIds?.includes(nicheProfile.id)
    );
    if (matchedTemplate && ctx.website) {
      return matchedTemplate.id;
    }
  }
  if (!ctx.website || ctx.website.includes('facebook.com') || ctx.website.includes('instagram.com')) {
    return 'no-website-map-rescue';
  }
  if (
    (typeof ctx.rating === 'number' && ctx.rating < 4.5) ||
    (typeof ctx.reviewCount === 'number' && ctx.reviewCount > 0 && ctx.reviewCount < 35)
  ) {
    return 'reputation-review-engine';
  }
  return 'funnel-strategy-conversion';
}

function buildPersonalizedGreeting(ctx: EmailRecipientContext): string {
  const cleanContact = (ctx.contactName || '').trim();
  const isGeneric =
    !cleanContact ||
    cleanContact.toLowerCase() === 'owner / manager' ||
    cleanContact.toLowerCase() === 'owner' ||
    cleanContact.toLowerCase() === 'decision maker' ||
    cleanContact.toLowerCase() === 'manager';

  if (!isGeneric) {
    const firstName = cleanContact.split(/\s+/)[0];
    return `Hi ${firstName},`;
  }
  return `Hi ${ctx.businessName} team,`;
}

export function getNichePainPointsForContext(ctx: EmailRecipientContext): string[] {
  const nicheProfile = resolveNicheProfile(ctx.niche);
  const candidates: string[] = [];
  if (ctx.opportunitySignals?.length) {
    candidates.push(...ctx.opportunitySignals);
  }
  if (ctx.competitorAdvantage) {
    candidates.push(ctx.competitorAdvantage);
  }
  if (nicheProfile) {
    candidates.push(...nicheProfile.painPoints);
  }
  if (candidates.length === 0) {
    candidates.push('local search visitors are leaking to competitors with faster booking flows');
  }
  return Array.from(new Set(candidates.map((s) => s.trim()).filter(Boolean)));
}

export function buildReplacementMap(
  ctx: EmailRecipientContext,
  selectedPainPoint?: string
): Record<string, string> {
  const nicheProfile = resolveNicheProfile(ctx.niche);
  const shortAddress =
    ctx.address?.split(',')[0]?.trim() ||
    [ctx.city, ctx.stateOrRegion].filter(Boolean).join(', ') ||
    ctx.country;

  const fullAddress =
    ctx.address?.trim() ||
    [ctx.city, ctx.stateOrRegion, ctx.country].filter(Boolean).join(', ');

  const ratingSummary =
    typeof ctx.rating === 'number'
      ? ` (${ctx.rating.toFixed(1)}★ from ${ctx.reviewCount || 0} Google reviews)`
      : '';

  const ratingInline =
    typeof ctx.rating === 'number'
      ? `${ctx.rating.toFixed(1)}★ (${ctx.reviewCount || 0} reviews)`
      : 'your current Google reviews';

  const websiteStatus = !ctx.website
    ? 'no website linked yet'
    : ctx.website.includes('facebook.com') || ctx.website.includes('instagram.com')
      ? `only a social link (${ctx.website})`
      : `your website (${ctx.website.replace(/^https?:\/\//, '')})`;

  const gapSignal =
    ctx.opportunitySignals?.[0] ||
    ctx.competitorAdvantage ||
    (!ctx.website
      ? 'there is no dedicated website converting your Google Maps traffic'
      : 'local map-pack visibility and automated follow-up can capture more bookings');

  const rawPain =
    selectedPainPoint ||
    nicheProfile?.painPoints[0] ||
    gapSignal;
  const primaryPainPoint = rawPain.charAt(0).toLowerCase() + rawPain.slice(1).replace(/\.$/, '');

  const serviceInterest =
    ctx.serviceInterest ||
    (!ctx.website
      ? 'High-Converting Website + Google Map Pack SEO'
      : 'Local SEO + AI Speed-to-Lead Automation');

  const phoneInline = ctx.phone ? ` (${ctx.phone})` : '';
  const contactDisplay =
    ctx.contactName &&
    !['owner / manager', 'owner', 'decision maker'].includes(ctx.contactName.toLowerCase())
      ? ctx.contactName
      : `${ctx.businessName} Team`;

  const crmNoteSentence = ctx.replyNotes?.trim()
    ? `Specifically regarding our earlier note (${ctx.replyNotes.trim().slice(0, 120)}), we mapped out a quick path forward.`
    : '';

  return {
    '{{personalizedGreeting}}': buildPersonalizedGreeting(ctx),
    '{{contactName}}': contactDisplay,
    '{{businessName}}': ctx.businessName || 'your business',
    '{{address}}': fullAddress || ctx.city || ctx.country,
    '{{shortAddress}}': shortAddress,
    '{{city}}': ctx.city || ctx.country,
    '{{stateOrRegion}}': ctx.stateOrRegion || '',
    '{{country}}': ctx.country || '',
    '{{niche}}': ctx.niche || 'local service',
    '{{primaryPainPoint}}': primaryPainPoint,
    '{{rating}}': typeof ctx.rating === 'number' ? ctx.rating.toFixed(1) : 'N/A',
    '{{reviewCount}}': String(ctx.reviewCount ?? 0),
    '{{ratingSummary}}': ratingSummary,
    '{{ratingInline}}': ratingInline,
    '{{websiteStatus}}': websiteStatus,
    '{{website}}': ctx.website || 'not listed',
    '{{phone}}': ctx.phone || '',
    '{{phoneInline}}': phoneInline,
    '{{gapSignal}}': gapSignal,
    '{{serviceInterest}}': serviceInterest,
    '{{offerStackSeo}}': nicheProfile?.offerStack.seo || 'Google Map Pack Local SEO',
    '{{offerStackWeb}}': nicheProfile?.offerStack.webDev || 'high-speed mobile conversion website',
    '{{offerStackAutomation}}':
      nicheProfile?.offerStack.automation || '24/7 AI missed-call & instant SMS booking',
    '{{trojanHook}}': nicheProfile?.trojanHorseHook || gapSignal,
    '{{clientJobValue}}': nicheProfile?.clientJobValue || '$1,500+ per closed customer',
    '{{crmNoteSentence}}': crmNoteSentence,
    '{{clientPreviewUrl}}': ctx.clientPreviewUrl || '',
    '{{senderName}}': ctx.senderName || 'Clientsology Growth Team',
  };
}

export function getDynamicFieldChips(
  ctx: EmailRecipientContext,
  selectedPainPoint?: string
): DynamicFieldChip[] {
  const map = buildReplacementMap(ctx, selectedPainPoint);
  const chips: DynamicFieldChip[] = [
    { token: '{{businessName}}', label: 'Business Name', value: map['{{businessName}}'] },
    { token: '{{contactName}}', label: 'Contact Name', value: map['{{contactName}}'] },
    { token: '{{address}}', label: 'Address / Location', value: map['{{address}}'] },
    { token: '{{city}}', label: 'City', value: map['{{city}}'] },
    { token: '{{niche}}', label: 'Niche', value: map['{{niche}}'] },
    { token: '{{primaryPainPoint}}', label: 'CRM Pain Point', value: map['{{primaryPainPoint}}'] },
    { token: '{{websiteStatus}}', label: 'Website Status', value: map['{{websiteStatus}}'] },
    { token: '{{ratingInline}}', label: 'GMB Rating', value: map['{{ratingInline}}'] },
    { token: '{{serviceInterest}}', label: 'Service Offer', value: map['{{serviceInterest}}'] },
    { token: '{{clientJobValue}}', label: 'Job Value', value: map['{{clientJobValue}}'] },
  ];
  if (ctx.clientPreviewUrl) {
    chips.unshift({
      token: '{{clientPreviewUrl}}',
      label: 'Client Preview Link',
      value: ctx.clientPreviewUrl,
    });
  }
  return chips;
}

export function renderEmailTemplate(
  template: MailTemplate,
  ctx: EmailRecipientContext,
  selectedPainPoint?: string
): { subject: string; body: string } {
  const replacements = buildReplacementMap(ctx, selectedPainPoint);

  let subject = template.subjectTemplate;
  let body = template.bodyTemplate;

  Object.entries(replacements).forEach(([token, value]) => {
    subject = subject.split(token).join(value);
    body = body.split(token).join(value);
  });

  // Clean up any double spaces created if crmNoteSentence was empty
  body = body.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');

  return { subject, body };
}
