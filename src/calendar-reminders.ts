import fs from 'fs';
import path from 'path';

import {
  initCalendar,
  getTodayEvents,
  getTomorrowEvents,
  listEvents,
  formatEventsMessage,
} from './google-calendar.js';
import { GROUPS_DIR, TIMEZONE } from './config.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

interface CalendarReminderDeps {
  registeredGroups: () => Record<string, RegisteredGroup>;
  sendMessage: (jid: string, text: string) => Promise<void>;
}

let deps: CalendarReminderDeps | null = null;
let morningTimer: ReturnType<typeof setTimeout> | null = null;
let eveningTimer: ReturnType<typeof setTimeout> | null = null;
let cacheTimer: ReturnType<typeof setInterval> | null = null;

function findMainGroupJid(): string | null {
  if (!deps) return null;
  const groups = deps.registeredGroups();
  for (const [jid, group] of Object.entries(groups)) {
    if (group.isMain) return jid;
  }
  return null;
}

function msUntilNextHour(hour: number): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - now.getTime();
}

async function sendMorningReminder(): Promise<void> {
  try {
    const jid = findMainGroupJid();
    if (!jid || !deps) return;

    const events = await getTodayEvents();
    const msg = formatEventsMessage(events, '☀️ *Agenda de hoje*');
    await deps.sendMessage(jid, msg);
    logger.info({ eventCount: events.length }, 'Morning calendar reminder sent');
  } catch (err) {
    logger.error({ err }, 'Failed to send morning calendar reminder');
  }

  // Schedule next morning reminder
  morningTimer = setTimeout(() => sendMorningReminder(), msUntilNextHour(9));
}

async function sendEveningReminder(): Promise<void> {
  try {
    const jid = findMainGroupJid();
    if (!jid || !deps) return;

    const events = await getTomorrowEvents();
    const msg = formatEventsMessage(events, '🌙 *Agenda de amanhã*');
    await deps.sendMessage(jid, msg);
    logger.info(
      { eventCount: events.length },
      'Evening calendar reminder sent',
    );
  } catch (err) {
    logger.error({ err }, 'Failed to send evening calendar reminder');
  }

  // Schedule next evening reminder
  eveningTimer = setTimeout(() => sendEveningReminder(), msUntilNextHour(23));
}

/**
 * Write upcoming 5-day events to a JSON file so the agent can read them on demand.
 */
async function updateEventCache(): Promise<void> {
  try {
    const now = new Date();
    const fiveDaysLater = new Date(now);
    fiveDaysLater.setDate(fiveDaysLater.getDate() + 5);

    const events = await listEvents(
      now.toISOString(),
      fiveDaysLater.toISOString(),
      100,
    );

    // Write to main group folder and global folder
    const cacheData = {
      updated_at: now.toISOString(),
      timezone: TIMEZONE,
      range: { from: now.toISOString(), to: fiveDaysLater.toISOString() },
      events,
    };
    const json = JSON.stringify(cacheData, null, 2);

    const globalPath = path.join(GROUPS_DIR, 'global', 'calendar-events.json');
    fs.writeFileSync(globalPath, json);

    logger.debug(
      { eventCount: events.length },
      'Calendar event cache updated',
    );
  } catch (err) {
    logger.error({ err }, 'Failed to update calendar event cache');
  }
}

export function startCalendarReminders(
  dependencies: CalendarReminderDeps,
): void {
  deps = dependencies;

  if (!initCalendar()) {
    logger.warn('Calendar not initialized — reminders disabled');
    return;
  }

  logger.info(
    { timezone: TIMEZONE },
    'Starting calendar reminders (9h + 23h)',
  );

  // Schedule first morning reminder
  const msMorning = msUntilNextHour(9);
  logger.info(
    { nextIn: `${Math.round(msMorning / 60000)}min` },
    'Next morning reminder scheduled',
  );
  morningTimer = setTimeout(() => sendMorningReminder(), msMorning);

  // Schedule first evening reminder
  const msEvening = msUntilNextHour(23);
  logger.info(
    { nextIn: `${Math.round(msEvening / 60000)}min` },
    'Next evening reminder scheduled',
  );
  eveningTimer = setTimeout(() => sendEveningReminder(), msEvening);

  // Update event cache every 30 minutes
  updateEventCache();
  cacheTimer = setInterval(() => updateEventCache(), 30 * 60 * 1000);
}

export function stopCalendarReminders(): void {
  if (morningTimer) clearTimeout(morningTimer);
  if (eveningTimer) clearTimeout(eveningTimer);
  if (cacheTimer) clearInterval(cacheTimer);
  morningTimer = null;
  eveningTimer = null;
  cacheTimer = null;
}
