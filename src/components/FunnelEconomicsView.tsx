import React from 'react';
import { formatMoney } from '../data/currency';
import { CurrencyCode, FunnelSettings } from '../types/crm';

interface Props {
  settings: FunnelSettings;
  currency: CurrencyCode;
  onUpdateSettings: (next: FunnelSettings) => void;
}

export const FunnelEconomicsView: React.FC<Props> = ({
  settings,
  currency,
  onUpdateSettings,
}) => {
  const clientsNeeded = Math.max(
    1,
    Math.ceil(settings.monthlyGoalUsd / Math.max(settings.ticketPriceUsd, 1))
  );

  // Paid Ads Funnel Math
  const paidCallsNeeded = Math.ceil(
    clientsNeeded / Math.max(settings.paidAdsCallToCloseRate / 100, 0.01)
  );
  const paidLeadsNeeded = Math.ceil(
    paidCallsNeeded / Math.max(settings.paidAdsLeadToCallRate / 100, 0.01)
  );
  const estimatedAdBudgetNeeded = paidLeadsNeeded * settings.paidAdsCplUsd;

  // Cold Outreach Funnel Math
  const coldCallsNeeded = Math.ceil(
    clientsNeeded / Math.max(settings.coldOutreachCallToCloseRate / 100, 0.01)
  );
  const coldRepliesNeeded = Math.ceil(
    coldCallsNeeded / Math.max(settings.coldOutreachReplyToCallRate / 100, 0.01)
  );
  const coldOutreachesNeeded = Math.ceil(
    coldRepliesNeeded / Math.max(settings.coldOutreachReplyRate / 100, 0.01)
  );
  const dailyOutreachTarget = Math.ceil(coldOutreachesNeeded / 26);

  // Unit Economics (Solo vs +2 Staff Scale)
  const grossRevenueUsd = clientsNeeded * settings.ticketPriceUsd;
  const soloCostsUsd = settings.toolsCostMonthlyUsd + settings.adSpendMonthlyUsd;
  const soloProfitUsd = grossRevenueUsd - soloCostsUsd;
  const soloMargin = grossRevenueUsd > 0 ? Math.round((soloProfitUsd / grossRevenueUsd) * 100) : 0;

  const teamCapacityClients = clientsNeeded * 2;
  const teamRevenueUsd = teamCapacityClients * settings.ticketPriceUsd;
  const teamCostsUsd =
    soloCostsUsd + settings.staffCount * settings.staffCostPerPersonUsd;
  const teamProfitUsd = teamRevenueUsd - teamCostsUsd;
  const teamMargin = teamRevenueUsd > 0 ? Math.round((teamProfitUsd / teamRevenueUsd) * 100) : 0;

  const updateField = (key: keyof FunnelSettings, val: number) => {
    const safeVal = Number.isFinite(val) ? Math.max(0, val) : 0;
    const isPercentField =
      key === 'paidAdsLeadToCallRate' ||
      key === 'paidAdsCallToCloseRate' ||
      key === 'coldOutreachReplyRate' ||
      key === 'coldOutreachReplyToCallRate' ||
      key === 'coldOutreachCallToCloseRate';
    onUpdateSettings({
      ...settings,
      [key]: isPercentField ? Math.min(100, safeVal) : safeVal,
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-[#F3F4F1] dark:bg-[#0D0E12] text-[#111214] dark:text-[#F4F5F7] p-5 lg:p-6 space-y-5 transition-colors">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">
          Sales Funnel & Unit Economics Calculator
        </h1>
        <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] mt-0.5">
          Live revenue math matching your spreadsheet model — adjust goal, ticket price, or conversion rates and every funnel volume updates instantly.
        </p>
      </div>

      {/* GOAL SETTINGS */}
      <div className="bg-[#D9F154] text-[#111214] rounded-3xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="text-[11px] font-bold uppercase text-[#111214]/75">
            Monthly Revenue Goal (USD)
          </label>
          <input
            type="number"
            value={settings.monthlyGoalUsd}
            onChange={(e) => updateField('monthlyGoalUsd', Number(e.target.value))}
            className="mt-1 w-full rounded-xl bg-white text-[#111214] px-3 py-2 text-sm font-mono-tabular font-bold"
          />
          <div className="text-[11px] font-mono-tabular mt-1">
            Display: {formatMoney(settings.monthlyGoalUsd, currency)}
          </div>
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase text-[#111214]/75">
            Average Ticket Price (USD)
          </label>
          <input
            type="number"
            value={settings.ticketPriceUsd}
            onChange={(e) => updateField('ticketPriceUsd', Number(e.target.value))}
            className="mt-1 w-full rounded-xl bg-white text-[#111214] px-3 py-2 text-sm font-mono-tabular font-bold"
          />
          <div className="text-[11px] font-mono-tabular mt-1">
            Display: {formatMoney(settings.ticketPriceUsd, currency)}
          </div>
        </div>

        <div className="bg-white/80 text-[#111214] rounded-2xl p-3.5">
          <div className="text-[11px] font-semibold text-[#111214]/75">Clients Needed / Month</div>
          <div className="text-3xl font-display font-bold font-mono-tabular mt-1">
            {clientsNeeded}
          </div>
        </div>

        <div className="bg-[#111214] text-white rounded-2xl p-3.5">
          <div className="text-[11px] text-[#9A9FA8]">Daily Cold Outreach Target</div>
          <div className="text-3xl font-display font-bold font-mono-tabular text-[#D9F154] mt-1">
            {dailyOutreachTarget} / day
          </div>
        </div>
      </div>

      {/* SIDE-BY-SIDE FUNNEL COMPARISON */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* PAID ADS FUNNEL */}
        <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 space-y-4">
          <h2 className="text-base font-display font-bold">Paid Ads Funnel Breakdown</h2>
          <div className="grid grid-cols-3 gap-2.5 text-xs">
            <div>
              <label className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">Cost / Lead (USD)</label>
              <input
                type="number"
                value={settings.paidAdsCplUsd}
                onChange={(e) => updateField('paidAdsCplUsd', Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] px-2.5 py-1.5 font-mono-tabular"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">Lead → Call %</label>
              <input
                type="number"
                value={settings.paidAdsLeadToCallRate}
                onChange={(e) => updateField('paidAdsLeadToCallRate', Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] px-2.5 py-1.5 font-mono-tabular"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">Call → Close %</label>
              <input
                type="number"
                value={settings.paidAdsCallToCloseRate}
                onChange={(e) => updateField('paidAdsCallToCloseRate', Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] px-2.5 py-1.5 font-mono-tabular"
              />
            </div>
          </div>

          <div className="space-y-2 text-xs pt-2">
            <div className="flex justify-between py-2 border-b border-[#EFEFEF] dark:border-[#242731]">
              <span>Required Qualified Leads</span>
              <span className="font-mono-tabular font-bold">{paidLeadsNeeded} / mo</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[#EFEFEF] dark:border-[#242731]">
              <span>Required Discovery Calls</span>
              <span className="font-mono-tabular font-bold">{paidCallsNeeded} / mo</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[#EFEFEF] dark:border-[#242731]">
              <span>Closed Clients</span>
              <span className="font-mono-tabular font-bold">{clientsNeeded} / mo</span>
            </div>
            <div className="flex justify-between py-2">
              <span>Estimated Ad Spend Needed</span>
              <span className="font-mono-tabular font-bold">
                {formatMoney(estimatedAdBudgetNeeded, currency)}
              </span>
            </div>
          </div>
        </div>

        {/* COLD OUTREACH FUNNEL */}
        <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 space-y-4">
          <h2 className="text-base font-display font-bold">Cold Outreach Funnel Breakdown</h2>
          <div className="grid grid-cols-3 gap-2.5 text-xs">
            <div>
              <label className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">Positive Reply %</label>
              <input
                type="number"
                value={settings.coldOutreachReplyRate}
                onChange={(e) => updateField('coldOutreachReplyRate', Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] px-2.5 py-1.5 font-mono-tabular"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">Reply → Call %</label>
              <input
                type="number"
                value={settings.coldOutreachReplyToCallRate}
                onChange={(e) => updateField('coldOutreachReplyToCallRate', Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] px-2.5 py-1.5 font-mono-tabular"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">Call → Close %</label>
              <input
                type="number"
                value={settings.coldOutreachCallToCloseRate}
                onChange={(e) => updateField('coldOutreachCallToCloseRate', Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] px-2.5 py-1.5 font-mono-tabular"
              />
            </div>
          </div>

          <div className="space-y-2 text-xs pt-2">
            <div className="flex justify-between py-2 border-b border-[#EFEFEF] dark:border-[#242731]">
              <span>Monthly Outreaches Needed</span>
              <span className="font-mono-tabular font-bold">{coldOutreachesNeeded} / mo</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[#EFEFEF] dark:border-[#242731]">
              <span>Positive Replies Needed</span>
              <span className="font-mono-tabular font-bold">{coldRepliesNeeded} / mo</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[#EFEFEF] dark:border-[#242731]">
              <span>Discovery Calls Needed</span>
              <span className="font-mono-tabular font-bold">{coldCallsNeeded} / mo</span>
            </div>
            <div className="flex justify-between py-2">
              <span>Daily Outreach Pace (26 work days)</span>
              <span className="font-mono-tabular font-bold">{dailyOutreachTarget} touches / day</span>
            </div>
          </div>
        </div>
      </div>

      {/* UNIT ECONOMICS & +2 STAFF HIRE SIMULATION */}
      <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 space-y-4">
        <h2 className="text-base font-display font-bold">
          Unit Economics & Post-Hire Scaling Simulation
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">Monthly Tools & AI (USD)</label>
            <input
              type="number"
              value={settings.toolsCostMonthlyUsd}
              onChange={(e) => updateField('toolsCostMonthlyUsd', Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] px-3 py-2 font-mono-tabular"
            />
          </div>
          <div>
            <label className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">Monthly Ad Spend (USD)</label>
            <input
              type="number"
              value={settings.adSpendMonthlyUsd}
              onChange={(e) => updateField('adSpendMonthlyUsd', Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] px-3 py-2 font-mono-tabular"
            />
          </div>
          <div>
            <label className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">Planned Hires (Staff)</label>
            <input
              type="number"
              value={settings.staffCount}
              onChange={(e) => updateField('staffCount', Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] px-3 py-2 font-mono-tabular"
            />
          </div>
          <div>
            <label className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">Cost / Staff Member (USD)</label>
            <input
              type="number"
              value={settings.staffCostPerPersonUsd}
              onChange={(e) => updateField('staffCostPerPersonUsd', Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] px-3 py-2 font-mono-tabular"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#E5E7E2] dark:border-[#2C2F3A] p-4 space-y-1.5 text-xs">
            <div className="font-bold text-sm">Phase 1 · Solo Operator Model</div>
            <div className="flex justify-between">
              <span>Gross Revenue ({clientsNeeded} clients)</span>
              <span className="font-mono-tabular font-bold">{formatMoney(grossRevenueUsd, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span>Operating Costs</span>
              <span className="font-mono-tabular">{formatMoney(soloCostsUsd, currency)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-[#E5E7E2] dark:border-[#2C2F3A] font-bold">
              <span>Net Profit ({soloMargin}% margin)</span>
              <span className="font-mono-tabular text-emerald-700 dark:text-[#6AE4C0]">
                {formatMoney(soloProfitUsd, currency)}
              </span>
            </div>
          </div>

          <div className="rounded-2xl bg-[#C8B6FF] text-[#111214] p-4 space-y-1.5 text-xs">
            <div className="font-bold text-sm">
              Phase 2 · After Hiring {settings.staffCount} Team Members (2x Capacity)
            </div>
            <div className="flex justify-between">
              <span>Scaled Revenue ({teamCapacityClients} clients)</span>
              <span className="font-mono-tabular font-bold">{formatMoney(teamRevenueUsd, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Costs (Tools + Ads + Payroll)</span>
              <span className="font-mono-tabular">{formatMoney(teamCostsUsd, currency)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-black/15 font-bold">
              <span>Net Profit ({teamMargin}% margin)</span>
              <span className="font-mono-tabular">{formatMoney(teamProfitUsd, currency)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
