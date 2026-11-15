import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  Eye,
  Mail,
  Maximize2,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  buildClientPreviewSnapshot,
  buildDefaultClientPortal,
  buildShareablePreviewUrl,
} from '../lib/clientPortal';
import { getLocalIsoDate, safeCopyText } from '../lib/appUtils';
import {
  ChatLogItem,
  ClientMilestoneStatus,
  ClientPortalConfig,
  ClientRoadmapMilestone,
  ClientStatusUpdate,
  ClientStatusUpdateCategory,
  CurrencyCode,
  FollowUpItem,
  Prospect,
} from '../types/crm';
import { ClientPreviewPortal } from './ClientPreviewPortal';

interface Props {
  prospects: Prospect[];
  followUps: FollowUpItem[];
  chatLogs: ChatLogItem[];
  selectedProspectId: string;
  onSelectProspectId: (id: string) => void;
  portals: Record<string, ClientPortalConfig>;
  onSavePortal: (prospectId: string, config: ClientPortalConfig) => void;
  currency: CurrencyCode;
  theme: 'light' | 'dark';
  agencyContactName: string;
  agencyContactEmail: string;
  onOpenFullScreenPreview: (prospectId: string) => void;
  onSendPreviewViaGmail: (prospect: Prospect, shareUrl: string) => void;
  onNotify: (msg: string) => void;
}

export const ClientPortalWorkspaceView: React.FC<Props> = ({
  prospects,
  followUps,
  chatLogs,
  selectedProspectId,
  onSelectProspectId,
  portals,
  onSavePortal,
  currency,
  theme,
  agencyContactName,
  agencyContactEmail,
  onOpenFullScreenPreview,
  onSendPreviewViaGmail,
  onNotify,
}) => {
  const [subMode, setSubMode] = useState<'configure' | 'preview'>('preview');
  const [copied, setCopied] = useState(false);

  // New status update form
  const [updTitle, setUpdTitle] = useState('');
  const [updCategory, setUpdCategory] = useState<ClientStatusUpdateCategory>('Update');
  const [updSummary, setUpdSummary] = useState('');

  // New milestone form
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [msPhase, setMsPhase] = useState('');
  const [msTitle, setMsTitle] = useState('');
  const [msDate, setMsDate] = useState(() => getLocalIsoDate());
  const [msSummary, setMsSummary] = useState('');
  const [msDeliverablesText, setMsDeliverablesText] = useState('');

  const activeProspect = useMemo(
    () => prospects.find((p) => p.id === selectedProspectId) || prospects[0],
    [prospects, selectedProspectId]
  );

  const portal = useMemo(() => {
    if (!activeProspect) return null;
    return (
      portals[activeProspect.id] ||
      buildDefaultClientPortal(
        activeProspect,
        followUps,
        chatLogs,
        agencyContactName,
        agencyContactEmail
      )
    );
  }, [activeProspect, portals, followUps, chatLogs, agencyContactName, agencyContactEmail]);

  const snapshot = useMemo(() => {
    if (!activeProspect || !portal) return null;
    return buildClientPreviewSnapshot(activeProspect, portal, currency);
  }, [activeProspect, portal, currency]);

  const shareUrl = useMemo(() => {
    if (!snapshot) return '';
    return buildShareablePreviewUrl(snapshot);
  }, [snapshot]);

  if (!activeProspect || !portal || !snapshot) {
    return (
      <div className="h-full flex items-center justify-center bg-[#F3F4F1] dark:bg-[#0D0E12] text-sm text-[#666A73] dark:text-[#9CA3AF]">
        Add a prospect in the Workbench to configure a read-only Client Preview.
      </div>
    );
  }

  const updatePortal = (patch: Partial<ClientPortalConfig>) => {
    onSavePortal(activeProspect.id, {
      ...portal,
      ...patch,
      lastUpdatedAt: getLocalIsoDate(),
    });
  };

  const handleCopyShareLink = async () => {
    const ok = await safeCopyText(shareUrl);
    if (ok) {
      setCopied(true);
      onNotify(`Copied read-only Client Preview link for ${activeProspect.businessName}`);
      setTimeout(() => setCopied(false), 2200);
    } else {
      onNotify('Share link generated — copy from browser address bar if clipboard is blocked.');
    }
  };

  const handlePublishUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!updTitle.trim() || !updSummary.trim()) return;
    const now = new Date();
    const nextUpdate: ClientStatusUpdate = {
      id: `upd-${Date.now()}`,
      date: getLocalIsoDate(now),
      time: now.toTimeString().slice(0, 5),
      title: updTitle.trim(),
      summary: updSummary.trim(),
      category: updCategory,
      author: portal.agencyContactName || agencyContactName,
    };
    updatePortal({ updates: [nextUpdate, ...portal.updates] });
    setUpdTitle('');
    setUpdSummary('');
    onNotify('Published status update to Client Preview');
  };

  const handleSyncLatestFromCrm = () => {
    const regenerated = buildDefaultClientPortal(
      activeProspect,
      followUps,
      chatLogs,
      portal.agencyContactName || agencyContactName,
      portal.agencyContactEmail || agencyContactEmail
    );
    const existingIds = new Set(portal.updates.map((u) => u.id));
    const newlyMatched = regenerated.updates.filter((u) => !existingIds.has(u.id));
    if (newlyMatched.length === 0) {
      onNotify('Client Preview updates are already synced with latest CRM records.');
      return;
    }
    updatePortal({ updates: [...newlyMatched, ...portal.updates] });
    onNotify(`Synced ${newlyMatched.length} new CRM ${newlyMatched.length === 1 ? 'update' : 'updates'} into Client Preview`);
  };

  const handleResetToDefaults = () => {
    const fresh = buildDefaultClientPortal(
      activeProspect,
      followUps,
      chatLogs,
      agencyContactName,
      agencyContactEmail
    );
    onSavePortal(activeProspect.id, fresh);
    onNotify(`Reset roadmap & updates to live CRM defaults for ${activeProspect.businessName}`);
  };

  const handleCycleMilestoneStatus = (msId: string, nextStatus: ClientMilestoneStatus) => {
    updatePortal({
      milestones: portal.milestones.map((m) =>
        m.id === msId ? { ...m, status: nextStatus } : m
      ),
    });
  };

  const handleDeleteMilestone = (msId: string) => {
    updatePortal({
      milestones: portal.milestones.filter((m) => m.id !== msId),
    });
  };

  const handleAddMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msTitle.trim()) return;
    const deliverables = msDeliverablesText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const created: ClientRoadmapMilestone = {
      id: `ms-${Date.now()}`,
      phaseLabel:
        msPhase.trim() || `Phase ${String(portal.milestones.length + 1).padStart(2, '0')}`,
      title: msTitle.trim(),
      summary: msSummary.trim() || 'Dedicated implementation milestone synced from CRM.',
      deliverables: deliverables.length > 0 ? deliverables : ['Milestone deliverable check-in'],
      status: 'upcoming',
      targetDate: msDate,
    };
    updatePortal({ milestones: [...portal.milestones, created] });
    setMsPhase('');
    setMsTitle('');
    setMsSummary('');
    setMsDeliverablesText('');
    setShowAddMilestone(false);
    onNotify('Added project milestone to Client Preview');
  };

  return (
    <div className="h-full flex flex-col bg-[#F3F4F1] dark:bg-[#0D0E12] text-[#111214] dark:text-[#F4F5F7] overflow-hidden">
      {/* WORKSPACE CONTROL BAR */}
      <div className="shrink-0 bg-white dark:bg-[#111214] border-b border-[#E2E4DF] dark:border-[#23252A] px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-[#6D28D9] dark:text-[#C8B6FF] shrink-0" />
            <span className="text-sm font-display font-bold whitespace-nowrap">
              Client Preview
            </span>
          </div>

          <select
            aria-label="Select prospect for client preview"
            value={activeProspect.id}
            onChange={(e) => onSelectProspectId(e.target.value)}
            className="h-9 bg-[#F3F4F1] dark:bg-[#1D1F24] border border-[#E2E4DF] dark:border-[#2C2F36] rounded-xl px-3 text-xs font-semibold max-w-[260px] truncate cursor-pointer"
          >
            {prospects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.businessName} · {p.city} ({p.stage})
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F3F4F1] dark:bg-[#1D1F24] border border-[#E2E4DF] dark:border-[#2C2F36]">
            <button
              type="button"
              onClick={() => setSubMode('preview')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                subMode === 'preview'
                  ? 'bg-white dark:bg-[#282B35] text-[#111214] dark:text-[#D9F154] shadow-xs'
                  : 'text-[#666A73] dark:text-[#9CA3AF] hover:text-[#111214] dark:hover:text-white'
              }`}
            >
              Read-Only Preview
            </button>
            <button
              type="button"
              onClick={() => setSubMode('configure')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                subMode === 'configure'
                  ? 'bg-white dark:bg-[#282B35] text-[#111214] dark:text-[#D9F154] shadow-xs'
                  : 'text-[#666A73] dark:text-[#9CA3AF] hover:text-[#111214] dark:hover:text-white'
              }`}
            >
              Curate Roadmap & Updates
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyShareLink}
            className="h-9 px-3.5 rounded-xl bg-[#F3F4F1] dark:bg-[#1D1F24] border border-[#E2E4DF] dark:border-[#2C2F36] hover:border-[#111214] dark:hover:border-[#D9F154] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-[#6AE4C0]" />
                <span>Link Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Share Link</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onSendPreviewViaGmail(activeProspect, shareUrl)}
            className="h-9 px-3.5 rounded-xl bg-[#D9F154] text-[#111214] hover:bg-[#e5f876] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Email Client Link</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenFullScreenPreview(activeProspect.id)}
            className="h-9 px-3.5 rounded-xl bg-[#111214] dark:bg-[#252833] dark:border dark:border-[#D9F154]/40 text-[#D9F154] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer hover:opacity-90"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Full-Screen Client View</span>
          </button>
        </div>
      </div>

      {/* CONTENT AREA */}
      {subMode === 'preview' ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ClientPreviewPortal snapshot={snapshot} theme={theme} standalone={false} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-5 lg:p-6">
          <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT: PORTAL SETTINGS + ROADMAP MILESTONES */}
            <div className="lg:col-span-7 space-y-5">
              {/* Portal Overview Configuration */}
              <section className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-display font-bold">
                      Portal Overview & Visibility
                    </h2>
                    <p className="text-xs text-[#666A73] dark:text-[#9CA3AF]">
                      Customize what {activeProspect.businessName} sees on their read-only link.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetToDefaults}
                    className="px-3 py-1.5 rounded-xl bg-[#F3F4F1] dark:bg-[#23262F] text-xs font-semibold flex items-center gap-1.5 hover:bg-[#E5E7E2] dark:hover:bg-[#2E3240] cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset Defaults
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="sm:col-span-2">
                    <label className="font-semibold text-[#555963] dark:text-[#9CA3AF]">
                      Project Goal / Headline Scope
                    </label>
                    <input
                      value={portal.projectGoal}
                      onChange={(e) => updatePortal({ projectGoal: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#F8F9F7] dark:bg-[#1C1F26] px-3 py-2"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="font-semibold text-[#555963] dark:text-[#9CA3AF]">
                      Client Welcome Note
                    </label>
                    <textarea
                      rows={2}
                      value={portal.welcomeNote}
                      onChange={(e) => updatePortal({ welcomeNote: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#F8F9F7] dark:bg-[#1C1F26] px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-[#555963] dark:text-[#9CA3AF]">
                      Delivery Lead Name
                    </label>
                    <input
                      value={portal.agencyContactName}
                      onChange={(e) => updatePortal({ agencyContactName: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#F8F9F7] dark:bg-[#1C1F26] px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-[#555963] dark:text-[#9CA3AF]">
                      Reply Contact Email
                    </label>
                    <input
                      type="email"
                      placeholder="team@clientsology.com"
                      value={portal.agencyContactEmail}
                      onChange={(e) => updatePortal({ agencyContactEmail: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#F8F9F7] dark:bg-[#1C1F26] px-3 py-2"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2.5 pt-2 text-xs font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={portal.showInvestment}
                    onChange={(e) => updatePortal({ showInvestment: e.target.checked })}
                    className="w-4 h-4 rounded accent-[#111214] dark:accent-[#D9F154]"
                  />
                  <span>Display scope investment value on read-only Client Preview</span>
                </label>
              </section>

              {/* Project Roadmap Milestones Builder */}
              <section className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-display font-bold">
                      Project Roadmap Milestones ({portal.milestones.length})
                    </h2>
                    <p className="text-xs text-[#666A73] dark:text-[#9CA3AF]">
                      Toggle milestone progress or edit deliverables shown to the client.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddMilestone((v) => !v)}
                    className="px-3 py-1.5 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Milestone
                  </button>
                </div>

                {showAddMilestone && (
                  <form
                    onSubmit={handleAddMilestone}
                    className="rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#2E3240] p-4 space-y-3 text-xs"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <input
                        placeholder="Phase label (e.g. Phase 05 · Month 2)"
                        value={msPhase}
                        onChange={(e) => setMsPhase(e.target.value)}
                        className="rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-white dark:bg-[#16181E] px-3 py-2"
                      />
                      <input
                        required
                        placeholder="Milestone title *"
                        value={msTitle}
                        onChange={(e) => setMsTitle(e.target.value)}
                        className="rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-white dark:bg-[#16181E] px-3 py-2"
                      />
                      <input
                        type="date"
                        value={msDate}
                        onChange={(e) => setMsDate(e.target.value)}
                        className="rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-white dark:bg-[#16181E] px-3 py-2 font-mono-tabular"
                      />
                    </div>
                    <input
                      placeholder="Short summary for client"
                      value={msSummary}
                      onChange={(e) => setMsSummary(e.target.value)}
                      className="w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-white dark:bg-[#16181E] px-3 py-2"
                    />
                    <textarea
                      rows={2}
                      placeholder="Deliverables (one per line)"
                      value={msDeliverablesText}
                      onChange={(e) => setMsDeliverablesText(e.target.value)}
                      className="w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-white dark:bg-[#16181E] px-3 py-2"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddMilestone(false)}
                        className="px-3 py-1.5 rounded-xl border border-[#D9DBD5] dark:border-[#323643] font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3.5 py-1.5 rounded-xl bg-[#D9F154] text-[#111214] font-semibold cursor-pointer"
                      >
                        Save Milestone
                      </button>
                    </div>
                  </form>
                )}

                <div className="space-y-3">
                  {portal.milestones.map((ms) => (
                    <div
                      key={ms.id}
                      className="rounded-2xl border border-[#E5E7E2] dark:border-[#282B35] bg-[#FAFAF8] dark:bg-[#1C1F26] p-4 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[11px] font-mono-tabular text-[#666A73] dark:text-[#9CA3AF]">
                            {ms.phaseLabel} · Target {ms.targetDate}
                          </div>
                          <div className="text-sm font-bold">{ms.title}</div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {(
                            [
                              { id: 'completed', label: 'Done', Icon: CheckCircle2 },
                              { id: 'in_progress', label: 'Active', Icon: Clock },
                              { id: 'upcoming', label: 'Next', Icon: Circle },
                            ] as const
                          ).map(({ id, label, Icon }) => {
                            const selected = ms.status === id;
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => handleCycleMilestoneStatus(ms.id, id)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                                  selected
                                    ? 'bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214]'
                                    : 'bg-white dark:bg-[#252833] text-[#666A73] dark:text-[#9CA3AF] border border-[#E2E4DF] dark:border-[#323643]'
                                }`}
                              >
                                <Icon className="w-3 h-3" />
                                {label}
                              </button>
                            );
                          })}

                          <button
                            type="button"
                            onClick={() => handleDeleteMilestone(ms.id)}
                            title="Remove Milestone"
                            className="p-1.5 rounded-lg text-[#7A7E87] hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-[#4B505B] dark:text-[#C9CDD4]">{ms.summary}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* RIGHT: PUBLISH & MANAGE STATUS UPDATES */}
            <div className="lg:col-span-5 space-y-5">
              <section className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-display font-bold">
                      Push Status Update from CRM
                    </h2>
                    <p className="text-xs text-[#666A73] dark:text-[#9CA3AF]">
                      Publish updates directly to {activeProspect.businessName}&apos;s read-only view.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSyncLatestFromCrm}
                    className="px-3 py-1.5 rounded-xl bg-[#F3F4F1] dark:bg-[#23262F] text-xs font-semibold flex items-center gap-1.5 hover:bg-[#E5E7E2] dark:hover:bg-[#2E3240] whitespace-nowrap cursor-pointer"
                    title="Pull new outbound messages or scheduled follow-ups from CRM"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Sync CRM
                  </button>
                </div>

                <form onSubmit={handlePublishUpdate} className="space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      required
                      placeholder="Update headline *"
                      value={updTitle}
                      onChange={(e) => setUpdTitle(e.target.value)}
                      className="sm:col-span-2 rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#F8F9F7] dark:bg-[#1C1F26] px-3 py-2"
                    />
                    <select
                      value={updCategory}
                      onChange={(e) =>
                        setUpdCategory(e.target.value as ClientStatusUpdateCategory)
                      }
                      className="rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#F8F9F7] dark:bg-[#1C1F26] px-2.5 py-2 font-semibold"
                    >
                      <option value="Update">Update</option>
                      <option value="Milestone">Milestone</option>
                      <option value="Deliverable">Deliverable</option>
                      <option value="Discovery">Discovery</option>
                    </select>
                  </div>

                  <textarea
                    required
                    rows={3}
                    placeholder="Client-facing progress summary (internal CRM sales notes stay hidden)..."
                    value={updSummary}
                    onChange={(e) => setUpdSummary(e.target.value)}
                    className="w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#F8F9F7] dark:bg-[#1C1F26] px-3 py-2"
                  />

                  <button
                    type="submit"
                    className="w-full h-10 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] font-semibold cursor-pointer hover:opacity-90"
                  >
                    Publish Status Update
                  </button>
                </form>
              </section>

              <section className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-6 space-y-3">
                <h3 className="text-sm font-display font-bold">
                  Published Client Updates ({portal.updates.length})
                </h3>
                <div className="divide-y divide-[#ECEEE8] dark:divide-[#242731] max-h-[380px] overflow-y-auto pr-1">
                  {portal.updates.map((u) => (
                    <div key={u.id} className="py-3 first:pt-1 last:pb-1 flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="text-[11px] font-mono-tabular text-[#666A73] dark:text-[#9CA3AF]">
                          {u.date} · {u.category}
                        </div>
                        <div className="text-xs font-bold">{u.title}</div>
                        <p className="text-xs text-[#4B505B] dark:text-[#C9CDD4] line-clamp-2">
                          {u.summary}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updatePortal({
                            updates: portal.updates.filter((item) => item.id !== u.id),
                          })
                        }
                        className="p-1.5 rounded-lg text-[#7A7E87] hover:text-red-600 dark:hover:text-red-400 shrink-0 cursor-pointer"
                        title="Remove update from preview"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
