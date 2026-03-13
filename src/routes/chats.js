import { Router } from 'express'
import { prisma } from '../config/prisma.js'
import { getTranscriptsForUser } from '../services/transcriptAccess.js'
import { generateAssistantReply } from '../services/assistantChat.js'

const router = Router()

/**
 * GET /chats
 * List user's chats, optionally search by query.
 * Query: ?search=... (searches title and message content)
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id
    const search = (req.query.search || '').toString().trim()

    if (!search) {
      const chats = await prisma.chat.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          updatedAt: true,
        },
      })
      return res.json({ chats })
    }

    const chats = await prisma.chat.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          {
            messages: {
              some: {
                content: { contains: search, mode: 'insensitive' },
              },
            },
          },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        updatedAt: true,
      },
    })

    res.json({ chats })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /chats/:id
 * Get single chat with all messages.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const chat = await prisma.chat.findFirst({
      where: { id, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
          },
        },
      },
    })

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' })
    }

    res.json({
      chat: {
        id: chat.id,
        title: chat.title,
        messages: chat.messages.map((m) => ({
          id: m.id,
          role: m.role,
          text: m.content,
          content: m.content,
          createdAt: m.createdAt,
        })),
        updatedAt: chat.updatedAt,
      },
    })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /chats
 * Create new chat with first user message and assistant reply.
 * Body: { title, content } (content = first user message)
 */
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user.id
    const content = (req.body.content ?? req.body.text ?? '').toString().trim()
    const title = (req.body.title ?? content.slice(0, 40)).toString().trim() || 'New Chat'

    if (!content) {
      return res.status(400).json({ error: 'Message content is required' })
    }

    const allTranscripts = await getTranscriptsForUser(userId)
    const transcripts = allTranscripts.filter((t) => t.status === 'completed')

    const assistantContent = await generateAssistantReply(content, [], transcripts)

    const chat = await prisma.chat.create({
      data: {
        title: title.length > 40 ? `${title.slice(0, 40)}..` : title,
        userId,
        messages: {
          create: [
            { role: 'user', content },
            { role: 'assistant', content: assistantContent },
          ],
        },
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
          },
        },
      },
    })

    res.status(201).json({
      chat: {
        id: chat.id,
        title: chat.title,
        messages: chat.messages.map((m) => ({
          id: m.id,
          role: m.role,
          text: m.content,
          content: m.content,
          createdAt: m.createdAt,
        })),
        updatedAt: chat.updatedAt,
      },
    })
  } catch (err) {
    next(err)
  }
})

/**
 * POST /chats/:id/messages
 * Add user message and get assistant reply.
 * Body: { content }
 */
router.post('/:id/messages', async (req, res, next) => {
  try {
    const { id: chatId } = req.params
    const userId = req.user.id
    const content = (req.body.content ?? req.body.text ?? '').toString().trim()

    if (!content) {
      return res.status(400).json({ error: 'Message content is required' })
    }

    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' })
    }

    const allTranscripts = await getTranscriptsForUser(userId)
    const transcripts = allTranscripts.filter((t) => t.status === 'completed')

    const chatHistory = chat.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    const assistantContent = await generateAssistantReply(content, chatHistory, transcripts)

    await prisma.$transaction([
      prisma.chatMessage.create({
        data: { chatId, role: 'user', content },
      }),
      prisma.chatMessage.create({
        data: { chatId, role: 'assistant', content: assistantContent },
      }),
    ])

    res.json({ content: assistantContent })
  } catch (err) {
    next(err)
  }
})

/**
 * DELETE /chats/:id
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const chat = await prisma.chat.findFirst({
      where: { id, userId },
    })

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' })
    }

    await prisma.chat.delete({ where: { id } })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
