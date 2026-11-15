import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getMapsApiKey(): string {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
}

interface ParsedGeminiError {
  statusCode: number;
  code: string;
  userMessage: string;
  isQuota: boolean;
}

function parseGeminiError(err: unknown, fallbackMsg: string): ParsedGeminiError {
  const raw = err instanceof Error ? err.message : String(err || fallbackMsg);
  let statusCode = 500;
  let apiStatus = '';
  let apiMessage = raw;

  try {
    const parsed = JSON.parse(raw) as {
      error?: { code?: number; status?: string; message?: string };
    };
    if (parsed?.error) {
      statusCode = parsed.error.code || 500;
      apiStatus = parsed.error.status || '';
      apiMessage = parsed.error.message || raw;
    }
  } catch {
    // Non-JSON error message; inspect string markers
  }

  const isQuota =
    statusCode === 429 ||
    apiStatus === 'RESOURCE_EXHAUSTED' ||
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.includes('429') ||
    raw.toLowerCase().includes('quota');

  if (isQuota) {
    return {
      statusCode: 429,
      code: 'QUOTA_EXCEEDED',
      userMessage:
        'Gemini API quota/rate limit reached for your current API key. Wait ~60 seconds for per-minute limits to reset, or attach a billing-enabled key in Settings > Secrets.',
      isQuota: true,
    };
  }

  if (statusCode === 403 || apiStatus === 'PERMISSION_DENIED' || raw.includes('API_KEY_INVALID')) {
    return {
      statusCode: 403,
      code: 'GEMINI_AUTH_ERROR',
      userMessage:
        'Gemini API key permission or validation error. Please verify GEMINI_API_KEY in Settings > Secrets.',
      isQuota: false,
    };
  }

  return {
    statusCode: statusCode >= 400 && statusCode < 600 ? statusCode : 500,
    code: 'GEMINI_ERROR',
    userMessage: apiMessage || fallbackMsg,
    isQuota: false,
  };
}

const aiCache = new Map<string, { expiresAt: number; payload: unknown }>();
const AI_CACHE_TTL_MS = 15 * 60 * 1000;

function getCachedAi<T>(key: string): T | null {
  const hit = aiCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    aiCache.delete(key);
    return null;
  }
  return hit.payload as T;
}

function setCachedAi(key: string, payload: unknown) {
  if (aiCache.size > 100) {
    const oldestKey = aiCache.keys().next().value;
    if (oldestKey) aiCache.delete(oldestKey);
  }
  aiCache.set(key, { expiresAt: Date.now() + AI_CACHE_TTL_MS, payload });
}

function extractJsonObject<T>(rawText: string | undefined): T {
  const cleaned = (rawText || '{}')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
    }
    return {} as T;
  }
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      hasMapsKey: Boolean(getMapsApiKey()),
    });
  });

  app.get('/api/maps/config', (_req, res) => {
    res.json({
      apiKey: getMapsApiKey(),
    });
  });

  // Google Maps Places API (New) Text Search proxy for real-time lead generation
  app.post('/api/maps/prospect-scrape', async (req, res) => {
    const mapsKey = getMapsApiKey();
    if (!mapsKey) {
      res.status(400).json({
        error: 'MAPS_KEY_MISSING',
        message: 'Google Maps API key is not configured on the server.',
      });
      return;
    }

    const { query, locationBias, regionCode, pageSize = 15 } = req.body as {
      query?: string;
      locationBias?: { lat: number; lng: number; radiusMeters?: number };
      regionCode?: string;
      pageSize?: number;
    };

    if (!query || !query.trim()) {
      res.status(400).json({ error: 'INVALID_QUERY', message: 'A search query is required.' });
      return;
    }

    const body: Record<string, unknown> = {
      textQuery: query.trim(),
      pageSize: Math.min(Math.max(Number(pageSize) || 15, 1), 20),
      languageCode: 'en',
    };

    if (regionCode && /^[a-zA-Z]{2}$/.test(regionCode)) {
      body.regionCode = regionCode.toLowerCase();
    }

    if (locationBias && typeof locationBias.lat === 'number' && typeof locationBias.lng === 'number') {
      body.locationBias = {
        circle: {
          center: {
            latitude: locationBias.lat,
            longitude: locationBias.lng,
          },
          radius: Math.min(Math.max(locationBias.radiusMeters || 25000, 500), 50000),
        },
      };
    }

    const fieldMask = [
      'places.id',
      'places.displayName',
      'places.formattedAddress',
      'places.location',
      'places.nationalPhoneNumber',
      'places.internationalPhoneNumber',
      'places.websiteUri',
      'places.rating',
      'places.userRatingCount',
      'places.googleMapsUri',
      'places.primaryTypeDisplayName',
      'places.businessStatus',
    ].join(',');

    try {
      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': mapsKey,
          'X-Goog-FieldMask': fieldMask,
          'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
        },
        body: JSON.stringify(body),
      });

      const rawText = await response.text();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        data = { message: rawText };
      }

      if (
        response.status === 429 ||
        (data as { error?: { status?: string } })?.error?.status === 'RESOURCE_EXHAUSTED'
      ) {
        res.status(429).json({
          error: 'RESOURCE_EXHAUSTED',
          message: 'Google Maps Platform quota reached.',
          details: data,
        });
        return;
      }

      if (!response.ok) {
        res.status(response.status).json({
          error: 'PLACES_API_ERROR',
          message:
            (data as { error?: { message?: string } })?.error?.message ||
            `Places API returned status ${response.status}`,
        });
        return;
      }

      const rawPlaces = Array.isArray((data as { places?: unknown[] }).places)
        ? ((data as { places: Record<string, unknown>[] }).places)
        : [];

      const leads = rawPlaces.map((p) => {
        const displayNameObj = p.displayName as { text?: string } | undefined;
        const locObj = p.location as { latitude?: number; longitude?: number } | undefined;
        const primaryTypeObj = p.primaryTypeDisplayName as { text?: string } | undefined;
        const website = typeof p.websiteUri === 'string' ? p.websiteUri : '';
        const rating = typeof p.rating === 'number' ? p.rating : null;
        const reviewCount = typeof p.userRatingCount === 'number' ? p.userRatingCount : 0;

        // Deterministic agency opportunity classification based strictly on observed API fields
        const opportunitySignals: string[] = [];
        let leadPriority: 'Hot' | 'Warm' | 'Cold' = 'Warm';
        if (!website) {
          opportunitySignals.push('No website listed — immediate Web Dev + Map Pack build');
          leadPriority = 'Hot';
        } else if (website.includes('facebook.com') || website.includes('instagram.com') || website.includes('linktr.ee')) {
          opportunitySignals.push('Social-only link — replace with high-converting landing site');
          leadPriority = 'Hot';
        }
        if (reviewCount < 35) {
          opportunitySignals.push('Low review volume (<35) — pitch automated review engine');
        }
        if (rating !== null && rating < 4.4) {
          opportunitySignals.push(`Rating ${rating.toFixed(1)} — reputation + follow-up opportunity`);
        }
        if (opportunitySignals.length === 0) {
          opportunitySignals.push('Established presence — pitch AI missed-call/WhatsApp & SEO scaling');
        }

        return {
          placeId: String(p.id || ''),
          businessName: displayNameObj?.text || 'Unnamed Business',
          formattedAddress: String(p.formattedAddress || ''),
          lat: typeof locObj?.latitude === 'number' ? locObj.latitude : null,
          lng: typeof locObj?.longitude === 'number' ? locObj.longitude : null,
          phone: String(p.internationalPhoneNumber || p.nationalPhoneNumber || ''),
          website,
          rating,
          reviewCount,
          googleMapsUri: String(p.googleMapsUri || ''),
          primaryType: primaryTypeObj?.text || '',
          businessStatus: String(p.businessStatus || 'OPERATIONAL'),
          leadPriority,
          opportunitySignals,
        };
      });

      res.json({ leads, total: leads.length });
    } catch (err) {
      res.status(500).json({
        error: 'SCRAPE_FAILED',
        message: err instanceof Error ? err.message : 'Failed to query Google Maps Places API.',
      });
    }
  });

  // Gemini + Google Search Grounding for Niche Search Volume & Competition Research
  app.post('/api/research/niche-search', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({
        error: 'GEMINI_KEY_MISSING',
        message: 'GEMINI_API_KEY is not configured in Settings > Secrets.',
      });
      return;
    }

    const { country, stateOrRegion, city, niche, serviceFocus } = req.body as {
      country?: string;
      stateOrRegion?: string;
      city?: string;
      niche?: string;
      serviceFocus?: string;
    };

    if (!country || !niche) {
      res.status(400).json({ error: 'INVALID_INPUT', message: 'Country and niche are required.' });
      return;
    }

    const geoLabel = [city, stateOrRegion, country].filter(Boolean).join(', ');
    const cacheKey = `niche:${geoLabel.toLowerCase()}:${niche.toLowerCase()}:${(serviceFocus || '').toLowerCase()}`;
    const cached = getCachedAi<{
      markdown: string;
      sources: { uri: string; title: string }[];
      geoLabel: string;
      grounded: boolean;
      notice?: string;
    }>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const prompt = `You are a senior digital agency market researcher. Evaluate market demand, search behavior, local competition, and commercial viability for selling ${serviceFocus || 'Web Development, Local SEO, and AI Automation'} to "${niche}" businesses in "${geoLabel}".

Provide a clear, structured Markdown brief with:
1. **Search Demand & Buyer Intent Signals**: Key local/transactional keywords prospects' customers actually search in ${geoLabel}, seasonality, and urgency indicators.
2. **Competition & Digital Saturation Analysis**: What top-ranking local competitors and agencies are doing in ${geoLabel}, typical Google Ads / SEO competitiveness, and obvious website/booking gaps.
3. **Recommended Trojan Horse Entry Offer**: The highest-converting 1-line audit hook, core deliverables, and realistic local retainer/setup benchmark.
4. **Top 5 Prospector Search Queries**: Exact queries to run on Google Maps or LinkedIn to find underserved buyers in ${geoLabel}.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources = chunks
        .map((c: { web?: { uri?: string; title?: string } }) =>
          c.web?.uri ? { uri: c.web.uri, title: c.web.title || c.web.uri } : null
        )
        .filter((s): s is { uri: string; title: string } => Boolean(s));

      const result = {
        markdown: response.text || 'No research summary returned.',
        sources,
        geoLabel,
        grounded: true,
      };
      setCachedAi(cacheKey, result);
      res.json(result);
    } catch (primaryErr) {
      const parsedPrimary = parseGeminiError(primaryErr, 'Search grounding request failed.');

      // If quota/rate-limit hit on Search-grounded gemini-4-hydrogen, fall back to lightweight gemini-3.1-flash-lite
      if (parsedPrimary.isQuota) {
        try {
          const liteResponse = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
          });
          const fallbackResult = {
            markdown: liteResponse.text || 'No research summary returned.',
            sources: [],
            geoLabel,
            grounded: false,
            notice:
              'Live Google Search grounding quota is currently exhausted; generated using Gemini Flash Lite without live web citations.',
          };
          setCachedAi(cacheKey, fallbackResult);
          res.json(fallbackResult);
          return;
        } catch (fallbackErr) {
          const parsedFallback = parseGeminiError(
            fallbackErr,
            'Gemini API quota reached across models.'
          );
          res.status(parsedFallback.statusCode).json({
            error: parsedFallback.code,
            message: parsedFallback.userMessage,
          });
          return;
        }
      }

      res.status(parsedPrimary.statusCode).json({
        error: parsedPrimary.code,
        message: parsedPrimary.userMessage,
      });
    }
  });

  // Gemini AI Outreach Customizer (with lightweight fallback on quota limits)
  app.post('/api/outreach/ai-personalize', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({
        error: 'GEMINI_KEY_MISSING',
        message: 'GEMINI_API_KEY is not configured in Settings > Secrets.',
      });
      return;
    }

    const { country, city, niche, businessName, contactName, serviceType, channel, tone, trojanHook } =
      req.body as Record<string, string>;

    const cacheKey = `outreach:${[country, city, niche, businessName, serviceType, tone]
      .map((v) => (v || '').toLowerCase())
      .join('|')}`;
    const cached = getCachedAi<{ script: string; notice?: string }>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const prompt = `Write a ready-to-send ${channel || 'Cold Email'} outreach message and a 60-second Loom Trojan Horse video script for an agency pitching ${serviceType || 'Web Dev + SEO + Automation'}.
Target Location: ${[city, country].filter(Boolean).join(', ')}
Niche: ${niche || 'Local Business'}
Business Name: ${businessName || '[Business Name]'}
Contact Name: ${contactName || '[Owner Name]'}
Style/Tone: ${tone || 'Direct, value-first Funnel Strategy (Pain-Desire)'}
Core Hook: ${trojanHook || 'Missed customer inquiries & Google Map Pack competitor gap'}

Keep copy crisp, human, free of spammy buzzwords, and include clear subject line + follow-up nudge.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      const result = { script: response.text || '' };
      setCachedAi(cacheKey, result);
      res.json(result);
    } catch (primaryErr) {
      const parsedPrimary = parseGeminiError(primaryErr, 'Failed to generate AI outreach.');

      if (parsedPrimary.isQuota) {
        try {
          const liteResponse = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
          });
          const fallbackResult = {
            script: liteResponse.text || '',
            notice: 'Generated with Gemini Flash Lite (web-grounding quota limit reached).',
          };
          setCachedAi(cacheKey, fallbackResult);
          res.json(fallbackResult);
          return;
        } catch (fallbackErr) {
          const parsedFallback = parseGeminiError(
            fallbackErr,
            'Gemini API quota reached across models.'
          );
          res.status(parsedFallback.statusCode).json({
            error: parsedFallback.code,
            message: parsedFallback.userMessage,
          });
          return;
        }
      }

      res.status(parsedPrimary.statusCode).json({
        error: parsedPrimary.code,
        message: parsedPrimary.userMessage,
      });
    }
  });

  // Gemini AI Email Conversion Optimizer (personalizes subject + body using live business/GMB details)
  app.post('/api/email/ai-optimize', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({
        error: 'GEMINI_KEY_MISSING',
        message: 'GEMINI_API_KEY is not configured in Settings > Secrets.',
      });
      return;
    }

    const {
      contactName,
      roleTitle,
      businessName,
      address,
      city,
      country,
      niche,
      rating,
      reviewCount,
      website,
      phone,
      opportunitySignals,
      serviceInterest,
      selectedPainPoint,
      replyNotes,
      stage,
      ticketUsd,
      senderName,
      conversionGoal,
      currentSubject,
      currentBody,
    } = req.body as {
      contactName?: string;
      roleTitle?: string;
      businessName?: string;
      address?: string;
      city?: string;
      country?: string;
      niche?: string;
      rating?: number | null;
      reviewCount?: number;
      website?: string;
      phone?: string;
      opportunitySignals?: string[];
      serviceInterest?: string;
      selectedPainPoint?: string;
      replyNotes?: string;
      stage?: string;
      ticketUsd?: number;
      senderName?: string;
      conversionGoal?: string;
      currentSubject?: string;
      currentBody?: string;
    };

    if (!businessName) {
      res.status(400).json({ error: 'INVALID_INPUT', message: 'Business name is required.' });
      return;
    }

    const cacheKey = `email-opt:${[
      businessName,
      contactName,
      address,
      city,
      website,
      typeof rating === 'number' ? String(rating) : '',
      serviceInterest,
      selectedPainPoint,
      replyNotes,
      stage,
      senderName,
      conversionGoal,
      currentSubject,
      currentBody,
    ]
      .map((v) => (v || '').trim().toLowerCase())
      .join('|')}`;
    const cached = getCachedAi<{ subject: string; body: string; notice?: string }>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const prompt = `You are a top B2B local agency copywriter. Rewrite and optimize this cold/warm outreach email for maximum reply rate and personal warmth.

STRICT RULES:
- NEVER write generic greetings like "Hey client", "Dear business owner", "To whom it may concern", or "I hope this email finds you well".
- Address the recipient naturally using "${contactName && !['owner / manager', 'owner', 'decision maker'].includes(contactName.toLowerCase()) ? contactName.split(/\s+/)[0] : `${businessName} team`}".
- Weave in specific, real details so it feels 1-to-1 researched:
  * Business Name: ${businessName}${roleTitle ? ` (Recipient role: ${roleTitle})` : ''}
  * Street / Full Address: ${address || [city, country].filter(Boolean).join(', ')}
  * City / Market: ${[city, country].filter(Boolean).join(', ')}
  * Niche / Category: ${niche || 'Local Business'}
  * Google Rating & Reviews: ${typeof rating === 'number' ? `${rating.toFixed(1)} stars across ${reviewCount || 0} Google reviews` : 'Not rated yet'}
  * Website Status: ${website || 'NO WEBSITE LISTED on Google Maps'}
  * Phone: ${phone || 'Not listed'}
  * Primary CRM Pain Point to Highlight: ${selectedPainPoint || (opportunitySignals || []).join('; ') || serviceInterest || 'Local SEO & conversion gap'}
  * Observed Signals: ${(opportunitySignals || []).join('; ') || 'None specified'}${replyNotes ? `\n  * CRM Deal Notes: ${replyNotes}` : ''}${stage ? `\n  * Pipeline Stage: ${stage}` : ''}${typeof ticketUsd === 'number' && ticketUsd > 0 ? `\n  * Estimated Deal Scope: $${ticketUsd}` : ''}
  * Conversion Goal: ${conversionGoal || 'Get a quick reply to send a 90-second custom teardown video'}
  * Sign-off Name: ${senderName || 'Clientsology Growth Team'}

Draft to upgrade:
Subject: ${currentSubject || ''}
Body:
${currentBody || ''}

Keep the email concise (110-155 words), conversational, zero buzzwords, with a crystal-clear low-friction CTA.`;

    const schemaConfig = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING, description: 'Personalized high-open-rate subject line' },
          body: { type: Type.STRING, description: 'Complete personalized email body with greeting and sign-off' },
        },
        required: ['subject', 'body'],
      },
    };

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          ...schemaConfig,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      const parsedJson = extractJsonObject<{
        subject?: string;
        body?: string;
      }>(response.text);
      const result = {
        subject: parsedJson.subject || currentSubject || `Quick note for ${businessName}`,
        body: parsedJson.body || currentBody || '',
      };
      setCachedAi(cacheKey, result);
      res.json(result);
    } catch (primaryErr) {
      const parsedPrimary = parseGeminiError(primaryErr, 'Failed to optimize email with AI.');
      if (parsedPrimary.isQuota) {
        try {
          const liteResponse = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
            config: schemaConfig,
          });
          const parsedLite = extractJsonObject<{
            subject?: string;
            body?: string;
          }>(liteResponse.text);
          const fallbackResult = {
            subject: parsedLite.subject || currentSubject || `Quick note for ${businessName}`,
            body: parsedLite.body || currentBody || '',
            notice: 'Optimized using Gemini Flash Lite (primary quota limit reached).',
          };
          setCachedAi(cacheKey, fallbackResult);
          res.json(fallbackResult);
          return;
        } catch (fallbackErr) {
          const parsedFallback = parseGeminiError(
            fallbackErr,
            'Gemini API quota reached across models.'
          );
          res.status(parsedFallback.statusCode).json({
            error: parsedFallback.code,
            message: parsedFallback.userMessage,
          });
          return;
        }
      }

      res.status(parsedPrimary.statusCode).json({
        error: parsedPrimary.code,
        message: parsedPrimary.userMessage,
      });
    }
  });

  // Automated LinkedIn Search URL & Snapshot Prospect Scraper (Gemini Search Grounding + Structured Parser)
  const LINKEDIN_GEO_LOOKUP: Record<string, string> = {
    '103644278': 'United States',
    '101165590': 'United Kingdom',
    '104305776': 'United Arab Emirates',
    '101282230': 'Germany',
    '101022442': 'Pakistan',
    '100459316': 'Saudi Arabia',
    '105015875': 'France',
    '102890719': 'Netherlands',
    '104738515': 'Ireland',
    '105646813': 'Spain',
    '103350119': 'Italy',
    '105072130': 'Poland',
    '102571732': 'New York, USA',
    '102448103': 'Los Angeles, USA',
    '103112676': 'Chicago, USA',
    '102394087': 'Miami, USA',
    '103759029': 'Houston, USA',
    '104472865': 'Austin, USA',
    '102277331': 'San Francisco, USA',
    '104116203': 'Dallas, USA',
    '106224388': 'Charlotte, USA',
    '104979702': 'Scottsdale, USA',
    '90009496': 'London, UK',
    '102257491': 'London, UK',
    '101318387': 'Manchester, UK',
    '100488509': 'Dubai, UAE',
    '105117309': 'Riyadh, Saudi Arabia',
    '103978481': 'Lahore, Pakistan',
    '105485641': 'Karachi, Pakistan',
    '100994331': 'Berlin, Germany',
    '100477049': 'Munich, Germany',
    '104804982': 'Stuttgart, Germany',
    '102011674': 'Amsterdam, Netherlands',
  };

  app.post('/api/linkedin/prospect-scrape', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({
        error: 'GEMINI_KEY_MISSING',
        message: 'GEMINI_API_KEY is not configured in Settings > Secrets.',
      });
      return;
    }

    const {
      linkedinSearchUrl = '',
      nicheOverride = '',
      locationOverride = '',
      searchType: requestedType,
      limit = 10,
      rawPastedText = '',
    } = req.body as {
      linkedinSearchUrl?: string;
      nicheOverride?: string;
      locationOverride?: string;
      searchType?: 'people' | 'companies' | 'all';
      limit?: number;
      rawPastedText?: string;
    };

    const trimmedUrl = linkedinSearchUrl.trim();
    const trimmedSnapshot = rawPastedText.trim();

    if (!trimmedUrl && !trimmedSnapshot) {
      res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'Provide a LinkedIn search URL or paste LinkedIn search results text.',
      });
      return;
    }

    let parsedKeywords = '';
    let parsedLocation = '';
    let parsedType: 'people' | 'companies' | 'all' = requestedType || 'people';

    if (trimmedUrl) {
      try {
        const parsed = new URL(trimmedUrl.startsWith('http') ? trimmedUrl : `https://${trimmedUrl}`);
        const host = parsed.hostname.toLowerCase();
        if (!host.includes('linkedin.com')) {
          res.status(400).json({
            error: 'INVALID_LINKEDIN_URL',
            message: 'Please enter a valid linkedin.com search URL.',
          });
          return;
        }
        const pathLower = parsed.pathname.toLowerCase();
        if (!requestedType) {
          parsedType = pathLower.includes('compan')
            ? 'companies'
            : pathLower.includes('/people')
              ? 'people'
              : 'all';
        }
        const kw =
          parsed.searchParams.get('keywords') ||
          parsed.searchParams.get('titleFreeText') ||
          '';
        parsedKeywords = kw.trim();

        const rawGeo =
          parsed.searchParams.get('geoUrn') ||
          parsed.searchParams.get('facetGeoRegion') ||
          '';
        const urnMatches = rawGeo.match(/\d{5,12}/g) || [];
        const geoNames = urnMatches.map((id) => LINKEDIN_GEO_LOOKUP[id]).filter(Boolean);
        parsedLocation = geoNames.join(', ');
      } catch {
        res.status(400).json({
          error: 'INVALID_URL',
          message: 'Could not parse the LinkedIn URL provided.',
        });
        return;
      }
    }

    const effectiveNiche = nicheOverride.trim() || parsedKeywords || 'B2B Business Owners';
    const effectiveLocation = locationOverride.trim() || parsedLocation;
    const maxResults = Math.min(Math.max(Number(limit) || 10, 1), 15);
    const siteScope =
      parsedType === 'companies'
        ? 'site:linkedin.com/company'
        : 'site:linkedin.com/in';

    const cacheKey = `li-scrape:${trimmedSnapshot ? `snap:${trimmedSnapshot.slice(0, 120)}` : `${parsedType}:${effectiveNiche}:${effectiveLocation}:${maxResults}`}`.toLowerCase();
    const cached = getCachedAi<{
      parsedParams: { searchType: string; keywords: string; location: string };
      profiles: Record<string, unknown>[];
      sources: { uri: string; title: string }[];
      grounded: boolean;
      notice?: string;
    }>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    interface RawProfileItem {
      fullName?: string;
      roleTitle?: string;
      companyName?: string;
      location?: string;
      city?: string;
      stateOrRegion?: string;
      country?: string;
      niche?: string;
      linkedinUrl?: string;
      website?: string;
      headline?: string;
      summary?: string;
      opportunitySignal?: string;
      leadQuality?: string;
    }

    const sanitizeProfiles = (items: RawProfileItem[]) => {
      const seen = new Set<string>();
      return items
        .map((item, idx) => {
          const rawUrl = String(item.linkedinUrl || '').trim();
          const normalizedLiUrl = rawUrl.startsWith('http')
            ? rawUrl
            : rawUrl.includes('linkedin.com/')
              ? `https://${rawUrl}`
              : '';
          const fullName = String(item.fullName || '').trim();
          const companyName = String(item.companyName || '').trim();
          const roleTitle = String(item.roleTitle || (parsedType === 'companies' ? 'Company Profile' : 'Owner / Executive')).trim();
          if (!fullName && !companyName) return null;

          const dedupKey = (normalizedLiUrl || `${fullName}::${companyName}`).toLowerCase();
          if (seen.has(dedupKey)) return null;
          seen.add(dedupKey);

          const qualityRaw = String(item.leadQuality || '').trim();
          const leadQuality: 'Hot' | 'Warm' | 'Cold' =
            qualityRaw === 'Hot' || qualityRaw === 'Cold' ? qualityRaw : 'Warm';

          return {
            profileId: normalizedLiUrl
              ? normalizedLiUrl.replace(/[^a-zA-Z0-9_-]/g, '').slice(-24)
              : `li-${idx}-${Date.now()}`,
            fullName: fullName || companyName,
            roleTitle,
            companyName: companyName || `${fullName} Advisory`,
            location: String(item.location || effectiveLocation || '').trim(),
            city: String(item.city || '').trim(),
            stateOrRegion: String(item.stateOrRegion || '').trim(),
            country: String(item.country || '').trim(),
            niche: String(item.niche || effectiveNiche).trim(),
            linkedinUrl: normalizedLiUrl,
            website: String(item.website || '').trim(),
            headline: String(item.headline || '').trim(),
            summary: String(item.summary || '').trim(),
            opportunitySignal:
              String(item.opportunitySignal || '').trim() ||
              'Decision-maker profile matched for website, Local SEO & AI automation outreach',
            leadQuality,
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
        .slice(0, maxResults);
    };

    // Path A: Parse user-pasted LinkedIn search snapshot text
    if (trimmedSnapshot) {
      const snapshotPrompt = `Extract all real LinkedIn prospects/companies from the pasted LinkedIn search snapshot below.
Target Niche Hint: ${effectiveNiche}
Target Location Hint: ${effectiveLocation || 'Infer from text'}

STRICT RULES:
- Only extract entities explicitly present in the pasted text. Never invent names, companies, URLs, or emails.
- If a LinkedIn URL is missing from the snippet, leave linkedinUrl as an empty string "".
- Mark decision makers (Owner, Founder, Principal, Managing Partner, CEO, Director) or companies needing web/SEO modernization as "Hot" or "Warm".

Pasted LinkedIn Search Snapshot:
"""
${trimmedSnapshot.slice(0, 12000)}
"""`;

      const snapshotSchema = {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            profiles: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  fullName: { type: Type.STRING },
                  roleTitle: { type: Type.STRING },
                  companyName: { type: Type.STRING },
                  location: { type: Type.STRING },
                  city: { type: Type.STRING },
                  stateOrRegion: { type: Type.STRING },
                  country: { type: Type.STRING },
                  niche: { type: Type.STRING },
                  linkedinUrl: { type: Type.STRING },
                  website: { type: Type.STRING },
                  headline: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  opportunitySignal: { type: Type.STRING },
                  leadQuality: { type: Type.STRING },
                },
              },
            },
          },
          required: ['profiles'],
        },
      };

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: snapshotPrompt,
          config: {
            ...snapshotSchema,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });
        const parsed = extractJsonObject<{ profiles?: RawProfileItem[] }>(response.text);
        const profiles = sanitizeProfiles(parsed.profiles || []);
        const payload = {
          parsedParams: {
            searchType: parsedType,
            keywords: effectiveNiche,
            location: effectiveLocation,
          },
          profiles,
          sources: [],
          grounded: false,
          notice: `Parsed ${profiles.length} real prospect records from pasted LinkedIn search snapshot.`,
        };
        setCachedAi(cacheKey, payload);
        res.json(payload);
        return;
      } catch (err) {
        const parsedErr = parseGeminiError(err, 'Failed to parse pasted LinkedIn snapshot.');
        if (parsedErr.isQuota) {
          try {
            const liteRes = await ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: snapshotPrompt,
              config: snapshotSchema,
            });
            const parsedLite = extractJsonObject<{ profiles?: RawProfileItem[] }>(liteRes.text);
            const profiles = sanitizeProfiles(parsedLite.profiles || []);
            const payload = {
              parsedParams: {
                searchType: parsedType,
                keywords: effectiveNiche,
                location: effectiveLocation,
              },
              profiles,
              sources: [],
              grounded: false,
              notice: `Parsed ${profiles.length} records via Gemini Flash Lite.`,
            };
            setCachedAi(cacheKey, payload);
            res.json(payload);
            return;
          } catch (fallbackErr) {
            const parsedFb = parseGeminiError(fallbackErr, 'Gemini quota reached.');
            res.status(parsedFb.statusCode).json({
              error: parsedFb.code,
              message: parsedFb.userMessage,
            });
            return;
          }
        }
        res.status(parsedErr.statusCode).json({
          error: parsedErr.code,
          message: parsedErr.userMessage,
        });
        return;
      }
    }

    // Path B: Automated LinkedIn Search URL scraping via Google Search Grounding
    const searchPrompt = `Find up to ${maxResults} real, publicly indexed LinkedIn ${parsedType === 'companies' ? 'company pages' : 'decision-maker profiles'} matching this LinkedIn Search URL:
LinkedIn Search URL: ${trimmedUrl}
Extracted Search Type: ${parsedType}
Target Niche / Keywords: ${effectiveNiche}
Target Location: ${effectiveLocation || 'Infer from keywords or global'}

Perform targeted Google Search queries using ${siteScope} combined with "${effectiveNiche}"${effectiveLocation ? ` and "${effectiveLocation}"` : ''} to locate genuine public LinkedIn profiles.

STRICT ACCURACY RULES:
- ONLY include real people, companies, and authentic linkedin.com/in/... or linkedin.com/company/... URLs directly observed in your Google Search results.
- NEVER fabricate, guess, or synthesize fake names, fake companies, or guessed LinkedIn URLs.
- If fewer than ${maxResults} genuine public profiles appear in search results, return ONLY the genuine profiles found.
- Set leadQuality to "Hot" for clear owners/founders/managing partners/directors in target niches, "Warm" for managers/practitioners, and "Cold" otherwise.

Return ONLY valid JSON (no markdown fences) matching this exact structure:
{
  "profiles": [
    {
      "fullName": "Person Full Name (or Company Name if company page)",
      "roleTitle": "Job Title / Role",
      "companyName": "Business / Organization Name",
      "location": "City, State/Region, Country",
      "city": "City",
      "stateOrRegion": "State or Region",
      "country": "Country",
      "niche": "${effectiveNiche}",
      "linkedinUrl": "https://www.linkedin.com/in/...",
      "website": "",
      "headline": "LinkedIn headline or tagline",
      "summary": "1-sentence bio / specialization summary from search snippet",
      "opportunitySignal": "Specific digital agency angle (e.g. Local SEO, conversion site, AI speed-to-lead)",
      "leadQuality": "Hot"
    }
  ]
}`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: searchPrompt,
        config: {
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const parsedJson = extractJsonObject<{ profiles?: RawProfileItem[] }>(response.text);
      const profiles = sanitizeProfiles(parsedJson.profiles || []);

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources = chunks
        .map((c: { web?: { uri?: string; title?: string } }) =>
          c.web?.uri ? { uri: c.web.uri, title: c.web.title || c.web.uri } : null
        )
        .filter((s): s is { uri: string; title: string } => Boolean(s));

      const payload = {
        parsedParams: {
          searchType: parsedType,
          keywords: effectiveNiche,
          location: effectiveLocation,
        },
        profiles,
        sources,
        grounded: true,
        notice:
          profiles.length === 0
            ? 'No public indexed LinkedIn profiles matched that exact query. Try broadening the keywords/location or paste search results directly below.'
            : undefined,
      };
      setCachedAi(cacheKey, payload);
      res.json(payload);
    } catch (err) {
      const parsedErr = parseGeminiError(err, 'LinkedIn search grounding failed.');
      res.status(parsedErr.statusCode).json({
        error: parsedErr.code,
        message: parsedErr.userMessage,
      });
    }
  });

  // Competitor SEO, Domain Authority & Value Proposition Audit
  function decodeHtmlEntities(input: string): string {
    return input
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stripHtmlTags(input: string): string {
    return decodeHtmlEntities(input.replace(/<[^>]+>/g, ' '));
  }

  function isBlockedPrivateHost(hostname: string): boolean {
    const h = hostname.toLowerCase();
    if (
      h === 'localhost' ||
      h === '0.0.0.0' ||
      h === '::1' ||
      h.endsWith('.local') ||
      h.endsWith('.internal') ||
      /^127\./.test(h) ||
      /^10\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^169\.254\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
    ) {
      return true;
    }
    return false;
  }

  app.post('/api/competitor/audit', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({
        error: 'GEMINI_KEY_MISSING',
        message: 'GEMINI_API_KEY is not configured in Settings > Secrets.',
      });
      return;
    }

    const {
      competitorUrl = '',
      prospectId = '',
      prospectBusinessName = '',
      prospectWebsite = '',
      targetNiche = '',
      targetLocation = '',
      prospectServiceInterest = '',
    } = req.body as {
      competitorUrl?: string;
      prospectId?: string;
      prospectBusinessName?: string;
      prospectWebsite?: string;
      targetNiche?: string;
      targetLocation?: string;
      prospectServiceInterest?: string;
    };

    const rawInput = competitorUrl.trim();
    if (!rawInput) {
      res.status(400).json({
        error: 'INVALID_URL',
        message: 'Provide a competitor website URL to audit.',
      });
      return;
    }

    let parsedUrl: URL;
    try {
      const withScheme = /^https?:\/\//i.test(rawInput) ? rawInput : `https://${rawInput}`;
      parsedUrl = new URL(withScheme);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error('Unsupported scheme');
      }
      if (!parsedUrl.hostname.includes('.') || isBlockedPrivateHost(parsedUrl.hostname)) {
        res.status(400).json({
          error: 'INVALID_HOST',
          message: 'Enter a valid public website domain (e.g. https://apexdental.com).',
        });
        return;
      }
    } catch {
      res.status(400).json({
        error: 'INVALID_URL',
        message: 'Unable to parse competitor website URL.',
      });
      return;
    }

    const normalizedUrl = parsedUrl.toString();
    const domain = parsedUrl.hostname.replace(/^www\./, '').toLowerCase();
    const cacheKey = `comp-audit:${domain}:${(prospectBusinessName || '').toLowerCase()}:${(targetNiche || '').toLowerCase()}:${(targetLocation || '').toLowerCase()}`;
    const cached = getCachedAi<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    // Step 1: Fetch live competitor homepage HTML to measure real on-page SEO signals
    let siteReachable = false;
    let httpStatus: number | null = null;
    let responseTimeMs: number | null = null;
    let finalUrl = normalizedUrl;
    let isHttps = parsedUrl.protocol === 'https:';
    let title = '';
    let metaDescription = '';
    let metaKeywords: string[] = [];
    let h1Headings: string[] = [];
    let h2Headings: string[] = [];
    let schemaTypes: string[] = [];
    let hasCanonical = false;
    let hasOpenGraph = false;
    let hasMobileViewport = false;
    let wordCount = 0;
    let internalLinksCount = 0;
    let externalLinksCount = 0;
    let visibleTextExcerpt = '';
    let fetchNote = '';

    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8500);
      const pageRes = await fetch(normalizedUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      clearTimeout(timeout);

      responseTimeMs = Date.now() - startedAt;
      httpStatus = pageRes.status;
      finalUrl = pageRes.url || normalizedUrl;
      isHttps = finalUrl.startsWith('https://');

      const contentType = pageRes.headers.get('content-type') || '';
      if (pageRes.ok && contentType.includes('text/html')) {
        siteReachable = true;
        const html = (await pageRes.text()).slice(0, 260000);

        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        title = titleMatch ? stripHtmlTags(titleMatch[1]).slice(0, 180) : '';

        const metaDescMatch =
          html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i) ||
          html.match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]*name=["']description["'][^>]*>/i);
        metaDescription = metaDescMatch ? decodeHtmlEntities(metaDescMatch[1]).slice(0, 320) : '';

        const metaKwMatch =
          html.match(/<meta[^>]+name=["']keywords["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i) ||
          html.match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]*name=["']keywords["'][^>]*>/i);
        if (metaKwMatch) {
          metaKeywords = decodeHtmlEntities(metaKwMatch[1])
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean)
            .slice(0, 20);
        }

        h1Headings = Array.from(html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi))
          .map((m) => stripHtmlTags(m[1]))
          .filter(Boolean)
          .slice(0, 6);

        h2Headings = Array.from(html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi))
          .map((m) => stripHtmlTags(m[1]))
          .filter(Boolean)
          .slice(0, 12);

        const ldMatches = Array.from(
          html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
        );
        const typeSet = new Set<string>();
        ldMatches.forEach((m) => {
          const typeTokens = m[1].match(/"@type"\s*:\s*"([^"]+)"/g) || [];
          typeTokens.forEach((tok) => {
            const val = tok.replace(/"@type"\s*:\s*"/i, '').replace(/"$/, '').trim();
            if (val) typeSet.add(val);
          });
        });
        schemaTypes = Array.from(typeSet).slice(0, 10);

        hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html);
        hasOpenGraph = /<meta[^>]+property=["']og:/i.test(html);
        hasMobileViewport = /<meta[^>]+name=["']viewport["']/i.test(html);

        const hrefMatches = Array.from(html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi));
        hrefMatches.forEach((m) => {
          const href = m[1].trim();
          if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
            return;
          }
          if (href.startsWith('/') || href.includes(domain)) {
            internalLinksCount += 1;
          } else if (href.startsWith('http')) {
            externalLinksCount += 1;
          }
        });

        const bodyHtml = html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
        const plainBody = stripHtmlTags(bodyHtml);
        wordCount = plainBody ? plainBody.split(/\s+/).filter(Boolean).length : 0;
        visibleTextExcerpt = plainBody.slice(0, 3200);
      } else {
        fetchNote = `Live HTTP fetch returned status ${pageRes.status}. Audit supplemented via Google Search grounding.`;
      }
    } catch {
      responseTimeMs = Date.now() - startedAt;
      fetchNote = 'Direct HTML fetch was blocked or timed out; audit grounded via Google Search index.';
    }

    const onPageSignals = {
      siteReachable,
      httpStatus,
      responseTimeMs,
      isHttps,
      finalUrl,
      title,
      titleLength: title.length,
      metaDescription,
      metaDescriptionLength: metaDescription.length,
      h1Headings,
      h2Headings,
      metaKeywords,
      schemaTypes,
      hasCanonical,
      hasOpenGraph,
      hasMobileViewport,
      wordCount,
      internalLinksCount,
      externalLinksCount,
      fetchNote: fetchNote || undefined,
    };

    // Step 2: Grounded Google Search + Gemini analysis for Domain Authority, SEO Keywords & Prospect Value Prop
    const prospectContextBlock = prospectBusinessName
      ? `Target CRM Prospect We Are Helping:
- Business Name: ${prospectBusinessName}
- Website: ${prospectWebsite || 'Not logged / needs upgrade'}
- Niche: ${targetNiche || 'Infer from competitor domain'}
- Target Location: ${targetLocation || 'Infer from competitor'}
- Agency Offer Interest: ${prospectServiceInterest || 'Conversion Website + Local SEO + AI Lead Capture'}`
      : `Target Agency Context:
- Niche: ${targetNiche || 'Infer from competitor domain'}
- Location: ${targetLocation || 'Infer from competitor domain'}
- Goal: Craft a compelling value proposition so a competing prospect can outrank and out-convert ${domain}.`;

    const auditPrompt = `Conduct an evidence-based SEO, Domain Authority, and Conversion Value Proposition audit for competitor website: ${normalizedUrl} (domain: ${domain}).

OBSERVED LIVE ON-PAGE TELEMETRY (from direct HTTP inspection):
- Site Reachable: ${siteReachable} (HTTP ${httpStatus ?? 'N/A'}, ${responseTimeMs ?? 'N/A'}ms, HTTPS: ${isHttps})
- Title (${title.length} chars): ${title || '(none detected)'}
- Meta Description (${metaDescription.length} chars): ${metaDescription || '(none detected)'}
- H1 Headings: ${h1Headings.join(' | ') || '(none detected)'}
- H2 Headings: ${h2Headings.slice(0, 8).join(' | ') || '(none detected)'}
- Meta Keywords Tag: ${metaKeywords.join(', ') || '(none)'}
- Schema.org Types: ${schemaTypes.join(', ') || '(none detected)'}
- Word Count: ${wordCount}, Internal Links: ${internalLinksCount}, External Links: ${externalLinksCount}
- Visible Page Copy Excerpt:
"""
${visibleTextExcerpt || 'Homepage copy unavailable via direct fetch — inspect domain via Google Search.'}
"""

${prospectContextBlock}

INSTRUCTIONS:
Use Google Search grounding (including queries like site:${domain} and "${domain}" reviews/citations/directories/backlinks) to evaluate:
1. Domain Authority Estimate (0–100 scale based on indexed pages, directory/press citations, brand footprint, backlink signals, and multi-location authority; clearly explain why).
2. Top 8–12 SEO Keywords: mix of keywords they currently target/rank for ("Ranking" or "On-Page") and high-intent transactional/local "Keyword Gap" terms they are missing or under-optimizing.
3. Concrete Strengths (2–4) and Exploitable Weaknesses (3–5) tied to real on-page or authority observations.
4. A tailored Value Proposition & Outreach Hook specifically crafted for ${prospectBusinessName || 'the target prospect'} to beat ${domain}.

Return ONLY valid JSON (no markdown fences) matching this exact schema:
{
  "domainAuthority": {
    "score": 34,
    "tier": "Strong" | "Moderate" | "Vulnerable",
    "confidence": "High" | "Medium" | "Low",
    "indexedFootprint": "Concise summary of site:domain footprint & service pages",
    "backlinkProfileSummary": "Summary of citations, directories, PR, or referring authority observed in search",
    "rationale": "2-sentence explanation of why this DA score fits the observed domain"
  },
  "seoKeywords": [
    {
      "keyword": "exact keyword phrase",
      "intent": "Transactional" | "Local" | "Commercial" | "Informational",
      "presence": "Ranking" | "On-Page" | "Keyword Gap",
      "difficulty": "Low" | "Medium" | "High",
      "monthlySearchPotential": "e.g. High Local Intent / ~480-1.2k est.",
      "prospectOpportunity": "How the prospect can capture or outrank on this term"
    }
  ],
  "strengths": ["specific observed strength"],
  "weaknesses": ["specific technical, SEO, or conversion weakness"],
  "valueProposition": {
    "headline": "Sharp 1-line positioning headline for the prospect",
    "coreStatement": "2-3 sentence persuasive value proposition positioning the prospect ahead of ${domain}",
    "differentiators": [
      "Differentiator 1 vs ${domain}",
      "Differentiator 2 vs ${domain}",
      "Differentiator 3 vs ${domain}"
    ],
    "recommendedOffer": "Specific Clientsology service package to pitch",
    "outreachHook": "2-sentence cold email / Loom opener referencing a real finding on ${domain}",
    "emailSubject": "Concise curiosity-driven subject line",
    "emailBody": "Short 4-5 sentence ready-to-send email pitching the prospect using this competitor audit"
  }
}`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: auditPrompt,
        config: {
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      interface RawAuditJson {
        domainAuthority?: {
          score?: number;
          tier?: string;
          confidence?: string;
          indexedFootprint?: string;
          backlinkProfileSummary?: string;
          rationale?: string;
        };
        seoKeywords?: {
          keyword?: string;
          intent?: string;
          presence?: string;
          difficulty?: string;
          monthlySearchPotential?: string;
          prospectOpportunity?: string;
        }[];
        strengths?: string[];
        weaknesses?: string[];
        valueProposition?: {
          headline?: string;
          coreStatement?: string;
          differentiators?: string[];
          recommendedOffer?: string;
          outreachHook?: string;
          emailSubject?: string;
          emailBody?: string;
        };
      }

      const parsedJson = extractJsonObject<RawAuditJson>(response.text);
      const rawScore = Number(parsedJson.domainAuthority?.score);
      const clampedScore = Number.isFinite(rawScore)
        ? Math.min(99, Math.max(1, Math.round(rawScore)))
        : 25;

      const daTier: 'Strong' | 'Moderate' | 'Vulnerable' =
        clampedScore >= 50 ? 'Strong' : clampedScore >= 25 ? 'Moderate' : 'Vulnerable';

      const daConfRaw = String(parsedJson.domainAuthority?.confidence || '');
      const daConfidence: 'High' | 'Medium' | 'Low' =
        daConfRaw === 'High' || daConfRaw === 'Low' ? daConfRaw : 'Medium';

      const validIntents = new Set(['Transactional', 'Local', 'Commercial', 'Informational']);
      const validPresence = new Set(['Ranking', 'On-Page', 'Keyword Gap']);
      const validDiff = new Set(['Low', 'Medium', 'High']);

      const seoKeywords = (parsedJson.seoKeywords || [])
        .map((k) => {
          const kw = String(k.keyword || '').trim();
          if (!kw) return null;
          return {
            keyword: kw,
            intent: validIntents.has(String(k.intent)) ? String(k.intent) : 'Local',
            presence: validPresence.has(String(k.presence)) ? String(k.presence) : 'On-Page',
            difficulty: validDiff.has(String(k.difficulty)) ? String(k.difficulty) : 'Medium',
            monthlySearchPotential: String(k.monthlySearchPotential || 'Local Search Volume').trim(),
            prospectOpportunity: String(
              k.prospectOpportunity || 'Build dedicated local service page with Schema markup'
            ).trim(),
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
        .slice(0, 15);

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources = chunks
        .map((c: { web?: { uri?: string; title?: string } }) =>
          c.web?.uri ? { uri: c.web.uri, title: c.web.title || c.web.uri } : null
        )
        .filter((s): s is { uri: string; title: string } => Boolean(s));

      const reportPayload = {
        id: `audit-${domain.replace(/[^a-z0-9]/g, '')}-${Date.now()}`,
        auditedAt: new Date().toISOString(),
        domain,
        normalizedUrl,
        prospectId: prospectId || undefined,
        prospectBusinessName: prospectBusinessName || undefined,
        targetNiche: targetNiche || undefined,
        targetLocation: targetLocation || undefined,
        onPageSignals,
        domainAuthority: {
          score: clampedScore,
          tier: daTier,
          confidence: daConfidence,
          indexedFootprint: String(
            parsedJson.domainAuthority?.indexedFootprint ||
              `Indexed web presence evaluated for ${domain}`
          ).trim(),
          backlinkProfileSummary: String(
            parsedJson.domainAuthority?.backlinkProfileSummary ||
              'Evaluated public directory citations, brand mentions, and authority signals.'
          ).trim(),
          rationale: String(
            parsedJson.domainAuthority?.rationale ||
              `Authority score reflects observed on-page structure and search-indexed footprint for ${domain}.`
          ).trim(),
        },
        seoKeywords,
        strengths: (parsedJson.strengths || []).map((s) => String(s).trim()).filter(Boolean).slice(0, 5),
        weaknesses: (parsedJson.weaknesses || []).map((w) => String(w).trim()).filter(Boolean).slice(0, 6),
        valueProposition: {
          headline: String(
            parsedJson.valueProposition?.headline ||
              `Outrank & Out-Convert ${domain} in Local Search`
          ).trim(),
          coreStatement: String(
            parsedJson.valueProposition?.coreStatement ||
              `Position ${prospectBusinessName || 'your prospect'} with faster conversion UX, structured local Schema, and targeted landing pages capturing missed search demand.`
          ).trim(),
          differentiators: (parsedJson.valueProposition?.differentiators || [])
            .map((d) => String(d).trim())
            .filter(Boolean)
            .slice(0, 4),
          recommendedOffer: String(
            parsedJson.valueProposition?.recommendedOffer ||
              'Conversion Web Redesign + Local SEO + AI Lead Intake'
          ).trim(),
          outreachHook: String(
            parsedJson.valueProposition?.outreachHook ||
              `I audited ${domain} and spotted high-intent local search gaps your practice can capture within 60 days.`
          ).trim(),
          emailSubject: String(
            parsedJson.valueProposition?.emailSubject ||
              `Quick question on outranking ${domain}`
          ).trim(),
          emailBody: String(
            parsedJson.valueProposition?.emailBody || ''
          ).trim(),
        },
        sources,
        grounded: true,
      };

      setCachedAi(cacheKey, reportPayload);
      res.json(reportPayload);
    } catch (err) {
      const parsedErr = parseGeminiError(err, 'Competitor audit failed.');
      res.status(parsedErr.statusCode).json({
        error: parsedErr.code,
        message: parsedErr.userMessage,
      });
    }
  });

  // Automated One-Click SEO Health Check (Load Speed, Mobile-Friendliness & Missing Meta-Tags)
  app.post('/api/seo/health-check', async (req, res) => {
    const {
      websiteUrl = '',
      prospectId = '',
      prospectBusinessName = '',
    } = req.body as {
      websiteUrl?: string;
      prospectId?: string;
      prospectBusinessName?: string;
    };

    const rawInput = websiteUrl.trim();
    if (!rawInput) {
      res.status(400).json({
        error: 'INVALID_URL',
        message: 'Provide a website URL to run the One-Click SEO Health Check.',
      });
      return;
    }

    let parsedUrl: URL;
    try {
      const withScheme = /^https?:\/\//i.test(rawInput) ? rawInput : `https://${rawInput}`;
      parsedUrl = new URL(withScheme);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error('Unsupported scheme');
      }
      if (!parsedUrl.hostname.includes('.') || isBlockedPrivateHost(parsedUrl.hostname)) {
        res.status(400).json({
          error: 'INVALID_HOST',
          message: 'Enter a valid public website domain (e.g. https://brightsmile.com).',
        });
        return;
      }
    } catch {
      res.status(400).json({
        error: 'INVALID_URL',
        message: 'Unable to parse prospect website URL.',
      });
      return;
    }

    const normalizedUrl = parsedUrl.toString();
    const domain = parsedUrl.hostname.replace(/^www\./, '').toLowerCase();

    let reachable = false;
    let httpStatus: number | null = null;
    let responseTimeMs: number | null = null;
    let finalUrl = normalizedUrl;
    let isHttps = parsedUrl.protocol === 'https:';
    let compressed = false;
    let payloadKb = 0;
    let html = '';

    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8500);
      const pageRes = await fetch(normalizedUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      });
      clearTimeout(timeout);

      responseTimeMs = Date.now() - startedAt;
      httpStatus = pageRes.status;
      finalUrl = pageRes.url || normalizedUrl;
      isHttps = finalUrl.startsWith('https://');
      const contentEnc = (pageRes.headers.get('content-encoding') || '').toLowerCase();
      compressed = /gzip|br|deflate/.test(contentEnc);

      const contentType = (pageRes.headers.get('content-type') || '').toLowerCase();
      if (pageRes.ok && (contentType.includes('text/html') || contentType === '')) {
        reachable = true;
        const fullText = await pageRes.text();
        payloadKb = Math.round((Buffer.byteLength(fullText, 'utf8') / 1024) * 10) / 10;
        html = fullText.slice(0, 300000);
      }
    } catch {
      responseTimeMs = Date.now() - startedAt;
    }

    if (!reachable) {
      const unreachableReport = {
        id: `hc-${domain.replace(/[^a-z0-9]/g, '')}-${Date.now()}`,
        checkedAt: new Date().toISOString(),
        domain,
        normalizedUrl,
        finalUrl,
        prospectId: prospectId || undefined,
        prospectBusinessName: prospectBusinessName || undefined,
        reachable: false,
        httpStatus,
        healthScore: 15,
        loadSpeed: {
          responseTimeMs,
          payloadKb: 0,
          compressed: false,
          isHttps,
          grade: 'Unreachable',
          summary: httpStatus
            ? `${domain} returned HTTP ${httpStatus} (${responseTimeMs ?? 'N/A'}ms), blocking automated inspection or failing to serve public HTML.`
            : `${domain} timed out or refused connection after ${responseTimeMs ?? '8500'}ms.`,
        },
        mobileFriendliness: {
          mobileFriendly: false,
          hasViewportTag: false,
          hasDeviceWidth: false,
          responsiveHintsDetected: false,
          grade: 'Unverified',
          summary: 'Mobile viewport could not be verified because the site failed to serve public HTML.',
        },
        metaTags: {
          missingCount: 1,
          warningCount: 0,
          passedCount: 0,
          checks: [
            {
              id: 'availability',
              label: 'Public HTML Reachability',
              status: 'missing',
              observedValue: httpStatus ? `HTTP ${httpStatus}` : 'Timeout / Connection Blocked',
              recommendation: 'Ensure the live homepage resolves with HTTP 200 and does not block search crawlers.',
            },
          ],
        },
        thirtySecondSummary: `${domain} could not be reached cleanly (${httpStatus ? `HTTP ${httpStatus}` : 'connection timeout'}). Potential patients or search crawlers hitting downtime or strict firewall blocks will bounce immediately—strong opportunity to pitch a fast, reliable Next.js/Cloudflare site rebuild.`,
        topFixes: [
          'Restore clean HTTP 200 homepage availability for users and Googlebot',
          'Verify SSL certificate and DNS routing without redirect loops',
          'Audit firewall rules to ensure search crawlers are not blocked',
        ],
        outreachPitchHook: `I ran a quick technical check on ${domain} and noticed it returned ${httpStatus ? `HTTP ${httpStatus}` : 'a connection timeout'}—fixing uptime and speed could immediately recover lost local traffic.`,
      };
      res.json(unreachableReport);
      return;
    }

    // Parse Speed, Mobile & Meta Tags
    const speedGrade: 'Fast' | 'Moderate' | 'Slow' =
      (responseTimeMs ?? 9999) <= 600
        ? 'Fast'
        : (responseTimeMs ?? 9999) <= 1400
          ? 'Moderate'
          : 'Slow';

    const speedSummary =
      speedGrade === 'Fast'
        ? `Fast server response (${responseTimeMs}ms, ${payloadKb} KB HTML${isHttps ? ', HTTPS' : ', NO HTTPS'}).`
        : speedGrade === 'Moderate'
          ? `Moderate response time (${responseTimeMs}ms, ${payloadKb} KB HTML). Trimming render-blocking scripts and enabling edge caching would boost mobile conversions.`
          : `Slow initial response (${responseTimeMs}ms, ${payloadKb} KB HTML). Visitors on mobile connections likely experience noticeable delay before first paint.`;

    // Mobile-Friendliness Check
    const viewportMatch =
      html.match(/<meta[^>]+name=["']viewport["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i) ||
      html.match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]*name=["']viewport["'][^>]*>/i);
    const viewportContent = viewportMatch ? decodeHtmlEntities(viewportMatch[1]) : '';
    const hasViewportTag = Boolean(viewportMatch);
    const hasDeviceWidth = /width\s*=\s*device-width/i.test(viewportContent);
    const responsiveHintsDetected =
      /@media\s*\(/i.test(html) || /responsive|mobile-nav|hamburger|flex-wrap|grid-cols/i.test(html);
    const mobileFriendly = hasViewportTag && hasDeviceWidth;
    const mobileGrade: 'Mobile-Ready' | 'Needs Viewport Fix' = mobileFriendly
      ? 'Mobile-Ready'
      : 'Needs Viewport Fix';
    const mobileSummary = mobileFriendly
      ? `Mobile viewport tag detected (${viewportContent})${responsiveHintsDetected ? ' with responsive layout patterns' : ''}.`
      : hasViewportTag
        ? `Viewport tag found ("${viewportContent}") but missing width=device-width, risking horizontal zoom/scroll issues on phones.`
        : 'Missing <meta name="viewport"> tag—mobile browsers will render a zoomed-out desktop layout.';

    // Meta-Tag & SEO Checklist
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const titleText = titleMatch ? stripHtmlTags(titleMatch[1]) : '';
    const metaDescMatch =
      html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i) ||
      html.match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]*name=["']description["'][^>]*>/i);
    const metaDescText = metaDescMatch ? decodeHtmlEntities(metaDescMatch[1]) : '';
    const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([\s\S]*?)["']/i);
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([\s\S]*?)["']/i);
    const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]*content=["']([\s\S]*?)["']/i);
    const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([\s\S]*?)["']/i);
    const twitterCardMatch = html.match(/<meta[^>]+name=["']twitter:card["'][^>]*content=["']([\s\S]*?)["']/i);
    const robotsMatch = html.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([\s\S]*?)["']/i);
    const htmlLangMatch = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
    const h1Count = Array.from(html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)).length;
    const hasSchema = /application\/ld\+json/i.test(html);

    interface CheckRow {
      id: string;
      label: string;
      status: 'pass' | 'warning' | 'missing';
      observedValue: string;
      recommendation: string;
    }

    const checks: CheckRow[] = [
      {
        id: 'title',
        label: 'Title Tag (<title>)',
        status: !titleText
          ? 'missing'
          : titleText.length >= 25 && titleText.length <= 65
            ? 'pass'
            : 'warning',
        observedValue: titleText ? `${titleText.length} chars: "${titleText.slice(0, 70)}"` : 'Missing',
        recommendation: !titleText
          ? 'Add a keyword-rich <title> (30–65 chars) including primary service and city.'
          : titleText.length < 25 || titleText.length > 65
            ? 'Tighten <title> to 30–65 characters so Google does not truncate it in SERPs.'
            : 'Title tag length is within optimal SERP bounds.',
      },
      {
        id: 'description',
        label: 'Meta Description',
        status: !metaDescText
          ? 'missing'
          : metaDescText.length >= 70 && metaDescText.length <= 165
            ? 'pass'
            : 'warning',
        observedValue: metaDescText
          ? `${metaDescText.length} chars: "${metaDescText.slice(0, 90)}"`
          : 'Missing',
        recommendation: !metaDescText
          ? 'Add a persuasive 120–155 char meta description with a clear local CTA to lift organic CTR.'
          : metaDescText.length < 70 || metaDescText.length > 165
            ? 'Adjust meta description to 120–155 characters for optimal mobile snippet visibility.'
            : 'Meta description length is well-formatted.',
      },
      {
        id: 'viewport',
        label: 'Mobile Viewport Meta',
        status: mobileFriendly ? 'pass' : hasViewportTag ? 'warning' : 'missing',
        observedValue: viewportContent || 'Missing',
        recommendation: mobileFriendly
          ? 'Viewport properly configured for responsive mobile rendering.'
          : 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
      },
      {
        id: 'h1',
        label: 'Primary Heading (<h1>)',
        status: h1Count === 1 ? 'pass' : h1Count > 1 ? 'warning' : 'missing',
        observedValue: h1Count === 0 ? 'Missing (0 H1 tags)' : `${h1Count} H1 tag(s)`,
        recommendation:
          h1Count === 1
            ? 'Single primary H1 heading detected.'
            : h1Count === 0
              ? 'Add one clear H1 headline stating your core niche service and city.'
              : 'Consolidate multiple H1 tags into one primary topic headline.',
      },
      {
        id: 'canonical',
        label: 'Canonical URL Tag',
        status: canonicalMatch ? 'pass' : 'missing',
        observedValue: canonicalMatch ? canonicalMatch[1].slice(0, 70) : 'Missing',
        recommendation: canonicalMatch
          ? 'Canonical link prevents duplicate URL indexing.'
          : 'Add <link rel="canonical"> to consolidate ranking authority on preferred URLs.',
      },
      {
        id: 'opengraph',
        label: 'OpenGraph Social Meta (og:title / og:image)',
        status:
          ogTitleMatch && ogDescMatch && ogImageMatch
            ? 'pass'
            : ogTitleMatch || ogImageMatch
              ? 'warning'
              : 'missing',
        observedValue:
          [
            ogTitleMatch ? 'og:title' : null,
            ogDescMatch ? 'og:description' : null,
            ogImageMatch ? 'og:image' : null,
          ]
            .filter(Boolean)
            .join(', ') || 'Missing OpenGraph tags',
        recommendation:
          ogTitleMatch && ogDescMatch && ogImageMatch
            ? 'Complete OpenGraph share metadata configured.'
            : 'Add og:title, og:description, and og:image for clean link previews on LinkedIn/WhatsApp.',
      },
      {
        id: 'twitter',
        label: 'Twitter / X Card Meta',
        status: twitterCardMatch ? 'pass' : 'missing',
        observedValue: twitterCardMatch ? twitterCardMatch[1] : 'Missing',
        recommendation: twitterCardMatch
          ? 'Social card tag present.'
          : 'Add <meta name="twitter:card" content="summary_large_image">.',
      },
      {
        id: 'schema',
        label: 'Schema.org JSON-LD Markup',
        status: hasSchema ? 'pass' : 'missing',
        observedValue: hasSchema ? 'Detected' : 'Missing',
        recommendation: hasSchema
          ? 'Structured data present for rich Google snippets.'
          : 'Deploy LocalBusiness + FAQPage JSON-LD schema to qualify for rich SERP results.',
      },
      {
        id: 'robots',
        label: 'Robots & Indexing Directive',
        status: robotsMatch && /noindex/i.test(robotsMatch[1]) ? 'warning' : 'pass',
        observedValue: robotsMatch ? robotsMatch[1] : 'Default (index, follow)',
        recommendation:
          robotsMatch && /noindex/i.test(robotsMatch[1])
            ? 'CRITICAL: Page has noindex directive blocking Google from ranking it!'
            : 'No blocking robots directive detected.',
      },
      {
        id: 'lang',
        label: 'HTML Language Attribute',
        status: htmlLangMatch ? 'pass' : 'missing',
        observedValue: htmlLangMatch ? `lang="${htmlLangMatch[1]}"` : 'Missing',
        recommendation: htmlLangMatch
          ? 'Language attribute aids regional search targeting and accessibility.'
          : 'Add lang="en" (or regional code) on <html> for search and WCAG accessibility.',
      },
    ];

    const missingChecks = checks.filter((c) => c.status === 'missing');
    const warningChecks = checks.filter((c) => c.status === 'warning');
    const passedChecks = checks.filter((c) => c.status === 'pass');

    let score = 100;
    if (!isHttps) score -= 12;
    if (speedGrade === 'Moderate') score -= 8;
    if (speedGrade === 'Slow') score -= 18;
    if (!mobileFriendly) score -= 15;
    score -= missingChecks.length * 7;
    score -= warningChecks.length * 3;
    const healthScore = Math.min(99, Math.max(12, score));

    const missingLabels = missingChecks.map((c) => c.label.replace(/\s*\(.*?\)/, ''));
    const topFixes = [
      ...(!isHttps ? ['Enforce HTTPS/SSL across all pages'] : []),
      ...(speedGrade === 'Slow' ? [`Optimize server response time (${responseTimeMs}ms -> <600ms)`] : []),
      ...(!mobileFriendly ? ['Add responsive mobile viewport tag (width=device-width)'] : []),
      ...missingChecks.slice(0, 4).map((c) => c.recommendation),
      ...warningChecks.slice(0, 2).map((c) => c.recommendation),
    ].slice(0, 5);

    const subjectName = prospectBusinessName ? `${prospectBusinessName} (${domain})` : domain;
    const thirtySecondSummary = `${subjectName} scored ${healthScore}/100 in our live check. Load speed is ${speedGrade.toLowerCase()} (${responseTimeMs}ms, ${payloadKb} KB${isHttps ? ', HTTPS secured' : ', missing HTTPS'}), and mobile-friendliness is ${mobileFriendly ? 'configured with a proper viewport meta tag' : 'at risk due to missing/incomplete mobile viewport setup'}. ${missingChecks.length > 0 ? `Detected ${missingChecks.length} missing SEO tag(s): ${missingLabels.join(', ')}.` : 'All core HTML meta tags are present.'} Fixing these gaps gives an immediate visibility and mobile conversion lift.`;

    const outreachPitchHook = `I ran a 30-second SEO health check on ${domain} (${healthScore}/100): load time measured ${responseTimeMs}ms${!mobileFriendly ? ', mobile viewport configuration needs fixing,' : ''} and ${missingChecks.length > 0 ? `it is missing ${missingLabels.slice(0, 3).join(', ')}` : 'meta snippets can be sharpened for higher local CTR'}. Fixing these quick wins could immediately capture missed local leads.`;

    res.json({
      id: `hc-${domain.replace(/[^a-z0-9]/g, '')}-${Date.now()}`,
      checkedAt: new Date().toISOString(),
      domain,
      normalizedUrl,
      finalUrl,
      prospectId: prospectId || undefined,
      prospectBusinessName: prospectBusinessName || undefined,
      reachable: true,
      httpStatus,
      healthScore,
      loadSpeed: {
        responseTimeMs,
        payloadKb,
        compressed,
        isHttps,
        grade: speedGrade,
        summary: speedSummary,
      },
      mobileFriendliness: {
        mobileFriendly,
        hasViewportTag,
        hasDeviceWidth,
        responsiveHintsDetected,
        grade: mobileGrade,
        summary: mobileSummary,
      },
      metaTags: {
        missingCount: missingChecks.length,
        warningCount: warningChecks.length,
        passedCount: passedChecks.length,
        checks,
      },
      thirtySecondSummary,
      topFixes,
      outreachPitchHook,
    });
  });

  const server = http.createServer(app);

  // Serve Vite middleware in dev or static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: hmrDisabled ? false : { server },
        ws: hmrDisabled ? false : { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  // WebSocket bridge for Gemini Live API (gemini-3.8-live)
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/api/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
      return;
    }
    const protocol = request.headers['sec-websocket-protocol'];
    if (
      process.env.DISABLE_HMR !== 'true' &&
      (protocol === 'vite-hmr' || protocol === 'vite-ping')
    ) {
      // Handled by Vite's HMR WebSocket listener attached to `server`
      return;
    }
    socket.destroy();
  });

  wss.on('connection', async (clientWs: WebSocket) => {
    const ai = getGeminiClient();
    if (!ai) {
      clientWs.send(
        JSON.stringify({
          error: 'GEMINI_API_KEY is not configured on the server for Live Voice.',
        })
      );
      clientWs.close();
      return;
    }

    let liveSession: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
    let closed = false;

    const connectLive = async (crmSummary?: string) => {
      try {
        liveSession = await ai.live.connect({
          model: 'gemini-3.8-live',
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            },
            systemInstruction: `You are Clientsology CRM Voice Strategist, a sharp, concise agency sales & operations partner. Help the user review leads, practice Funnel Strategy cold call / Loom pitches, prioritize follow-ups, and pick high-ROI niches across USA, UK, EU, Balkans, UAE, KSA, and Pakistan. Keep spoken responses natural, tactical, and concise (2–4 sentences unless asked for a roleplay or full script).${crmSummary ? `\n\nLive CRM Context:\n${crmSummary}` : ''}`,
          },
          callbacks: {
            onopen: () => {
              if (!closed && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ ready: true }));
              }
            },
            onmessage: (message: LiveServerMessage) => {
              if (closed || clientWs.readyState !== WebSocket.OPEN) return;
              const content = message.serverContent;
              if (content?.inputTranscription?.text) {
                clientWs.send(
                  JSON.stringify({ inputTranscript: content.inputTranscription.text })
                );
              }
              if (content?.outputTranscription?.text) {
                clientWs.send(
                  JSON.stringify({ outputTranscript: content.outputTranscription.text })
                );
              }
              for (const part of content?.modelTurn?.parts ?? []) {
                if (part.inlineData?.data) {
                  clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
                }
              }
              if (content?.interrupted) {
                clientWs.send(JSON.stringify({ interrupted: true }));
              }
            },
            onerror: (e: unknown) => {
              if (!closed && clientWs.readyState === WebSocket.OPEN) {
                const parsed = parseGeminiError(e, 'Live session error');
                clientWs.send(
                  JSON.stringify({
                    error: parsed.userMessage,
                  })
                );
              }
            },
            onclose: () => {
              if (!closed && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ closed: true }));
              }
            },
          },
        });
      } catch (err) {
        if (clientWs.readyState === WebSocket.OPEN) {
          const parsed = parseGeminiError(err, 'Failed to connect Gemini Live API.');
          clientWs.send(
            JSON.stringify({
              error: parsed.userMessage,
            })
          );
        }
      }
    };

    clientWs.on('message', async (rawData) => {
      try {
        const payload = JSON.parse(rawData.toString()) as {
          type?: string;
          crmSummary?: string;
          audio?: string;
          text?: string;
        };

        if (payload.type === 'init') {
          if (!liveSession) {
            await connectLive(payload.crmSummary);
          }
          return;
        }

        if (!liveSession) {
          await connectLive(payload.crmSummary);
        }

        if (payload.audio && liveSession) {
          liveSession.sendRealtimeInput({
            audio: {
              data: payload.audio,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (payload.text && liveSession) {
          liveSession.sendRealtimeInput({
            text: payload.text,
          });
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    clientWs.on('close', () => {
      closed = true;
      try {
        liveSession?.close();
      } catch {
        // Ignore close errors
      }
      liveSession = null;
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Clientsology CRM server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
