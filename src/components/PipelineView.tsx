import React from 'react';
import { ArrowRight, Eye } from 'lucide-react';
import { formatMoney } from '../data/currency';
import { CurrencyCode, PipelineStage, Prospect } from '../types/crm';

const STAGES: { stage: PipelineStage; accent: string }[] = [
  { stage: 'New Lead', accent: 'bg-[#E5E7E2]' },
  { stage: 'Contacted', accent: 'bg-[#B3E5FC]' },
  { stage: 'Proposal Sent', accent: 'bg-[#C8B6FF]' },
  { stage: 'Negotiating', accent: 'bg-[#D9F154]' },
  { stage: 'Follow Up', accent: 'bg-[#FFE0B2]' },
  { stage: 'Closed Won', accent: 'bg-[#6AE4C0]' },
  { stage: 'Closed Lost', accent: 'bg-[#FFCDD2]' },
];

interface Props {
  prospects: Prospect[];
  currency: CurrencyCode;
  onMoveStage: (prospect: Prospect, nextStage: PipelineStage) => void;
  onOpenProspect: (prospectId: string) => void;
  onOpenClientPreview: (prospect: Prospect) => void;
}

export const PipelineView: React.FC<Props> = ({
  prospects,
  currency,
  onMoveStage,
  onOpenProspect,
  onOpenClientPreview,
}) => {
  return (
    <div className="h-full flex flex-col bg-[#F3F4F1] dark:bg-[#0D0E12] text-[#111214] dark:text-[#F4F5F7] p-5 lg:p-6 overflow-hidden">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">7-Stage Sales Pipeline</h1>
          <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] mt-0.5">
            Track deal progression from New Lead through Closed Won across all global markets.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto pb-2">
        <div className="flex gap-3.5 h-full min-w-[1400px]">
          {STAGES.map(({ stage, accent }, sIdx) => {
            const items = prospects.filter((p) => p.stage === stage);
            const totalUsd = items.reduce((a, b) => a + b.ticketUsd, 0);
            const nextStage = STAGES[Math.min(sIdx + 1, STAGES.length - 1)]?.stage;

            return (
              <div
                key={stage}
                className="w-[265px] shrink-0 bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] flex flex-col overflow-hidden"
              >
                <div className="p-3.5 border-b border-[#EFEFEF] dark:border-[#242731] flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${accent}`} />
                      <span className="text-xs font-bold">{stage}</span>
                    </div>
                    <div className="text-[11px] font-mono-tabular text-[#666A73] dark:text-[#9CA3AF] mt-0.5">
                      {items.length} deals · {formatMoney(totalUsd, currency, { compact: true })}
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-[#FAFAF8] dark:bg-[#121419]">
                  {items.map((p) => (
                    <div
                      key={p.id}
                      className="bg-white dark:bg-[#1A1D25] rounded-2xl p-3.5 border border-[#E5E7E2] dark:border-[#2A2D39] space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenProspect(p.id)}
                          className="text-left text-xs font-bold text-[#111214] dark:text-[#F4F5F7] hover:underline cursor-pointer"
                        >
                          {p.businessName}
                        </button>
                        <span className="text-[11px] font-mono-tabular font-semibold dark:text-[#D9F154]">
                          {formatMoney(p.ticketUsd, currency, { compact: true })}
                        </span>
                      </div>

                      <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                        {p.contactPerson} · {p.city}
                      </div>

                      <div className="text-[11px] text-[#3D404A] dark:text-[#C9CDD4] line-clamp-2">
                        {p.serviceInterest}
                      </div>

                      <div className="pt-1 flex items-center justify-between gap-2">
                        <select
                          value={p.stage}
                          onChange={(e) => onMoveStage(p, e.target.value as PipelineStage)}
                          className="text-[11px] bg-[#F3F4F1] dark:bg-[#23262F] dark:text-[#F4F5F7] rounded-lg px-2 py-1 font-medium"
                        >
                          {STAGES.map((st) => (
                            <option key={st.stage} value={st.stage}>
                              {st.stage}
                            </option>
                          ))}
                        </select>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onOpenClientPreview(p)}
                            className="p-1.5 rounded-lg bg-[#F3F4F1] dark:bg-[#23262F] text-[#555963] dark:text-[#C8B6FF] hover:bg-[#EDE7FF] dark:hover:bg-[#2E3240] cursor-pointer"
                            title="Open Read-Only Client Preview"
                          >
                            <Eye className="w-3 h-3" />
                          </button>

                          {stage !== 'Closed Won' && stage !== 'Closed Lost' && nextStage && (
                            <button
                              type="button"
                              onClick={() => onMoveStage(p, nextStage)}
                              className="p-1.5 rounded-lg bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] hover:bg-[#23252A] dark:hover:bg-[#e5f876] cursor-pointer"
                              title={`Advance to ${nextStage}`}
                            >
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="text-center py-6 text-[11px] text-[#9A9FA8] dark:text-[#7E8492]">
                      Empty stage
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
