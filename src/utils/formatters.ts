import type {
  CalendarEventItem,
  ClickUpTaskItem,
  DriveItem,
  ProviderName,
} from '../types';
import { formatDate, formatEventStart } from './dates';

export const HELP_TEXT = [
  '*Vivo Assistant* can help you with:',
  '',
  '*Drive*',
  '• `@Vivo Assistant find Alexia proposal`',
  '• `@Vivo Assistant where is the Vectora website folder?`',
  '',
  '*Calendar*',
  '• `@Vivo Assistant what meetings do I have today?`',
  '• `@Vivo Assistant what meetings do I have this week?`',
  '',
  '*ClickUp*',
  '• `@Vivo Assistant status of payroll task`',
  '• `@Vivo Assistant show my overdue tasks`',
  '• `@Vivo Assistant what tasks do I have pending?`',
  '',
  '*Commands*',
  '• `/vivo-connect` — connect your Google and ClickUp accounts',
  '• `/vivo-whoami` — see your connected accounts',
  '• `/vivo-disconnect [google|clickup]` — remove connections',
  '• `/vivo-help` — show this help',
].join('\n');

export const UNKNOWN_TEXT =
  "I'm not sure how to help with that yet. Try `/vivo-help` to see what I can do.";

export const GENERIC_ERROR_TEXT =
  "I couldn't complete that request right now. Please try again or reconnect your account with `/vivo-connect`.";

export function connectPrompt(provider: ProviderName): string {
  return provider === 'google'
    ? 'You need to connect your Google account first. Use `/vivo-connect`.'
    : 'You need to connect your ClickUp account first. Use `/vivo-connect`.';
}

export function reconnectPrompt(provider: ProviderName): string {
  const name = provider === 'google' ? 'Google' : 'ClickUp';
  return `Your ${name} connection has expired. Please reconnect it with \`/vivo-connect\`.`;
}

const MIME_LABELS: Record<string, string> = {
  'application/vnd.google-apps.document': 'Google Docs',
  'application/vnd.google-apps.spreadsheet': 'Google Sheets',
  'application/vnd.google-apps.presentation': 'Google Slides',
  'application/vnd.google-apps.folder': 'Folder',
  'application/vnd.google-apps.form': 'Google Forms',
  'application/pdf': 'PDF',
};

function mimeLabel(mimeType: string): string {
  if (MIME_LABELS[mimeType]) return MIME_LABELS[mimeType];
  const segment = mimeType.split('/').pop() ?? mimeType;
  return segment.toUpperCase().slice(0, 20);
}

export function formatDriveResults(items: DriveItem[]): string {
  if (items.length === 0) {
    return 'I could not find any matching Drive items available for your account.';
  }
  const lines = items.map((item, i) => {
    const parts = [`*${i + 1}. ${item.name}*`, `Type: ${mimeLabel(item.mimeType)}`];
    if (item.modifiedTime) parts.push(`Last modified: ${formatDate(item.modifiedTime)}`);
    if (item.owners.length > 0) parts.push(`Owner: ${item.owners.join(', ')}`);
    if (item.webViewLink) parts.push(`Open: <${item.webViewLink}|link>`);
    return parts.join('\n');
  });
  return `I found these matching Drive items:\n\n${lines.join('\n\n')}`;
}

export function formatCalendarResults(events: CalendarEventItem[], rangeLabel: string): string {
  if (events.length === 0) {
    return `You have no meetings ${rangeLabel} on your connected calendar.`;
  }
  const lines = events.map((event) => {
    const parts = [`*${formatEventStart(event)}*`, event.summary];
    if (event.location) parts.push(`Location: ${event.location}`);
    if (event.htmlLink) parts.push(`Open: <${event.htmlLink}|link>`);
    return parts.join('\n');
  });
  return `Your meetings ${rangeLabel}:\n\n${lines.join('\n\n')}`;
}

export function formatClickUpTasks(tasks: ClickUpTaskItem[], intro: string): string {
  if (tasks.length === 0) {
    return 'I could not find any matching tasks available for your account.';
  }
  const lines = tasks.map((task) => {
    const parts = [`*${task.name}*`, `Status: ${task.status}`];
    if (task.assignees.length > 0) parts.push(`Assignee: ${task.assignees.join(', ')}`);
    if (task.priority) parts.push(`Priority: ${task.priority}`);
    if (task.dueDate) parts.push(`Due date: ${formatDate(task.dueDate)}`);
    const location = [task.space, task.folder, task.list].filter(Boolean).join(' › ');
    if (location) parts.push(`Where: ${location}`);
    parts.push(`Open: <${task.url}|link>`);
    return parts.join('\n');
  });
  return `${intro}\n\n${lines.join('\n\n')}`;
}
