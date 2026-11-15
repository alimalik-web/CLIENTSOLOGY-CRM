import React, { useEffect, useState } from 'react';
import { CalendarPlus, ExternalLink, FileSpreadsheet, Loader2, X } from 'lucide-react';
import {
  CalendarOption,
  createCalendarDiscoveryCall,
  listGoogleCalendars,
} from '../lib/googleWorkspace';
import { addDaysUtc, getLocalIsoDate } from '../lib/appUtils';
import { Prospect } from '../types/crm';

interface SheetsModalProps {
  open: boolean;
  isSignedIn: boolean;
  hasToken: boolean;
  existingSpreadsheetId?: string;
  existingSpreadsheetUrl?: string;
  lastSyncedAt?: string;
  rowCountPreview: number;
  onClose: () => void;
  onSignIn: () => Promise<void>;
  onConfirmSync: () => Promise<void>;
  onDownloadXlsx: () => void;
}

export const GoogleSheetsSyncModal: React.FC<SheetsModalProps> = ({
  open,
  isSignedIn,
  hasToken,
  existingSpreadsheetId,
  existingSpreadsheetUrl,
  lastSyncedAt,
  rowCountPreview,
  onClose,
  onSignIn,
  onConfirmSync,
  onDownloadXlsx,
}) => {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await onConfirmSync();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sheets sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const handleSignIn = async () => {
    setError(null);
    try {
      await onSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in was cancelled or failed.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#16181E] text-[#111214] dark:text-[#F4F5F7] border border-transparent dark:border-[#2C2F3A] rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-700 dark:text-[#6AE4C0]" />
            <h2 className="text-lg font-display font-bold">Google Sheets Workbook Sync</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#F3F4F1] dark:hover:bg-[#23262F] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-[#3D404A] dark:text-[#C9CDD4] leading-relaxed">
          {existingSpreadsheetId
            ? 'Confirm updating your linked Google Sheets CRM workbook across all 6 sheets (Prospect Database, Follow-Ups, Chat History, Weekly Plan, Monthly Goals, and Global Market Matrix).'
            : 'Confirm creating a new Clientsology Global Agency CRM workbook in your Google Drive and syncing all 6 sheets.'}
        </p>

        <div className="rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#E5E7E2] dark:border-[#2C2F3A] p-3.5 text-xs space-y-1">
          <div>
            Rows prepared for sync: <strong className="font-mono-tabular">{rowCountPreview}</strong>
          </div>
          {lastSyncedAt && (
            <div className="text-[#666A73] dark:text-[#9CA3AF]">
              Last synced: {new Date(lastSyncedAt).toLocaleString()}
            </div>
          )}
          {existingSpreadsheetUrl && (
            <a
              href={existingSpreadsheetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold underline text-emerald-800 dark:text-[#6AE4C0] pt-1"
            >
              Open Linked Google Sheet <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800/60 p-3 text-xs text-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <button
            type="button"
            onClick={onDownloadXlsx}
            className="px-3.5 py-2 rounded-xl border border-[#D9DBD5] dark:border-[#323643] text-xs font-semibold hover:bg-[#F3F4F1] dark:hover:bg-[#23262F] cursor-pointer"
          >
            Download .XLSX
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-[#D9DBD5] dark:border-[#323643] text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            {!isSignedIn || !hasToken ? (
              <button
                type="button"
                onClick={handleSignIn}
                className="px-4 py-2 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-xs font-semibold cursor-pointer"
              >
                Connect Google Account
              </button>
            ) : (
              <button
                type="button"
                disabled={syncing}
                onClick={handleSync}
                className="px-4 py-2 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {syncing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {existingSpreadsheetId ? 'Confirm Update Sheet' : 'Confirm Create & Sync'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface CalendarModalProps {
  open: boolean;
  prospect: Prospect | null;
  accessToken: string | null;
  onClose: () => void;
  onSignIn: () => Promise<void>;
  onBooked: (eventLink?: string) => void;
}

export const CalendarBookingModal: React.FC<CalendarModalProps> = ({
  open,
  prospect,
  accessToken,
  onClose,
  onSignIn,
  onBooked,
}) => {
  const [calendars, setCalendars] = useState<CalendarOption[]>([
    { id: 'primary', summary: 'Primary Calendar', primary: true },
  ]);
  const [calendarId, setCalendarId] = useState('primary');
  const [date, setDate] = useState(
    prospect?.nextFollowUp || addDaysUtc(getLocalIsoDate(), 1)
  );
  const [time, setTime] = useState('14:00');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !prospect) return;
    setSummary(`Discovery Call: ${prospect.businessName} (${prospect.contactPerson})`);
    setDescription(
      `Niche: ${prospect.categoryNiche}\nCity: ${prospect.city}, ${prospect.country}\nService Interest: ${prospect.serviceInterest}\nNotes: ${prospect.replyNotes}`
    );
    setDate(prospect.nextFollowUp || addDaysUtc(getLocalIsoDate(), 1));
    setError(null);
  }, [open, prospect]);

  useEffect(() => {
    if (!open || !accessToken) return;
    listGoogleCalendars(accessToken)
      .then((list) => {
        if (list.length > 0) {
          setCalendars(list);
          const primary = list.find((c) => c.primary) || list[0];
          setCalendarId(primary.id);
        }
      })
      .catch(() => {});
  }, [open, accessToken]);

  if (!open || !prospect) return null;

  const handleConfirmBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setBooking(true);
    setError(null);
    try {
      const created = await createCalendarDiscoveryCall(accessToken, {
        calendarId,
        summary,
        description,
        date,
        time,
        durationMinutes: 30,
        attendeeEmail: prospect.email,
      });
      onBooked(created.htmlLink);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create Google Calendar event.');
    } finally {
      setBooking(false);
    }
  };

  const handleSignIn = async () => {
    setError(null);
    try {
      await onSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in was cancelled or failed.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#16181E] text-[#111214] dark:text-[#F4F5F7] border border-transparent dark:border-[#2C2F3A] rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-[#6D28D9] dark:text-[#C8B6FF]" />
            <h2 className="text-lg font-display font-bold">Confirm Google Calendar Event</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#F3F4F1] dark:hover:bg-[#23262F] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleConfirmBook} className="space-y-3 text-xs">
          <div>
            <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">
              Calendar
            </label>
            <select
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 bg-[#FAFAF8] dark:bg-[#1C1F26] dark:text-[#F4F5F7]"
            >
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.summary}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">
                Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] dark:bg-[#1C1F26] px-3 py-2 font-mono-tabular"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">
                Start Time
              </label>
              <input
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] dark:bg-[#1C1F26] px-3 py-2 font-mono-tabular"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">
              Event Title
            </label>
            <input
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] dark:bg-[#1C1F26] px-3 py-2"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-[#666A73] dark:text-[#9CA3AF] uppercase">
              Agenda / Notes {prospect.email ? `(Invite: ${prospect.email})` : ''}
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] dark:bg-[#1C1F26] px-3 py-2"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800/60 p-2.5 text-xs text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-[#D9DBD5] dark:border-[#323643] font-semibold cursor-pointer"
            >
              Cancel
            </button>
            {!accessToken ? (
              <button
                type="button"
                onClick={handleSignIn}
                className="px-4 py-2 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] font-semibold cursor-pointer"
              >
                Sign in with Google to Book
              </button>
            ) : (
              <button
                type="submit"
                disabled={booking}
                className="px-4 py-2 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {booking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm & Create Event
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
