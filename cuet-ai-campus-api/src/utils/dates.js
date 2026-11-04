import { env } from '../config/env.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(value) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function assertDateString(value, field = 'date') {
  if (!isValidDateString(value)) {
    throw new Error(`${field} must be a valid YYYY-MM-DD date`);
  }
  return value;
}

export function dateInTimeZone(value = new Date(), timeZone = env.timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value;
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

export const todayISO = (timeZone = env.timeZone) => dateInTimeZone(new Date(), timeZone);

export function normalizeDate(value, { fallback = null } = {}) {
  if (!value) return fallback;
  if (value instanceof Date) return dateInTimeZone(value);
  const raw = String(value).trim();
  if (isValidDateString(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return dateInTimeZone(parsed);
}

export function addDays(dateString, days) {
  const [year, month, day] = assertDateString(dateString).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dayNameFor(dateString) {
  const [year, month, day] = assertDateString(dateString).split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function dateRange(from, to, { maxDays = 366 } = {}) {
  assertDateString(from, 'from');
  assertDateString(to, 'to');
  if (from > to) throw new Error('from must be before or equal to to');

  const days = [];
  let cursor = from;
  while (cursor <= to) {
    days.push(cursor);
    if (days.length > maxDays) {
      throw new Error(`Date range cannot exceed ${maxDays} days`);
    }
    cursor = addDays(cursor, 1);
  }
  return days;
}

export function datesOverlap(startA, endA, startB, endB) {
  return startA <= endB && startB <= endA;
}

export function timeToMinutes(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isValidTime(value) {
  return timeToMinutes(value) != null;
}

export function timesOverlap(startA, endA, startB, endB) {
  const aStart = timeToMinutes(startA);
  const aEnd = timeToMinutes(endA);
  const bStart = timeToMinutes(startB);
  const bEnd = timeToMinutes(endB);
  if ([aStart, aEnd, bStart, bEnd].some((v) => v == null)) return false;
  return aStart < bEnd && bStart < aEnd;
}

export function endOfDay(dateString) {
  return new Date(`${dateString}T23:59:59.999Z`);
}

export function startOfDay(dateString) {
  return new Date(`${dateString}T00:00:00.000Z`);
}

export function toDateOnly(value) {
  if (!value) return null;
  return normalizeDate(value);
}
