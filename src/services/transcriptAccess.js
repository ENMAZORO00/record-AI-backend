/**
 * Helpers for transcript access: owned + shared + meeting participant.
 * Used by transcripts routes, search, and assistant chat.
 */

import { prisma } from '../config/prisma.js'
import { getFreshRecordingReadUrl } from './azureStorage.js'

const transcriptInclude = {
  Conversation: { orderBy: { id: 'asc' } },
}

function withFreshRecordingUrl(transcript) {
  if (!transcript) return transcript
  return {
    ...transcript,
    recordingUrl: getFreshRecordingReadUrl(transcript.recordingUrl),
  }
}

/**
 * Get all transcripts the user can access (owned + shared + meeting participant).
 * Each transcript includes isOwner: boolean and optionally meetingId/participant info.
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function getTranscriptsForUser(userId) {
  const [owned, sharedRows, meetingParticipations] = await Promise.all([
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
    prisma.meetingParticipant.findMany({
      where: { userId },
      include: {
        meeting: {
          include: {
            transcript: { include: transcriptInclude },
          },
        },
      },
    }),
  ])

  const resultMap = new Map(owned.map((t) => [t.id, { ...t, isOwner: true }]))

  for (const row of sharedRows) {
    if (!resultMap.has(row.transcript.id)) {
      resultMap.set(row.transcript.id, {
        ...row.transcript,
        isOwner: false,
      })
    }
  }

  for (const p of meetingParticipations) {
    const t = p.meeting?.transcript
    if (t && !resultMap.has(t.id)) {
      resultMap.set(t.id, {
        ...t,
        isOwner: t.userId === userId,
      })
    }
  }

  const enriched = Array.from(resultMap.values()).map(withFreshRecordingUrl)
  return enriched.sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  )
}

/**
 * Get a single transcript if user owns it, it's shared with them, or they're a meeting participant.
 * @param {string} transcriptId
 * @param {string} userId
 * @returns {Promise<{ transcript: object, isOwner: boolean } | null>}
 */
export async function getTranscriptForUser(transcriptId, userId) {
  const owned = await prisma.transcript.findFirst({
    where: { id: transcriptId, userId },
    include: transcriptInclude,
  })
  if (owned) return { transcript: withFreshRecordingUrl(owned), isOwner: true }

  const share = await prisma.transcriptShare.findFirst({
    where: { transcriptId, sharedWithId: userId },
    include: {
      transcript: { include: transcriptInclude },
    },
  })
  if (share) return { transcript: withFreshRecordingUrl(share.transcript), isOwner: false }

  const meetingAccess = await prisma.transcript.findFirst({
    where: {
      id: transcriptId,
      meetingId: { not: null },
      meeting: {
        participants: {
          some: { userId },
        },
      },
    },
    include: transcriptInclude,
  })
  if (meetingAccess) {
    return {
      transcript: withFreshRecordingUrl(meetingAccess),
      isOwner: meetingAccess.userId === userId,
    }
  }

  return null
}
