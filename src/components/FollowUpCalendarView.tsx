import React, { useState } from 'react';
import { CalendarPlus, Check, Copy } from 'lucide-react';
import { FOLLOW_UP_TEMPLATES } from '../data/seedCrmData';
import { safeCopyText } from '../lib/appUtils';
import { FollowUpItem, Prospect } from '../types/crm';

interface Props {
  followUps: FollowUpItem[];
  prospects: Prospect[];
  onUpsertFollowUp: (item: FollowUpItem) => void;
  onBookCalendarForFollowUp: (item: FollowUpItem, prospect?: Prospect) => void;
}

export const FollowUpCalendarView: React.FC<Props> = ({
  followUps,
  prospects,
  onUpsertFollowUp,
  onBookCalendarForFollowUp,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (id: string, text: string) => {
    const ok = await safeCopyText(text);
    if (ok) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#F3F4F1] dark:bg-[#0D0E12] text-[#111214] dark:text-[#F4F5F7] p-5 lg:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">
          Follow-Up Tracker & Google Calendar Booking
        </h1>
        <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] mt-0.5">
          Execute the 48h → 5-Day → 10-Day → 30-Day follow-up cadence and schedule discovery calls straight to Google Calendar.
        </p>
      </div>

      {/* Follow-Up Queue */}
      <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 space-y-3">
        <h2 className="text-base font-display font-bold">Active Follow-Up Queue</h2>
        <div className="space-y-2.5">
          {followUps.map((f) => {
            const matchedProspect = prospects.find((p) => p.id === f.prospectId);
            return (
              <div
                key={f.id}
                className="rounded-2xl border border-[#E5E7E2] dark:border-[#282B35] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#FAFAF8] dark:bg-[#1C1F26]"
              >
                <div className="space-y-1 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onUpsertFollowUp({ ...f, done: !f.done })}
                      className={`w-5 h-5 rounded-md flex items-center justify-center border cursor-pointer ${
                        f.done
                          ? 'bg-[#D9F154] border-[#111214] text-[#111214]'
                          : 'bg-white dark:bg-[#23262F] border-[#C4C7CE] dark:border-[#3A3E4C]'
                      }`}
                    >
                      {f.done && <Check className="w-3.5 h-3.5" />}
                    </button>
                    <span className="font-bold text-sm">{f.businessName}</span>
                    <span className="text-xs text-[#666A73] dark:text-[#9CA3AF]">
                      · {f.followUpType} · {f.followUpDate} {f.followUpTime}
                    </span>
                  </div>
                  <p className="text-xs text-[#3D404A] dark:text-[#C9CDD4] pl-7">{f.messageScript}</p>
                  <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF] pl-7">
                    Outcome: {f.outcome || 'Pending'} · Next Step: {f.nextStep || 'TBD'}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopy(f.id, f.messageScript)}
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#23262F] border border-[#D9DBD5] dark:border-[#323643] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedId === f.id ? 'Copied' : 'Copy Script'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onBookCalendarForFollowUp(f, matchedProspect)}
                    className="px-3 py-1.5 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <CalendarPlus className="w-3.5 h-3.5" />
                    Schedule in Calendar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5 Cadence Templates */}
      <div className="space-y-3">
        <h2 className="text-base font-display font-bold">5 Proven Follow-Up Cadence Templates</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {FOLLOW_UP_TEMPLATES.map((tpl) => (
            <div
              key={tpl.id}
              className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-display font-bold">{tpl.label}</h3>
                  <span className="text-[11px] font-mono-tabular font-semibold text-[#666A73] dark:text-[#9CA3AF]">
                    {tpl.timing}
                  </span>
                </div>
                <p className="text-xs text-[#3D404A] dark:text-[#C9CDD4] mt-2 leading-relaxed">{tpl.script}</p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(tpl.id, tpl.script)}
                className="self-start px-3 py-1.5 rounded-xl bg-[#F3F4F1] dark:bg-[#23262F] hover:bg-[#D9F154] hover:text-[#111214] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedId === tpl.id ? 'Copied!' : 'Copy Template'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
