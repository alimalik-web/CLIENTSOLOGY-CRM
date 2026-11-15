import { getLocalIsoDate } from './appUtils';
import {
  ChatLogItem,
  CountryMarket,
  FollowUpItem,
  MonthlyGoalRow,
  Prospect,
  WeeklyTaskRow,
} from '../types/crm';

export interface SyncWorkbookPayload {
  spreadsheetId?: string;
  prospects: Prospect[];
  followUps: FollowUpItem[];
  chatLogs: ChatLogItem[];
  weeklyTasks: WeeklyTaskRow[];
  monthlyGoals: MonthlyGoalRow[];
  countries: CountryMarket[];
}

export interface SyncWorkbookResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  updatedRows: number;
  syncedAt: string;
}

export interface CalendarOption {
  id: string;
  summary: string;
  primary?: boolean;
  timeZone?: string;
}

async function googleFetch(url: string, accessToken: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `Google API error (${res.status})`;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      if (parsed.error?.message) msg = parsed.error.message;
    } catch {
      if (text) msg = text;
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function syncCrmToGoogleSheets(
  accessToken: string,
  payload: SyncWorkbookPayload
): Promise<SyncWorkbookResult> {
  let spreadsheetId = payload.spreadsheetId;
  let spreadsheetUrl = spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    : '';

  if (!spreadsheetId) {
    const created = (await googleFetch(
      'https://sheets.googleapis.com/v4/spreadsheets',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          properties: {
            title: `Clientsology Global Agency CRM — ${getLocalIsoDate()}`,
          },
          sheets: [
            { properties: { title: 'Prospect Database' } },
            { properties: { title: 'Follow-Ups' } },
            { properties: { title: 'Chat History' } },
            { properties: { title: 'Weekly Plan' } },
            { properties: { title: 'Monthly Goals' } },
            { properties: { title: 'Global Market Targets' } },
          ],
        }),
      }
    )) as { spreadsheetId: string; spreadsheetUrl: string };

    spreadsheetId = created.spreadsheetId;
    spreadsheetUrl = created.spreadsheetUrl;
  }

  const prospectRows: (string | number)[][] = [
    [
      'ID',
      'Business Name',
      'Contact Person',
      'Role',
      'Email',
      'Phone',
      'Website',
      'Country',
      'State/Region',
      'City',
      'Niche',
      'Quality',
      'Stage',
      'Service Interest',
      'Ticket (USD)',
      'Date Added',
      'Next Follow-Up',
      'Last Contacted',
      'Last Message',
      'Reply Notes',
      'Status',
    ],
    ...payload.prospects.map((p) => [
      p.id,
      p.businessName,
      p.contactPerson,
      p.roleTitle,
      p.email,
      p.phone,
      p.website,
      p.country,
      p.stateOrRegion,
      p.city,
      p.categoryNiche,
      p.leadQuality,
      p.stage,
      p.serviceInterest,
      p.ticketUsd,
      p.dateAdded,
      p.nextFollowUp,
      p.lastContacted,
      p.lastMessageSent,
      p.replyNotes,
      p.status,
    ]),
  ];

  const followUpRows: (string | number | boolean)[][] = [
    ['ID', 'Prospect', 'Date', 'Time', 'Type', 'Stage', 'Priority', 'Done', 'Message Script', 'Outcome', 'Next Step'],
    ...payload.followUps.map((f) => [
      f.id,
      f.businessName,
      f.followUpDate,
      f.followUpTime,
      f.followUpType,
      f.stage,
      f.priority,
      f.done ? 'Yes' : 'No',
      f.messageScript,
      f.outcome,
      f.nextStep,
    ]),
  ];

  const chatRows: (string | number)[][] = [
    ['ID', 'Business', 'Date', 'Time', 'Channel', 'Direction', 'Message', 'Response Summary'],
    ...payload.chatLogs.map((c) => [
      c.id,
      c.businessName,
      c.date,
      c.time,
      c.channel,
      c.direction,
      c.messageContent,
      c.responseSummary,
    ]),
  ];

  const weeklyRows: (string | number | boolean)[][] = [
    ['Day', 'Date', 'Morning Task', 'Afternoon Task', 'Outreach Target', 'Outreach Actual', 'Calls Scheduled', 'Calls Done', 'Done', 'Notes'],
    ...payload.weeklyTasks.map((w) => [
      w.day,
      w.date,
      w.morningTask,
      w.afternoonTask,
      w.outreachTarget,
      w.outreachActual,
      w.callsScheduled,
      w.callsDone,
      w.done ? 'Yes' : 'No',
      w.notes,
    ]),
  ];

  const monthlyRows: (string | number)[][] = [
    ['Metric', 'Goal', 'Actual', 'Gap', '% Complete'],
    ...payload.monthlyGoals.map((m) => [
      m.metric,
      m.goal,
      m.actual,
      m.goal - m.actual,
      m.goal > 0 ? `${Math.round((m.actual / m.goal) * 100)}%` : '0%',
    ]),
  ];

  const marketRows: (string | number)[][] = [
    ['Country', 'Region', 'Tier', 'Median Income (USD)', 'Competition', 'Retainer Range (USD)', 'Top Niches', 'Future Opportunities'],
    ...payload.countries.map((c) => [
      c.name,
      c.macroRegion,
      c.tier,
      c.medianIncomeUsd,
      c.competition,
      `$${c.retainerRangeUsd[0]}–$${c.retainerRangeUsd[1]}/mo`,
      c.topOperatingNiches.join(', '),
      c.futureNicheOpportunities.join(', '),
    ]),
  ];

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        ranges: [
          'Prospect Database!A1:Z500',
          'Follow-Ups!A1:Z500',
          'Chat History!A1:Z500',
          'Weekly Plan!A1:Z50',
          'Monthly Goals!A1:Z50',
          'Global Market Targets!A1:Z200',
        ],
      }),
    }
  );

  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: 'Prospect Database!A1', values: prospectRows },
          { range: 'Follow-Ups!A1', values: followUpRows },
          { range: 'Chat History!A1', values: chatRows },
          { range: 'Weekly Plan!A1', values: weeklyRows },
          { range: 'Monthly Goals!A1', values: monthlyRows },
          { range: 'Global Market Targets!A1', values: marketRows },
        ],
      }),
    }
  );

  return {
    spreadsheetId,
    spreadsheetUrl,
    updatedRows:
      prospectRows.length +
      followUpRows.length +
      chatRows.length +
      weeklyRows.length +
      monthlyRows.length +
      marketRows.length,
    syncedAt: new Date().toISOString(),
  };
}

export async function listGoogleCalendars(accessToken: string): Promise<CalendarOption[]> {
  const data = (await googleFetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer',
    accessToken
  )) as { items?: CalendarOption[] };
  return data.items || [{ id: 'primary', summary: 'Primary Calendar', primary: true }];
}

export async function createCalendarDiscoveryCall(
  accessToken: string,
  params: {
    calendarId: string;
    summary: string;
    description: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:mm
    durationMinutes?: number;
    attendeeEmail?: string;
  }
): Promise<{ id: string; htmlLink?: string }> {
  const startDt = new Date(`${params.date}T${params.time}:00`);
  if (Number.isNaN(startDt.getTime())) {
    throw new Error('Please choose a valid discovery call date and start time.');
  }
  const endDt = new Date(startDt.getTime() + (params.durationMinutes || 30) * 60000);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const body: Record<string, unknown> = {
    summary: params.summary,
    description: params.description,
    start: { dateTime: startDt.toISOString(), timeZone },
    end: { dateTime: endDt.toISOString(), timeZone },
  };

  if (params.attendeeEmail && params.attendeeEmail.includes('@')) {
    body.attendees = [{ email: params.attendeeEmail }];
  }

  return googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(params.calendarId)}/events`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );
}

function encodeUtf8Base64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeMimeHeaderUtf8(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

export async function sendGmailMessage(
  accessToken: string,
  params: {
    to: string;
    subject: string;
    body: string;
    fromEmail?: string;
  }
): Promise<{ id: string; threadId?: string }> {
  const headers = [
    `To: ${params.to.trim()}`,
    ...(params.fromEmail ? [`From: ${params.fromEmail.trim()}`] : []),
    `Subject: ${encodeMimeHeaderUtf8(params.subject.trim())}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ];
  const rawMessage = `${headers.join('\r\n')}\r\n\r\n${params.body}`;
  const raw = encodeUtf8Base64Url(rawMessage);

  return googleFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', accessToken, {
    method: 'POST',
    body: JSON.stringify({ raw }),
  });
}
