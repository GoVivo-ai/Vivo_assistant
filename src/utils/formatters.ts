import type {
  CalendarEventItem,
  ClickUpTaskItem,
  DriveItem,
  ProviderName,
} from '../types';
import { formatDate, formatEventStart } from './dates';

export type Lang = 'es' | 'en';

const S = {
  en: {
    driveIntro: 'I found these matching Drive items:',
    driveListIntro: 'Here are your most recent Drive items:',
    driveEmpty: 'I could not find any matching Drive items available for your account.',
    type: 'Type',
    lastModified: 'Last modified',
    owner: 'Owner',
    open: 'Open',
    link: 'link',
    meetings: (label: string) => `Your meetings ${label}:`,
    calendarEmpty: (label: string) => `You have no meetings ${label} on your connected calendar.`,
    location: 'Location',
    foundTask: 'I found this task:',
    foundTasks: 'I found these tasks:',
    cuEmpty: 'I could not find any matching tasks available for your account.',
    status: 'Status',
    assignee: 'Assignee',
    priority: 'Priority',
    dueDate: 'Due date',
    where: 'Where',
    overdueTasks: 'Your overdue tasks:',
    inProgressTasks: 'Your tasks in progress:',
    yourTasks: 'Your tasks:',
    connectGoogle: 'You need to connect your Google account first. Use `/vivo-connect`.',
    connectClickup: 'You need to connect your ClickUp account first. Use `/vivo-connect`.',
    reconnect: (name: string) =>
      `Your ${name} connection has expired. Please reconnect it with \`/vivo-connect\`.`,
    rateLimit: 'That service is rate-limiting requests right now. Please try again in a minute.',
    genericError:
      "I couldn't complete that request right now. Please try again or reconnect your account with `/vivo-connect`.",
    unknown: "I'm not sure how to help with that yet. Try `/vivo-help` to see what I can do.",
  },
  es: {
    driveIntro: 'Encontré estos elementos en Drive:',
    driveListIntro: 'Estos son tus elementos más recientes en Drive:',
    driveEmpty: 'No encontré archivos o carpetas que coincidan, disponibles para tu cuenta.',
    type: 'Tipo',
    lastModified: 'Última modificación',
    owner: 'Propietario',
    open: 'Abrir',
    link: 'enlace',
    meetings: (label: string) => `Tus reuniones ${label}:`,
    calendarEmpty: (label: string) => `No tienes reuniones ${label} en tu calendario conectado.`,
    location: 'Lugar',
    foundTask: 'Encontré esta tarea:',
    foundTasks: 'Encontré estas tareas:',
    cuEmpty: 'No encontré tareas que coincidan, disponibles para tu cuenta.',
    status: 'Estado',
    assignee: 'Responsable',
    priority: 'Prioridad',
    dueDate: 'Fecha límite',
    where: 'Ubicación',
    overdueTasks: 'Tus tareas vencidas:',
    inProgressTasks: 'Tus tareas en progreso:',
    yourTasks: 'Tus tareas:',
    connectGoogle: 'Primero necesitas conectar tu cuenta de Google. Usa `/vivo-connect`.',
    connectClickup: 'Primero necesitas conectar tu cuenta de ClickUp. Usa `/vivo-connect`.',
    reconnect: (name: string) =>
      `Tu conexión con ${name} expiró. Vuelve a conectarla con \`/vivo-connect\`.`,
    rateLimit: 'Ese servicio está limitando las solicitudes ahora mismo. Intenta de nuevo en un minuto.',
    genericError:
      'No pude completar esa solicitud. Intenta de nuevo o reconecta tu cuenta con `/vivo-connect`.',
    unknown: 'Aún no sé cómo ayudarte con eso. Usa `/vivo-help` para ver lo que puedo hacer.',
  },
} as const;

export function t(lang: Lang) {
  return S[lang];
}

export function helpText(lang: Lang = 'en'): string {
  if (lang === 'es') {
    return [
      '*Vivo Assistant* puede ayudarte con:',
      '',
      '*Drive*',
      '• `busca la propuesta de Alexia`',
      '• `dónde está la carpeta del sitio de Vectora?`',
      '',
      '*Calendario*',
      '• `qué reuniones tengo hoy?`',
      '• `qué reuniones tengo esta semana?`',
      '',
      '*ClickUp*',
      '• `en qué va la tarea de payroll?`',
      '• `muéstrame mis tareas vencidas`',
      '• `qué tareas tengo pendientes?`',
      '',
      '*Comandos*',
      '• `/vivo-connect` — conecta tus cuentas de Google y ClickUp',
      '• `/vivo-whoami` — mira tus cuentas conectadas',
      '• `/vivo-disconnect [google|clickup]` — desconecta cuentas',
      '• `/vivo-help` — muestra esta ayuda',
      '',
      '💬 Puedes escribirme en español o en inglés.',
    ].join('\n');
  }
  return [
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
    '',
    '💬 You can write to me in English or Spanish.',
  ].join('\n');
}

export function connectPrompt(provider: ProviderName, lang: Lang = 'en'): string {
  return provider === 'google' ? t(lang).connectGoogle : t(lang).connectClickup;
}

export function reconnectPrompt(provider: ProviderName, lang: Lang = 'en'): string {
  return t(lang).reconnect(provider === 'google' ? 'Google' : 'ClickUp');
}

const MIME_LABELS: Record<string, string> = {
  'application/vnd.google-apps.document': 'Google Docs',
  'application/vnd.google-apps.spreadsheet': 'Google Sheets',
  'application/vnd.google-apps.presentation': 'Google Slides',
  'application/vnd.google-apps.folder': 'Folder',
  'application/vnd.google-apps.form': 'Google Forms',
  'application/pdf': 'PDF',
};

function mimeLabel(mimeType: string, lang: Lang): string {
  if (mimeType === 'application/vnd.google-apps.folder') {
    return lang === 'es' ? 'Carpeta' : 'Folder';
  }
  if (MIME_LABELS[mimeType]) return MIME_LABELS[mimeType];
  const segment = mimeType.split('/').pop() ?? mimeType;
  return segment.toUpperCase().slice(0, 20);
}

export function formatDriveResults(
  items: DriveItem[],
  lang: Lang = 'en',
  isSearch = true,
): string {
  const s = t(lang);
  if (items.length === 0) return s.driveEmpty;
  const lines = items.map((item, i) => {
    const parts = [`*${i + 1}. ${item.name}*`, `${s.type}: ${mimeLabel(item.mimeType, lang)}`];
    if (item.modifiedTime) parts.push(`${s.lastModified}: ${formatDate(item.modifiedTime, lang)}`);
    if (item.owners.length > 0) parts.push(`${s.owner}: ${item.owners.join(', ')}`);
    if (item.webViewLink) parts.push(`${s.open}: <${item.webViewLink}|${s.link}>`);
    return parts.join('\n');
  });
  return `${isSearch ? s.driveIntro : s.driveListIntro}\n\n${lines.join('\n\n')}`;
}

export function formatCalendarResults(
  events: CalendarEventItem[],
  rangeLabel: string,
  lang: Lang = 'en',
): string {
  const s = t(lang);
  if (events.length === 0) return s.calendarEmpty(rangeLabel);
  const lines = events.map((event) => {
    const parts = [`*${formatEventStart(event, lang)}*`, event.summary];
    if (event.location) parts.push(`${s.location}: ${event.location}`);
    if (event.htmlLink) parts.push(`${s.open}: <${event.htmlLink}|${s.link}>`);
    return parts.join('\n');
  });
  return `${s.meetings(rangeLabel)}\n\n${lines.join('\n\n')}`;
}

export function formatClickUpTasks(
  tasks: ClickUpTaskItem[],
  intro: string,
  lang: Lang = 'en',
): string {
  const s = t(lang);
  if (tasks.length === 0) return s.cuEmpty;
  const lines = tasks.map((task) => {
    const parts = [`*${task.name}*`, `${s.status}: ${task.status}`];
    if (task.assignees.length > 0) parts.push(`${s.assignee}: ${task.assignees.join(', ')}`);
    if (task.priority) parts.push(`${s.priority}: ${task.priority}`);
    if (task.dueDate) parts.push(`${s.dueDate}: ${formatDate(task.dueDate, lang)}`);
    const location = [task.space, task.folder, task.list].filter(Boolean).join(' › ');
    if (location) parts.push(`${s.where}: ${location}`);
    parts.push(`${s.open}: <${task.url}|${s.link}>`);
    return parts.join('\n');
  });
  return `${intro}\n\n${lines.join('\n\n')}`;
}
