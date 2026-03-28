/**
 * Generate one structured note from a completed transcript (title + bullet points) via Groq LLM.
 * Replaces any existing Information row for the same transcript. Runs async.
 *
 * Env: GROQ_API_KEY
 */
import { prisma } from '../config/prisma.js'

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'
const CHAT_MODEL = 'llama-3.1-8b-instant'

const MAX_TRANSCRIPT_CHARS = 6000
const MAX_TITLE_CHARS = 120
const MAX_BULLET_CHARS = 600
const MAX_BULLETS = 25

/**
 * @param {unknown} parsed
 * @returns {{ title: string, bullets: string[], text: string } | null}
 */
function normalizeStructuredNote(parsed) {
  if (!parsed || typeof parsed !== 'object') return null
  let title =
    typeof parsed.title === 'string' ? parsed.title.trim().slice(0, MAX_TITLE_CHARS) : ''
  const raw = Array.isArray(parsed.bullets) ? parsed.bullets : []
  const bullets = raw
    .filter((b) => typeof b === 'string')
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => b.slice(0, MAX_BULLET_CHARS))
    .slice(0, MAX_BULLETS)
  if (bullets.length === 0) return null
  if (!title) {
    const first = bullets[0]
    title =
      first.length <= MAX_TITLE_CHARS
        ? first
        : `${first.slice(0, MAX_TITLE_CHARS - 1)}…`
  }
  const text = bullets.join('\n\n')
  return { title, bullets, text }
}

/**
 * @param {string} transcriptText
 * @returns {Promise<{ title: string, bullets: string[], text: string } | null>}
 */
async function extractStructuredNoteWithLLM(transcriptText) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY is not set')

  const truncated =
    transcriptText.length > MAX_TRANSCRIPT_CHARS
      ? transcriptText.slice(0, MAX_TRANSCRIPT_CHARS) + '\n...[truncated]'
      : transcriptText

  const systemPrompt = `You summarize conversation transcripts into one structured note. Return ONLY a JSON object with this exact shape:
{"title": "short heading for the note", "bullets": ["point 1", "point 2", ...]}

Rules:
- title: one line, max ~8 words, captures the meeting or main topic (no trailing punctuation clutter).
- bullets: 4–12 items when the transcript has enough substance; use fewer if the conversation is thin. Each bullet is one clear statement (decisions, commitments, deadlines, tasks, key facts, names/dates, follow-ups). No duplicate ideas.
- Skip greetings, small talk, filler, and generic statements.
- Use plain text only inside strings (no markdown, no nested JSON).`

  const userPrompt = `Summarize this transcript:\n\n${truncated}`

  const res = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 2048,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Notes extraction failed: ${res.status} ${errText}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content?.trim()
  if (!content) return null

  let jsonStr = content
  const match = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) jsonStr = match[1].trim()

  let parsed
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    return null
  }

  return normalizeStructuredNote(parsed)
}

/**
 * Run notes generation for a completed transcript. Creates or replaces one Information row.
 * @param {string} transcriptId
 */
export async function runNotesGenerationJob(transcriptId) {
  const transcript = await prisma.transcript.findFirst({
    where: { id: transcriptId },
    include: { Conversation: { orderBy: { id: 'asc' } } },
  })

  if (!transcript || transcript.status !== 'completed') return
  if (!transcript.Conversation?.length) return

  const transcriptText = transcript.Conversation.map(
    (c) => `${c.speaker}: ${c.text}`
  ).join('\n')

  if (!transcriptText.trim()) return

  const structured = await extractStructuredNoteWithLLM(transcriptText)
  if (!structured) return

  await prisma.$transaction([
    prisma.information.deleteMany({ where: { transcriptId } }),
    prisma.information.create({
      data: {
        title: structured.title,
        text: structured.text,
        bullets: structured.bullets,
        transcriptId,
        userId: transcript.userId,
      },
    }),
  ])
}
