import { prisma } from '../db/prisma';
import { encryptToken } from '../security/encryption';
import type { ProviderName } from '../types';

export interface UpsertConnectionInput {
  userId: string;
  provider: ProviderName;
  providerAccountId?: string | null;
  providerEmail?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  scopes?: string | null;
  expiresAt?: Date | null;
}

export async function upsertConnection(input: UpsertConnectionInput) {
  const data = {
    providerAccountId: input.providerAccountId ?? null,
    providerEmail: input.providerEmail ?? null,
    accessTokenEncrypted: encryptToken(input.accessToken),
    refreshTokenEncrypted: input.refreshToken ? encryptToken(input.refreshToken) : null,
    scopes: input.scopes ?? null,
    expiresAt: input.expiresAt ?? null,
  };
  return prisma.connection.upsert({
    where: { userId_provider: { userId: input.userId, provider: input.provider } },
    update: data,
    create: { userId: input.userId, provider: input.provider, ...data },
  });
}

export async function getConnection(userId: string, provider: ProviderName) {
  return prisma.connection.findUnique({
    where: { userId_provider: { userId, provider } },
  });
}

export async function listConnections(userId: string) {
  return prisma.connection.findMany({ where: { userId } });
}

export async function deleteConnections(userId: string, provider?: ProviderName) {
  const result = await prisma.connection.deleteMany({
    where: { userId, ...(provider ? { provider } : {}) },
  });
  return result.count;
}

/** Persist refreshed tokens after a successful refresh. */
export async function updateConnectionTokens(
  connectionId: string,
  accessToken: string,
  expiresAt: Date | null,
  refreshToken?: string | null,
) {
  return prisma.connection.update({
    where: { id: connectionId },
    data: {
      accessTokenEncrypted: encryptToken(accessToken),
      expiresAt,
      ...(refreshToken ? { refreshTokenEncrypted: encryptToken(refreshToken) } : {}),
    },
  });
}
