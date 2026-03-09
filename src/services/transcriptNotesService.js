/**
 * Generate 1–3 helpful, concise notes from a completed transcript using Groq LLM.
 * Runs async; does not block transcription or other APIs.
 *
 * Env: GROQ_API_KEY
 */
import { prisma } from '../config/prisma.js'

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'
const CHAT_MODEL = 'llama-3.1-8b-instant'

/** Max transcript chars to send to LLM */
const MAX_TRANSCRIPT_CHARS = 6000

/**
 * Extract 1–3 helpful notes from transcript text via LLM.
 * @param {string} transcriptText - Full conversation text (e.g. "Speaker 1: ... Speaker 2: ...")
 * @returns {Promise<string[]>} 1–3 short note strings
 */
async function extractNotesWithLLM(transcriptText) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY is not set')

  const truncated =
    transcriptText.length > MAX_TRANSCRIPT_CHARS
      ? transcriptText.slice(0, MAX_TRANSCRIPT_CHARS) + '\n...[truncated]'
      : transcriptText

  const systemPrompt = `You extract brief, helpful notes from conversation transcripts. Return ONLY a JSON object with this exact format:
{"notes": ["note1", "note2", "note3"]}

Rules:
- Extract 1–3 notes (minimum 1, maximum 3). If only one useful point exists, return just one.
- Each note must be a short, standalone piece of information (1–2 sentences max). No long paragraphs.
- Include only information a user would find helpful: decisions, commitments, deadlines, tasks, key facts, important names/dates, follow-ups, action items.
- Skip: greetings, small talk, filler, redundant or generic statements.
- Each note must be concise and actionable.`

  const userPrompt = `Extract helpful notes from this transcript:\n\n${truncated}`

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
      max_tokens: 512,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Notes extraction failed: ${res.status} ${errText}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content?.trim()
  if (!content) return []

  // Parse JSON from response (handle markdown code blocks if present)
  let jsonStr = content
  const match = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) jsonStr = match[1].trim()

  let parsed
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    return []
  }

  const notes = Array.isArray(parsed.notes) ? parsed.notes : []
  return notes
    .filter((n) => typeof n === 'string' && n.trim().length > 0)
    .map((n) => n.trim().slice(0, 500))
    .slice(0, 3)
}

/**
 * Run notes generation for a completed transcript. Creates Information rows.
 * Called asynchronously; does not block.
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

  const notes = await extractNotesWithLLM(transcriptText)
  if (notes.length === 0) return

  await prisma.information.createMany({
    data: notes.map((text) => ({
      text,
      userId: transcript.userId,
    })),
  })
}
