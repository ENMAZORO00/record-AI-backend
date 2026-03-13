import { Router } from 'express'
import { getTranscriptsForUser } from '../services/transcriptAccess.js'
import { generateAssistantReply } from '../services/assistantChat.js'

const router = Router()

/**
 * POST /assistant/chat
 * Chat with the assistant using transcript context. Supports follow-up questions.
 * Body: { messages: [{ role: 'user'|'assistant', content: string }] }
 * Returns: { content: string }
 */
router.post('/chat', async (req, res, next) => {
  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : []
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    const query = lastUser?.content?.trim() ?? ''

    if (!query) {
      return res.status(400).json({
        error: 'At least one user message is required',
      })
    }

    const allTranscripts = await getTranscriptsForUser(req.user.id)
    const transcripts = allTranscripts.filter((t) => t.status === 'completed')

    const chatHistory = messages
      .filter((m) => m.role && (m.content ?? '').toString().trim())
      .map((m) => ({ role: m.role, content: String(m.content ?? '').trim() }))
      .slice(0, -1)

    const content = await generateAssistantReply(query, chatHistory, transcripts)
    res.json({ content })
  } catch (err) {
    next(err)
  }
})

export default router
