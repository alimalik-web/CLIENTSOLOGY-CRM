import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus,
  Check,
  Edit3,
  ExternalLink,
  Eye,
  Globe,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Send,
  Sparkles,
  Target,
  UserCheck,
  X,
} from 'lucide-react';
import { formatMoney } from '../data/currency';
import { OPERATING_NICHES } from '../data/operatingNiches';
import { GLOBAL_COUNTRIES } from '../data/globalMarkets';
import { addDaysUtc, ensureHttpUrl, getLocalIsoDate } from '../lib/appUtils';
import {
  ChatLogItem,
  CurrencyCode,
  FollowUpItem,
  LeadQuality,
  OutreachChannel,
  PipelineStage,
  Prospect,
} from '../types/crm';

const STAGES: PipelineStage[] = [
  'New Lead',
  'Contacted',
  'Proposal Sent',
  'Negotiating',
  'Closed Won',
  'Closed Lost',
  'Follow Up',
];

const QUALITIES: LeadQuality[] = ['Hot', 'Warm', 'Cold', 'Dead'];

interface Props {
  prospects: Prospect[];
  followUps: FollowUpItem[];
  chatLogs: ChatLogItem[];
  currency: CurrencyCode;
  initialProspectId?: string;
  metrics: {
    worklistCount: number;
    newLeadsCount: number;
    followUpsDueCount: number;
    closedWonCount: number;
  };
  onUpsertProspect: (p: Prospect) => void;
  onAddChatLog: (c: ChatLogItem) => void;
  onUpsertFollowUp: (f: FollowUpItem) => void;
  onOpenCalendarModal: (prospect: Prospect) => void;
  onOpenGmailModal: (prospect: Prospect) => void;
  onOpenClientPreview: (prospect: Prospect) => void;
  onNavigateToOutreach: (prospect: Prospect) => void;
  onNavigateToPricing: (prospect: Prospect) => void;
  onNavigateToCompetitorAudit?: (prospect: Prospect) => void;
}

export const ProspectWorkbenchView: React.FC<Props> = ({
  prospects,
  followUps,
  chatLogs,
  currency,
  initialProspectId,
  metrics,
  onUpsertProspect,
  onAddChatLog,
  onUpsertFollowUp,
  onOpenCalendarModal,
  onOpenGmailModal,
  onOpenClientPreview,
  onNavigateToOutreach,
  onNavigateToPricing,
  onNavigateToCompetitorAudit,
}) => {
  const [selectedId, setSelectedId] = useState<string>(initialProspectId || prospects[0]?.id || '');

  useEffect(() => {
    if (initialProspectId) {
      setSelectedId(initialProspectId);
    }
  }, [initialProspectId]);
  const [worklistFilter, setWorklistFilter] = useState<'all' | 'new' | 'followups' | 'won'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [centerTab, setCenterTab] = useState<'activity' | 'summary' | 'details'>('activity');
  const [channel, setChannel] = useState<OutreachChannel>('WhatsApp');
  const [draftMessage, setDraftMessage] = useState('');
  const [isEditingDeal, setIsEditingDeal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const [newLeadForm, setNewLeadForm] = useState({
    businessName: '',
    contactPerson: '',
    roleTitle: 'Owner',
    email: '',
    phone: '',
    website: '',
    country: 'United States',
    stateOrRegion: 'North Carolina',
    city: 'Charlotte',
    categoryNiche: OPERATING_NICHES[0].name,
    leadQuality: 'Hot' as LeadQuality,
    serviceInterest: 'Local Map Pack SEO + AI Text-Back',
    ticketUsd: 2500,
  });

  const filteredWorklist = useMemo(() => {
    return prospects.filter((p) => {
      if (worklistFilter === 'new' && p.stage !== 'New Lead') return false;
      if (worklistFilter === 'won' && p.stage !== 'Closed Won') return false;
      if (worklistFilter === 'followups' && p.stage !== 'Follow Up' && !p.nextFollowUp) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          p.businessName.toLowerCase().includes(q) ||
          p.contactPerson.toLowerCase().includes(q) ||
          p.city.toLowerCase().includes(q) ||
          p.country.toLowerCase().includes(q) ||
          p.categoryNiche.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [prospects, worklistFilter, searchQuery]);

  const activeProspect = useMemo(
    () => prospects.find((p) => p.id === selectedId) || filteredWorklist[0] || prospects[0],
    [prospects, selectedId, filteredWorklist]
  );

  const prospectChats = useMemo(
    () =>
      activeProspect
        ? chatLogs.filter((c) => c.prospectId === activeProspect.id)
        : [],
    [chatLogs, activeProspect]
  );

  const prospectFollowUps = useMemo(
    () =>
      activeProspect
        ? followUps.filter((f) => f.prospectId === activeProspect.id)
        : [],
    [followUps, activeProspect]
  );

  const nextTask = prospectFollowUps.find((f) => !f.done) || prospectFollowUps[0];

  const handleSendMessage = () => {
    if (!activeProspect || !draftMessage.trim()) return;
    const now = new Date();
    const date = getLocalIsoDate(now);
    const time = now.toTimeString().slice(0, 5);

    onAddChatLog({
      id: `cl-${Date.now()}`,
      prospectId: activeProspect.id,
      businessName: activeProspect.businessName,
      date,
      time,
      channel,
      direction: 'Outbound',
      messageContent: draftMessage.trim(),
      responseSummary: 'Sent via Workbench',
    });

    onUpsertProspect({
      ...activeProspect,
      lastContacted: date,
      lastMessageSent: draftMessage.trim(),
    });
    setDraftMessage('');
  };

  const handleCompleteNextTask = () => {
    if (!nextTask) return;
    onUpsertFollowUp({
      ...nextTask,
      done: !nextTask.done,
      outcome: !nextTask.done ? 'Completed from Workbench' : nextTask.outcome,
    });
  };

  const handleCreateLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadForm.businessName.trim()) return;
    const today = getLocalIsoDate();
    const twoDaysLater = addDaysUtc(today, 2);
    const created: Prospect = {
      id: `p-${Date.now()}`,
      ...newLeadForm,
      stage: 'New Lead',
      dateAdded: today,
      nextFollowUp: twoDaysLater,
      lastContacted: '',
      lastMessageSent: '',
      replyNotes: 'Added manually in Prospect Workbench.',
      competitorAdvantage: 'Fast turnaround + ROI-backed Local SEO & Automation',
      status: 'Active',
    };
    onUpsertProspect(created);
    setSelectedId(created.id);
    setShowAddModal(false);
    setNewLeadForm({ ...newLeadForm, businessName: '', contactPerson: '', email: '', phone: '', website: '' });
  };

  const qualityBadgeStyle = (q: LeadQuality) => {
    switch (q) {
      case 'Hot':
        return 'bg-[#FF786C] text-[#111214]';
      case 'Warm':
        return 'bg-[#D9F154] text-[#111214]';
      case 'Cold':
        return 'bg-[#B3E5FC] text-[#111214]';
      default:
        return 'bg-[#32343B] text-[#9A9FA8]';
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0 bg-[#F3F4F1] dark:bg-[#0D0E12] overflow-hidden">
      {/* LEFT WORKLIST QUEUE (Obsidian Panel) */}
      <aside className="w-full lg:w-[295px] shrink-0 bg-[#111214] text-white flex flex-col border-r border-[#E2E4DF] dark:border-[#23252A] min-h-0">
        {/* 2x2 KPI Metric Cards */}
        <div className="p-3.5 grid grid-cols-2 gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setWorklistFilter('all')}
            className={`text-left rounded-2xl p-3 border transition-colors ${
              worklistFilter === 'all'
                ? 'bg-[#1D1F24] border-[#D9F154]/60'
                : 'bg-[#1A1C20] border-[#26282E] hover:border-[#3A3D46]'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[11px] text-[#9A9FA8]">
              <span className="w-2.5 h-2.5 rounded border border-[#D9F154] inline-block" />
              <span>Worklist</span>
            </div>
            <div className="mt-1 text-2xl font-bold font-mono-tabular tracking-tight">
              {metrics.worklistCount}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setWorklistFilter('new')}
            className={`text-left rounded-2xl p-3 border transition-colors ${
              worklistFilter === 'new'
                ? 'bg-[#1D1F24] border-[#FF786C]/60'
                : 'bg-[#1A1C20] border-[#26282E] hover:border-[#3A3D46]'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[11px] text-[#9A9FA8]">
              <span className="w-2.5 h-2.5 rounded border border-[#FF786C] inline-block" />
              <span>New Leads</span>
            </div>
            <div className="mt-1 text-2xl font-bold font-mono-tabular tracking-tight">
              {metrics.newLeadsCount}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setWorklistFilter('followups')}
            className={`text-left rounded-2xl p-3 border transition-colors ${
              worklistFilter === 'followups'
                ? 'bg-[#1D1F24] border-[#C8B6FF]/60'
                : 'bg-[#1A1C20] border-[#26282E] hover:border-[#3A3D46]'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[11px] text-[#9A9FA8]">
              <span className="w-2.5 h-2.5 rounded border border-[#C8B6FF] inline-block" />
              <span>Follow-Ups</span>
            </div>
            <div className="mt-1 text-2xl font-bold font-mono-tabular tracking-tight">
              {metrics.followUpsDueCount}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setWorklistFilter('won')}
            className={`text-left rounded-2xl p-3 border transition-colors ${
              worklistFilter === 'won'
                ? 'bg-[#1D1F24] border-[#6AE4C0]/60'
                : 'bg-[#1A1C20] border-[#26282E] hover:border-[#3A3D46]'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[11px] text-[#9A9FA8]">
              <span className="w-2.5 h-2.5 rounded border border-[#6AE4C0] inline-block" />
              <span>Closed Won</span>
            </div>
            <div className="mt-1 text-2xl font-bold font-mono-tabular tracking-tight">
              {metrics.closedWonCount}
            </div>
          </button>
        </div>

        {/* Search + Add Lead */}
        <div className="px-3.5 pb-2.5 flex items-center gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-[#7A7E87] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search business, city..."
              className="w-full bg-[#1A1C20] border border-[#26282E] rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-[#7A7E87] focus:outline-none focus:border-[#D9F154]"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="h-8 px-2.5 rounded-xl bg-[#D9F154] text-[#111214] text-xs font-semibold flex items-center gap-1 hover:bg-[#e5f876] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>

        {/* Worklist Scroll */}
        <div className="flex-1 overflow-y-auto px-3.5 pb-4 space-y-2.5">
          {filteredWorklist.map((p) => {
            const isSelected = activeProspect?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`w-full text-left rounded-2xl p-3.5 transition-all border cursor-pointer ${
                  isSelected
                    ? 'bg-[#D9F154] text-[#111214] border-[#D9F154]'
                    : 'bg-[#1A1C20] text-white border-[#26282E] hover:border-[#3D404A]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{p.businessName}</div>
                    <div
                      className={`text-xs truncate mt-0.5 ${
                        isSelected ? 'text-[#111214]/75' : 'text-[#9A9FA8]'
                      }`}
                    >
                      {p.contactPerson} · {p.city}
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-mono-tabular font-semibold shrink-0 ${
                      isSelected ? 'text-[#111214]' : 'text-[#D9F154]'
                    }`}
                  >
                    {formatMoney(p.ticketUsd, currency, { compact: true })}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-lg truncate ${
                      isSelected
                        ? 'bg-[#111214]/10 text-[#111214] font-medium'
                        : 'bg-[#23252A] text-[#C9CDD4]'
                    }`}
                  >
                    {p.stage}
                  </span>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${qualityBadgeStyle(
                      p.leadQuality
                    )}`}
                  >
                    {p.leadQuality}
                  </span>
                </div>
              </button>
            );
          })}
          {filteredWorklist.length === 0 && (
            <div className="text-center py-8 text-xs text-[#7A7E87]">
              No prospects match current filter.
            </div>
          )}
        </div>
      </aside>

      {/* MAIN CANVAS + RIGHT STRATEGY CARDS */}
      <div className="flex-1 bg-[#F3F4F1] dark:bg-[#0D0E12] text-[#111214] dark:text-[#F4F5F7] rounded-tl-3xl overflow-y-auto p-5 lg:p-6 min-h-0">
        {activeProspect ? (
          <div className="max-w-[1380px] mx-auto space-y-5">
            {/* PROSPECT HEADER ROW */}
            <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl bg-[#111214] dark:bg-[#1E212B] border border-transparent dark:border-[#323643] text-[#D9F154] flex items-center justify-center font-display font-bold text-xl shrink-0">
                  {activeProspect.businessName
                    .split(' ')
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join('')
                    .toUpperCase()}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-2xl lg:text-3xl font-display font-bold tracking-tight text-[#111214] dark:text-[#F4F5F7]">
                      {activeProspect.businessName}
                    </h1>
                    <button
                      type="button"
                      onClick={() => setIsEditingDeal(!isEditingDeal)}
                      className="p-1.5 rounded-lg bg-white dark:bg-[#16181E] border border-[#E2E4DF] dark:border-[#2C2F3A] text-[#555963] dark:text-[#9CA3AF] hover:text-[#111214] dark:hover:text-white cursor-pointer"
                      title="Edit Prospect"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] mt-1">
                    {activeProspect.contactPerson} ({activeProspect.roleTitle}) ·{' '}
                    {activeProspect.city}, {activeProspect.country} · {activeProspect.categoryNiche}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#3D404A] dark:text-[#C9CDD4]">
                    <span>{activeProspect.phone || 'No phone logged'}</span>
                    <span>·</span>
                    <span>{activeProspect.email || 'No email logged'}</span>
                    {ensureHttpUrl(activeProspect.website) && (
                      <>
                        <span>·</span>
                        <a
                          href={ensureHttpUrl(activeProspect.website)}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:text-[#111214] dark:hover:text-[#D9F154]"
                        >
                          {activeProspect.website.replace(/^https?:\/\//, '')}
                        </a>
                      </>
                    )}
                    {ensureHttpUrl(activeProspect.linkedinUrl || '') && (
                      <>
                        <span>·</span>
                        <a
                          href={ensureHttpUrl(activeProspect.linkedinUrl || '')}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 underline text-[#0A66C2] dark:text-[#6AE4C0] hover:opacity-80"
                        >
                          <ExternalLink className="w-3 h-3" />
                          LinkedIn Profile
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${qualityBadgeStyle(
                    activeProspect.leadQuality
                  )}`}
                >
                  {activeProspect.leadQuality} Priority
                </span>
                <button
                  type="button"
                  onClick={() => onNavigateToOutreach(activeProspect)}
                  className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#16181E] border border-[#D9DBD5] dark:border-[#2C2F3A] text-xs font-semibold text-[#111214] dark:text-[#F4F5F7] hover:bg-[#ECEEE8] dark:hover:bg-[#23262F] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#6D28D9] dark:text-[#C8B6FF]" />
                  Generate Outreach
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateToPricing(activeProspect)}
                  className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#16181E] border border-[#D9DBD5] dark:border-[#2C2F3A] text-xs font-semibold text-[#111214] dark:text-[#F4F5F7] hover:bg-[#ECEEE8] dark:hover:bg-[#23262F] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Globe className="w-3.5 h-3.5" />
                  Build Offer
                </button>
                <button
                  type="button"
                  onClick={() => onOpenClientPreview(activeProspect)}
                  className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#16181E] border border-[#D9DBD5] dark:border-[#2C2F3A] text-xs font-semibold text-[#111214] dark:text-[#F4F5F7] hover:bg-[#ECEEE8] dark:hover:bg-[#23262F] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-[#6D28D9] dark:text-[#C8B6FF]" />
                  Client Preview
                </button>
                <button
                  type="button"
                  onClick={() => onOpenGmailModal(activeProspect)}
                  className="px-3.5 py-2 rounded-xl bg-[#D9F154] text-[#111214] text-xs font-semibold hover:bg-[#e5f876] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Send Gmail
                </button>
                <button
                  type="button"
                  onClick={() => onOpenCalendarModal(activeProspect)}
                  className="px-3.5 py-2 rounded-xl bg-[#111214] dark:bg-[#252833] dark:border dark:border-[#D9F154]/35 text-[#D9F154] text-xs font-semibold hover:bg-[#23252A] dark:hover:bg-[#2F3340] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <CalendarPlus className="w-3.5 h-3.5" />
                  Book Discovery Call
                </button>
              </div>
            </header>

            {/* Quick Action Circle Strip + Sub-Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E4DF] dark:border-[#242731] pb-3.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setChannel('Phone')}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                    channel === 'Phone'
                      ? 'bg-[#D9F154] text-[#111214]'
                      : 'bg-white dark:bg-[#16181E] border border-[#E2E4DF] dark:border-[#2C2F3A] text-[#555963] dark:text-[#9CA3AF]'
                  }`}
                  title="Log Phone Touch"
                >
                  <Phone className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setChannel('WhatsApp')}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                    channel === 'WhatsApp'
                      ? 'bg-[#D9F154] text-[#111214]'
                      : 'bg-white dark:bg-[#16181E] border border-[#E2E4DF] dark:border-[#2C2F3A] text-[#555963] dark:text-[#9CA3AF]'
                  }`}
                  title="WhatsApp Channel"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChannel('Email');
                    onOpenGmailModal(activeProspect);
                  }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                    channel === 'Email'
                      ? 'bg-[#D9F154] text-[#111214]'
                      : 'bg-white dark:bg-[#16181E] border border-[#E2E4DF] dark:border-[#2C2F3A] text-[#555963] dark:text-[#9CA3AF]'
                  }`}
                  title="Compose & Send Dynamic Gmail"
                >
                  <Mail className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenCalendarModal(activeProspect)}
                  className="w-9 h-9 rounded-full bg-white dark:bg-[#16181E] border border-[#E2E4DF] dark:border-[#2C2F3A] text-[#555963] dark:text-[#9CA3AF] hover:text-[#111214] dark:hover:text-white flex items-center justify-center cursor-pointer"
                  title="Schedule Google Calendar Call"
                >
                  <CalendarPlus className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                {(['activity', 'summary', 'details'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setCenterTab(t)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold capitalize cursor-pointer ${
                      centerTab === t
                        ? 'bg-white dark:bg-[#1E212B] text-[#111214] dark:text-[#D9F154] shadow-xs border border-[#E2E4DF] dark:border-[#323643]'
                        : 'text-[#666A73] dark:text-[#9CA3AF] hover:text-[#111214] dark:hover:text-white'
                    }`}
                  >
                    {t === 'activity' ? `Deal #${activeProspect.id.toUpperCase()}` : t}
                  </button>
                ))}
              </div>
            </div>

            {/* INLINE EDIT PANEL */}
            {isEditingDeal && (
              <div className="bg-white dark:bg-[#16181E] rounded-2xl border border-[#E2E4DF] dark:border-[#282B35] p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">
                    Pipeline Stage
                  </label>
                  <select
                    value={activeProspect.stage}
                    onChange={(e) =>
                      onUpsertProspect({
                        ...activeProspect,
                        stage: e.target.value as PipelineStage,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 text-xs bg-[#F8F9F7] dark:bg-[#1C1F26] dark:text-[#F4F5F7]"
                  >
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">
                    Lead Priority
                  </label>
                  <select
                    value={activeProspect.leadQuality}
                    onChange={(e) =>
                      onUpsertProspect({
                        ...activeProspect,
                        leadQuality: e.target.value as LeadQuality,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 text-xs bg-[#F8F9F7] dark:bg-[#1C1F26] dark:text-[#F4F5F7]"
                  >
                    {QUALITIES.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">
                    Deal Value (USD)
                  </label>
                  <input
                    type="number"
                    value={activeProspect.ticketUsd}
                    onChange={(e) =>
                      onUpsertProspect({
                        ...activeProspect,
                        ticketUsd: Number(e.target.value) || 0,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 text-xs bg-[#F8F9F7] dark:bg-[#1C1F26] dark:text-[#F4F5F7] font-mono-tabular"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">
                    Service Interest / Package
                  </label>
                  <input
                    value={activeProspect.serviceInterest}
                    onChange={(e) =>
                      onUpsertProspect({
                        ...activeProspect,
                        serviceInterest: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 text-xs bg-[#F8F9F7] dark:bg-[#1C1F26] dark:text-[#F4F5F7]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">
                    Next Follow-Up Date
                  </label>
                  <input
                    type="date"
                    value={activeProspect.nextFollowUp}
                    onChange={(e) =>
                      onUpsertProspect({
                        ...activeProspect,
                        nextFollowUp: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 text-xs bg-[#F8F9F7] dark:bg-[#1C1F26] dark:text-[#F4F5F7] font-mono-tabular"
                  />
                </div>
              </div>
            )}

            {/* 2-COLUMN MAIN BODY: CENTER TIMELINE/CHAT + RIGHT STRATEGY CARDS */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
              {/* CENTER COLUMN (8 cols) */}
              <div className="xl:col-span-8 space-y-4">
                {centerTab === 'activity' && (
                  <>
                    {/* Timeline Event Cards */}
                    <div className="space-y-3">
                      <div className="bg-white dark:bg-[#16181E] rounded-2xl p-4 border border-[#E5E7E2] dark:border-[#282B35] flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-[#E0F4FC] dark:bg-[#0284C7]/20 text-[#0284C7] dark:text-[#38BDF8] flex items-center justify-center shrink-0">
                            <Phone className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[#111214] dark:text-[#F4F5F7]">
                              Latest Outreach & Discovery Status
                            </div>
                            <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] truncate mt-0.5">
                              {activeProspect.lastMessageSent ||
                                'No outreach logged yet — send a Trojan Horse audit below.'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[11px] font-mono-tabular text-[#666A73] dark:text-[#9CA3AF]">
                            {activeProspect.lastContacted || activeProspect.dateAdded}
                          </div>
                          <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#B3E5FC] text-[#111214]">
                            {activeProspect.stage}
                          </span>
                        </div>
                      </div>

                      <div className="bg-white dark:bg-[#16181E] rounded-2xl p-4 border border-[#E5E7E2] dark:border-[#282B35] flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-[#EDE7FF] dark:bg-[#6D28D9]/25 text-[#6D28D9] dark:text-[#C8B6FF] flex items-center justify-center shrink-0">
                            <UserCheck className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[#111214] dark:text-[#F4F5F7]">
                              Client Reply Notes & Objections
                            </div>
                            <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] mt-0.5">
                              {activeProspect.replyNotes || 'Awaiting reply from prospect.'}
                            </p>
                          </div>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#C8B6FF] text-[#111214] shrink-0">
                          Next: {activeProspect.nextFollowUp || 'TBD'}
                        </span>
                      </div>
                    </div>

                    {/* INLINE CHAT HISTORY & COMPOSER */}
                    <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E5E7E2] dark:border-[#282B35] overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-[#EFEFEF] dark:border-[#242731] flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#111214] dark:bg-[#23262F] text-[#D9F154] text-xs font-bold flex items-center justify-center">
                            {activeProspect.contactPerson
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-[#111214] dark:text-[#F4F5F7]">
                              {activeProspect.contactPerson}
                            </div>
                            <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                              Channel: {channel} · {activeProspect.city}
                            </div>
                          </div>
                        </div>

                        <select
                          value={channel}
                          onChange={(e) => setChannel(e.target.value as OutreachChannel)}
                          className="text-xs font-semibold bg-[#F3F4F1] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#323643] dark:text-[#F4F5F7] rounded-xl px-2.5 py-1.5"
                        >
                          <option value="WhatsApp">WhatsApp</option>
                          <option value="Email">Email</option>
                          <option value="LinkedIn">LinkedIn</option>
                          <option value="Instagram DM">Instagram DM</option>
                          <option value="Phone">Phone</option>
                          <option value="Fiverr">Fiverr</option>
                        </select>
                      </div>

                      <div className="p-5 space-y-3 max-h-[300px] overflow-y-auto bg-[#FAFAF8] dark:bg-[#121419]">
                        {prospectChats.length === 0 ? (
                          <div className="text-center py-8 text-xs text-[#7A7E87] dark:text-[#8E94A2]">
                            No chat history logged for {activeProspect.businessName}. Send your first message below.
                          </div>
                        ) : (
                          prospectChats.map((msg) => {
                            const isOutbound = msg.direction === 'Outbound';
                            return (
                              <div
                                key={msg.id}
                                className={`flex flex-col ${
                                  isOutbound ? 'items-end' : 'items-start'
                                }`}
                              >
                                <div
                                  className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                                    isOutbound
                                      ? 'bg-[#EAECE7] dark:bg-[#252934] text-[#111214] dark:text-[#F4F5F7]'
                                      : 'bg-[#111214] dark:bg-[#C8B6FF] text-white dark:text-[#111214]'
                                  }`}
                                >
                                  {msg.messageContent}
                                </div>
                                <span className="mt-1 text-[10px] font-mono-tabular text-[#7A7E87] dark:text-[#8E94A2]">
                                  {msg.channel} · {msg.date} {msg.time}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <div className="p-3.5 bg-white dark:bg-[#16181E] border-t border-[#EFEFEF] dark:border-[#242731] flex items-center gap-2.5">
                        <input
                          value={draftMessage}
                          onChange={(e) => setDraftMessage(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                          placeholder={`Log ${channel} outreach or reply for ${activeProspect.contactPerson}...`}
                          className="flex-1 bg-[#F3F4F1] dark:bg-[#1C1F26] rounded-2xl px-4 py-2.5 text-xs text-[#111214] dark:text-[#F4F5F7] placeholder-[#7A7E87] focus:outline-none focus:ring-2 focus:ring-[#D9F154]"
                        />
                        <button
                          type="button"
                          onClick={handleSendMessage}
                          className="w-10 h-10 rounded-full bg-[#D9F154] text-[#111214] flex items-center justify-center hover:bg-[#c8e044] shrink-0 cursor-pointer"
                          title="Log Message"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {centerTab === 'summary' && (
                  <div className="bg-white dark:bg-[#16181E] rounded-3xl p-6 border border-[#E5E7E2] dark:border-[#282B35] space-y-4">
                    <h3 className="text-base font-display font-bold">Executive Deal Summary</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="p-4 rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26]">
                        <div className="text-[#666A73] dark:text-[#9CA3AF]">Target Market</div>
                        <div className="font-semibold mt-1">
                          {activeProspect.city}, {activeProspect.stateOrRegion} ({activeProspect.country})
                        </div>
                      </div>
                      <div className="p-4 rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26]">
                        <div className="text-[#666A73] dark:text-[#9CA3AF]">Service Interest</div>
                        <div className="font-semibold mt-1">{activeProspect.serviceInterest}</div>
                      </div>
                      <div className="p-4 rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] md:col-span-2 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-[#666A73] dark:text-[#9CA3AF]">Winning Angle / Competitor Advantage</div>
                          <div className="font-semibold mt-1">{activeProspect.competitorAdvantage}</div>
                        </div>
                        {onNavigateToCompetitorAudit && (
                          <button
                            type="button"
                            onClick={() => onNavigateToCompetitorAudit(activeProspect)}
                            className="px-3 py-1.5 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                          >
                            <Target className="w-3.5 h-3.5" />
                            Run Competitor Audit
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {centerTab === 'details' && (
                  <div className="bg-white dark:bg-[#16181E] rounded-3xl p-6 border border-[#E5E7E2] dark:border-[#282B35] space-y-3">
                    <h3 className="text-base font-display font-bold">Editable Notes & Metadata</h3>
                    <textarea
                      rows={4}
                      value={activeProspect.replyNotes}
                      onChange={(e) =>
                        onUpsertProspect({ ...activeProspect, replyNotes: e.target.value })
                      }
                      className="w-full rounded-2xl border border-[#D9DBD5] dark:border-[#323643] p-3 text-xs bg-[#F8F9F7] dark:bg-[#1C1F26] dark:text-[#F4F5F7]"
                      placeholder="Reply notes, objections, decision maker context..."
                    />
                    <input
                      value={activeProspect.competitorAdvantage}
                      onChange={(e) =>
                        onUpsertProspect({ ...activeProspect, competitorAdvantage: e.target.value })
                      }
                      className="w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 text-xs bg-[#F8F9F7] dark:bg-[#1C1F26] dark:text-[#F4F5F7]"
                      placeholder="Why we beat local competition..."
                    />
                    <input
                      value={activeProspect.linkedinUrl || ''}
                      onChange={(e) =>
                        onUpsertProspect({ ...activeProspect, linkedinUrl: e.target.value })
                      }
                      className="w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 text-xs bg-[#F8F9F7] dark:bg-[#1C1F26] dark:text-[#F4F5F7]"
                      placeholder="LinkedIn Profile URL (https://www.linkedin.com/in/...)"
                    />
                  </div>
                )}
              </div>

              {/* RIGHT STRATEGY COLUMN (4 cols: Lavender Deal Card + Electric Lime Task Card) */}
              <div className="xl:col-span-4 space-y-4">
                {/* LAVENDER DEAL STAGE & POTENTIAL PROFIT CARD */}
                <div className="bg-[#C8B6FF] text-[#111214] rounded-3xl p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-[#111214]/70">
                        Interested in
                      </div>
                      <h3 className="text-lg font-display font-bold leading-snug mt-0.5">
                        {activeProspect.serviceInterest}
                      </h3>
                    </div>
                  </div>

                  {/* Interactive Stage Strip */}
                  <div className="flex flex-wrap gap-1.5">
                    {(['Contacted', 'Proposal Sent', 'Negotiating', 'Closed Won'] as PipelineStage[]).map(
                      (st) => {
                        const active = activeProspect.stage === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => onUpsertProspect({ ...activeProspect, stage: st })}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${
                              active
                                ? 'bg-white text-[#111214]'
                                : 'bg-[#111214]/10 text-[#111214]/80 hover:bg-white/60'
                            }`}
                          >
                            {st}
                          </button>
                        );
                      }
                    )}
                  </div>

                  <div>
                    <div className="text-xs font-medium text-[#111214]/70">Potential Deal Value</div>
                    <div className="text-3xl font-display font-bold font-mono-tabular mt-0.5">
                      {formatMoney(activeProspect.ticketUsd, currency)}
                    </div>
                  </div>

                  <div className="space-y-2 pt-1 text-xs font-medium">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-white/70 flex items-center justify-center text-[11px]">
                        ✓
                      </span>
                      <span>Niche Fit: {activeProspect.categoryNiche}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-white/70 flex items-center justify-center text-[11px]">
                        ✓
                      </span>
                      <span>Market: {activeProspect.city}, {activeProspect.country}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-[#111214]/15 flex items-center justify-center text-[11px] shrink-0">
                          ★
                        </span>
                        <span className="truncate">{activeProspect.competitorAdvantage}</span>
                      </div>
                      {onNavigateToCompetitorAudit && (
                        <button
                          type="button"
                          onClick={() => onNavigateToCompetitorAudit(activeProspect)}
                          className="px-2 py-0.5 rounded-lg bg-[#111214] text-[#D9F154] text-[11px] font-semibold shrink-0 cursor-pointer whitespace-nowrap"
                        >
                          Audit Rival
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* ELECTRIC LIME TASK & PROPOSAL CARD */}
                <div className="bg-[#D9F154] text-[#111214] rounded-3xl p-5 space-y-4">
                  <div>
                    <div className="text-xs font-semibold text-[#111214]/70">Next Follow-Up Task</div>
                    <h3 className="text-lg font-display font-bold mt-0.5">
                      {nextTask ? nextTask.followUpType : 'Send Trojan Horse Proposal'}
                    </h3>
                  </div>

                  <div className="bg-white/80 rounded-2xl p-3 text-xs leading-relaxed text-[#111214]">
                    {nextTask
                      ? nextTask.messageScript
                      : `Follow up with ${activeProspect.contactPerson} on ${activeProspect.nextFollowUp || 'next available slot'}.`}
                  </div>

                  <div className="flex items-center justify-between text-xs font-medium">
                    <span>Due: {nextTask?.followUpDate || activeProspect.nextFollowUp || 'Today'}</span>
                    <span className="font-mono-tabular">
                      {nextTask?.done ? 'Completed' : 'Pending Action'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => onNavigateToOutreach(activeProspect)}
                      className="h-10 rounded-2xl bg-[#111214] text-white text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-[#23252A] cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Pitch Script
                    </button>
                    <button
                      type="button"
                      onClick={handleCompleteNextTask}
                      className="h-10 rounded-2xl bg-white text-[#111214] text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-[#F3F4F1] cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {nextTask?.done ? 'Reopen' : 'Mark Done'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-[#666A73] dark:text-[#9CA3AF]">
            Select or add a prospect to open the Workbench.
          </div>
        )}
      </div>

      {/* ADD NEW PROSPECT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#16181E] text-[#111214] dark:text-[#F4F5F7] border border-transparent dark:border-[#2C2F3A] rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-bold">Add New Agency Prospect</h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg hover:bg-[#F3F4F1] dark:hover:bg-[#23262F] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateLead} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <input
                required
                placeholder="Business Name *"
                value={newLeadForm.businessName}
                onChange={(e) => setNewLeadForm({ ...newLeadForm, businessName: e.target.value })}
                className="sm:col-span-2 rounded-xl border border-[#D9DBD5] dark:border-[#323643] dark:bg-[#1C1F26] px-3 py-2"
              />
              <input
                placeholder="Contact Person"
                value={newLeadForm.contactPerson}
                onChange={(e) => setNewLeadForm({ ...newLeadForm, contactPerson: e.target.value })}
                className="rounded-xl border border-[#D9DBD5] dark:border-[#323643] dark:bg-[#1C1F26] px-3 py-2"
              />
              <input
                placeholder="Role / Title"
                value={newLeadForm.roleTitle}
                onChange={(e) => setNewLeadForm({ ...newLeadForm, roleTitle: e.target.value })}
                className="rounded-xl border border-[#D9DBD5] dark:border-[#323643] dark:bg-[#1C1F26] px-3 py-2"
              />
              <input
                placeholder="Email"
                value={newLeadForm.email}
                onChange={(e) => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
                className="rounded-xl border border-[#D9DBD5] dark:border-[#323643] dark:bg-[#1C1F26] px-3 py-2"
              />
              <input
                placeholder="Phone / WhatsApp"
                value={newLeadForm.phone}
                onChange={(e) => setNewLeadForm({ ...newLeadForm, phone: e.target.value })}
                className="rounded-xl border border-[#D9DBD5] dark:border-[#323643] dark:bg-[#1C1F26] px-3 py-2"
              />
              <select
                value={newLeadForm.country}
                onChange={(e) => setNewLeadForm({ ...newLeadForm, country: e.target.value })}
                className="rounded-xl border border-[#D9DBD5] dark:border-[#323643] dark:bg-[#1C1F26] px-3 py-2"
              >
                {GLOBAL_COUNTRIES.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                placeholder="City"
                value={newLeadForm.city}
                onChange={(e) => setNewLeadForm({ ...newLeadForm, city: e.target.value })}
                className="rounded-xl border border-[#D9DBD5] dark:border-[#323643] dark:bg-[#1C1F26] px-3 py-2"
              />
              <select
                value={newLeadForm.categoryNiche}
                onChange={(e) => setNewLeadForm({ ...newLeadForm, categoryNiche: e.target.value })}
                className="sm:col-span-2 rounded-xl border border-[#D9DBD5] dark:border-[#323643] dark:bg-[#1C1F26] px-3 py-2"
              >
                {OPERATING_NICHES.map((n) => (
                  <option key={n.id} value={n.name}>
                    {n.name}
                  </option>
                ))}
              </select>
              <input
                placeholder="Service Interest"
                value={newLeadForm.serviceInterest}
                onChange={(e) => setNewLeadForm({ ...newLeadForm, serviceInterest: e.target.value })}
                className="rounded-xl border border-[#D9DBD5] dark:border-[#323643] dark:bg-[#1C1F26] px-3 py-2"
              />
              <input
                type="number"
                placeholder="Ticket (USD)"
                value={newLeadForm.ticketUsd}
                onChange={(e) =>
                  setNewLeadForm({ ...newLeadForm, ticketUsd: Number(e.target.value) || 0 })
                }
                className="rounded-xl border border-[#D9DBD5] dark:border-[#323643] dark:bg-[#1C1F26] px-3 py-2 font-mono-tabular"
              />
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#D9DBD5] dark:border-[#323643] font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] font-semibold cursor-pointer"
                >
                  Save Prospect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
