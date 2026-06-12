import { google } from 'googleapis';
import { getGoogleAccessToken } from '../services/tokenService';
import type { DriveItem, DriveSearchType } from '../types';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MAX_SEARCH_RESULTS = 5;
const MAX_LIST_RESULTS = 10;

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Searches Drive files/folders visible to THIS user only, using the access
 * token of the requesting user. Excludes trashed items.
 * Without a query it lists the user's most recently modified items instead.
 */
export async function searchDriveFiles(
  userId: string,
  query: string | undefined,
  type: DriveSearchType = 'any',
): Promise<DriveItem[]> {
  const accessToken = await getGoogleAccessToken(userId);

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth });

  const isSearch = Boolean(query && query.trim().length > 0);
  const maxResults = isSearch ? MAX_SEARCH_RESULTS : MAX_LIST_RESULTS;
  const conditions = ['trashed = false'];
  if (isSearch) conditions.push(`name contains '${escapeDriveQuery(query!.trim())}'`);
  if (type === 'folder') conditions.push(`mimeType = '${FOLDER_MIME}'`);
  if (type === 'file') conditions.push(`mimeType != '${FOLDER_MIME}'`);

  const response = await drive.files.list({
    q: conditions.join(' and '),
    pageSize: maxResults,
    orderBy: 'modifiedTime desc',
    fields: 'files(id, name, mimeType, webViewLink, modifiedTime, owners(displayName, emailAddress))',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const files = response.data.files ?? [];
  return files.slice(0, maxResults).map((file) => ({
    id: file.id ?? '',
    name: file.name ?? '(unnamed)',
    mimeType: file.mimeType ?? 'unknown',
    webViewLink: file.webViewLink ?? undefined,
    modifiedTime: file.modifiedTime ?? undefined,
    owners: (file.owners ?? [])
      .map((owner) => owner.displayName ?? owner.emailAddress ?? '')
      .filter(Boolean),
  }));
}
