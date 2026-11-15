import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  Mail,
  Moon,
  Sun,
} from 'lucide-react';
import { formatMoney } from '../data/currency';
import { ensureHttpUrl } from '../lib/appUtils';
import { getClientStageDisplay } from '../lib/clientPortal';
import {
  ClientMilestoneStatus,
  ClientPreviewSnapshot,
  ClientStatusUpdateCategory,
} from '../types/crm';
import { ClientsologyLogo } from './ClientsologyLogo';

interface ClientPreviewPortalProps {
  snapshot: ClientPreviewSnapshot;
  theme: 'light' | 'dark';
  onToggleTheme?: () => void;
  standalone?: boolean;
  isExternalShare?: boolean;
  onExitPreview?: () => void;
}

type MilestoneFilter = 'all' | 'active' | 'completed';
type UpdateFilter = 'all' | ClientStatusUpdateCategory;

const MILESTONE_STATUS_DISPLAY: Record<
  ClientMilestoneStatus,
  { label: string; textClass: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  completed: {
    label: 'Completed',
    textClass: 'text-emerald-700 dark:text-[#6AE4C0]',
    Icon: CheckCircle2,
  },
  in_progress: {
    label: 'In Progress',
    textClass: 'text-[#6D28D9] dark:text-[#C8B6FF]',
    Icon: Clock,
  },
  upcoming: {
    label: 'Upcoming',
    textClass: 'text-[#666A73] dark:text-[#9CA3AF]',
    Icon: Circle,
  },
};

export const ClientPreviewPortal: React.FC<ClientPreviewPortalProps> = ({
  snapshot,
  theme,
  onToggleTheme,
  standalone = true,
  isExternalShare = false,
  onExitPreview,
}) => {
  const [milestoneFilter, setMilestoneFilter] = useState<MilestoneFilter>('all');
  const [updateFilter, setUpdateFilter] = useState<UpdateFilter>('all');

  const { prospect, portal, currency } = snapshot;
  const stageInfo = getClientStageDisplay(prospect.stage);

  const completedCount = useMemo(
    () => portal.milestones.filter((m) => m.status === 'completed').length,
    [portal.milestones]
  );
  const totalMilestones = portal.milestones.length;
  const progressPct = totalMilestones > 0 ? Math.round((completedCount / totalMilestones) * 100) : 0;

  const filteredMilestones = useMemo(() => {
    if (milestoneFilter === 'completed') {
      return portal.milestones.filter((m) => m.status === 'completed');
    }
    if (milestoneFilter === 'active') {
      return portal.milestones.filter((m) => m.status !== 'completed');
    }
    return portal.milestones;
  }, [portal.milestones, milestoneFilter]);

  const filteredUpdates = useMemo(() => {
    if (updateFilter === 'all') return portal.updates;
    return portal.updates.filter((u) => u.category === updateFilter);
  }, [portal.updates, updateFilter]);

  const nextMilestone = useMemo(
    () =>
      portal.milestones.find((m) => m.status === 'in_progress') ||
      portal.milestones.find((m) => m.status === 'upcoming') ||
      portal.milestones[portal.milestones.length - 1],
    [portal.milestones]
  );

  const nextTargetDate = prospect.nextFollowUp || nextMilestone?.targetDate || 'On schedule';

  return (
    <div
      className={`${
        standalone ? 'h-screen w-screen overflow-y-auto' : 'h-full overflow-y-auto'
      } bg-[#F3F4F1] dark:bg-[#0D0E12] text-[#111214] dark:text-[#F4F5F7] transition-colors duration-150`}
    >
      {/* STANDALONE TOP BAR (clean 3-zone header contract) */}
      {standalone && (
        <header className="sticky top-0 z-30 h-14 bg-white/95 dark:bg-[#111214]/95 backdrop-blur-sm border-b border-[#E2E4DF] dark:border-[#23252A] px-5 lg:px-8 flex items-center justify-between gap-6">
          <ClientsologyLogo theme={theme} className="h-7 w-auto shrink-0" />

          <div className="hidden md:flex items-center gap-3 text-xs text-[#666A73] dark:text-[#9CA3AF] whitespace-nowrap">
            <span>Read-only client preview</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">Synced {portal.lastUpdatedAt}</span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                className="h-9 px-3 rounded-xl bg-[#F3F4F1] dark:bg-[#1D1F24] border border-[#E2E4DF] dark:border-[#2C2F36] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer hover:border-[#111214] dark:hover:border-[#D9F154] transition-colors"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-[#D9F154]" />
                    <span className="hidden sm:inline">Light</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-[#6D28D9]" />
                    <span className="hidden sm:inline">Dark</span>
                  </>
                )}
              </button>
            )}

            {!isExternalShare && onExitPreview ? (
              <button
                type="button"
                onClick={onExitPreview}
                className="h-9 px-4 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer hover:opacity-90 transition-opacity"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Return to CRM
              </button>
            ) : portal.agencyContactEmail ? (
              <a
                href={`mailto:${portal.agencyContactEmail}?subject=${encodeURIComponent(
                  `${prospect.businessName} — Project Roadmap Question`
                )}`}
                className="h-9 px-4 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap hover:opacity-90 transition-opacity"
              >
                <Mail className="w-3.5 h-3.5" />
                Contact Team
              </a>
            ) : null}
          </div>
        </header>
      )}

      {/* PORTAL BODY */}
      <div className="max-w-[1200px] mx-auto px-5 lg:px-8 py-6 lg:py-8 space-y-6">
        {/* CLIENT PROJECT HEADER */}
        <section className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-6 lg:p-8 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
            <div className="space-y-2.5 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#666A73] dark:text-[#9CA3AF]">
                <span>Prepared for {prospect.contactPerson || prospect.businessName}</span>
                {prospect.roleTitle && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{prospect.roleTitle}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span>
                  {[prospect.city, prospect.country].filter(Boolean).join(', ')}
                </span>
                <span aria-hidden="true">·</span>
                <span>{prospect.categoryNiche}</span>
              </div>

              <h1 className="text-2xl lg:text-4xl font-display font-bold tracking-tight text-[#111214] dark:text-[#F4F5F7]">
                {prospect.businessName}
              </h1>

              <p className="text-sm font-medium text-[#2B2E36] dark:text-[#E5E7EB]">
                {portal.projectGoal || prospect.serviceInterest}
              </p>

              <p className="text-xs lg:text-sm leading-relaxed text-[#555963] dark:text-[#9CA3AF]">
                {portal.welcomeNote}
              </p>
            </div>

            {prospect.website && ensureHttpUrl(prospect.website) && (
              <a
                href={ensureHttpUrl(prospect.website)}
                target="_blank"
                rel="noreferrer"
                className="self-start h-9 px-3.5 rounded-xl bg-[#F3F4F1] dark:bg-[#1E212B] border border-[#E2E4DF] dark:border-[#323643] text-xs font-semibold text-[#111214] dark:text-[#F4F5F7] hover:border-[#111214] dark:hover:border-[#D9F154] flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <span>{prospect.website.replace(/^https?:\/\//, '')}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          {/* 4-COLUMN SUMMARY STRIP */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-4 border-t border-[#ECEEE8] dark:border-[#242731]">
            <div className="rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#ECEEE8] dark:border-[#282B35] p-4">
              <div className="text-xs text-[#666A73] dark:text-[#9CA3AF]">Current Stage</div>
              <div className="mt-1 text-sm font-display font-bold text-[#111214] dark:text-[#F4F5F7]">
                {stageInfo.label}
              </div>
              <div className="mt-1 text-[11px] text-[#555963] dark:text-[#9CA3AF]">
                {stageInfo.description}
              </div>
            </div>

            <div className="rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#ECEEE8] dark:border-[#282B35] p-4">
              <div className="text-xs text-[#666A73] dark:text-[#9CA3AF]">Roadmap Progress</div>
              <div className="mt-1 text-xl font-display font-bold font-mono-tabular text-[#111214] dark:text-[#D9F154]">
                {progressPct}% Complete
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-[#E2E4DF] dark:bg-[#2A2D39] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#111214] dark:bg-[#D9F154] transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="mt-1.5 text-[11px] font-mono-tabular text-[#555963] dark:text-[#9CA3AF]">
                {completedCount} of {totalMilestones} phases completed
              </div>
            </div>

            <div className="rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#ECEEE8] dark:border-[#282B35] p-4">
              <div className="text-xs text-[#666A73] dark:text-[#9CA3AF]">Next Checkpoint</div>
              <div className="mt-1 text-sm font-display font-bold font-mono-tabular text-[#111214] dark:text-[#F4F5F7] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#6D28D9] dark:text-[#C8B6FF] shrink-0" />
                <span>{nextTargetDate}</span>
              </div>
              <div className="mt-1 text-[11px] text-[#555963] dark:text-[#9CA3AF] truncate">
                {nextMilestone ? nextMilestone.title : 'Schedule aligned'}
              </div>
            </div>

            <div className="rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#ECEEE8] dark:border-[#282B35] p-4">
              {portal.showInvestment && prospect.ticketUsd > 0 ? (
                <>
                  <div className="text-xs text-[#666A73] dark:text-[#9CA3AF]">Scope Investment</div>
                  <div className="mt-1 text-xl font-display font-bold font-mono-tabular text-[#111214] dark:text-[#F4F5F7]">
                    {formatMoney(prospect.ticketUsd, currency)}
                  </div>
                  <div className="mt-1 text-[11px] text-[#555963] dark:text-[#9CA3AF] truncate">
                    {prospect.serviceInterest}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs text-[#666A73] dark:text-[#9CA3AF]">Portal Access</div>
                  <div className="mt-1 text-sm font-display font-bold text-[#111214] dark:text-[#F4F5F7]">
                    Read-Only View
                  </div>
                  <div className="mt-1 text-[11px] font-mono-tabular text-[#555963] dark:text-[#9CA3AF]">
                    Updated {portal.lastUpdatedAt}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* MAIN 2-COLUMN CONTENT: PROJECT ROADMAP (7) + STATUS UPDATES (5) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT: PROJECT ROADMAP */}
          <section className="lg:col-span-7 bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-display font-bold text-[#111214] dark:text-[#F4F5F7]">
                  Project Roadmap & Deliverables
                </h2>
                <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] mt-0.5">
                  Phased implementation milestones and deliverable checkpoints.
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F3F4F1] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#282B35]">
                {(
                  [
                    { id: 'all', label: 'All Phases' },
                    { id: 'active', label: 'Active' },
                    { id: 'completed', label: 'Completed' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMilestoneFilter(tab.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      milestoneFilter === tab.id
                        ? 'bg-white dark:bg-[#282B35] text-[#111214] dark:text-[#D9F154] shadow-xs'
                        : 'text-[#666A73] dark:text-[#9CA3AF] hover:text-[#111214] dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3.5">
              {filteredMilestones.map((ms, index) => {
                const statusInfo = MILESTONE_STATUS_DISPLAY[ms.status];
                const StatusIcon = statusInfo.Icon;
                const isComplete = ms.status === 'completed';
                const isActive = ms.status === 'in_progress';

                return (
                  <article
                    key={ms.id}
                    className={`rounded-2xl border p-5 transition-colors ${
                      isActive
                        ? 'bg-[#FAFAF8] dark:bg-[#1B1E28] border-[#C8B6FF] dark:border-[#C8B6FF]/50'
                        : 'bg-white dark:bg-[#16181E] border-[#E5E7E2] dark:border-[#282B35]'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#666A73] dark:text-[#9CA3AF] font-mono-tabular">
                          <span>{ms.phaseLabel}</span>
                          {ms.targetDate && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>Target {ms.targetDate}</span>
                            </>
                          )}
                        </div>
                        <h3 className="text-base font-display font-bold text-[#111214] dark:text-[#F4F5F7]">
                          {String(index + 1).padStart(2, '0')}. {ms.title}
                        </h3>
                      </div>

                      <div
                        className={`flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap shrink-0 ${statusInfo.textClass}`}
                      >
                        <StatusIcon className="w-4 h-4" />
                        <span>{statusInfo.label}</span>
                      </div>
                    </div>

                    <p className="mt-2 text-xs leading-relaxed text-[#4B505B] dark:text-[#C9CDD4]">
                      {ms.summary}
                    </p>

                    {ms.deliverables.length > 0 && (
                      <ul className="mt-3.5 pt-3.5 border-t border-[#ECEEE8] dark:border-[#242731] space-y-2">
                        {ms.deliverables.map((deliv, dIdx) => (
                          <li
                            key={`${ms.id}-deliv-${dIdx}`}
                            className="flex items-start gap-2.5 text-xs text-[#2B2E36] dark:text-[#E5E7EB]"
                          >
                            <span
                              className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                                isComplete
                                  ? 'bg-[#D9F154] text-[#111214]'
                                  : 'bg-[#F3F4F1] dark:bg-[#23262F] text-[#666A73] dark:text-[#9CA3AF]'
                              }`}
                            >
                              <Check className="w-2.5 h-2.5" />
                            </span>
                            <span>{deliv}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                );
              })}

              {filteredMilestones.length === 0 && (
                <div className="rounded-2xl border border-dashed border-[#D9DBD5] dark:border-[#323643] p-8 text-center text-xs text-[#666A73] dark:text-[#9CA3AF]">
                  No milestones match the selected filter.
                </div>
              )}
            </div>
          </section>

          {/* RIGHT: STATUS UPDATES SHARED FROM CRM */}
          <aside className="lg:col-span-5 space-y-5">
            <section className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-6 space-y-4">
              <div className="space-y-3">
                <div>
                  <h2 className="text-lg font-display font-bold text-[#111214] dark:text-[#F4F5F7]">
                    Live Status Updates
                  </h2>
                  <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] mt-0.5">
                    Chronological progress notes shared directly from the CRM.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#F3F4F1] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#282B35]">
                  {(['all', 'Milestone', 'Deliverable', 'Discovery', 'Update'] as const).map(
                    (cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setUpdateFilter(cat)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                          updateFilter === cat
                            ? 'bg-white dark:bg-[#282B35] text-[#111214] dark:text-[#D9F154] shadow-xs'
                            : 'text-[#666A73] dark:text-[#9CA3AF] hover:text-[#111214] dark:hover:text-white'
                        }`}
                      >
                        {cat === 'all' ? 'All' : cat}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="divide-y divide-[#ECEEE8] dark:divide-[#242731]">
                {filteredUpdates.map((upd) => (
                  <article key={upd.id} className="py-4 first:pt-1 last:pb-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono-tabular text-[#666A73] dark:text-[#9CA3AF]">
                      <span>{upd.date}</span>
                      {upd.time && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{upd.time}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="font-sans font-semibold text-[#111214] dark:text-[#C8B6FF]">
                        {upd.category}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-[#111214] dark:text-[#F4F5F7]">
                      {upd.title}
                    </h3>

                    <p className="text-xs leading-relaxed text-[#4B505B] dark:text-[#C9CDD4]">
                      {upd.summary}
                    </p>

                    <div className="text-[11px] text-[#7A7E87] dark:text-[#8E94A2]">
                      Shared by {upd.author}
                    </div>
                  </article>
                ))}

                {filteredUpdates.length === 0 && (
                  <div className="py-8 text-center text-xs text-[#666A73] dark:text-[#9CA3AF]">
                    No status updates published for this category yet.
                  </div>
                )}
              </div>
            </section>

            {/* DEDICATED ACCOUNT CONTACT CARD */}
            <section className="bg-[#111214] dark:bg-[#1B1E28] text-white rounded-3xl border border-[#23252A] dark:border-[#2E3240] p-6 space-y-3">
              <div className="text-xs text-[#9CA3AF]">Delivery Contact</div>
              <div className="text-base font-display font-bold text-[#F4F5F7]">
                {portal.agencyContactName || 'Clientsology Growth Team'}
              </div>
              <p className="text-xs text-[#C9CDD4] leading-relaxed">
                This portal reflects live roadmap milestones and status updates synced from Clientsology. Need an adjustment to scope or timing? Reach out directly to your delivery lead.
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs border-t border-white/10">
                <span className="font-mono-tabular text-[#9CA3AF]">
                  Last updated {portal.lastUpdatedAt}
                </span>
                {portal.agencyContactEmail && (
                  <a
                    href={`mailto:${portal.agencyContactEmail}?subject=${encodeURIComponent(
                      `${prospect.businessName} — Project Portal Feedback`
                    )}`}
                    className="font-semibold text-[#D9F154] hover:underline flex items-center gap-1"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    {portal.agencyContactEmail}
                  </a>
                )}
              </div>
            </section>
          </aside>
        </div>

        {/* QUIET FOOTER */}
        <footer className="pt-2 pb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#666A73] dark:text-[#8E94A2]">
          <span>Clientsology · Client Project Portal</span>
          <span className="font-mono-tabular">Read-only view for {prospect.businessName}</span>
        </footer>
      </div>
    </div>
  );
};
