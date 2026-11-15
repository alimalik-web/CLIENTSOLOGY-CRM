import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { RoadmapPhase } from '../types/crm';

interface Props {
  phases: RoadmapPhase[];
  onUpdatePhases: (next: RoadmapPhase[]) => void;
}

export const RoadmapView: React.FC<Props> = ({ phases, onUpdatePhases }) => {
  const completed = phases.filter((p) => p.done).length;
  const pct = phases.length > 0 ? Math.round((completed / phases.length) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto bg-[#F3F4F1] dark:bg-[#0D0E12] text-[#111214] dark:text-[#F4F5F7] p-5 lg:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">
            30-Day + Month 2 Execution Roadmap
          </h1>
          <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] mt-0.5">
            Step-by-step agency ramp from first rapid-close local cashflow to high-ticket global retainers & team hiring.
          </p>
        </div>
        <div className="bg-[#111214] dark:bg-[#1E212B] border border-transparent dark:border-[#D9F154]/35 text-[#D9F154] px-4 py-2 rounded-2xl text-xs font-mono-tabular font-bold">
          {completed} / {phases.length} Phases Complete ({pct}%)
        </div>
      </div>

      <div className="space-y-3.5">
        {phases.map((phase, idx) => (
          <div
            key={phase.id}
            className={`rounded-3xl border p-5 transition-colors ${
              phase.done
                ? 'bg-[#D9F154]/35 dark:bg-[#D9F154]/12 border-[#B9D13E] dark:border-[#D9F154]/45'
                : 'bg-white dark:bg-[#16181E] border-[#E2E4DF] dark:border-[#282B35]'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-[11px] font-mono-tabular font-semibold uppercase text-[#666A73] dark:text-[#9CA3AF]">
                  {phase.timeline}
                </div>
                <h2 className="text-lg font-display font-bold">{phase.phase}</h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  const next = [...phases];
                  next[idx] = { ...phase, done: !phase.done };
                  onUpdatePhases(next);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                  phase.done
                    ? 'bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214]'
                    : 'bg-[#F3F4F1] dark:bg-[#23262F] text-[#111214] dark:text-[#F4F5F7] hover:bg-[#D9F154] hover:text-[#111214]'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                {phase.done ? 'Completed' : 'Mark Phase Done'}
              </button>
            </div>

            <ul className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-[#2B2E36] dark:text-[#D1D5DB]">
              {phase.actions.map((act) => (
                <li
                  key={act}
                  className="bg-white/75 dark:bg-[#1C1F26] rounded-xl px-3 py-2 border border-[#ECEEE8] dark:border-[#2C2F3A]"
                >
                  · {act}
                </li>
              ))}
            </ul>

            <div className="mt-3 pt-3 border-t border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-[#3D404A] dark:text-[#C9CDD4]">
                Output: {phase.expectedOutput}
              </span>
              <span className="font-mono-tabular font-bold text-[#111214] dark:text-[#D9F154]">
                KPI: {phase.kpiTarget}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
