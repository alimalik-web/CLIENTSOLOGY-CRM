import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  db,
  googleSignIn,
  googleSignOut,
  handleFirestoreError,
  initAuth,
  OperationType,
  testFirestoreConnection,
} from '../lib/firebase';
import { addDaysUtc, getLocalIsoDate } from '../lib/appUtils';
import {
  SEED_CHAT_LOGS,
  SEED_FOLLOWUPS,
  SEED_FUNNEL_SETTINGS,
  SEED_MONTHLY_GOALS,
  SEED_PROSPECTS,
  SEED_ROADMAP,
  SEED_WEEKLY_GOALS,
  SEED_WEEKLY_TASKS,
  SEED_WEEK_BREAKDOWN,
} from '../data/seedCrmData';
import {
  ChatLogItem,
  CurrencyCode,
  FollowUpItem,
  FunnelSettings,
  MonthlyGoalRow,
  PipelineStage,
  Prospect,
  RoadmapPhase,
  WeekBreakdownRow,
  WeeklyGoalMetric,
  WeeklyTaskRow,
  WorksheetPersistedPayload,
} from '../types/crm';

const VALID_LEAD_QUALITIES: Prospect['leadQuality'][] = ['Hot', 'Warm', 'Cold', 'Dead'];
const VALID_STAGES: PipelineStage[] = [
  'New Lead',
  'Contacted',
  'Proposal Sent',
  'Negotiating',
  'Closed Won',
  'Closed Lost',
  'Follow Up',
];
const VALID_STATUSES: Prospect['status'][] = ['Active', 'Archived'];
const VALID_PRIORITIES: FollowUpItem['priority'][] = ['High', 'Mid', 'Low'];
const VALID_CHANNELS: ChatLogItem['channel'][] = [
  'WhatsApp',
  'Email',
  'LinkedIn',
  'Instagram DM',
  'Phone',
  'Fiverr',
];
const VALID_DIRECTIONS: ChatLogItem['direction'][] = ['Outbound', 'Inbound'];

function sanitizeFirestoreId(raw: string, fallbackPrefix: string): string {
  const cleaned = (raw || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned.length >= 1 ? cleaned : `${fallbackPrefix}-${Date.now()}`;
}

function clampStr(val: string | undefined | null, maxLen: number, fallback = ''): string {
  const s = (val ?? '').toString().trim();
  if (!s) return fallback;
  return s.slice(0, maxLen);
}

function sanitizeProspectForFirestore(prospect: Prospect) {
  const cleanId = sanitizeFirestoreId(prospect.id, 'p');
  const rawTicket = Number(prospect.ticketUsd);
  const ticketUsd = Number.isFinite(rawTicket)
    ? Math.min(1000000, Math.max(0, rawTicket))
    : 0;
  return {
    cleanId,
    fields: {
      businessName: clampStr(prospect.businessName, 160, 'Unnamed Business'),
      contactPerson: clampStr(prospect.contactPerson, 120),
      roleTitle: clampStr(prospect.roleTitle, 120),
      email: clampStr(prospect.email, 160),
      phone: clampStr(prospect.phone, 64),
      website: clampStr(prospect.website, 200),
      country: clampStr(prospect.country, 80, 'United States'),
      stateOrRegion: clampStr(prospect.stateOrRegion, 100),
      city: clampStr(prospect.city, 100),
      categoryNiche: clampStr(prospect.categoryNiche, 100, 'Local Business'),
      leadQuality: VALID_LEAD_QUALITIES.includes(prospect.leadQuality)
        ? prospect.leadQuality
        : 'Warm',
      stage: VALID_STAGES.includes(prospect.stage) ? prospect.stage : 'New Lead',
      serviceInterest: clampStr(prospect.serviceInterest, 160),
      ticketUsd,
      dateAdded: clampStr(prospect.dateAdded, 32),
      nextFollowUp: clampStr(prospect.nextFollowUp, 32),
      lastContacted: clampStr(prospect.lastContacted, 32),
      lastMessageSent: clampStr(prospect.lastMessageSent, 2000),
      replyNotes: clampStr(prospect.replyNotes, 2000),
      competitorAdvantage: clampStr(prospect.competitorAdvantage, 240),
      status: VALID_STATUSES.includes(prospect.status) ? prospect.status : 'Active',
    },
  };
}

function sanitizeFollowUpForFirestore(item: FollowUpItem) {
  const cleanId = sanitizeFirestoreId(item.id, 'fu');
  const fields: Record<string, unknown> = {
    prospectId: sanitizeFirestoreId(item.prospectId, 'p-general'),
    businessName: clampStr(item.businessName, 160, 'Unnamed Business'),
    followUpDate: clampStr(item.followUpDate, 32, getLocalIsoDate()),
    followUpTime: clampStr(item.followUpTime, 32, '10:00'),
    followUpType: clampStr(item.followUpType, 80, 'Follow Up'),
    messageScript: clampStr(item.messageScript, 3000),
    stage: clampStr(item.stage, 40, 'Follow Up'),
    priority: VALID_PRIORITIES.includes(item.priority) ? item.priority : 'Mid',
    done: Boolean(item.done),
    outcome: clampStr(item.outcome, 400),
    nextStep: clampStr(item.nextStep, 400),
  };
  if (item.calendarEventId && item.calendarEventId.trim()) {
    fields.calendarEventId = clampStr(item.calendarEventId, 200);
  }
  return { cleanId, fields };
}

function sanitizeChatLogForFirestore(item: ChatLogItem) {
  const cleanId = sanitizeFirestoreId(item.id, 'log');
  return {
    cleanId,
    fields: {
      prospectId: sanitizeFirestoreId(item.prospectId, 'p-general'),
      businessName: clampStr(item.businessName, 160, 'Unnamed Business'),
      date: clampStr(item.date, 32, getLocalIsoDate()),
      time: clampStr(item.time, 32, '09:00'),
      channel: VALID_CHANNELS.includes(item.channel) ? item.channel : 'Email',
      direction: VALID_DIRECTIONS.includes(item.direction) ? item.direction : 'Outbound',
      messageContent: clampStr(item.messageContent, 4000, '(No message content)'),
      responseSummary: clampStr(item.responseSummary, 2000),
    },
  };
}

export function useCrmStore() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [prospects, setProspects] = useState<Prospect[]>(SEED_PROSPECTS);
  const [followUps, setFollowUps] = useState<FollowUpItem[]>(SEED_FOLLOWUPS);
  const [chatLogs, setChatLogs] = useState<ChatLogItem[]>(SEED_CHAT_LOGS);

  const [weeklyStartDate, setWeeklyStartDate] = useState('2026-11-16');
  const [weeklyTasks, setWeeklyTasks] = useState<WeeklyTaskRow[]>(SEED_WEEKLY_TASKS);
  const [weeklyGoalTargets, setWeeklyGoalTargets] =
    useState<WeeklyGoalMetric[]>(SEED_WEEKLY_GOALS);
  const [monthlyGoals, setMonthlyGoals] = useState<MonthlyGoalRow[]>(SEED_MONTHLY_GOALS);
  const [weekBreakdown, setWeekBreakdown] = useState<WeekBreakdownRow[]>(SEED_WEEK_BREAKDOWN);
  const [roadmap, setRoadmap] = useState<RoadmapPhase[]>(SEED_ROADMAP);
  const [funnelSettings, setFunnelSettings] = useState<FunnelSettings>(SEED_FUNNEL_SETTINGS);
  const [preferredCurrency, setPreferredCurrency] = useState<CurrencyCode>('USD');
  const [customMarketNotes, setCustomMarketNotes] = useState<Record<string, string>>({});

  const [syncedSpreadsheetId, setSyncedSpreadsheetId] = useState<string | undefined>(undefined);
  const [syncedSpreadsheetUrl, setSyncedSpreadsheetUrl] = useState<string | undefined>(undefined);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | undefined>(undefined);

  // Refs to track existing Firestore document IDs (create vs update rules) and latest worksheet state
  const cloudProspectIdsRef = useRef<Set<string>>(new Set());
  const cloudFollowUpIdsRef = useRef<Set<string>>(new Set());
  const hasSyncedProspectsRef = useRef(false);
  const hasSyncedFollowUpsRef = useRef(false);
  const hasSyncedChatLogsRef = useRef(false);
  const hasWorksheetDocRef = useRef(false);
  const weeklyTasksRef = useRef<WeeklyTaskRow[]>(weeklyTasks);
  weeklyTasksRef.current = weeklyTasks;

  const worksheetStateRef = useRef<WorksheetPersistedPayload>({
    weeklyStartDate,
    weeklyTasks,
    weeklyGoalTargets,
    monthlyGoals,
    weekBreakdown,
    roadmap,
    funnelSettings,
    preferredCurrency,
    customMarketNotes,
    syncedSpreadsheetId,
    syncedSpreadsheetUrl,
    lastSyncedAt,
  });
  worksheetStateRef.current = {
    weeklyStartDate,
    weeklyTasks,
    weeklyGoalTargets,
    monthlyGoals,
    weekBreakdown,
    roadmap,
    funnelSettings,
    preferredCurrency,
    customMarketNotes,
    syncedSpreadsheetId,
    syncedSpreadsheetUrl,
    lastSyncedAt,
  };

  useEffect(() => {
    testFirestoreConnection();
    const unsub = initAuth((u, token) => {
      setUser(u);
      setAccessToken(token);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const isCloudVerified = Boolean(user && user.emailVerified);

  const reportFirestoreError = useCallback(
    (error: unknown, op: OperationType, path: string) => {
      try {
        handleFirestoreError(error, op, path);
      } catch (wrapped) {
        console.warn('Firestore operation failed:', wrapped);
      }
    },
    []
  );

  // Subscribe to Firestore collections when signed in
  useEffect(() => {
    if (!isCloudVerified || !user) {
      cloudProspectIdsRef.current.clear();
      cloudFollowUpIdsRef.current.clear();
      hasSyncedProspectsRef.current = false;
      hasSyncedFollowUpsRef.current = false;
      hasSyncedChatLogsRef.current = false;
      hasWorksheetDocRef.current = false;
      return;
    }
    const uid = user.uid;

    const pQuery = query(collection(db, 'users', uid, 'prospects'), where('ownerUid', '==', uid));
    const unsubP = onSnapshot(
      pQuery,
      (snap) => {
        cloudProspectIdsRef.current = new Set(snap.docs.map((d) => d.id));
        if (!snap.empty || hasSyncedProspectsRef.current) {
          hasSyncedProspectsRef.current = true;
          const rows = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              businessName: String(data.businessName || ''),
              contactPerson: String(data.contactPerson || ''),
              roleTitle: String(data.roleTitle || ''),
              email: String(data.email || ''),
              phone: String(data.phone || ''),
              website: String(data.website || ''),
              country: String(data.country || 'United States'),
              stateOrRegion: String(data.stateOrRegion || ''),
              city: String(data.city || ''),
              categoryNiche: String(data.categoryNiche || ''),
              leadQuality: (data.leadQuality || 'Warm') as Prospect['leadQuality'],
              stage: (data.stage || 'New Lead') as PipelineStage,
              serviceInterest: String(data.serviceInterest || ''),
              ticketUsd: Number(data.ticketUsd || 0),
              dateAdded: String(data.dateAdded || ''),
              nextFollowUp: String(data.nextFollowUp || ''),
              lastContacted: String(data.lastContacted || ''),
              lastMessageSent: String(data.lastMessageSent || ''),
              replyNotes: String(data.replyNotes || ''),
              competitorAdvantage: String(data.competitorAdvantage || ''),
              status: (data.status || 'Active') as Prospect['status'],
            };
          });
          setProspects(rows);
        }
      },
      (err) => console.warn('Prospects listener:', err.message)
    );

    const fQuery = query(collection(db, 'users', uid, 'followUps'), where('ownerUid', '==', uid));
    const unsubF = onSnapshot(
      fQuery,
      (snap) => {
        cloudFollowUpIdsRef.current = new Set(snap.docs.map((d) => d.id));
        if (!snap.empty || hasSyncedFollowUpsRef.current) {
          hasSyncedFollowUpsRef.current = true;
          setFollowUps(
            snap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                prospectId: String(data.prospectId || ''),
                businessName: String(data.businessName || ''),
                followUpDate: String(data.followUpDate || ''),
                followUpTime: String(data.followUpTime || '10:00'),
                followUpType: String(data.followUpType || ''),
                messageScript: String(data.messageScript || ''),
                stage: (data.stage || 'Follow Up') as PipelineStage,
                priority: (data.priority || 'Mid') as FollowUpItem['priority'],
                done: Boolean(data.done),
                outcome: String(data.outcome || ''),
                nextStep: String(data.nextStep || ''),
                calendarEventId: data.calendarEventId ? String(data.calendarEventId) : undefined,
              };
            })
          );
        }
      },
      (err) => console.warn('FollowUps listener:', err.message)
    );

    const cQuery = query(collection(db, 'users', uid, 'chatLogs'), where('ownerUid', '==', uid));
    const unsubC = onSnapshot(
      cQuery,
      (snap) => {
        if (!snap.empty || hasSyncedChatLogsRef.current) {
          hasSyncedChatLogsRef.current = true;
          setChatLogs(
            snap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                prospectId: String(data.prospectId || ''),
                businessName: String(data.businessName || ''),
                date: String(data.date || ''),
                time: String(data.time || ''),
                channel: (data.channel || 'Email') as ChatLogItem['channel'],
                direction: (data.direction || 'Outbound') as ChatLogItem['direction'],
                messageContent: String(data.messageContent || ''),
                responseSummary: String(data.responseSummary || ''),
              };
            })
          );
        }
      },
      (err) => console.warn('ChatLogs listener:', err.message)
    );

    const wDocRef = doc(db, 'users', uid, 'worksheets', 'main');
    const unsubW = onSnapshot(
      wDocRef,
      (snap) => {
        hasWorksheetDocRef.current = snap.exists();
        if (snap.exists()) {
          const raw = snap.data() as Record<string, unknown>;
          let data: Partial<WorksheetPersistedPayload> = {};
          if (typeof raw.payloadJson === 'string') {
            try {
              data = JSON.parse(raw.payloadJson) as Partial<WorksheetPersistedPayload>;
            } catch {
              data = {};
            }
          } else {
            data = raw as Partial<WorksheetPersistedPayload>;
          }
          if (data.weeklyStartDate) setWeeklyStartDate(data.weeklyStartDate);
          if (Array.isArray(data.weeklyTasks)) setWeeklyTasks(data.weeklyTasks);
          if (Array.isArray(data.weeklyGoalTargets)) setWeeklyGoalTargets(data.weeklyGoalTargets);
          if (Array.isArray(data.monthlyGoals)) setMonthlyGoals(data.monthlyGoals);
          if (Array.isArray(data.weekBreakdown)) setWeekBreakdown(data.weekBreakdown);
          if (Array.isArray(data.roadmap)) setRoadmap(data.roadmap);
          if (data.funnelSettings) setFunnelSettings(data.funnelSettings);
          if (data.preferredCurrency) setPreferredCurrency(data.preferredCurrency);
          if (data.customMarketNotes) setCustomMarketNotes(data.customMarketNotes);
          if (data.syncedSpreadsheetId) setSyncedSpreadsheetId(data.syncedSpreadsheetId);
          if (data.syncedSpreadsheetUrl) setSyncedSpreadsheetUrl(data.syncedSpreadsheetUrl);
          if (data.lastSyncedAt) setLastSyncedAt(data.lastSyncedAt);
        }
      },
      (err) => console.warn('Worksheet listener:', err.message)
    );

    return () => {
      unsubP();
      unsubF();
      unsubC();
      unsubW();
    };
  }, [isCloudVerified, user]);

  const persistWorksheet = useCallback(
    async (overrides: Partial<WorksheetPersistedPayload>) => {
      const merged: WorksheetPersistedPayload = {
        ...worksheetStateRef.current,
        ...overrides,
      };
      worksheetStateRef.current = merged;

      if (!isCloudVerified || !user) return;
      const uid = user.uid;
      const wDocRef = doc(db, 'users', uid, 'worksheets', 'main');

      let payloadJson = JSON.stringify(merged);
      if (payloadJson.length > 98000) {
        // Guard Firestore 100KB rule limit by trimming verbose notes if needed
        payloadJson = JSON.stringify({ ...merged, customMarketNotes: {} }).slice(0, 99000);
      }

      try {
        if (hasWorksheetDocRef.current) {
          await updateDoc(wDocRef, {
            payloadJson,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(wDocRef, {
            id: 'main',
            ownerUid: uid,
            payloadJson,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          hasWorksheetDocRef.current = true;
        }
      } catch (error) {
        reportFirestoreError(error, OperationType.WRITE, `users/${uid}/worksheets/main`);
      }
    },
    [isCloudVerified, user, reportFirestoreError]
  );

  const upsertProspect = useCallback(
    async (prospect: Prospect) => {
      const { cleanId, fields } = sanitizeProspectForFirestore(prospect);
      const normalizedProspect: Prospect =
        cleanId === prospect.id ? prospect : { ...prospect, id: cleanId };

      setProspects((prev) => {
        const exists = prev.some((p) => p.id === cleanId);
        return exists
          ? prev.map((p) => (p.id === cleanId ? normalizedProspect : p))
          : [normalizedProspect, ...prev];
      });
      if (!isCloudVerified || !user) return;
      const uid = user.uid;
      const pRef = doc(db, 'users', uid, 'prospects', cleanId);
      try {
        if (cloudProspectIdsRef.current.has(cleanId)) {
          await updateDoc(pRef, {
            ...fields,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(pRef, {
            ...fields,
            id: cleanId,
            ownerUid: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          cloudProspectIdsRef.current.add(cleanId);
          hasSyncedProspectsRef.current = true;
        }
      } catch (error) {
        reportFirestoreError(error, OperationType.WRITE, `users/${uid}/prospects/${cleanId}`);
      }
    },
    [isCloudVerified, user, reportFirestoreError]
  );

  const batchUpsertProspects = useCallback(
    async (incoming: Prospect[]) => {
      if (incoming.length === 0) return;
      const sanitizedList = incoming.map((p) => ({
        original: p,
        ...sanitizeProspectForFirestore(p),
      }));

      setProspects((prev) => {
        const incomingById = new globalThis.Map(
          sanitizedList.map((item) => [
            item.cleanId,
            item.cleanId === item.original.id ? item.original : { ...item.original, id: item.cleanId },
          ])
        );
        const updatedExisting = prev.map((p) => incomingById.get(p.id) ?? p);
        const existingIds = new Set(prev.map((p) => p.id));
        const brandNew = sanitizedList
          .filter((item) => !existingIds.has(item.cleanId))
          .map((item) =>
            item.cleanId === item.original.id ? item.original : { ...item.original, id: item.cleanId }
          );
        return [...brandNew, ...updatedExisting];
      });
      if (!isCloudVerified || !user) return;
      const uid = user.uid;
      try {
        const chunkSize = 400;
        for (let i = 0; i < sanitizedList.length; i += chunkSize) {
          const chunk = sanitizedList.slice(i, i + chunkSize);
          const batch = writeBatch(db);
          chunk.forEach(({ cleanId, fields }) => {
            const pRef = doc(db, 'users', uid, 'prospects', cleanId);
            if (cloudProspectIdsRef.current.has(cleanId)) {
              batch.update(pRef, {
                ...fields,
                updatedAt: serverTimestamp(),
              });
            } else {
              batch.set(pRef, {
                ...fields,
                id: cleanId,
                ownerUid: uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
          });
          await batch.commit();
          chunk.forEach(({ cleanId }) => cloudProspectIdsRef.current.add(cleanId));
          hasSyncedProspectsRef.current = true;
        }
      } catch (error) {
        reportFirestoreError(error, OperationType.WRITE, `users/${uid}/prospects/batch`);
      }
    },
    [isCloudVerified, user, reportFirestoreError]
  );

  const removeProspect = useCallback(
    async (id: string) => {
      setProspects((prev) => prev.filter((p) => p.id !== id));
      if (!isCloudVerified || !user) return;
      const cleanId = sanitizeFirestoreId(id, 'p');
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'prospects', cleanId));
        cloudProspectIdsRef.current.delete(cleanId);
      } catch (error) {
        reportFirestoreError(error, OperationType.DELETE, `users/${user.uid}/prospects/${cleanId}`);
      }
    },
    [isCloudVerified, user, reportFirestoreError]
  );

  const upsertFollowUp = useCallback(
    async (item: FollowUpItem) => {
      const { cleanId, fields } = sanitizeFollowUpForFirestore(item);
      const normalizedItem: FollowUpItem = cleanId === item.id ? item : { ...item, id: cleanId };

      setFollowUps((prev) => {
        const exists = prev.some((f) => f.id === cleanId);
        return exists
          ? prev.map((f) => (f.id === cleanId ? normalizedItem : f))
          : [normalizedItem, ...prev];
      });
      if (!isCloudVerified || !user) return;
      const uid = user.uid;
      const fRef = doc(db, 'users', uid, 'followUps', cleanId);
      try {
        if (cloudFollowUpIdsRef.current.has(cleanId)) {
          await updateDoc(fRef, {
            ...fields,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(fRef, {
            ...fields,
            id: cleanId,
            ownerUid: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          cloudFollowUpIdsRef.current.add(cleanId);
          hasSyncedFollowUpsRef.current = true;
        }
      } catch (error) {
        reportFirestoreError(error, OperationType.WRITE, `users/${uid}/followUps/${cleanId}`);
      }
    },
    [isCloudVerified, user, reportFirestoreError]
  );

  const addChatLog = useCallback(
    async (item: ChatLogItem) => {
      const { cleanId, fields } = sanitizeChatLogForFirestore(item);
      const normalizedItem: ChatLogItem = cleanId === item.id ? item : { ...item, id: cleanId };
      setChatLogs((prev) => [...prev, normalizedItem]);
      if (!isCloudVerified || !user) return;
      const uid = user.uid;
      try {
        await setDoc(doc(db, 'users', uid, 'chatLogs', cleanId), {
          ...fields,
          id: cleanId,
          ownerUid: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        hasSyncedChatLogsRef.current = true;
      } catch (error) {
        reportFirestoreError(error, OperationType.CREATE, `users/${uid}/chatLogs/${cleanId}`);
      }
    },
    [isCloudVerified, user, reportFirestoreError]
  );

  const updateWeeklyStartDate = useCallback(
    (startDate: string) => {
      setWeeklyStartDate(startDate);
      const base = new Date(`${startDate}T00:00:00Z`);
      if (!Number.isNaN(base.getTime())) {
        const nextTasks = weeklyTasksRef.current.map((t, idx) => ({
          ...t,
          date: addDaysUtc(startDate, idx),
        }));
        setWeeklyTasks(nextTasks);
        persistWorksheet({ weeklyStartDate: startDate, weeklyTasks: nextTasks });
      }
    },
    [persistWorksheet]
  );

  const updateWeeklyTasks = useCallback(
    (next: WeeklyTaskRow[]) => {
      setWeeklyTasks(next);
      persistWorksheet({ weeklyTasks: next });
    },
    [persistWorksheet]
  );

  const updateWeeklyGoals = useCallback(
    (next: WeeklyGoalMetric[]) => {
      setWeeklyGoalTargets(next);
      persistWorksheet({ weeklyGoalTargets: next });
    },
    [persistWorksheet]
  );

  const updateMonthlyGoals = useCallback(
    (next: MonthlyGoalRow[]) => {
      setMonthlyGoals(next);
      persistWorksheet({ monthlyGoals: next });
    },
    [persistWorksheet]
  );

  const updateWeekBreakdown = useCallback(
    (next: WeekBreakdownRow[]) => {
      setWeekBreakdown(next);
      persistWorksheet({ weekBreakdown: next });
    },
    [persistWorksheet]
  );

  const updateRoadmap = useCallback(
    (next: RoadmapPhase[]) => {
      setRoadmap(next);
      persistWorksheet({ roadmap: next });
    },
    [persistWorksheet]
  );

  const updateFunnelSettings = useCallback(
    (next: FunnelSettings) => {
      setFunnelSettings(next);
      persistWorksheet({ funnelSettings: next });
    },
    [persistWorksheet]
  );

  const changeCurrency = useCallback(
    (code: CurrencyCode) => {
      setPreferredCurrency(code);
      persistWorksheet({ preferredCurrency: code });
    },
    [persistWorksheet]
  );

  const saveMarketNote = useCallback(
    (countryId: string, note: string) => {
      const next = { ...worksheetStateRef.current.customMarketNotes, [countryId]: note };
      setCustomMarketNotes(next);
      persistWorksheet({ customMarketNotes: next });
    },
    [persistWorksheet]
  );

  const recordSheetSync = useCallback(
    (spreadsheetId: string, spreadsheetUrl: string, syncedAt: string) => {
      setSyncedSpreadsheetId(spreadsheetId);
      setSyncedSpreadsheetUrl(spreadsheetUrl);
      setLastSyncedAt(syncedAt);
      persistWorksheet({
        syncedSpreadsheetId: spreadsheetId,
        syncedSpreadsheetUrl: spreadsheetUrl,
        lastSyncedAt: syncedAt,
      });
    },
    [persistWorksheet]
  );

  const handleSignIn = useCallback(async () => {
    const res = await googleSignIn();
    setUser(res.user);
    setAccessToken(res.accessToken);
  }, []);

  const handleSignOut = useCallback(async () => {
    await googleSignOut();
    setUser(null);
    setAccessToken(null);
  }, []);

  const metrics = useMemo(() => {
    const active = prospects.filter((p) => p.status === 'Active');
    const newLeads = active.filter((p) => p.stage === 'New Lead');
    const closedWon = active.filter((p) => p.stage === 'Closed Won');
    const dueFollowUps = followUps.filter((f) => !f.done);
    const pipelineValueUsd = active
      .filter((p) => p.stage !== 'Closed Lost')
      .reduce((acc, p) => acc + p.ticketUsd, 0);
    const wonRevenueUsd = closedWon.reduce((acc, p) => acc + p.ticketUsd, 0);

    return {
      worklistCount: active.filter((p) => p.stage !== 'Closed Won' && p.stage !== 'Closed Lost')
        .length,
      newLeadsCount: newLeads.length,
      followUpsDueCount: dueFollowUps.length,
      closedWonCount: closedWon.length,
      pipelineValueUsd,
      wonRevenueUsd,
    };
  }, [prospects, followUps]);

  return {
    user,
    accessToken,
    authReady,
    isCloudVerified,
    handleSignIn,
    handleSignOut,
    prospects,
    upsertProspect,
    batchUpsertProspects,
    removeProspect,
    followUps,
    upsertFollowUp,
    chatLogs,
    addChatLog,
    weeklyStartDate,
    updateWeeklyStartDate,
    weeklyTasks,
    updateWeeklyTasks,
    weeklyGoalTargets,
    updateWeeklyGoals,
    monthlyGoals,
    updateMonthlyGoals,
    weekBreakdown,
    updateWeekBreakdown,
    roadmap,
    updateRoadmap,
    funnelSettings,
    updateFunnelSettings,
    preferredCurrency,
    changeCurrency,
    customMarketNotes,
    saveMarketNote,
    syncedSpreadsheetId,
    syncedSpreadsheetUrl,
    lastSyncedAt,
    recordSheetSync,
    metrics,
  };
}
