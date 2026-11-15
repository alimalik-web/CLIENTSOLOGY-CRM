import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ExternalLink,
  Loader2,
  Mail,
  Plus,
  Search,
  Send,
  Sparkles,
  Target,
  UserCheck,
  Wand2,
  X,
} from 'lucide-react';
import {
  BUILT_IN_MAIL_TEMPLATES,
  DYNAMIC_TEMPLATE_TOKENS,
  EmailRecipientContext,
  getDynamicFieldChips,
  getNichePainPointsForContext,
  loadCustomMailTemplates,
  MailTemplate,
  pickRecommendedTemplateId,
  renderEmailTemplate,
  resolveNicheProfile,
  saveCustomMailTemplates,
} from '../lib/emailTemplates';
import { sendGmailMessage } from '../lib/googleWorkspace';
import { ensureHttpUrl, safeReadJsonResponse } from '../lib/appUtils';

interface GmailComposerModalProps {
  open: boolean;
  recipient: EmailRecipientContext | null;
  accessToken: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
  onClose: () => void;
  onSignIn: () => Promise<void>;
  onSentSuccess: (payload: {
    recipient: EmailRecipientContext;
    toEmail: string;
    subject: string;
    body: string;
    messageId: string;
    saveToCrm: boolean;
  }) => void;
}

type TemplateFilter = 'all' | 'niche' | 'universal' | 'custom';

const CONVERSION_GOALS = [
  'Reply for 90s Loom Audit Video',
  'Book 15-Min Discovery Call',
  'Request Free Homepage / Map Mockup',
  'Re-engage Warm Proposal Lead',
] as const;

export const GmailComposerModal: React.FC<GmailComposerModalProps> = ({
  open,
  recipient,
  accessToken,
  senderEmail,
  senderName,
  onClose,
  onSignIn,
  onSentSuccess,
}) => {
  const [customTemplates, setCustomTemplates] = useState<MailTemplate[]>(() =>
    loadCustomMailTemplates()
  );
  const allTemplates = useMemo(
    () => [...BUILT_IN_MAIL_TEMPLATES, ...customTemplates],
    [customTemplates]
  );

  const [ctx, setCtx] = useState<EmailRecipientContext | null>(recipient);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>('all');
  const [selectedPainPoint, setSelectedPainPoint] = useState<string>('');
  const [toEmail, setToEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [conversionGoal, setConversionGoal] = useState<string>(CONVERSION_GOALS[0]);
  const [saveToCrm, setSaveToCrm] = useState(true);
  const [activeField, setActiveField] = useState<'subject' | 'body'>('body');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const [confirmStep, setConfirmStep] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Inline custom template builder
  const [showNewTemplateForm, setShowNewTemplateForm] = useState(false);
  const [newTplName, setNewTplName] = useState('');
  const [newTplSubject, setNewTplSubject] = useState(
    'Quick idea for {{businessName}} on {{shortAddress}}'
  );
  const [newTplBody, setNewTplBody] = useState(
    '{{personalizedGreeting}}\n\nI was looking at {{businessName}} at {{address}} ({{ratingInline}}) and noticed {{primaryPainPoint}}.\n\nWould you like me to send a quick 90-second video tailored to {{businessName}}?\n\nBest,\n{{senderName}}'
  );

  const subjectInputRef = useRef<HTMLInputElement | null>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const allTemplatesRef = useRef<MailTemplate[]>(allTemplates);
  allTemplatesRef.current = allTemplates;

  useEffect(() => {
    if (!open || !recipient) return;
    const enriched: EmailRecipientContext = {
      ...recipient,
      senderName: recipient.senderName || senderName || 'Clientsology Growth Team',
    };
    const painPoints = getNichePainPointsForContext(enriched);
    const initialPain = painPoints[0] || '';
    const recommendedId = pickRecommendedTemplateId(enriched);
    const tpl =
      allTemplatesRef.current.find((t) => t.id === recommendedId) || BUILT_IN_MAIL_TEMPLATES[0];
    const rendered = renderEmailTemplate(tpl, enriched, initialPain);

    setCtx(enriched);
    setSelectedPainPoint(initialPain);
    setToEmail(enriched.email || '');
    setSelectedTemplateId(recommendedId);
    setTemplateFilter('all');
    setSubject(rendered.subject);
    setBody(rendered.body);
    setActiveField('body');
    setConfirmStep(false);
    setAiError(null);
    setAiNotice(null);
    setSendError(null);
    setShowNewTemplateForm(false);
  }, [open, recipient, senderName]);

  const matchedNicheProfile = useMemo(
    () => (ctx ? resolveNicheProfile(ctx.niche) : undefined),
    [ctx]
  );

  const painPointOptions = useMemo(
    () => (ctx ? getNichePainPointsForContext(ctx) : []),
    [ctx]
  );

  const dynamicChips = useMemo(
    () => (ctx ? getDynamicFieldChips(ctx, selectedPainPoint) : []),
    [ctx, selectedPainPoint]
  );

  const availableTemplates = useMemo(
    () =>
      allTemplates.filter(
        (t) => t.id !== 'client-portal-share' || Boolean(ctx?.clientPreviewUrl)
      ),
    [allTemplates, ctx?.clientPreviewUrl]
  );

  const sortedAndFilteredTemplates = useMemo(() => {
    const matchedId = matchedNicheProfile?.id;
    const sorted = [...availableTemplates].sort((a, b) => {
      const aRecommended = a.id === selectedTemplateId ? 2 : 0;
      const bRecommended = b.id === selectedTemplateId ? 2 : 0;
      const aNicheMatch = matchedId && a.nicheIds?.includes(matchedId) ? 1 : 0;
      const bNicheMatch = matchedId && b.nicheIds?.includes(matchedId) ? 1 : 0;
      return bRecommended + bNicheMatch - (aRecommended + aNicheMatch);
    });

    if (templateFilter === 'niche') {
      return sorted.filter((t) => Boolean(t.nicheIds && t.nicheIds.length > 0));
    }
    if (templateFilter === 'universal') {
      return sorted.filter((t) => !t.isCustom && (!t.nicheIds || t.nicheIds.length === 0));
    }
    if (templateFilter === 'custom') {
      return sorted.filter((t) => Boolean(t.isCustom));
    }
    return sorted;
  }, [availableTemplates, matchedNicheProfile, selectedTemplateId, templateFilter]);

  if (!open || !ctx) return null;

  const applyTemplate = (
    tplId: string,
    overrideCtx?: EmailRecipientContext,
    overridePainPoint?: string
  ) => {
    const activeCtx = overrideCtx || ctx;
    const activePain = overridePainPoint !== undefined ? overridePainPoint : selectedPainPoint;
    setSelectedTemplateId(tplId);
    const tpl = allTemplates.find((t) => t.id === tplId) || BUILT_IN_MAIL_TEMPLATES[0];
    const rendered = renderEmailTemplate(tpl, activeCtx, activePain);
    setSubject(rendered.subject);
    setBody(rendered.body);
    setAiNotice(null);
    setAiError(null);
    setConfirmStep(false);
  };

  const handleSelectPainPoint = (pain: string) => {
    setSelectedPainPoint(pain);
    applyTemplate(selectedTemplateId, ctx, pain);
  };

  const handleContactNameChange = (nextName: string) => {
    const updated = { ...ctx, contactName: nextName };
    setCtx(updated);
    applyTemplate(selectedTemplateId, updated, selectedPainPoint);
  };

  const handleInjectDynamicValue = (value: string) => {
    if (!value) return;
    if (activeField === 'subject') {
      const el = subjectInputRef.current;
      const start = el?.selectionStart ?? subject.length;
      const end = el?.selectionEnd ?? subject.length;
      const prefix = start > 0 && !/\s$/.test(subject.slice(0, start)) ? ' ' : '';
      const suffix = end < subject.length && !/^\s/.test(subject.slice(end)) ? ' ' : '';
      const next = `${subject.slice(0, start)}${prefix}${value}${suffix}${subject.slice(end)}`;
      setSubject(next);
      setConfirmStep(false);
      requestAnimationFrame(() => {
        if (el) {
          const caret = start + prefix.length + value.length;
          el.focus();
          el.setSelectionRange(caret, caret);
        }
      });
      return;
    }

    const el = bodyTextareaRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const prefix = start > 0 && !/[\s\n]$/.test(body.slice(0, start)) ? ' ' : '';
    const suffix = end < body.length && !/^[\s\n.,!?;:]/.test(body.slice(end)) ? ' ' : '';
    const next = `${body.slice(0, start)}${prefix}${value}${suffix}${body.slice(end)}`;
    setBody(next);
    setConfirmStep(false);
    requestAnimationFrame(() => {
      if (el) {
        const caret = start + prefix.length + value.length;
        el.focus();
        el.setSelectionRange(caret, caret);
      }
    });
  };

  const handleAiOptimize = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiNotice(null);
    try {
      const res = await fetch('/api/email/ai-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...ctx,
          selectedPainPoint,
          conversionGoal,
          currentSubject: subject,
          currentBody: body,
        }),
      });
      const data = await safeReadJsonResponse<{
        subject?: string;
        body?: string;
        notice?: string;
        message?: string;
      }>(res);
      if (!res.ok) {
        setAiError(data.message || 'AI email optimization unavailable right now.');
        return;
      }
      if (data.subject) setSubject(data.subject);
      if (data.body) setBody(data.body);
      if (data.notice) setAiNotice(data.notice);
      setConfirmStep(false);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Network error optimizing email.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveCustomTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTplName.trim() || !newTplSubject.trim() || !newTplBody.trim()) return;
    const created: MailTemplate = {
      id: `custom-${Date.now()}`,
      name: newTplName.trim(),
      category: 'Custom',
      bestFor: 'Saved personal template with dynamic tokens',
      subjectTemplate: newTplSubject.trim(),
      bodyTemplate: newTplBody.trim(),
      isCustom: true,
    };
    const nextList = [...customTemplates, created];
    setCustomTemplates(nextList);
    saveCustomMailTemplates(nextList);
    setShowNewTemplateForm(false);
    setNewTplName('');
    setSelectedTemplateId(created.id);
    const rendered = renderEmailTemplate(created, ctx, selectedPainPoint);
    setSubject(rendered.subject);
    setBody(rendered.body);
  };

  const handleConfirmAndSend = async () => {
    if (!accessToken) return;
    if (!toEmail.trim() || !toEmail.includes('@')) {
      setSendError('Please enter a valid recipient email address before sending.');
      setConfirmStep(false);
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const sent = await sendGmailMessage(accessToken, {
        to: toEmail.trim(),
        subject: subject.trim(),
        body,
        fromEmail: senderEmail || undefined,
      });
      onSentSuccess({
        recipient: { ...ctx, email: toEmail.trim() },
        toEmail: toEmail.trim(),
        subject: subject.trim(),
        body,
        messageId: sent.id,
        saveToCrm,
      });
      onClose();
    } catch (err) {
      setSendError(
        err instanceof Error
          ? err.message
          : 'Failed to send via Gmail. If you just connected Gmail, sign out and sign in once to grant send permission.'
      );
      setConfirmStep(false);
    } finally {
      setSending(false);
    }
  };

  const googleEmailFindQuery = encodeURIComponent(
    `${ctx.businessName} ${ctx.city} email OR contact`
  );

  const nicheCount = availableTemplates.filter((t) => Boolean(t.nicheIds?.length)).length;
  const universalCount = availableTemplates.filter(
    (t) => !t.isCustom && (!t.nicheIds || t.nicheIds.length === 0)
  ).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white dark:bg-[#16181E] text-[#111214] dark:text-[#F4F5F7] rounded-3xl border border-transparent dark:border-[#282B35] max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* MODAL HEADER */}
        <div className="px-6 py-4 bg-[#111214] text-white flex items-center justify-between gap-3 shrink-0 border-b border-transparent dark:border-[#242731]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#D9F154] text-[#111214] flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-display font-bold truncate">
                Gmail Direct Outreach — {ctx.businessName}
              </h2>
              <p className="text-[11px] text-[#9A9FA8] truncate">
                Dynamic CRM personalization for {ctx.address || `${ctx.city}, ${ctx.country}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9A9FA8] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 text-xs">
          {/* LIVE DYNAMIC CONTEXT STRIP */}
          <div className="rounded-2xl bg-[#F3F4F1] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#282B35] p-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#555963] dark:text-[#A1A6B3]">
                Live CRM &amp; Maps Prospect Profile
              </span>
              {ctx.website && ensureHttpUrl(ctx.website) && (
                <a
                  href={ensureHttpUrl(ctx.website)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-semibold underline inline-flex items-center gap-1 text-[#111214] dark:text-[#D9F154]"
                >
                  Check Website for Email <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#23262F] border border-[#E2E4DF] dark:border-[#323643] font-semibold">
                {ctx.businessName}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#23262F] border border-[#E2E4DF] dark:border-[#323643]">
                {ctx.address || `${ctx.city}, ${ctx.country}`}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#23262F] border border-[#E2E4DF] dark:border-[#323643]">
                Niche: {ctx.niche}
              </span>
              {typeof ctx.rating === 'number' && (
                <span className="px-2.5 py-1 rounded-lg bg-[#D9F154] text-[#111214] font-semibold">
                  {ctx.rating.toFixed(1)}★ ({ctx.reviewCount || 0} reviews)
                </span>
              )}
              <span className="px-2.5 py-1 rounded-lg bg-[#EDE7FF] dark:bg-[#C8B6FF]/20 text-[#111214] dark:text-[#DDD4FA] font-medium">
                {ctx.website ? ctx.website.replace(/^https?:\/\//, '') : 'No Website Listed'}
              </span>
              {ctx.stage && (
                <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#23262F] border border-[#E2E4DF] dark:border-[#323643] font-medium">
                  Stage: {ctx.stage}
                </span>
              )}
              {typeof ctx.ticketUsd === 'number' && ctx.ticketUsd > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#23262F] border border-[#E2E4DF] dark:border-[#323643] font-mono-tabular font-semibold">
                  Est. Deal: ${ctx.ticketUsd.toLocaleString()}
                </span>
              )}
            </div>
            {ctx.replyNotes && (
              <div className="text-[11px] text-[#3D404A] dark:text-[#C9CDD4] bg-white/80 dark:bg-[#23262F]/80 border border-[#E2E4DF] dark:border-[#323643] rounded-xl px-3 py-1.5">
                <span className="font-semibold text-[#111214] dark:text-[#F4F5F7]">CRM Note:</span> {ctx.replyNotes}
              </div>
            )}
          </div>

          {/* 1. NICHE-SPECIFIC TEMPLATE PICKER */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[11px] font-bold uppercase text-[#555963] dark:text-[#A1A6B3]">
                  1. Choose Niche-Specific Template
                </label>
                {matchedNicheProfile && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#D9F154] text-[#111214]">
                    CRM Niche Match: {matchedNicheProfile.name}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowNewTemplateForm(!showNewTemplateForm)}
                className="text-[11px] font-semibold inline-flex items-center gap-1 underline cursor-pointer text-[#111214] dark:text-[#D9F154]"
              >
                <Plus className="w-3 h-3" />
                {showNewTemplateForm ? 'Close Template Builder' : 'New Custom Template'}
              </button>
            </div>

            {/* FILTER TABS */}
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'all', label: `All (${availableTemplates.length})` },
                  { id: 'niche', label: `Niche Playbooks (${nicheCount})` },
                  { id: 'universal', label: `Universal (${universalCount})` },
                  { id: 'custom', label: `Custom (${customTemplates.length})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTemplateFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    templateFilter === tab.id
                      ? 'bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214]'
                      : 'bg-[#F3F4F1] dark:bg-[#23262F] text-[#3D404A] dark:text-[#C9CDD4] hover:bg-[#E5E7E2] dark:hover:bg-[#2C2F3A]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {sortedAndFilteredTemplates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#D9DBD5] dark:border-[#323643] p-4 text-center text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                No custom templates saved yet. Click &ldquo;New Custom Template&rdquo; above to save your own dynamic template.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                {sortedAndFilteredTemplates.map((tpl) => {
                  const active = tpl.id === selectedTemplateId;
                  const isNicheMatch = Boolean(
                    matchedNicheProfile && tpl.nicheIds?.includes(matchedNicheProfile.id)
                  );
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applyTemplate(tpl.id)}
                      className={`text-left rounded-2xl p-2.5 border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#111214] dark:bg-[#D9F154] text-white dark:text-[#111214] border-[#111214] dark:border-[#D9F154]'
                          : isNicheMatch
                            ? 'bg-[#F7FCE0] dark:bg-[#D9F154]/12 text-[#111214] dark:text-[#F4F5F7] border-[#C5DF3B] dark:border-[#D9F154]/45 hover:border-[#111214] dark:hover:border-[#D9F154]'
                            : 'bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] border-[#E2E4DF] dark:border-[#2C2F3A] hover:border-[#111214] dark:hover:border-[#D9F154]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-[11px] truncate">{tpl.name}</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 font-semibold ${
                            active
                              ? 'bg-[#D9F154] dark:bg-[#111214] text-[#111214] dark:text-[#D9F154]'
                              : isNicheMatch
                                ? 'bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214]'
                                : 'bg-[#E5E7E2] dark:bg-[#2A2D38] text-[#3D404A] dark:text-[#C9CDD4]'
                          }`}
                        >
                          {isNicheMatch ? 'Matched' : tpl.category}
                        </span>
                      </div>
                      <div
                        className={`text-[10px] mt-0.5 truncate ${
                          active
                            ? 'text-[#C9CDD4] dark:text-[#111214]/75'
                            : 'text-[#666A73] dark:text-[#9CA3AF]'
                        }`}
                      >
                        {tpl.bestFor}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. CRM & NICHE PAIN POINT SELECTOR */}
          {painPointOptions.length > 0 && (
            <div className="rounded-2xl bg-[#FAFAF8] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#282B35] p-3.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase text-[#555963] dark:text-[#A1A6B3] inline-flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-[#111214] dark:text-[#D9F154]" />
                  2. Select CRM Pain Point to Auto-Populate Email
                </span>
                <span className="text-[10px] text-[#666A73] dark:text-[#9CA3AF]">
                  Updates <code className="font-mono-tabular">{'{{primaryPainPoint}}'}</code> live
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {painPointOptions.slice(0, 4).map((pain) => {
                  const isSelected = selectedPainPoint === pain;
                  return (
                    <button
                      key={pain}
                      type="button"
                      onClick={() => handleSelectPainPoint(pain)}
                      className={`text-left px-3 py-2 rounded-xl border text-[11px] leading-snug transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#111214] dark:bg-[#D9F154] text-white dark:text-[#111214] border-[#111214] dark:border-[#D9F154] font-semibold'
                          : 'bg-white dark:bg-[#23262F] text-[#2C2F36] dark:text-[#E5E7E2] border-[#E2E4DF] dark:border-[#323643] hover:border-[#111214] dark:hover:border-[#D9F154]/60'
                      }`}
                    >
                      {pain}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* INLINE CUSTOM TEMPLATE BUILDER */}
          {showNewTemplateForm && (
            <form
              onSubmit={handleSaveCustomTemplate}
              className="rounded-2xl bg-[#EDE7FF]/45 dark:bg-[#C8B6FF]/10 border border-[#C8B6FF] dark:border-[#C8B6FF]/40 p-4 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold">Create Reusable Dynamic Template</span>
                <div className="flex flex-wrap gap-1">
                  {DYNAMIC_TEMPLATE_TOKENS.slice(0, 8).map((tok) => (
                    <button
                      key={tok}
                      type="button"
                      onClick={() => setNewTplBody((prev) => `${prev} ${tok}`)}
                      className="px-1.5 py-0.5 rounded bg-white dark:bg-[#23262F] border border-[#C8B6FF] dark:border-[#C8B6FF]/45 text-[10px] font-mono-tabular cursor-pointer"
                    >
                      +{tok}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  required
                  value={newTplName}
                  onChange={(e) => setNewTplName(e.target.value)}
                  placeholder="Template Name (e.g. Clinic Follow-Up)"
                  className="rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-white dark:bg-[#1C1F26] px-3 py-1.5 text-xs"
                />
                <input
                  required
                  value={newTplSubject}
                  onChange={(e) => setNewTplSubject(e.target.value)}
                  placeholder="Subject with {{businessName}}..."
                  className="rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-white dark:bg-[#1C1F26] px-3 py-1.5 text-xs"
                />
              </div>
              <textarea
                required
                rows={4}
                value={newTplBody}
                onChange={(e) => setNewTplBody(e.target.value)}
                className="w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-white dark:bg-[#1C1F26] px-3 py-2 text-xs"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewTemplateForm(false)}
                  className="px-3 py-1.5 rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-white dark:bg-[#23262F] text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-xs font-semibold cursor-pointer"
                >
                  Save &amp; Apply Template
                </button>
              </div>
            </form>
          )}

          {/* RECIPIENT + CONTACT NAME */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase text-[#666A73] dark:text-[#9CA3AF]">
                  Recipient Email (To)
                </label>
                {!toEmail && (
                  <a
                    href={`https://www.google.com/search?q=${googleEmailFindQuery}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-semibold underline inline-flex items-center gap-0.5 text-[#111214] dark:text-[#D9F154]"
                  >
                    <Search className="w-2.5 h-2.5" /> Find Email
                  </a>
                )}
              </div>
              <input
                type="email"
                value={toEmail}
                onChange={(e) => {
                  setToEmail(e.target.value);
                  setConfirmStep(false);
                }}
                placeholder="owner@businessdomain.com"
                className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 text-xs bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] placeholder:text-[#9A9FA8] dark:placeholder:text-[#6B7280]"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase text-[#666A73] dark:text-[#9CA3AF]">
                Contact First/Full Name (Dynamic Greeting)
              </label>
              <input
                value={ctx.contactName}
                onChange={(e) => handleContactNameChange(e.target.value)}
                placeholder="e.g. Sarah (leave Owner to address business team)"
                className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 text-xs bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] placeholder:text-[#9A9FA8] dark:placeholder:text-[#6B7280]"
              />
            </div>
          </div>

          {/* AI CONVERSION OPTIMIZER BAR */}
          <div className="rounded-2xl bg-[#111214] border border-transparent dark:border-[#282B35] text-white p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#D9F154]" />
              <span className="text-xs font-semibold">AI Conversion Boost:</span>
              <select
                value={conversionGoal}
                onChange={(e) => setConversionGoal(e.target.value)}
                className="bg-[#1D1F24] border border-[#2C2F36] rounded-xl px-2.5 py-1 text-[11px] text-white"
              >
                {CONVERSION_GOALS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={aiLoading}
              onClick={handleAiOptimize}
              className="px-3.5 py-1.5 rounded-xl bg-[#D9F154] text-[#111214] text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {aiLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {aiLoading ? 'Optimizing Copy...' : 'Personalize with AI'}
            </button>
          </div>

          {aiNotice && (
            <div className="rounded-xl bg-[#EDE7FF] dark:bg-[#C8B6FF]/15 border border-[#C8B6FF] dark:border-[#C8B6FF]/40 px-3.5 py-2 text-[11px] font-semibold text-[#111214] dark:text-[#E5DEFF]">
              {aiNotice}
            </div>
          )}
          {aiError && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-700/60 px-3.5 py-2 text-[11px] text-amber-900 dark:text-amber-200">
              {aiError}
            </div>
          )}

          {/* CLICK-TO-INJECT DYNAMIC CRM FIELD BAR */}
          <div className="rounded-2xl bg-[#F3F4F1] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#282B35] p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase text-[#555963] dark:text-[#A1A6B3] inline-flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5 text-[#111214] dark:text-[#D9F154]" />
                Click to Inject Live Prospect Field at Cursor
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white dark:bg-[#23262F] border border-[#D9DBD5] dark:border-[#323643] text-[#111214] dark:text-[#F4F5F7]">
                Target: {activeField === 'subject' ? 'Email Subject' : 'Email Body'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dynamicChips.map((chip) => (
                <button
                  key={chip.token}
                  type="button"
                  title={`Inject "${chip.value}" into ${activeField}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleInjectDynamicValue(chip.value)}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#23262F] border border-[#D9DBD5] dark:border-[#323643] hover:border-[#111214] dark:hover:border-[#D9F154] hover:bg-[#D9F154]/30 dark:hover:bg-[#D9F154]/15 text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1.5 max-w-full"
                >
                  <span className="font-semibold text-[#111214] dark:text-[#F4F5F7] shrink-0">+ {chip.label}</span>
                  <span className="text-[10px] text-[#666A73] dark:text-[#9CA3AF] truncate max-w-[150px]">
                    {chip.value}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* SUBJECT & BODY */}
          <div>
            <label className="text-[11px] font-semibold uppercase text-[#666A73] dark:text-[#9CA3AF]">
              Email Subject
            </label>
            <input
              ref={subjectInputRef}
              value={subject}
              onFocus={() => setActiveField('subject')}
              onChange={(e) => {
                setSubject(e.target.value);
                setConfirmStep(false);
              }}
              className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 text-xs font-semibold bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7]"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase text-[#666A73] dark:text-[#9CA3AF]">
              Email Body (Editable &amp; Fully Dynamic)
            </label>
            <textarea
              ref={bodyTextareaRef}
              rows={9}
              value={body}
              onFocus={() => setActiveField('body')}
              onChange={(e) => {
                setBody(e.target.value);
                setConfirmStep(false);
              }}
              className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2.5 text-xs leading-relaxed bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7]"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-[#3D404A] dark:text-[#C9CDD4] cursor-pointer">
            <input
              type="checkbox"
              checked={saveToCrm}
              onChange={(e) => setSaveToCrm(e.target.checked)}
              className="rounded border-[#D9DBD5] dark:border-[#323643] accent-[#111214] dark:accent-[#D9F154]"
            />
            <span>
              Log sent email in CRM Chat History and {ctx.prospectId ? 'update' : 'import'} this lead into CRM Prospect Database
            </span>
          </label>

          {sendError && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-700/60 px-3.5 py-2.5 text-xs text-red-800 dark:text-red-200">
              {sendError}
            </div>
          )}

          {/* EXPLICIT USER CONFIRMATION STEP BEFORE GMAIL SEND */}
          {confirmStep && (
            <div className="rounded-2xl bg-[#D9F154]/30 dark:bg-[#D9F154]/15 border-2 border-[#111214] dark:border-[#D9F154] p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#111214] dark:text-[#D9F154]">
                <UserCheck className="w-4 h-4" />
                <span>Confirm Sending Email via Gmail</span>
              </div>
              <p className="text-xs text-[#111214] dark:text-[#F4F5F7]">
                Send email from <strong>{senderEmail || 'your connected Gmail'}</strong> to{' '}
                <strong>{toEmail}</strong> for <strong>{ctx.businessName}</strong> with subject{' '}
                <em>&ldquo;{subject}&rdquo;</em>?
              </p>
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmStep(false)}
                  className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#23262F] border border-[#111214]/30 dark:border-[#323643] text-[#111214] dark:text-[#F4F5F7] text-xs font-semibold cursor-pointer"
                >
                  Back to Edit
                </button>
                <button
                  type="button"
                  disabled={sending}
                  onClick={handleConfirmAndSend}
                  className="px-4 py-2 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {sending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  {sending ? 'Sending via Gmail...' : 'Confirm & Send Email Now'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-3.5 bg-[#FAFAF8] dark:bg-[#1C1F26] border-t border-[#E2E4DF] dark:border-[#282B35] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
            {accessToken
              ? `Connected Gmail: ${senderEmail || 'Authorized'}`
              : 'Sign in with Google to authorize sending via Gmail'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-[#D9DBD5] dark:border-[#323643] text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            {!accessToken ? (
              <button
                type="button"
                onClick={async () => {
                  setSendError(null);
                  try {
                    await onSignIn();
                  } catch (err) {
                    setSendError(
                      err instanceof Error
                        ? err.message
                        : 'Google sign-in was cancelled or blocked.'
                    );
                  }
                }}
                className="px-4 py-2 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-xs font-semibold cursor-pointer"
              >
                Sign in with Google to Send
              </button>
            ) : (
              !confirmStep && (
                <button
                  type="button"
                  onClick={() => {
                    if (!toEmail.trim() || !toEmail.includes('@')) {
                      setSendError('Please enter the prospect email address above first.');
                      return;
                    }
                    setSendError(null);
                    setConfirmStep(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Review &amp; Send via Gmail
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
