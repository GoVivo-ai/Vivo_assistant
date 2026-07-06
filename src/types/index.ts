export type ProviderName = 'google' | 'clickup';

/** Thrown when the requesting user has no connection for the required provider. */
export class NotConnectedError extends Error {
  constructor(public readonly provider: ProviderName) {
    super(`User has no ${provider} connection`);
    this.name = 'NotConnectedError';
  }
}

/** Thrown when a refresh token is invalid/revoked and the user must reconnect. */
export class ReconnectRequiredError extends Error {
  constructor(public readonly provider: ProviderName) {
    super(`User must reconnect ${provider}`);
    this.name = 'ReconnectRequiredError';
  }
}

/** Thrown when an external API rate-limits us. */
export class RateLimitError extends Error {
  constructor(public readonly provider: ProviderName) {
    super(`${provider} API rate limit reached`);
    this.name = 'RateLimitError';
  }
}

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
  owners: string[];
}

export interface CalendarEventItem {
  summary: string;
  /** ISO datetime (or ISO date for all-day events) */
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  htmlLink?: string;
  attendees?: string[];
}

export interface ClickUpTaskItem {
  id: string;
  name: string;
  status: string;
  assignees: string[];
  priority?: string;
  dueDate?: Date | null;
  url: string;
  list?: string;
  folder?: string;
  space?: string;
}

export type CalendarRange = 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'custom';
export type DriveSearchType = 'file' | 'folder' | 'any';
export type ClickUpTaskStatusFilter = 'open' | 'in_progress' | 'overdue' | 'all';
export type ClickUpTaskRange = 'today' | 'this_week' | 'all';

/** Image attached to a Slack message (screenshot of an error, etc.). */
export interface SlackImageFile {
  slackFileId: string;
  name: string;
  mimetype: string;
  urlPrivate: string;
  size: number;
}
