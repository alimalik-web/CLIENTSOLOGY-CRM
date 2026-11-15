import React, { useState } from 'react';
import { Calendar, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { formatMoney } from '../data/currency';
import { getLocalIsoDate } from '../lib/appUtils';
import {
  ChatLogItem,
  CurrencyCode,
  FollowUpItem,
  LeadQuality,
  MonthlyGoalRow,
  PipelineStage,
  Prospect,
  WeekBreakdownRow,
  WeeklyGoalMetric,
  WeeklyTaskRow,
} from '../types/crm';

type SheetTab = 'prospects' | 'followups' | 'chatlog' | 'weekly' | 'monthly';

interface Props {
  prospects: Prospect[];
  followUps: FollowUpItem[];
  chatLogs: ChatLogItem[];
  weeklyStartDate: string;
  weeklyTasks: WeeklyTaskRow[];
  weeklyGoalTargets: WeeklyGoalMetric[];
  monthlyGoals: MonthlyGoalRow[];
  weekBreakdown: WeekBreakdownRow[];
  currency: CurrencyCode;
  onUpsertProspect: (p: Prospect) => void;
  onDeleteProspect: (id: string) => void;
  onUpsertFollowUp: (f: FollowUpItem) => void;
  onUpdateWeeklyStartDate: (d: string) => void;
  onUpdateWeeklyTasks: (rows: WeeklyTaskRow[]) => void;
  onUpdateMonthlyGoals: (rows: MonthlyGoalRow[]) => void;
  onUpdateWeekBreakdown: (rows: WeekBreakdownRow[]) => void;
}

export const SpreadsheetGridView: React.FC<Props> = ({
  prospects,
  followUps,
  chatLogs,
  weeklyStartDate,
  weeklyTasks,
  weeklyGoalTargets,
  monthlyGoals,
  weekBreakdown,
  currency,
  onUpsertProspect,
  onDeleteProspect,
  onUpsertFollowUp,
  onUpdateWeeklyStartDate,
  onUpdateWeeklyTasks,
  onUpdateMonthlyGoals,
  onUpdateWeekBreakdown,
}) => {
  const [tab, setTab] = useState<SheetTab>('prospects');

  const addBlankProspect = () => {
    const today = getLocalIsoDate();
    onUpsertProspect({
      id: `p-${Date.now()}`,
      businessName: 'New Prospect Co.',
      contactPerson: 'Owner Name',
      roleTitle: 'Founder',
      email: '',
      phone: '',
      website: '',
      country: 'United States',
      stateOrRegion: 'Texas',
      city: 'Austin',
      categoryNiche: 'HVAC & Plumbing Contractors',
      leadQuality: 'Warm',
      stage: 'New Lead',
      serviceInterest: 'Web Dev + Local SEO',
      ticketUsd: 1500,
      dateAdded: today,
      nextFollowUp: today,
      lastContacted: '',
      lastMessageSent: '',
      replyNotes: '',
      competitorAdvantage: 'Speed + Map Pack SEO',
      status: 'Active',
    });
  };

  const weeklyTotals = {
    outreachTarget: weeklyTasks.reduce((a, b) => a + b.outreachTarget, 0),
    outreachActual: weeklyTasks.reduce((a, b) => a + b.outreachActual, 0),
    callsScheduled: weeklyTasks.reduce((a, b) => a + b.callsScheduled, 0),
    callsDone: weeklyTasks.reduce((a, b) => a + b.callsDone, 0),
    doneCount: weeklyTasks.filter((t) => t.done).length,
  };

  return (
    <div className="h-full overflow-y-auto bg-[#F3F4F1] dark:bg-[#0D0E12] text-[#111214] dark:text-[#F4F5F7] p-5 lg:p-6 space-y-5 transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">
            Editable CRM Sheets & Operations
          </h1>
          <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] mt-0.5">
            Live tabular CRM matching your sales workbook — edit any cell directly; changes persist automatically.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-white dark:bg-[#16181E] p-1.5 rounded-2xl border border-[#E2E4DF] dark:border-[#282B35]">
          {(
            [
              ['prospects', `Prospect Database (${prospects.length})`],
              ['followups', `Follow-Up Queue (${followUps.length})`],
              ['chatlog', `Chat History (${chatLogs.length})`],
              ['weekly', 'Weekly Plan'],
              ['monthly', 'Monthly Goals'],
            ] as [SheetTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                tab === id
                  ? 'bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214]'
                  : 'text-[#555963] dark:text-[#A1A6B3] hover:text-[#111214] dark:hover:text-[#F4F5F7]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: PROSPECT DATABASE */}
      {tab === 'prospects' && (
        <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#EFEFEF] dark:border-[#242731] flex items-center justify-between">
            <span className="text-xs font-semibold text-[#555963] dark:text-[#A1A6B3]">
              Click any cell to edit business, stage, priority, ticket, or follow-up date
            </span>
            <button
              type="button"
              onClick={addBlankProspect}
              className="px-3 py-1.5 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Row
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8F9F7] dark:bg-[#1C1F26] border-b border-[#E5E7E2] dark:border-[#282B35] text-[11px] uppercase text-[#666A73] dark:text-[#9CA3AF]">
                  <th className="py-2.5 px-3">Business</th>
                  <th className="py-2.5 px-3">Contact</th>
                  <th className="py-2.5 px-3">City / Country</th>
                  <th className="py-2.5 px-3">Niche</th>
                  <th className="py-2.5 px-3">Quality</th>
                  <th className="py-2.5 px-3">Stage</th>
                  <th className="py-2.5 px-3">Ticket (USD / {currency})</th>
                  <th className="py-2.5 px-3">Next Follow-Up</th>
                  <th className="py-2.5 px-3">Reply Notes</th>
                  <th className="py-2.5 px-3 text-right">Del</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEF] dark:divide-[#242731]">
                {prospects.map((p) => (
                  <tr key={p.id} className="hover:bg-[#FAFAF8] dark:hover:bg-[#1C1F26]/70">
                    <td className="p-2 min-w-[170px]">
                      <input
                        value={p.businessName}
                        onChange={(e) => onUpsertProspect({ ...p, businessName: e.target.value })}
                        className="w-full bg-transparent px-2 py-1 rounded hover:bg-white dark:hover:bg-[#23262F] focus:bg-white dark:focus:bg-[#23262F] focus:outline-none focus:ring-1 focus:ring-[#111214] dark:focus:ring-[#D9F154] font-semibold"
                      />
                    </td>
                    <td className="p-2 min-w-[140px]">
                      <input
                        value={p.contactPerson}
                        onChange={(e) => onUpsertProspect({ ...p, contactPerson: e.target.value })}
                        className="w-full bg-transparent px-2 py-1 rounded hover:bg-white dark:hover:bg-[#23262F] focus:bg-white dark:focus:bg-[#23262F] focus:outline-none"
                      />
                    </td>
                    <td className="p-2 min-w-[200px] text-[#555963] dark:text-[#A1A6B3]">
                      <div className="flex items-center gap-1">
                        <input
                          value={p.city}
                          placeholder="City"
                          onChange={(e) => onUpsertProspect({ ...p, city: e.target.value })}
                          className="w-1/2 bg-transparent px-2 py-1 rounded hover:bg-white dark:hover:bg-[#23262F] focus:bg-white dark:focus:bg-[#23262F] focus:outline-none focus:ring-1 focus:ring-[#111214] dark:focus:ring-[#D9F154]"
                        />
                        <input
                          value={p.country}
                          placeholder="Country"
                          onChange={(e) => onUpsertProspect({ ...p, country: e.target.value })}
                          className="w-1/2 bg-transparent px-2 py-1 rounded hover:bg-white dark:hover:bg-[#23262F] focus:bg-white dark:focus:bg-[#23262F] focus:outline-none focus:ring-1 focus:ring-[#111214] dark:focus:ring-[#D9F154]"
                        />
                      </div>
                    </td>
                    <td className="p-2 min-w-[160px]">
                      <input
                        value={p.categoryNiche}
                        onChange={(e) => onUpsertProspect({ ...p, categoryNiche: e.target.value })}
                        className="w-full bg-transparent px-2 py-1 rounded hover:bg-white dark:hover:bg-[#23262F] focus:bg-white dark:focus:bg-[#23262F] focus:outline-none"
                      />
                    </td>
                    <td className="p-2">
                      <select
                        value={p.leadQuality}
                        onChange={(e) =>
                          onUpsertProspect({ ...p, leadQuality: e.target.value as LeadQuality })
                        }
                        className="bg-[#F3F4F1] dark:bg-[#23262F] text-[#111214] dark:text-[#F4F5F7] rounded-lg px-2 py-1 font-semibold border border-transparent dark:border-[#323643]"
                      >
                        {(['Hot', 'Warm', 'Cold', 'Dead'] as LeadQuality[]).map((q) => (
                          <option key={q} value={q}>
                            {q}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <select
                        value={p.stage}
                        onChange={(e) =>
                          onUpsertProspect({ ...p, stage: e.target.value as PipelineStage })
                        }
                        className="bg-[#F3F4F1] dark:bg-[#23262F] text-[#111214] dark:text-[#F4F5F7] rounded-lg px-2 py-1 font-semibold border border-transparent dark:border-[#323643]"
                      >
                        {[
                          'New Lead',
                          'Contacted',
                          'Proposal Sent',
                          'Negotiating',
                          'Closed Won',
                          'Closed Lost',
                          'Follow Up',
                        ].map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 min-w-[140px]">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          value={p.ticketUsd}
                          onChange={(e) =>
                            onUpsertProspect({ ...p, ticketUsd: Number(e.target.value) || 0 })
                          }
                          className="w-20 bg-[#F3F4F1] dark:bg-[#23262F] text-[#111214] dark:text-[#F4F5F7] rounded px-2 py-1 font-mono-tabular border border-transparent dark:border-[#323643]"
                        />
                        {currency !== 'USD' && (
                          <span className="text-[11px] text-[#666A73] dark:text-[#9CA3AF] font-mono-tabular">
                            {formatMoney(p.ticketUsd, currency, { compact: true })}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2">
                      <input
                        type="date"
                        value={p.nextFollowUp}
                        onChange={(e) => onUpsertProspect({ ...p, nextFollowUp: e.target.value })}
                        className="bg-transparent px-1 py-1 font-mono-tabular text-[#111214] dark:text-[#F4F5F7]"
                      />
                    </td>
                    <td className="p-2 min-w-[200px]">
                      <input
                        value={p.replyNotes}
                        onChange={(e) => onUpsertProspect({ ...p, replyNotes: e.target.value })}
                        className="w-full bg-transparent px-2 py-1 rounded hover:bg-white dark:hover:bg-[#23262F] focus:bg-white dark:focus:bg-[#23262F] focus:outline-none"
                      />
                    </td>
                    <td className="p-2 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteProspect(p.id)}
                        className="p-1.5 text-[#9A9FA8] hover:text-red-500 cursor-pointer"
                        title="Delete Row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: FOLLOW-UP QUEUE */}
      {tab === 'followups' && (
        <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F8F9F7] dark:bg-[#1C1F26] border-b border-[#E5E7E2] dark:border-[#282B35] text-[11px] uppercase text-[#666A73] dark:text-[#9CA3AF]">
                <th className="py-2.5 px-3">Done</th>
                <th className="py-2.5 px-3">Prospect</th>
                <th className="py-2.5 px-3">Date & Time</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Priority</th>
                <th className="py-2.5 px-3">Script</th>
                <th className="py-2.5 px-3">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEFEF] dark:divide-[#242731]">
              {followUps.map((f) => (
                <tr key={f.id} className="hover:bg-[#FAFAF8] dark:hover:bg-[#1C1F26]/70">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={f.done}
                      onChange={(e) => onUpsertFollowUp({ ...f, done: e.target.checked })}
                      className="w-4 h-4 accent-[#111214] dark:accent-[#D9F154]"
                    />
                  </td>
                  <td className="p-2 font-semibold min-w-[160px]">{f.businessName}</td>
                  <td className="p-2 font-mono-tabular whitespace-nowrap">
                    {f.followUpDate} {f.followUpTime}
                  </td>
                  <td className="p-2 min-w-[140px]">{f.followUpType}</td>
                  <td className="p-2">{f.priority}</td>
                  <td className="p-2 min-w-[260px]">
                    <input
                      value={f.messageScript}
                      onChange={(e) => onUpsertFollowUp({ ...f, messageScript: e.target.value })}
                      className="w-full bg-transparent px-2 py-1 rounded hover:bg-white dark:hover:bg-[#23262F] focus:bg-white dark:focus:bg-[#23262F] focus:outline-none"
                    />
                  </td>
                  <td className="p-2 min-w-[160px]">
                    <input
                      value={f.outcome}
                      onChange={(e) => onUpsertFollowUp({ ...f, outcome: e.target.value })}
                      className="w-full bg-transparent px-2 py-1 rounded hover:bg-white dark:hover:bg-[#23262F] focus:bg-white dark:focus:bg-[#23262F] focus:outline-none"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: CHAT HISTORY LOG */}
      {tab === 'chatlog' && (
        <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F8F9F7] dark:bg-[#1C1F26] border-b border-[#E5E7E2] dark:border-[#282B35] text-[11px] uppercase text-[#666A73] dark:text-[#9CA3AF]">
                <th className="py-2.5 px-3">Date / Time</th>
                <th className="py-2.5 px-3">Business</th>
                <th className="py-2.5 px-3">Channel</th>
                <th className="py-2.5 px-3">Direction</th>
                <th className="py-2.5 px-3">Message Content</th>
                <th className="py-2.5 px-3">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEFEF] dark:divide-[#242731]">
              {chatLogs.map((c) => (
                <tr key={c.id} className="hover:bg-[#FAFAF8] dark:hover:bg-[#1C1F26]/70">
                  <td className="p-3 font-mono-tabular whitespace-nowrap">
                    {c.date} {c.time}
                  </td>
                  <td className="p-3 font-semibold">{c.businessName}</td>
                  <td className="p-3">{c.channel}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        c.direction === 'Inbound'
                          ? 'bg-[#D9F154] text-[#111214]'
                          : 'bg-[#E5E7E2] dark:bg-[#252833] text-[#111214] dark:text-[#E5E7E2]'
                      }`}
                    >
                      {c.direction}
                    </span>
                  </td>
                  <td className="p-3 max-w-md">{c.messageContent}</td>
                  <td className="p-3 text-[#666A73] dark:text-[#9CA3AF]">{c.responseSummary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: WEEKLY IMPLEMENTATION PLAN */}
      {tab === 'weekly' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-[#111214] dark:text-[#D9F154]" />
              <div>
                <div className="text-xs font-semibold text-[#666A73] dark:text-[#9CA3AF]">Week Starting (Auto-fills Mon–Sun)</div>
                <input
                  type="date"
                  value={weeklyStartDate}
                  onChange={(e) => onUpdateWeeklyStartDate(e.target.value)}
                  className="mt-1 rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] px-3 py-1.5 text-xs font-mono-tabular"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6 text-xs">
              <div>
                <div className="text-[#666A73] dark:text-[#9CA3AF]">Outreach Progress</div>
                <div className="text-lg font-bold font-mono-tabular">
                  {weeklyTotals.outreachActual} / {weeklyTotals.outreachTarget}
                </div>
              </div>
              <div>
                <div className="text-[#666A73] dark:text-[#9CA3AF]">Calls Done</div>
                <div className="text-lg font-bold font-mono-tabular">
                  {weeklyTotals.callsDone} / {weeklyTotals.callsScheduled}
                </div>
              </div>
              <div>
                <div className="text-[#666A73] dark:text-[#9CA3AF]">Days Completed</div>
                <div className="text-lg font-bold font-mono-tabular">
                  {weeklyTotals.doneCount} / 7 ({Math.round((weeklyTotals.doneCount / 7) * 100)}%)
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {weeklyGoalTargets.map((g) => (
              <div key={g.id} className="bg-white dark:bg-[#16181E] rounded-2xl border border-[#E2E4DF] dark:border-[#282B35] p-4">
                <div className="text-xs text-[#666A73] dark:text-[#9CA3AF]">{g.label}</div>
                <div className="text-2xl font-display font-bold font-mono-tabular mt-1">
                  {g.target}
                </div>
                <div className="text-[11px] text-[#7A7E87] dark:text-[#8E93A0] mt-1">{g.helper}</div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8F9F7] dark:bg-[#1C1F26] border-b border-[#E5E7E2] dark:border-[#282B35] text-[11px] uppercase text-[#666A73] dark:text-[#9CA3AF]">
                  <th className="py-2.5 px-3">Day</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Morning Sprint</th>
                  <th className="py-2.5 px-3">Afternoon Sprint</th>
                  <th className="py-2.5 px-3">Outreach (Act / Tgt)</th>
                  <th className="py-2.5 px-3">Calls (Done / Sched)</th>
                  <th className="py-2.5 px-3">Done</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEF] dark:divide-[#242731]">
                {weeklyTasks.map((row, idx) => (
                  <tr key={row.day} className="hover:bg-[#FAFAF8] dark:hover:bg-[#1C1F26]/70">
                    <td className="p-3 font-semibold">{row.day}</td>
                    <td className="p-3 font-mono-tabular whitespace-nowrap">{row.date}</td>
                    <td className="p-2 min-w-[220px]">
                      <input
                        value={row.morningTask}
                        onChange={(e) => {
                          const next = [...weeklyTasks];
                          next[idx] = { ...row, morningTask: e.target.value };
                          onUpdateWeeklyTasks(next);
                        }}
                        className="w-full bg-transparent px-2 py-1 rounded hover:bg-white dark:hover:bg-[#23262F] focus:bg-white dark:focus:bg-[#23262F] focus:outline-none"
                      />
                    </td>
                    <td className="p-2 min-w-[220px]">
                      <input
                        value={row.afternoonTask}
                        onChange={(e) => {
                          const next = [...weeklyTasks];
                          next[idx] = { ...row, afternoonTask: e.target.value };
                          onUpdateWeeklyTasks(next);
                        }}
                        className="w-full bg-transparent px-2 py-1 rounded hover:bg-white dark:hover:bg-[#23262F] focus:bg-white dark:focus:bg-[#23262F] focus:outline-none"
                      />
                    </td>
                    <td className="p-2 font-mono-tabular whitespace-nowrap">
                      <input
                        type="number"
                        value={row.outreachActual}
                        onChange={(e) => {
                          const next = [...weeklyTasks];
                          next[idx] = { ...row, outreachActual: Number(e.target.value) || 0 };
                          onUpdateWeeklyTasks(next);
                        }}
                        className="w-12 bg-[#F3F4F1] dark:bg-[#23262F] rounded px-1.5 py-1 text-center"
                      />{' '}
                      / {row.outreachTarget}
                    </td>
                    <td className="p-2 font-mono-tabular whitespace-nowrap">
                      <input
                        type="number"
                        value={row.callsDone}
                        onChange={(e) => {
                          const next = [...weeklyTasks];
                          next[idx] = { ...row, callsDone: Number(e.target.value) || 0 };
                          onUpdateWeeklyTasks(next);
                        }}
                        className="w-12 bg-[#F3F4F1] dark:bg-[#23262F] rounded px-1.5 py-1 text-center"
                      />{' '}
                      / {row.callsScheduled}
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...weeklyTasks];
                          next[idx] = { ...row, done: !row.done };
                          onUpdateWeeklyTasks(next);
                        }}
                        className={`p-1.5 rounded-lg cursor-pointer ${
                          row.done
                            ? 'bg-[#D9F154] text-[#111214]'
                            : 'bg-[#F3F4F1] dark:bg-[#23262F] text-[#9A9FA8]'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: MONTHLY GOALS & 4-WEEK BREAKDOWN */}
      {tab === 'monthly' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 space-y-3">
            <h2 className="text-base font-display font-bold">Monthly Targets vs Actuals</h2>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5E7E2] dark:border-[#282B35] text-[11px] uppercase text-[#666A73] dark:text-[#9CA3AF]">
                  <th className="py-2">Metric</th>
                  <th className="py-2">Goal</th>
                  <th className="py-2">Actual</th>
                  <th className="py-2">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEF] dark:divide-[#242731]">
                {monthlyGoals.map((g, idx) => {
                  const pct = g.goal > 0 ? Math.round((g.actual / g.goal) * 100) : 0;
                  return (
                    <tr key={g.id}>
                      <td className="py-2.5 font-semibold">{g.metric}</td>
                      <td className="py-2">
                        <input
                          type="number"
                          value={g.goal}
                          onChange={(e) => {
                            const next = [...monthlyGoals];
                            next[idx] = { ...g, goal: Number(e.target.value) || 0 };
                            onUpdateMonthlyGoals(next);
                          }}
                          className="w-24 bg-[#F3F4F1] dark:bg-[#23262F] rounded px-2 py-1 font-mono-tabular"
                        />
                        {g.isCurrency && currency !== 'USD' && (
                          <div className="text-[10px] text-[#666A73] dark:text-[#9CA3AF] font-mono-tabular">
                            {formatMoney(g.goal, currency)}
                          </div>
                        )}
                      </td>
                      <td className="py-2">
                        <input
                          type="number"
                          value={g.actual}
                          onChange={(e) => {
                            const next = [...monthlyGoals];
                            next[idx] = { ...g, actual: Number(e.target.value) || 0 };
                            onUpdateMonthlyGoals(next);
                          }}
                          className="w-24 bg-[#F3F4F1] dark:bg-[#23262F] rounded px-2 py-1 font-mono-tabular"
                        />
                      </td>
                      <td className="py-2 font-mono-tabular font-bold">
                        <span className={pct >= 100 ? 'text-emerald-700 dark:text-[#6AE4C0]' : 'text-[#111214] dark:text-[#F4F5F7]'}>
                          {pct}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 space-y-3">
            <h2 className="text-base font-display font-bold">4-Week Execution Breakdown</h2>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5E7E2] dark:border-[#282B35] text-[11px] uppercase text-[#666A73] dark:text-[#9CA3AF]">
                  <th className="py-2">Week</th>
                  <th className="py-2">Outreach</th>
                  <th className="py-2">Calls</th>
                  <th className="py-2">Props</th>
                  <th className="py-2">Closed</th>
                  <th className="py-2">Revenue ({currency})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEF] dark:divide-[#242731]">
                {weekBreakdown.map((w, idx) => (
                  <tr key={w.week}>
                    <td className="py-2.5 font-semibold">{w.week}</td>
                    <td className="py-2">
                      <input
                        type="number"
                        value={w.outreachSent}
                        onChange={(e) => {
                          const next = [...weekBreakdown];
                          next[idx] = { ...w, outreachSent: Number(e.target.value) || 0 };
                          onUpdateWeekBreakdown(next);
                        }}
                        className="w-16 bg-[#F3F4F1] dark:bg-[#23262F] rounded px-2 py-1 font-mono-tabular"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        value={w.callsDone}
                        onChange={(e) => {
                          const next = [...weekBreakdown];
                          next[idx] = { ...w, callsDone: Number(e.target.value) || 0 };
                          onUpdateWeekBreakdown(next);
                        }}
                        className="w-14 bg-[#F3F4F1] dark:bg-[#23262F] rounded px-2 py-1 font-mono-tabular"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        value={w.proposals}
                        onChange={(e) => {
                          const next = [...weekBreakdown];
                          next[idx] = { ...w, proposals: Number(e.target.value) || 0 };
                          onUpdateWeekBreakdown(next);
                        }}
                        className="w-14 bg-[#F3F4F1] dark:bg-[#23262F] rounded px-2 py-1 font-mono-tabular"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        value={w.clientsClosed}
                        onChange={(e) => {
                          const next = [...weekBreakdown];
                          next[idx] = { ...w, clientsClosed: Number(e.target.value) || 0 };
                          onUpdateWeekBreakdown(next);
                        }}
                        className="w-14 bg-[#F3F4F1] dark:bg-[#23262F] rounded px-2 py-1 font-mono-tabular"
                      />
                    </td>
                    <td className="py-2 font-mono-tabular font-semibold">
                      {formatMoney(w.revenueUsd, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
