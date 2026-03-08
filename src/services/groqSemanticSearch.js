/**
 * Semantic search over transcripts using Groq Chat API (LLM-based ranking).
 * Uses llama-3.1-8b-instant to rank transcripts by relevance to the user's query.
 *
 * Env: GROQ_API_KEY
 */

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'
const CHAT_MODEL = 'llama-3.1-8b-instant'

/** Max transcripts to send (avoid token limits) */
const MAX_TRANSCRIPTS = 50
/** Max chars per transcript snippet */
const MAX_SNIPPET_LEN = 800

/**
 * Rank transcripts by semantic relevance using Groq chat API.
 * @param {string} query - User's search query
 * @param {Array<{ id: string, Conversation?: Array<{ text: string }> }>} transcripts
 * @returns {Promise<Array>} Transcripts reordered by relevance (most relevant first)
 */
export async function rankTranscriptsByRelevance(query, transcripts) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY is not set')

  if (transcripts.length === 0) return []

  const items = transcripts.slice(0, MAX_TRANSCRIPTS).map((t) => {
    const lines = t.Conversation ?? []
    const text = lines.map((l) => l.text).join(' ').trim()
    const snippet = text.length > MAX_SNIPPET_LEN ? `${text.slice(0, MAX_SNIPPET_LEN)}...` : text
    return { id: t.id, text: snippet || '(empty)' }
  })

  const transcriptList = items.map((i) => `[ID: ${i.id}]\n${i.text}`).join('\n\n---\n\n')

  const systemPrompt = `You rank transcript snippets by relevance to a search query. Return ONLY a JSON array of transcript IDs in order of relevance (most relevant first). Example: ["id1","id2","id3"]. Include ALL given IDs.`
  const userPrompt = `Search query: "${query}"

Transcripts to rank:
${transcriptList}

Return a JSON array of IDs in order of relevance (most relevant first). Include every ID listed above.`

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
      temperature: 0.1,
      max_tokens: 2048,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Groq chat failed: ${res.status} ${errText}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content?.trim() || ''
  const orderedIds = parseOrderedIds(content, items.map((i) => i.id))

  if (orderedIds.length === 0) return transcripts

  const byId = new Map(transcripts.map((t) => [t.id, t]))
  const ordered = []
  for (const id of orderedIds) {
    const t = byId.get(id)
    if (t) ordered.push(t)
  }
  for (const t of transcripts) {
    if (!orderedIds.includes(t.id)) ordered.push(t)
  }
  return ordered
}

function parseOrderedIds(content, validIds) {
  const validSet = new Set(validIds)
  try {
    const json = content.replace(/```json?\s*|\s*```/g, '').trim()
    const arr = JSON.parse(json)
    if (!Array.isArray(arr)) return []
    return arr.filter((id) => typeof id === 'string' && validSet.has(id))
  } catch {
    const match = content.match(/\[[\s\S]*?\]/)
    if (match) {
      try {
        const arr = JSON.parse(match[0])
        if (Array.isArray(arr)) return arr.filter((id) => typeof id === 'string' && validSet.has(id))
      } catch {}
    }
  }
  return []
}
