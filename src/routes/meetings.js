import { Router } from 'express'
import { prisma } from '../config/prisma.js'

const router = Router()

/**
 * POST /meetings
 * Create a meeting with selected participants (same company). Creator is always a participant.
 * Body: { participantUserIds: string[] } — other members to include (can be empty for solo company recording)
 */
router.post('/', async (req, res, next) => {
  try {
    const user = req.user
    if (!user.companyId) {
      return res.status(403).json({ error: 'You must be in a company to create a meeting' })
    }

    let participantUserIds = req.body?.participantUserIds
    if (!Array.isArray(participantUserIds)) {
      participantUserIds = []
    }
    // Deduplicate and exclude self
    const ids = [...new Set(participantUserIds.filter((id) => id && id !== user.id))]

    if (ids.length > 0) {
      const members = await prisma.user.findMany({
        where: {
          id: { in: ids },
          companyId: user.companyId,
        },
        select: { id: true },
      })
      const foundIds = new Set(members.map((m) => m.id))
      const invalid = ids.filter((id) => !foundIds.has(id))
      if (invalid.length > 0) {
        return res.status(400).json({
          error: 'All participants must be in your company',
          invalidIds: invalid,
        })
      }
    }

    const meeting = await prisma.meeting.create({
      data: {
        companyId: user.companyId,
        createdById: user.id,
        participants: {
          create: [
            { userId: user.id },
            ...ids.map((userId) => ({ userId })),
          ],
        },
      },
      include: {
        participants: { select: { userId: true } },
      },
    })

    res.status(201).json({
      meetingId: meeting.id,
      participantIds: meeting.participants.map((p) => p.userId),
    })
  } catch (err) {
    next(err)
  }
})

export default router
