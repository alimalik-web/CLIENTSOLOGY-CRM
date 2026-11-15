import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Calculator,
  CalendarClock,
  Compass,
  Download,
  Eye,
  FileSpreadsheet,
  Globe2,
  Kanban,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mic,
  Moon,
  Send,
  Sparkles,
  Sun,
  Table2,
  Target,
  UserPlus,
} from 'lucide-react';
import { CalendarBookingModal, GoogleSheetsSyncModal } from './components/WorkspaceModals';
import { ClientPortalWorkspaceView } from './components/ClientPortalWorkspaceView';
import { ClientPreviewPortal } from './components/ClientPreviewPortal';
import { ClientsologyLogo } from './components/ClientsologyLogo';
import { CompetitorAuditView } from './components/CompetitorAuditView';
import { GmailComposerModal } from './components/GmailComposerModal';
import { FollowUpCalendarView } from './components/FollowUpCalendarView';
import { FunnelEconomicsView } from './components/FunnelEconomicsView';
import { GlobalMarketsView } from './components/GlobalMarketsView';
import { LinkedInProspectorView } from './components/LinkedInProspectorView';
import { LiveVoiceDrawer } from './components/LiveVoiceDrawer';
import { MarketGlobeView } from './components/MarketGlobeView';
import { NichePerformanceDashboardView } from './components/NichePerformanceDashboardView';
import { OutreachGeneratorView } from './components/OutreachGeneratorView';
import { PipelineView } from './components/PipelineView';
import { PricingEngineView } from './components/PricingEngineView';
import { ProspectWorkbenchView } from './components/ProspectWorkbenchView';
import { RoadmapView } from './components/RoadmapView';
import { SpreadsheetGridView } from './components/SpreadsheetGridView';
import { CURRENCY_LIST, formatMoney } from './data/currency';
import { GLOBAL_COUNTRIES } from './data/globalMarkets';
import { OPERATING_NICHES } from './data/operatingNiches';
import { useCrmStore } from './hooks/useCrmStore';
import {
  buildClientPreviewSnapshot,
  buildDefaultClientPortal,
  decodeClientPreviewSnapshot,
  loadSavedClientPortals,
  persistClientPortals,
} from './lib/clientPortal';
import { addDaysUtc, getLocalIsoDate } from './lib/appUtils';
import { EmailRecipientContext } from './lib/emailTemplates';
import { syncCrmToGoogleSheets } from './lib/googleWorkspace';
import { exportCrmWorkbookXlsx } from './lib/xlsxExport';
import {
  ActiveWorkspaceView,
  ClientPortalConfig,
  ClientPreviewSnapshot,
  CurrencyCode,
  Prospect,
} from './types/crm';

const NAV_ITEMS: { id: ActiveWorkspaceView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'workbench', label: 'Prospect Workbench', icon: LayoutDashboard },
  { id: 'sheets', label: 'CRM Sheets & Goals', icon: Table2 },
  { id: 'pipeline', label: '7-Stage Pipeline', icon: Kanban },
  { id: 'analytics', label: 'Niche Performance Dashboard', icon: BarChart3 },
  { id: 'followups', label: 'Follow-Ups & Cal', icon: CalendarClock },
  { id: 'preview', label: 'Client Preview & Portal', icon: Eye },
  { id: 'globe', label: '3D Market Globe', icon: Compass },
  { id: 'markets', label: 'Global Markets + Maps', icon: Globe2 },
  { id: 'linkedin', label: 'LinkedIn Prospector', icon: UserPlus },
  { id: 'competitor-audit', label: 'Competitor Audit', icon: Target },
  { id: 'pricing', label: 'Pricing Engine', icon: Sparkles },
  { id: 'outreach', label: 'Outreach Generator', icon: Send },
  { id: 'funnel', label: 'Funnel & Economics', icon: Calculator },
  { id: 'roadmap', label: '30-Day Roadmap', icon: ListChecks },
];

const THEME_STORAGE_KEY = 'clientsology_theme_v1';

export default function App() {
  const store = useCrmStore();
  const [activeView, setActiveView] = useState<ActiveWorkspaceView>('workbench');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return saved === 'light' || saved === 'dark' ? saved : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // Cross-view contextual routing params
  const [targetCountryId, setTargetCountryId] = useState<string | undefined>('usa');
  const [targetNicheId, setTargetNicheId] = useState<string | undefined>(OPERATING_NICHES[0].id);
  const [targetProspectId, setTargetProspectId] = useState<string | undefined>(undefined);
  const [outreachPrefill, setOutreachPrefill] = useState<{
    businessName?: string;
    contactName?: string;
    serviceSummary?: string;
  }>({});

  // Modals & Drawers
  const [sheetsModalOpen, setSheetsModalOpen] = useState(false);
  const [calendarProspect, setCalendarProspect] = useState<Prospect | null>(null);
  const [gmailRecipient, setGmailRecipient] = useState<EmailRecipientContext | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);

  // Client Preview State (CRM curated portals + full-screen preview + shared ?clientPreview= link)
  const [clientPortals, setClientPortals] = useState<Record<string, ClientPortalConfig>>(() =>
    loadSavedClientPortals()
  );
  const [previewProspectId, setPreviewProspectId] = useState<string>('');
  const [fullScreenPreviewProspectId, setFullScreenPreviewProspectId] = useState<string | null>(
    null
  );
  const [externalSharedSnapshot] = useState<ClientPreviewSnapshot | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('clientPreview');
      return token ? decodeClientPreviewSnapshot(token) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  useEffect(() => {
    const onQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3500);
  };

  const resolveCountryId = (countryName: string) =>
    GLOBAL_COUNTRIES.find((c) => c.name.toLowerCase() === countryName.toLowerCase())?.id || 'usa';

  const resolveNicheId = (nicheName: string) =>
    OPERATING_NICHES.find((n) => n.name.toLowerCase() === nicheName.toLowerCase())?.id ||
    OPERATING_NICHES[0].id;

  const crmContextSummary = useMemo(() => {
    const hotLeads = store.prospects
      .filter((p) => p.leadQuality === 'Hot' && p.status === 'Active')
      .slice(0, 5)
      .map((p) => `${p.businessName} (${p.city}, ${p.stage}, $${p.ticketUsd})`)
      .join('; ');
    return `Active Worklist: ${store.metrics.worklistCount} deals, Pipeline Value: $${store.metrics.pipelineValueUsd}, Follow-ups Due: ${store.metrics.followUpsDueCount}. Hot Leads: ${hotLeads}`;
  }, [store.prospects, store.metrics]);

  const handleConfirmSheetsSync = async () => {
    if (!store.accessToken) {
      await store.handleSignIn();
      return;
    }
    const res = await syncCrmToGoogleSheets(store.accessToken, {
      spreadsheetId: store.syncedSpreadsheetId,
      prospects: store.prospects,
      followUps: store.followUps,
      chatLogs: store.chatLogs,
      weeklyTasks: store.weeklyTasks,
      monthlyGoals: store.monthlyGoals,
      countries: GLOBAL_COUNTRIES,
    });
    store.recordSheetSync(res.spreadsheetId, res.spreadsheetUrl, res.syncedAt);
    showToast(`Synced ${res.updatedRows} rows to Google Sheets`);
  };

  const handleDownloadXlsx = () => {
    exportCrmWorkbookXlsx({
      prospects: store.prospects,
      followUps: store.followUps,
      chatLogs: store.chatLogs,
      weeklyTasks: store.weeklyTasks,
      monthlyGoals: store.monthlyGoals,
      roadmap: store.roadmap,
      funnelSettings: store.funnelSettings,
      countries: GLOBAL_COUNTRIES,
    });
    showToast('Exported Clientsology CRM workbook (.xlsx)');
  };

  const openGmailForProspect = (p: Prospect, clientPreviewUrl?: string) => {
    setGmailRecipient({
      prospectId: p.id,
      contactName: p.contactPerson,
      roleTitle: p.roleTitle,
      businessName: p.businessName,
      email: p.email,
      phone: p.phone,
      website: p.website,
      address: [p.city, p.stateOrRegion, p.country].filter(Boolean).join(', '),
      city: p.city,
      stateOrRegion: p.stateOrRegion,
      country: p.country,
      niche: p.categoryNiche,
      serviceInterest: p.serviceInterest,
      competitorAdvantage: p.competitorAdvantage,
      opportunitySignals: p.competitorAdvantage ? [p.competitorAdvantage] : [],
      replyNotes: p.replyNotes,
      stage: p.stage,
      ticketUsd: p.ticketUsd,
      lastContacted: p.lastContacted,
      leadPriority: p.leadQuality,
      clientPreviewUrl,
    });
  };

  const handleSaveClientPortal = (prospectId: string, nextConfig: ClientPortalConfig) => {
    setClientPortals((prev) => {
      const updated = { ...prev, [prospectId]: nextConfig };
      persistClientPortals(updated);
      return updated;
    });
  };

  const handleOpenClientPreviewForProspect = (p: Prospect) => {
    setPreviewProspectId(p.id);
    setActiveView('preview');
  };

  const fullScreenSnapshot = useMemo(() => {
    if (!fullScreenPreviewProspectId) return null;
    const targetProspect =
      store.prospects.find((p) => p.id === fullScreenPreviewProspectId) || store.prospects[0];
    if (!targetProspect) return null;
    const portalConfig =
      clientPortals[targetProspect.id] ||
      buildDefaultClientPortal(
        targetProspect,
        store.followUps,
        store.chatLogs,
        store.user?.displayName || 'Clientsology Delivery Team',
        store.user?.email || ''
      );
    return buildClientPreviewSnapshot(targetProspect, portalConfig, store.preferredCurrency);
  }, [
    fullScreenPreviewProspectId,
    store.prospects,
    store.followUps,
    store.chatLogs,
    store.user,
    store.preferredCurrency,
    clientPortals,
  ]);

  const handleGmailSentSuccess = ({
    recipient,
    toEmail,
    subject,
    body,
    saveToCrm,
  }: {
    recipient: EmailRecipientContext;
    toEmail: string;
    subject: string;
    body: string;
    messageId: string;
    saveToCrm: boolean;
  }) => {
    const now = new Date();
    const today = getLocalIsoDate(now);
    const time = now.toTimeString().slice(0, 5);
    const twoDays = addDaysUtc(today, 2);

    if (saveToCrm) {
      let targetProspectId = recipient.prospectId;
      const existing = targetProspectId
        ? store.prospects.find((p) => p.id === targetProspectId)
        : store.prospects.find(
            (p) =>
              p.businessName.toLowerCase() === recipient.businessName.toLowerCase() &&
              p.city.toLowerCase() === recipient.city.toLowerCase()
          );

      if (existing) {
        targetProspectId = existing.id;
        store.upsertProspect({
          ...existing,
          email: toEmail || existing.email,
          contactPerson:
            recipient.contactName && recipient.contactName !== 'Owner'
              ? recipient.contactName
              : existing.contactPerson,
          stage: existing.stage === 'New Lead' ? 'Contacted' : existing.stage,
          lastContacted: today,
          lastMessageSent: `Gmail: ${subject}`,
        });
      } else {
        targetProspectId = `p-gmail-${Date.now().toString().slice(-6)}`;
        const matchedCountry = GLOBAL_COUNTRIES.find(
          (c) => c.name.toLowerCase() === recipient.country.toLowerCase()
        );
        const ticketUsd = matchedCountry
          ? Math.round(
              (matchedCountry.retainerRangeUsd[0] + matchedCountry.retainerRangeUsd[1]) / 2
            )
          : 1800;

        store.upsertProspect({
          id: targetProspectId,
          businessName: recipient.businessName,
          contactPerson: recipient.contactName || 'Owner',
          roleTitle: 'Decision Maker',
          email: toEmail,
          phone: recipient.phone || '',
          website: recipient.website || '',
          country: recipient.country,
          stateOrRegion: recipient.stateOrRegion || '',
          city: recipient.city,
          categoryNiche: recipient.niche,
          leadQuality:
            recipient.leadPriority === 'Hot' ||
            recipient.leadPriority === 'Warm' ||
            recipient.leadPriority === 'Cold'
              ? recipient.leadPriority
              : 'Warm',
          stage: 'Contacted',
          serviceInterest: recipient.serviceInterest || 'Web Dev + Local SEO + AI Automation',
          ticketUsd,
          dateAdded: today,
          nextFollowUp: twoDays,
          lastContacted: today,
          lastMessageSent: `Gmail: ${subject}`,
          replyNotes: `Emailed via Gmail (${recipient.address}).`,
          competitorAdvantage: recipient.opportunitySignals?.[0] || 'GMB gap audit',
          status: 'Active',
        });
      }

      store.addChatLog({
        id: `cl-gmail-${Date.now()}`,
        prospectId: targetProspectId,
        businessName: recipient.businessName,
        date: today,
        time,
        channel: 'Email',
        direction: 'Outbound',
        messageContent: `Subject: ${subject}\n\n${body}`,
        responseSummary: `Sent via Gmail to ${toEmail}`,
      });
    }

    showToast(`Email sent via Gmail to ${toEmail}!`);
  };

  if (externalSharedSnapshot) {
    return (
      <ClientPreviewPortal
        snapshot={externalSharedSnapshot}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        standalone={true}
        isExternalShare={true}
      />
    );
  }

  if (fullScreenSnapshot) {
    return (
      <ClientPreviewPortal
        snapshot={fullScreenSnapshot}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        standalone={true}
        isExternalShare={false}
        onExitPreview={() => setFullScreenPreviewProspectId(null)}
      />
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#F3F4F1] dark:bg-[#0D0E12] text-[#111214] dark:text-[#F4F5F7] overflow-hidden transition-colors duration-150">
      {/* DEMO KEY QUOTA DEFENSE BANNER (Section 8 Case A) */}
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* TOP GLOBAL CONTEXT BAR */}
      <header className="h-14 shrink-0 bg-white dark:bg-[#111214] text-[#111214] dark:text-white border-b border-[#E2E4DF] dark:border-[#23252A] px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <ClientsologyLogo theme={theme} className="h-8 w-auto shrink-0" />
          <div className="hidden lg:flex items-center gap-2 pl-3 border-l border-[#E2E4DF] dark:border-[#2C2F36] text-[11px] text-[#555963] dark:text-[#9A9FA8] font-mono-tabular whitespace-nowrap">
            <span>
              Pipeline: {formatMoney(store.metrics.pipelineValueUsd, store.preferredCurrency)}
            </span>
            <span>·</span>
            <span>
              Won: {formatMoney(store.metrics.wonRevenueUsd, store.preferredCurrency)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {/* Dark / Light Theme Toggle */}
          <button
            type="button"
            onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="h-8 px-2.5 rounded-xl bg-[#F3F4F1] dark:bg-[#1D1F24] border border-[#E2E4DF] dark:border-[#2C2F36] hover:border-[#111214] dark:hover:border-[#D9F154] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-[#D9F154]" />
                <span className="hidden md:inline">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-[#6D28D9]" />
                <span className="hidden md:inline">Dark</span>
              </>
            )}
          </button>

          {/* Multi-Currency Switcher */}
          <select
            aria-label="Currency Selector"
            value={store.preferredCurrency}
            onChange={(e) => store.changeCurrency(e.target.value as CurrencyCode)}
            className="h-8 bg-[#F3F4F1] dark:bg-[#1D1F24] border border-[#E2E4DF] dark:border-[#2C2F36] rounded-xl px-2.5 text-xs font-mono-tabular font-semibold text-[#111214] dark:text-[#D9F154] cursor-pointer shrink-0"
          >
            {CURRENCY_LIST.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Gemini Live Voice Strategist */}
          <button
            type="button"
            onClick={() => setVoiceOpen(true)}
            className="h-8 px-3 rounded-xl bg-[#C8B6FF] text-[#111214] text-xs font-semibold flex items-center gap-1.5 hover:bg-[#d6c8ff] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Mic className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Voice Strategist</span>
          </button>

          {/* Google Sheets Sync */}
          <button
            type="button"
            onClick={() => setSheetsModalOpen(true)}
            className="h-8 px-3 rounded-xl bg-[#F3F4F1] dark:bg-[#1D1F24] border border-[#E2E4DF] dark:border-[#2C2F36] hover:border-[#111214] dark:hover:border-[#D9F154] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700 dark:text-[#6AE4C0]" />
            <span className="hidden md:inline">Sheets Sync</span>
          </button>

          {/* XLSX Export */}
          <button
            type="button"
            onClick={handleDownloadXlsx}
            className="h-8 px-2.5 rounded-xl bg-[#F3F4F1] dark:bg-[#1D1F24] border border-[#E2E4DF] dark:border-[#2C2F36] hover:border-[#111214] dark:hover:border-[#3D404A] text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            title="Download .xlsx Workbook"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">.XLSX</span>
          </button>

          {/* Google Auth */}
          {store.user ? (
            <button
              type="button"
              onClick={store.handleSignOut}
              className="h-8 px-2.5 rounded-xl bg-[#F3F4F1] dark:bg-[#1D1F24] border border-[#E2E4DF] dark:border-[#2C2F36] text-xs flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              title={`Signed in as ${store.user.email}`}
            >
              <span className="w-5 h-5 rounded-full bg-[#D9F154] text-[#111214] font-bold text-[10px] flex items-center justify-center">
                {(store.user.displayName || store.user.email || 'U')[0].toUpperCase()}
              </span>
              <span className="hidden sm:inline max-w-[100px] truncate">
                {store.user.displayName?.split(' ')[0] || 'Account'}
              </span>
              <LogOut className="w-3 h-3 text-[#666A73] dark:text-[#9A9FA8]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={async () => {
                try {
                  await store.handleSignIn();
                } catch (err) {
                  showToast(
                    err instanceof Error
                      ? err.message
                      : 'Google sign-in was cancelled or blocked.'
                  );
                }
              }}
              className="gsi-material-button shrink-0"
            >
              <div className="gsi-material-button-state" />
              <div className="gsi-material-button-content-wrapper">
                <div className="gsi-material-button-icon">
                  <svg viewBox="0 0 48 48" className="block">
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                </div>
                <span className="gsi-material-button-contents">Sign in</span>
              </div>
            </button>
          )}
        </div>
      </header>

      {/* BODY: NAVIGATION RAIL + ACTIVE VIEW */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* 64px LEFT ICON RAIL */}
        <nav className="w-16 shrink-0 bg-white dark:bg-[#111214] border-r border-[#E2E4DF] dark:border-[#23252A] py-3 flex flex-col items-center gap-2 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                title={item.label}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#111214] text-[#D9F154] dark:bg-[#D9F154] dark:text-[#111214]'
                    : 'text-[#555963] hover:bg-[#F3F4F1] hover:text-[#111214] dark:text-[#8C919B] dark:hover:bg-[#1D1F24] dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </nav>

        {/* ACTIVE WORKSPACE SCREEN */}
        <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
          {activeView === 'workbench' && (
            <ProspectWorkbenchView
              prospects={store.prospects}
              followUps={store.followUps}
              chatLogs={store.chatLogs}
              currency={store.preferredCurrency}
              initialProspectId={targetProspectId}
              metrics={store.metrics}
              onUpsertProspect={store.upsertProspect}
              onAddChatLog={store.addChatLog}
              onUpsertFollowUp={store.upsertFollowUp}
              onOpenCalendarModal={(p) => setCalendarProspect(p)}
              onOpenGmailModal={(p) => openGmailForProspect(p)}
              onOpenClientPreview={handleOpenClientPreviewForProspect}
              onNavigateToOutreach={(p) => {
                setTargetCountryId(resolveCountryId(p.country));
                setTargetNicheId(resolveNicheId(p.categoryNiche));
                setOutreachPrefill({
                  businessName: p.businessName,
                  contactName: p.contactPerson,
                  serviceSummary: p.serviceInterest,
                });
                setActiveView('outreach');
              }}
              onNavigateToPricing={(p) => {
                setTargetCountryId(resolveCountryId(p.country));
                setTargetNicheId(resolveNicheId(p.categoryNiche));
                setActiveView('pricing');
              }}
              onNavigateToCompetitorAudit={(p) => {
                setTargetProspectId(p.id);
                setActiveView('competitor-audit');
              }}
            />
          )}

          {activeView === 'sheets' && (
            <SpreadsheetGridView
              prospects={store.prospects}
              followUps={store.followUps}
              chatLogs={store.chatLogs}
              weeklyStartDate={store.weeklyStartDate}
              weeklyTasks={store.weeklyTasks}
              weeklyGoalTargets={store.weeklyGoalTargets}
              monthlyGoals={store.monthlyGoals}
              weekBreakdown={store.weekBreakdown}
              currency={store.preferredCurrency}
              onUpsertProspect={store.upsertProspect}
              onDeleteProspect={store.removeProspect}
              onUpsertFollowUp={store.upsertFollowUp}
              onUpdateWeeklyStartDate={store.updateWeeklyStartDate}
              onUpdateWeeklyTasks={store.updateWeeklyTasks}
              onUpdateMonthlyGoals={store.updateMonthlyGoals}
              onUpdateWeekBreakdown={store.updateWeekBreakdown}
            />
          )}

          {activeView === 'pipeline' && (
            <PipelineView
              prospects={store.prospects}
              currency={store.preferredCurrency}
              onMoveStage={(p, nextStage) => store.upsertProspect({ ...p, stage: nextStage })}
              onOpenProspect={(pid) => {
                setTargetProspectId(pid);
                setActiveView('workbench');
              }}
              onOpenClientPreview={handleOpenClientPreviewForProspect}
            />
          )}

          {activeView === 'analytics' && (
            <NichePerformanceDashboardView
              prospects={store.prospects}
              followUps={store.followUps}
              chatLogs={store.chatLogs}
              currency={store.preferredCurrency}
              onInspectProspect={(pid) => {
                setTargetProspectId(pid);
                setActiveView('workbench');
              }}
              onNavigateToPricing={(nid) => {
                setTargetNicheId(nid);
                setActiveView('pricing');
              }}
              onNavigateToOutreach={(nid) => {
                setTargetNicheId(nid);
                setActiveView('outreach');
              }}
              onNavigateToMarkets={() => setActiveView('markets')}
            />
          )}

          {activeView === 'preview' && (
            <ClientPortalWorkspaceView
              prospects={store.prospects}
              followUps={store.followUps}
              chatLogs={store.chatLogs}
              selectedProspectId={previewProspectId || store.prospects[0]?.id || ''}
              onSelectProspectId={setPreviewProspectId}
              portals={clientPortals}
              onSavePortal={handleSaveClientPortal}
              currency={store.preferredCurrency}
              theme={theme}
              agencyContactName={store.user?.displayName || 'Clientsology Delivery Team'}
              agencyContactEmail={store.user?.email || ''}
              onOpenFullScreenPreview={(pid) => setFullScreenPreviewProspectId(pid)}
              onSendPreviewViaGmail={(p, url) => openGmailForProspect(p, url)}
              onNotify={showToast}
            />
          )}

          {activeView === 'followups' && (
            <FollowUpCalendarView
              followUps={store.followUps}
              prospects={store.prospects}
              onUpsertFollowUp={store.upsertFollowUp}
              onBookCalendarForFollowUp={(fu, matched) =>
                setCalendarProspect(
                  matched || {
                    id: fu.prospectId || `p-${Date.now()}`,
                    businessName: fu.businessName,
                    contactPerson: fu.businessName,
                    roleTitle: 'Decision Maker',
                    email: '',
                    phone: '',
                    website: '',
                    country: 'United States',
                    stateOrRegion: '',
                    city: '',
                    categoryNiche: 'Agency Lead',
                    leadQuality: 'Warm',
                    stage: fu.stage,
                    serviceInterest: fu.followUpType,
                    ticketUsd: 1500,
                    dateAdded: fu.followUpDate,
                    nextFollowUp: fu.followUpDate,
                    lastContacted: '',
                    lastMessageSent: fu.messageScript,
                    replyNotes: fu.outcome,
                    competitorAdvantage: '',
                    status: 'Active',
                  }
                )
              }
            />
          )}

          {activeView === 'globe' && (
            <MarketGlobeView
              currency={store.preferredCurrency}
              existingProspects={store.prospects}
              onInspectCountryInMatrix={(cid) => {
                setTargetCountryId(cid);
                setActiveView('markets');
              }}
              onOpenPricingForCountry={(cid) => {
                setTargetCountryId(cid);
                setActiveView('pricing');
              }}
              onProspectNicheInCountry={(cid, nid, nicheLabel) => {
                setTargetCountryId(cid);
                if (nid) setTargetNicheId(nid);
                if (nicheLabel) {
                  setOutreachPrefill({ serviceSummary: nicheLabel });
                }
                setActiveView('markets');
                showToast(`Opened ${nicheLabel || 'target niche'} prospecting for selected market`);
              }}
            />
          )}

          {activeView === 'markets' && (
            <GlobalMarketsView
              currency={store.preferredCurrency}
              initialCountryId={targetCountryId}
              existingProspects={store.prospects}
              customMarketNotes={store.customMarketNotes}
              onSaveMarketNote={store.saveMarketNote}
              onImportScrapedProspect={(p) => {
                store.upsertProspect(p);
                showToast(`Imported "${p.businessName}" into CRM Prospect Database`);
              }}
              onBatchImportProspects={(batch) => {
                store.batchUpsertProspects(batch);
                showToast(
                  `Auto-parsed ${batch.length} Google Maps ${batch.length === 1 ? 'prospect' : 'prospects'} into CRM`
                );
              }}
              onOpenPricingEngine={(cid, nid) => {
                setTargetCountryId(cid);
                if (nid) setTargetNicheId(nid);
                setActiveView('pricing');
              }}
              onOpenOutreachGenerator={(cid, nid, prefill) => {
                setTargetCountryId(cid);
                if (nid) setTargetNicheId(nid);
                if (prefill) {
                  setOutreachPrefill(prefill);
                }
                setActiveView('outreach');
              }}
              onOpenGmailForLead={(ctx) => setGmailRecipient(ctx)}
            />
          )}

          {activeView === 'linkedin' && (
            <LinkedInProspectorView
              existingProspects={store.prospects}
              currency={store.preferredCurrency}
              onBatchImportProspects={(batch) => {
                store.batchUpsertProspects(batch);
                showToast(
                  `Auto-parsed ${batch.length} LinkedIn ${batch.length === 1 ? 'prospect' : 'prospects'} into CRM`
                );
              }}
              onOpenGmailForLead={(ctx) => setGmailRecipient(ctx)}
              onOpenOutreachGenerator={(cid, nid, prefill) => {
                setTargetCountryId(cid);
                if (nid) setTargetNicheId(nid);
                if (prefill) {
                  setOutreachPrefill(prefill);
                }
                setActiveView('outreach');
              }}
              onInspectProspectInCrm={(pid) => {
                setTargetProspectId(pid);
                setActiveView('workbench');
              }}
            />
          )}

          {activeView === 'competitor-audit' && (
            <CompetitorAuditView
              prospects={store.prospects}
              initialProspectId={targetProspectId}
              onSaveAngleToProspect={(prospectId, competitorAdvantage, auditSummaryNote) => {
                const target = store.prospects.find((item) => item.id === prospectId);
                if (!target) return;
                const nextNotes = target.replyNotes
                  ? `${auditSummaryNote}\n${target.replyNotes}`
                  : auditSummaryNote;
                store.upsertProspect({
                  ...target,
                  competitorAdvantage,
                  replyNotes: nextNotes,
                });
                showToast(`Saved Competitor Audit angle to "${target.businessName}"`);
              }}
              onOpenGmailForProspect={(ctx) => setGmailRecipient(ctx)}
              onOpenOutreachGenerator={(cid, nid, prefill) => {
                setTargetCountryId(cid);
                if (nid) setTargetNicheId(nid);
                if (prefill) {
                  setOutreachPrefill(prefill);
                }
                setActiveView('outreach');
              }}
              onInspectProspectInCrm={(pid) => {
                setTargetProspectId(pid);
                setActiveView('workbench');
              }}
            />
          )}

          {activeView === 'pricing' && (
            <PricingEngineView
              currency={store.preferredCurrency}
              initialCountryId={targetCountryId}
              initialNicheId={targetNicheId}
              onSendOfferToOutreach={(cid, nid, summary) => {
                setTargetCountryId(cid);
                setTargetNicheId(nid);
                setOutreachPrefill({ serviceSummary: summary });
                setActiveView('outreach');
              }}
            />
          )}

          {activeView === 'outreach' && (
            <OutreachGeneratorView
              initialCountryId={targetCountryId}
              initialNicheId={targetNicheId}
              initialBusinessName={outreachPrefill.businessName}
              initialContactName={outreachPrefill.contactName}
              initialServiceSummary={outreachPrefill.serviceSummary}
              onOpenGmailModal={(ctx) => setGmailRecipient(ctx)}
            />
          )}

          {activeView === 'funnel' && (
            <FunnelEconomicsView
              settings={store.funnelSettings}
              currency={store.preferredCurrency}
              onUpdateSettings={store.updateFunnelSettings}
            />
          )}

          {activeView === 'roadmap' && (
            <RoadmapView phases={store.roadmap} onUpdatePhases={store.updateRoadmap} />
          )}
        </main>
      </div>

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-[#111214] text-[#D9F154] border border-[#D9F154]/50 px-4 py-2.5 rounded-2xl text-xs font-semibold shadow-xl">
          {toastMessage}
        </div>
      )}

      {/* MODALS & VOICE DRAWER */}
      <GoogleSheetsSyncModal
        open={sheetsModalOpen}
        isSignedIn={Boolean(store.user)}
        hasToken={Boolean(store.accessToken)}
        existingSpreadsheetId={store.syncedSpreadsheetId}
        existingSpreadsheetUrl={store.syncedSpreadsheetUrl}
        lastSyncedAt={store.lastSyncedAt}
        rowCountPreview={
          store.prospects.length +
          store.followUps.length +
          store.chatLogs.length +
          store.weeklyTasks.length +
          store.monthlyGoals.length +
          GLOBAL_COUNTRIES.length
        }
        onClose={() => setSheetsModalOpen(false)}
        onSignIn={store.handleSignIn}
        onConfirmSync={handleConfirmSheetsSync}
        onDownloadXlsx={handleDownloadXlsx}
      />

      <CalendarBookingModal
        open={Boolean(calendarProspect)}
        prospect={calendarProspect}
        accessToken={store.accessToken}
        onClose={() => setCalendarProspect(null)}
        onSignIn={store.handleSignIn}
        onBooked={() => showToast('Discovery call booked on Google Calendar!')}
      />

      <GmailComposerModal
        open={Boolean(gmailRecipient)}
        recipient={gmailRecipient}
        accessToken={store.accessToken}
        senderEmail={store.user?.email}
        senderName={store.user?.displayName || 'Clientsology Growth Team'}
        onClose={() => setGmailRecipient(null)}
        onSignIn={store.handleSignIn}
        onSentSuccess={handleGmailSentSuccess}
      />

      <LiveVoiceDrawer
        open={voiceOpen}
        crmContextSummary={crmContextSummary}
        onClose={() => setVoiceOpen(false)}
      />
    </div>
  );
}
