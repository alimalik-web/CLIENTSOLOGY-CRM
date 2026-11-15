import * as XLSX from 'xlsx';
import {
  ChatLogItem,
  CountryMarket,
  FollowUpItem,
  FunnelSettings,
  MonthlyGoalRow,
  Prospect,
  RoadmapPhase,
  WeeklyTaskRow,
} from '../types/crm';

export function exportCrmWorkbookXlsx(params: {
  prospects: Prospect[];
  followUps: FollowUpItem[];
  chatLogs: ChatLogItem[];
  weeklyTasks: WeeklyTaskRow[];
  monthlyGoals: MonthlyGoalRow[];
  roadmap: RoadmapPhase[];
  funnelSettings: FunnelSettings;
  countries: CountryMarket[];
}) {
  const wb = XLSX.utils.book_new();

  const prospectSheet = XLSX.utils.json_to_sheet(
    params.prospects.map((p) => ({
      ID: p.id,
      Business: p.businessName,
      Contact: p.contactPerson,
      Role: p.roleTitle,
      Email: p.email,
      Phone: p.phone,
      Website: p.website,
      Country: p.country,
      'State / Region': p.stateOrRegion,
      City: p.city,
      Niche: p.categoryNiche,
      Quality: p.leadQuality,
      Stage: p.stage,
      'Service Interest': p.serviceInterest,
      'Ticket (USD)': p.ticketUsd,
      'Date Added': p.dateAdded,
      'Next Follow-Up': p.nextFollowUp,
      'Last Contacted': p.lastContacted,
      'Last Message': p.lastMessageSent,
      'Reply Notes': p.replyNotes,
      Status: p.status,
    }))
  );
  XLSX.utils.book_append_sheet(wb, prospectSheet, 'Prospect Database');

  const followUpSheet = XLSX.utils.json_to_sheet(
    params.followUps.map((f) => ({
      ID: f.id,
      Business: f.businessName,
      Date: f.followUpDate,
      Time: f.followUpTime,
      Type: f.followUpType,
      Stage: f.stage,
      Priority: f.priority,
      Done: f.done ? 'Yes' : 'No',
      Script: f.messageScript,
      Outcome: f.outcome,
      'Next Step': f.nextStep,
    }))
  );
  XLSX.utils.book_append_sheet(wb, followUpSheet, 'Follow-Ups');

  const chatSheet = XLSX.utils.json_to_sheet(
    params.chatLogs.map((c) => ({
      ID: c.id,
      Business: c.businessName,
      Date: c.date,
      Time: c.time,
      Channel: c.channel,
      Direction: c.direction,
      Message: c.messageContent,
      Summary: c.responseSummary,
    }))
  );
  XLSX.utils.book_append_sheet(wb, chatSheet, 'Chat History');

  const weeklySheet = XLSX.utils.json_to_sheet(
    params.weeklyTasks.map((w) => ({
      Day: w.day,
      Date: w.date,
      'Morning Task': w.morningTask,
      'Afternoon Task': w.afternoonTask,
      'Outreach Target': w.outreachTarget,
      'Outreach Actual': w.outreachActual,
      'Calls Scheduled': w.callsScheduled,
      'Calls Done': w.callsDone,
      Done: w.done ? 'Yes' : 'No',
      Notes: w.notes,
    }))
  );
  XLSX.utils.book_append_sheet(wb, weeklySheet, 'Weekly Plan');

  const goalsSheet = XLSX.utils.json_to_sheet(
    params.monthlyGoals.map((g) => ({
      Metric: g.metric,
      Goal: g.goal,
      Actual: g.actual,
      Gap: g.goal - g.actual,
      'Progress %': g.goal > 0 ? `${Math.round((g.actual / g.goal) * 100)}%` : '0%',
    }))
  );
  XLSX.utils.book_append_sheet(wb, goalsSheet, 'Monthly Goals');

  const roadmapSheet = XLSX.utils.json_to_sheet(
    params.roadmap.map((r) => ({
      Phase: r.phase,
      Timeline: r.timeline,
      Actions: r.actions.join(' | '),
      'Expected Output': r.expectedOutput,
      KPI: r.kpiTarget,
      Done: r.done ? 'Yes' : 'No',
    }))
  );
  XLSX.utils.book_append_sheet(wb, roadmapSheet, '30-Day Roadmap');

  const marketsSheet = XLSX.utils.json_to_sheet(
    params.countries.map((c) => ({
      Country: c.name,
      Region: c.macroRegion,
      Tier: c.tier,
      'Median Income (USD)': c.medianIncomeUsd,
      Competition: c.competition,
      'Retainer Min (USD)': c.retainerRangeUsd[0],
      'Retainer Max (USD)': c.retainerRangeUsd[1],
      'SEO Score': c.serviceSuitability.seo.score,
      'Web Dev Score': c.serviceSuitability.webDev.score,
      'Automation Score': c.serviceSuitability.automation.score,
      'Top Niches': c.topOperatingNiches.join(', '),
      'Future Niches': c.futureNicheOpportunities.join(', '),
      'Required Skills': c.requiredSkills.join(', '),
    }))
  );
  XLSX.utils.book_append_sheet(wb, marketsSheet, 'Global Market Matrix');

  const filename = `Clientsology_Global_CRM_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}
