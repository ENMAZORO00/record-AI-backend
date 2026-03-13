/**
 * Helpers for transcript access: owned + shared with user.
 * Used by transcripts routes, search, and assistant chat.
 */

import { prisma } from '../config/prisma.js'

const transcriptInclude = {
  Conversation: { orderBy: { id: 'asc' } },
}

/**
 * Get all transcripts the user can access (owned + shared).
 * Each transcript includes isOwner: boolean.
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function getTranscriptsForUser(userId) {
  const [owned, sharedRows] = await Promise.all([
    prisma.transcript.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: transcriptInclude,
    }),
    prisma.transcriptShare.findMany({
      where: { sharedWithId: userId },
      include: {
        transcript: {
          include: transcriptInclude,
        },
      },
    }),
  ])

  const ownedMap = new Map(owned.map((t) => [t.id, { ...t, isOwner: true }]))
  for (const row of sharedRows) {
    if (!ownedMap.has(row.transcript.id)) {
      ownedMap.set(row.transcript.id, {
        ...row.transcript,
        isOwner: false,
      })
    }
  }

  return Array.from(ownedMap.values()).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  )
}

/**
 * Get a single transcript if user owns it or it's shared with them.
 * @param {string} transcriptId
 * @param {string} userId
 * @returns {Promise<{ transcript: object, isOwner: boolean } | null>}
 */
export async function getTranscriptForUser(transcriptId, userId) {
  const owned = await prisma.transcript.findFirst({
    where: { id: transcriptId, userId },
    include: transcriptInclude,
  })
  if (owned) return { transcript: owned, isOwner: true }

  const share = await prisma.transcriptShare.findFirst({
    where: { transcriptId, sharedWithId: userId },
    include: {
      transcript: { include: transcriptInclude },
    },
  })
  if (share) return { transcript: share.transcript, isOwner: false }

  return null
}
