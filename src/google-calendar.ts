import fs from 'fs';
import os from 'os';
import path from 'path';

import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

import { logger } from './logger.js';

let calendarClient: calendar_v3.Calendar | null = null;
let oauth2Client: OAuth2Client | null = null;

function getCredPaths() {
  const credDir = path.join(os.homedir(), '.gmail-mcp');
  return {
    keysPath: path.join(credDir, 'gcp-oauth.keys.json'),
    tokensPath: path.join(credDir, 'credentials.json'),
  };
}

export function initCalendar(): boolean {
  const { keysPath, tokensPath } = getCredPaths();

  if (!fs.existsSync(keysPath) || !fs.existsSync(tokensPath)) {
    logger.warn(
      'Google credentials not found. Skipping Calendar. Re-run gmail-auth with calendar scope.',
    );
    return false;
  }

  const keys = JSON.parse(fs.readFileSync(keysPath, 'utf-8'));
  const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));

  const clientConfig = keys.installed || keys.web || keys;
  const { client_id, client_secret, redirect_uris } = clientConfig;

  oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris?.[0],
  );
  oauth2Client.setCredentials(tokens);

  oauth2Client.on('tokens', (newTokens) => {
    try {
      const current = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));
      Object.assign(current, newTokens);
      fs.writeFileSync(tokensPath, JSON.stringify(current, null, 2));
      logger.debug('Calendar OAuth tokens refreshed');
    } catch (err) {
      logger.warn({ err }, 'Failed to persist refreshed Calendar tokens');
    }
  });

  calendarClient = google.calendar({ version: 'v3', auth: oauth2Client });
  logger.info('Google Calendar initialized');
  return true;
}

function getCalendar(): calendar_v3.Calendar {
  if (!calendarClient) {
    throw new Error('Calendar not initialized. Call initCalendar() first.');
  }
  return calendarClient;
}

export interface CalendarEvent {
  id?: string;
  title: string;
  description?: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  location?: string;
  allDay?: boolean;
}

/**
 * List events within a time range.
 */
export async function listEvents(
  timeMin: string,
  timeMax: string,
  maxResults = 50,
): Promise<CalendarEvent[]> {
  const cal = getCalendar();
  const res = await cal.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return (res.data.items || []).map((e) => ({
    id: e.id || undefined,
    title: e.summary || '(sem título)',
    description: e.description || undefined,
    start: e.start?.dateTime || e.start?.date || '',
    end: e.end?.dateTime || e.end?.date || '',
    location: e.location || undefined,
    allDay: !!e.start?.date,
  }));
}

/**
 * Get today's events.
 */
export async function getTodayEvents(): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  return listEvents(startOfDay.toISOString(), endOfDay.toISOString());
}

/**
 * Get tomorrow's events.
 */
export async function getTomorrowEvents(): Promise<CalendarEvent[]> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const startOfDay = new Date(tomorrow);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(tomorrow);
  endOfDay.setHours(23, 59, 59, 999);

  return listEvents(startOfDay.toISOString(), endOfDay.toISOString());
}

/**
 * Create a new calendar event.
 */
export async function createEvent(
  event: CalendarEvent,
): Promise<CalendarEvent> {
  const cal = getCalendar();

  const startField = event.allDay
    ? { date: event.start.split('T')[0] }
    : { dateTime: event.start };
  const endField = event.allDay
    ? { date: event.end.split('T')[0] }
    : { dateTime: event.end };

  const res = await cal.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: startField,
      end: endField,
    },
  });

  logger.info({ eventId: res.data.id, title: event.title }, 'Event created');
  return {
    id: res.data.id || undefined,
    title: res.data.summary || event.title,
    description: res.data.description || undefined,
    start: res.data.start?.dateTime || res.data.start?.date || event.start,
    end: res.data.end?.dateTime || res.data.end?.date || event.end,
    location: res.data.location || undefined,
  };
}

/**
 * Create multiple events at once.
 */
export async function createEvents(
  events: CalendarEvent[],
): Promise<CalendarEvent[]> {
  const results: CalendarEvent[] = [];
  for (const event of events) {
    results.push(await createEvent(event));
  }
  return results;
}

/**
 * Delete an event by ID.
 */
export async function deleteEvent(eventId: string): Promise<void> {
  const cal = getCalendar();
  await cal.events.delete({ calendarId: 'primary', eventId });
  logger.info({ eventId }, 'Event deleted');
}

/**
 * Update an existing event.
 */
export async function updateEvent(
  eventId: string,
  updates: Partial<CalendarEvent>,
): Promise<CalendarEvent> {
  const cal = getCalendar();

  const requestBody: calendar_v3.Schema$Event = {};
  if (updates.title) requestBody.summary = updates.title;
  if (updates.description) requestBody.description = updates.description;
  if (updates.location) requestBody.location = updates.location;
  if (updates.start) {
    requestBody.start = updates.allDay
      ? { date: updates.start.split('T')[0] }
      : { dateTime: updates.start };
  }
  if (updates.end) {
    requestBody.end = updates.allDay
      ? { date: updates.end.split('T')[0] }
      : { dateTime: updates.end };
  }

  const res = await cal.events.patch({
    calendarId: 'primary',
    eventId,
    requestBody,
  });

  logger.info({ eventId }, 'Event updated');
  return {
    id: res.data.id || undefined,
    title: res.data.summary || '',
    description: res.data.description || undefined,
    start: res.data.start?.dateTime || res.data.start?.date || '',
    end: res.data.end?.dateTime || res.data.end?.date || '',
    location: res.data.location || undefined,
  };
}

/**
 * Format events into a readable message for WhatsApp.
 */
export function formatEventsMessage(
  events: CalendarEvent[],
  header: string,
): string {
  if (events.length === 0) return `${header}\n\nNenhum evento encontrado.`;

  const lines = events.map((e) => {
    const time = e.allDay
      ? 'Dia inteiro'
      : new Date(e.start).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        });
    const location = e.location ? ` 📍 ${e.location}` : '';
    return `• ${time} — ${e.title}${location}`;
  });

  return `${header}\n\n${lines.join('\n')}`;
}
