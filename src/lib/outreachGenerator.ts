import { CityMarket, CountryMarket, OperatingNiche } from '../types/crm';

export interface OutreachBundle {
  coldEmailSequence: { step: string; subject: string; body: string }[];
  linkedinMessages: { connectionNote: string; followUpDm: string };
  funnelStrategyScript: string;
  trojanHorseLoomScript: { section: string; timing: string; script: string }[];
}

export type OutreachTone =
  | 'Funnel Strategy (Pain-Desire)'
  | 'Executive B2B Direct'
  | 'Friendly Local Consultant';

export function buildOutreachBundle(params: {
  country: CountryMarket;
  city?: CityMarket;
  niche: OperatingNiche;
  serviceType: string;
  businessName: string;
  contactName: string;
  tone: OutreachTone;
}): OutreachBundle {
  const loc = params.city?.name || params.country.name;
  const biz = params.businessName.trim() || `[${params.niche.name} Business]`;
  const contact = params.contactName.trim() || 'there';
  const greeting =
    params.country.id === 'pakistan'
      ? `Assalam-o-Alaikum ${contact === 'there' ? 'bhai' : contact},`
      : `Hi ${contact},`;

  const anglePrefix =
    params.tone === 'Executive B2B Direct'
      ? `Keeping this brief—our team audited ${biz}'s online pipeline in ${loc}.`
      : params.tone === 'Friendly Local Consultant'
        ? `Hope your week in ${loc} is going great! I was researching top ${params.niche.name.toLowerCase()} in the area and came across ${biz}.`
        : params.niche.trojanHorseHook;

  const coldEmailSequence = [
    {
      step: 'Email 1 — Trojan Horse Opener (Day 1)',
      subject: `Quick 90s audit for ${biz} (${loc})`,
      body: `${greeting}

${anglePrefix}

Specifically for ${biz} in ${loc}, we spotted two quick wins around ${params.serviceType}:
1. ${params.niche.painPoints[0]}
2. ${params.niche.painPoints[1]}

I recorded a 90-second Loom screen-share showing the exact fixes and how competitors in ${loc} are capturing those customers right now. Want me to send the link over?

Best,
Clientsology Growth Team`,
    },
    {
      step: 'Email 2 — 48h Competitor Proof Follow-Up (Day 3)',
      subject: `Re: Quick 90s audit for ${biz}`,
      body: `${greeting}

Bumping this in case it got buried. We recently deployed ${params.niche.offerStack.automation} + ${params.niche.offerStack.seo} for a ${params.niche.name.toLowerCase()} team and helped them capture high-intent bookings without increasing ad spend.

Happy to share the 3-bullet teardown for ${biz}—worth a 10-minute look this week?`,
    },
    {
      step: 'Email 3 — 10-Day Respectful Breakup (Day 10)',
      subject: `Closing the loop on ${biz}`,
      body: `${greeting}

I will assume upgrading ${biz}'s Google visibility and automated lead capture isn't a priority this month. I'll keep your ${loc} audit notes on file—just reply "audit" anytime if you'd like to revisit.`,
    },
  ];

  const connectionNote = `Hi ${contact} — saw ${biz}'s work in ${loc}. We help ${params.niche.name.toLowerCase()} turn missed searches & inquiries into booked jobs via ${params.serviceType}. Would love to connect!`.slice(
    0,
    295
  );

  const followUpDm = `Thanks for connecting, ${contact}! Quick question—at ${biz}, are you mostly relying on referrals right now, or actively capturing "${params.niche.name.split(' ')[0]} ${loc}" searches on Google? Spot-checked your setup and noticed ${params.niche.painPoints[0].toLowerCase()}. Happy to send a 60s Loom teardown if useful.`;

  const funnelStrategyScript = `${greeting} I found ${biz} while checking top ${params.niche.name.toLowerCase()} in ${loc}.

[PAIN]: Right now, ${params.niche.fearsDesires.fear.toLowerCase()} — especially when buyers search Google Maps and pick whichever competitor responds fastest.
[FRICTION]: Most owners tell us ${params.niche.fearsDesires.frustration.toLowerCase()}.
[OUTCOME]: Our ${params.serviceType} setup helps ${biz} ${params.niche.fearsDesires.desire.toLowerCase()}.

Can I send you a 60-second video preview tailored for ${biz} today?`;

  const trojanHorseLoomScript = [
    {
      section: '01 · Pattern-Interrupt Hook',
      timing: '0:00 – 0:15',
      script: `"Hey ${contact}, recorded this quick 90-second video specifically for ${biz} in ${loc}. ${params.niche.trojanHorseHook}"`,
    },
    {
      section: '02 · Live Screen Audit (Pain)',
      timing: '0:15 – 0:45',
      script: `"Here is what a customer in ${loc} sees today when searching for ${params.niche.name.toLowerCase()}. Notice two leaks: first, ${params.niche.painPoints[0].toLowerCase()}; second, ${params.niche.painPoints[1].toLowerCase()}."`,
    },
    {
      section: '03 · Competitor Gap & Solution',
      timing: '0:45 – 1:15',
      script: `"Meanwhile, the #1–#2 listings in ${loc} are winning because they pair ${params.niche.offerStack.seo} with ${params.niche.offerStack.automation}. Because a single client job is worth ${params.niche.clientJobValue}, recovering just 1–2 leads a month pays for the whole system."`,
    },
    {
      section: '04 · Zero-Pressure CTA',
      timing: '1:15 – 1:30',
      script: `"No big pitch—if you'd like us to map out the exact 14-day rollout for ${biz}, reply 'yes' or grab a 15-minute slot on the link below."`,
    },
  ];

  return {
    coldEmailSequence,
    linkedinMessages: { connectionNote, followUpDm },
    funnelStrategyScript,
    trojanHorseLoomScript,
  };
}
