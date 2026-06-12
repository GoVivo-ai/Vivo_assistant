import { prisma } from '../db/prisma';

export interface SlackProfile {
  name?: string;
  email?: string;
}

export async function getOrCreateUser(
  slackUserId: string,
  slackTeamId: string,
  profile?: SlackProfile,
) {
  return prisma.user.upsert({
    where: { slackUserId_slackTeamId: { slackUserId, slackTeamId } },
    update: {
      ...(profile?.name ? { name: profile.name } : {}),
      ...(profile?.email ? { email: profile.email } : {}),
    },
    create: {
      slackUserId,
      slackTeamId,
      name: profile?.name ?? null,
      email: profile?.email ?? null,
    },
  });
}

export async function getUser(slackUserId: string, slackTeamId: string) {
  return prisma.user.findUnique({
    where: { slackUserId_slackTeamId: { slackUserId, slackTeamId } },
  });
}

/** Full reset: removes the user and (via cascade) all connections and audit logs. */
export async function deleteUser(userId: string) {
  return prisma.user.delete({ where: { id: userId } });
}
