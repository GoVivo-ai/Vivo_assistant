import type {
  CalendarEventItem,
  ClickUpTaskItem,
  DriveItem,
  ProviderName,
} from '../types';
import type { TicketCategory, TicketPriority, TicketStatus } from '../services/ticketService';
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
    ticketAsk:
      '🎫 Sure! Tell me what is going on — describe the problem or what you need (a Martech app issue, an account or access request, or any request for the team: what happens / what you need, since when, who is involved) and I will open the ticket right away. You can also attach a screenshot of the error and I will include it in the ticket. 📸',
    screenshotReceived:
      '📸 Got your screenshot! Now describe the problem (what fails, since when) and I will open the ticket with the image attached.',
    ticketAttachments: (n: number) =>
      n === 1 ? '📎 I attached your screenshot to the ticket.' : `📎 I attached your ${n} screenshots to the ticket.`,
    ticketOpened: (n: number) => `🎫 Done! I opened ticket *#${n}* for you:`,
    ticketFollowup:
      'The team has been notified and I will DM you here as soon as it is resolved. You can ask me "how is my ticket going?" anytime.',
    ticketListIntro: 'Here are your latest tickets:',
    ticketListEmpty:
      "You don't have any tickets yet. If something is failing or you need anything from the team (Martech app, accounts, accesses, general requests), just describe it and I'll open one for you.",
    category: 'Category',
    ticketStatus: 'Status',
    opened: 'Opened',
    resolved: 'Resolved',
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
    ticketAsk:
      '🎫 ¡Claro! Cuéntame qué está pasando — descríbeme el problema o lo que necesitas (algo de la app de Martech, una cuenta o acceso, o cualquier solicitud para el equipo: qué pasa / qué necesitas, desde cuándo, quiénes están involucrados) y te abro el ticket de una vez. También puedes adjuntar un pantallazo del error y lo incluyo en el ticket. 📸',
    screenshotReceived:
      '📸 ¡Recibí tu pantallazo! Ahora descríbeme el problema (qué falla, desde cuándo) y abro el ticket con la imagen adjunta.',
    ticketAttachments: (n: number) =>
      n === 1 ? '📎 Adjunté tu pantallazo al ticket.' : `📎 Adjunté tus ${n} pantallazos al ticket.`,
    ticketOpened: (n: number) => `🎫 ¡Listo! Abrí el ticket *#${n}* por ti:`,
    ticketFollowup:
      'El equipo ya fue notificado y te escribiré por aquí en cuanto esté solucionado. Puedes preguntarme "¿cómo va mi ticket?" cuando quieras.',
    ticketListIntro: 'Estos son tus últimos tickets:',
    ticketListEmpty:
      'Aún no tienes tickets. Si algo está fallando o necesitas algo del equipo (app de Martech, cuentas, accesos, solicitudes en general), descríbemelo y te abro uno.',
    category: 'Categoría',
    ticketStatus: 'Estado',
    opened: 'Abierto',
    resolved: 'Solucionado',
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
      '*Soporte y solicitudes*',
      '• Describe cualquier problema o solicitud (app de Martech, cuentas, accesos, etc.) y abro un ticket por ti',
      '• `cómo va mi ticket?` — consulta el estado de tus tickets',
      '• `elimina el ticket #12` — elimina un ticket tuyo (solo los que tú abriste)',
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
    '*Support & requests*',
    '• Describe any problem or request (Martech app, accounts, accesses, etc.) and I will open a ticket for you',
    '• `how is my ticket going?` — check the status of your tickets',
    '• `delete ticket #12` — delete one of your tickets (only the ones you opened)',
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

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, { es: string; en: string }> = {
  access: { es: 'Acceso / Login', en: 'Access / Login' },
  bug: { es: 'Error / Bug', en: 'Bug' },
  data: { es: 'Datos / Reportes', en: 'Data / Reports' },
  performance: { es: 'Rendimiento', en: 'Performance' },
  integration: { es: 'Integraciones', en: 'Integrations' },
  feature_request: { es: 'Solicitud de mejora', en: 'Feature request' },
  other: { es: 'Otro', en: 'Other' },
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, { es: string; en: string }> = {
  low: { es: 'Baja', en: 'Low' },
  medium: { es: 'Media', en: 'Medium' },
  high: { es: 'Alta', en: 'High' },
  urgent: { es: 'Urgente', en: 'Urgent' },
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, { es: string; en: string }> = {
  open: { es: 'Abierto', en: 'Open' },
  in_progress: { es: 'En proceso', en: 'In progress' },
  resolved: { es: 'Solucionado', en: 'Resolved' },
  closed: { es: 'Cerrado', en: 'Closed' },
};

const PRIORITY_EMOJI: Record<TicketPriority, string> = {
  low: '⚪',
  medium: '🟡',
  high: '🟠',
  urgent: '🔴',
};

const STATUS_EMOJI: Record<TicketStatus, string> = {
  open: '🆕',
  in_progress: '🔧',
  resolved: '✅',
  closed: '⬛',
};

function ticketLabel<K extends string>(
  map: Record<K, { es: string; en: string }>,
  key: string,
  lang: Lang,
): string {
  return (map as Record<string, { es: string; en: string }>)[key]?.[lang] ?? key;
}

export interface TicketView {
  number: number;
  title: string;
  category: string;
  priority: string;
  status: string;
  resolutionNote: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export function formatTicketOpened(ticket: TicketView, lang: Lang = 'es'): string {
  const s = t(lang);
  const p = PRIORITY_EMOJI[ticket.priority as TicketPriority] ?? '🟡';
  return [
    s.ticketOpened(ticket.number),
    `*${ticket.title}*`,
    `${s.category}: ${ticketLabel(TICKET_CATEGORY_LABELS, ticket.category, lang)}`,
    `${s.priority}: ${p} ${ticketLabel(TICKET_PRIORITY_LABELS, ticket.priority, lang)}`,
    '',
    s.ticketFollowup,
  ].join('\n');
}

export function formatTicketList(tickets: TicketView[], lang: Lang = 'es'): string {
  const s = t(lang);
  if (tickets.length === 0) return s.ticketListEmpty;
  const lines = tickets.map((ticket) => {
    const status = STATUS_EMOJI[ticket.status as TicketStatus] ?? '🆕';
    const parts = [
      `*#${ticket.number} — ${ticket.title}*`,
      `${s.ticketStatus}: ${status} ${ticketLabel(TICKET_STATUS_LABELS, ticket.status, lang)}`,
      `${s.priority}: ${ticketLabel(TICKET_PRIORITY_LABELS, ticket.priority, lang)} · ${s.opened}: ${formatDate(ticket.createdAt.toISOString(), lang)}`,
    ];
    if (ticket.status === 'resolved' && ticket.resolutionNote) {
      parts.push(`${s.resolved}: ${ticket.resolutionNote}`);
    }
    return parts.join('\n');
  });
  return `${s.ticketListIntro}\n\n${lines.join('\n\n')}`;
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
