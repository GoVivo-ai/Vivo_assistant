import { getClickUpAccessToken } from '../services/tokenService';
import { companyNow, isWithinRange, resolveDateRange } from '../utils/dates';
import {
  RateLimitError,
  ReconnectRequiredError,
  type ClickUpTaskItem,
  type ClickUpTaskRange,
  type ClickUpTaskStatusFilter,
} from '../types';

const CLICKUP_API = 'https://api.clickup.com/api/v2';
const MAX_SEARCH_RESULTS = 5;
const MAX_MY_TASKS_RESULTS = 10;
const MAX_PAGES = 3;

interface ClickUpRawTask {
  id: string;
  name: string;
  status?: { status?: string; type?: string };
  assignees?: Array<{ username?: string; email?: string }>;
  priority?: { priority?: string } | null;
  due_date?: string | null;
  url: string;
  list?: { name?: string };
  folder?: { name?: string; hidden?: boolean };
  space?: { id?: string; name?: string };
}

async function clickupFetch<T>(
  token: string,
  path: string,
  params?: Record<string, string | string[]>,
): Promise<T> {
  const url = new URL(`${CLICKUP_API}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, item);
      } else {
        url.searchParams.set(key, value);
      }
    }
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: token, 'Content-Type': 'application/json' },
  });

  if (response.status === 401 || response.status === 403) {
    throw new ReconnectRequiredError('clickup');
  }
  if (response.status === 429) {
    throw new RateLimitError('clickup');
  }
  if (!response.ok) {
    throw new Error(`ClickUp API request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

async function getTeams(token: string): Promise<Array<{ id: string; name: string }>> {
  const data = await clickupFetch<{ teams: Array<{ id: string; name: string }> }>(token, '/team');
  return data.teams ?? [];
}

async function getAuthorizedUser(token: string): Promise<{ id: number; username: string }> {
  const data = await clickupFetch<{ user: { id: number; username: string } }>(token, '/user');
  return data.user;
}

function mapTask(raw: ClickUpRawTask): ClickUpTaskItem {
  return {
    id: raw.id,
    name: raw.name,
    status: raw.status?.status ?? 'unknown',
    assignees: (raw.assignees ?? [])
      .map((assignee) => assignee.username ?? assignee.email ?? '')
      .filter(Boolean),
    priority: raw.priority?.priority ?? undefined,
    dueDate: raw.due_date ? new Date(Number(raw.due_date)) : null,
    url: raw.url,
    list: raw.list?.name,
    folder: raw.folder?.hidden ? undefined : raw.folder?.name,
    space: raw.space?.name,
  };
}

async function fetchTeamTasks(
  token: string,
  teamId: string,
  extraParams: Record<string, string | string[]> = {},
): Promise<ClickUpRawTask[]> {
  const tasks: ClickUpRawTask[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await clickupFetch<{ tasks: ClickUpRawTask[]; last_page?: boolean }>(
      token,
      `/team/${teamId}/task`,
      { page: String(page), include_closed: 'false', subtasks: 'true', ...extraParams },
    );
    tasks.push(...(data.tasks ?? []));
    if (data.last_page || (data.tasks ?? []).length === 0) break;
  }
  return tasks;
}

/**
 * Searches tasks visible to THIS user only (their OAuth token determines
 * visibility), matching by task name. Max 5 results.
 */
export async function searchClickUpTasks(userId: string, query: string): Promise<ClickUpTaskItem[]> {
  const token = await getClickUpAccessToken(userId);
  const teams = await getTeams(token);
  const needle = query.toLowerCase();
  const results: ClickUpTaskItem[] = [];

  for (const team of teams) {
    const tasks = await fetchTeamTasks(token, team.id);
    for (const task of tasks) {
      if (task.name.toLowerCase().includes(needle)) {
        results.push(mapTask(task));
        if (results.length >= MAX_SEARCH_RESULTS) return results;
      }
    }
  }
  return results;
}

/**
 * Fetches tasks assigned to the authenticated ClickUp user (resolved from
 * their own OAuth token), optionally filtered by status and due-date range.
 */
export async function getMyClickUpTasks(
  userId: string,
  status: ClickUpTaskStatusFilter = 'all',
  range: ClickUpTaskRange = 'all',
): Promise<ClickUpTaskItem[]> {
  const token = await getClickUpAccessToken(userId);
  const me = await getAuthorizedUser(token);
  const teams = await getTeams(token);

  let tasks: ClickUpTaskItem[] = [];
  for (const team of teams) {
    const raw = await fetchTeamTasks(token, team.id, { 'assignees[]': String(me.id) });
    tasks.push(...raw.map(mapTask));
  }

  const now = companyNow().toMillis();
  if (status === 'overdue') {
    tasks = tasks.filter((task) => task.dueDate && task.dueDate.getTime() < now);
  } else if (status === 'in_progress') {
    tasks = tasks.filter((task) => /progress/i.test(task.status));
  }
  // 'open' and 'all': include_closed=false already limits to open tasks.

  if (range !== 'all') {
    const dateRange = resolveDateRange(range === 'today' ? 'today' : 'this_week');
    tasks = tasks.filter((task) => task.dueDate && isWithinRange(task.dueDate, dateRange));
  }

  tasks.sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });

  return tasks.slice(0, MAX_MY_TASKS_RESULTS);
}
