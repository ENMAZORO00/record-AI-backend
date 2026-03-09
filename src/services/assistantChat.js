/**
 * Assistant chat: search transcripts by query, then answer using Groq LLM with transcript context.
 * Supports follow-up questions via full conversation history.
 *
 * Env: GROQ_API_KEY
 */

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'
const CHAT_MODEL = 'llama-3.1-8b-instant'

/** Max transcripts to include in context (most relevant first) */
const MAX_CTX_TRANSCRIPTS = 5
/** Max chars per transcript in context */
const MAX_CHARS_PER_TRANSCRIPT = 2000

/**
 * Generate assistant reply from user query + chat history, grounded in transcript content.
 * @param {string} query - Latest user message
 * @param {Array<{ role: 'user'|'assistant', content: string }>} chatHistory - Previous messages
 * @param {Array<{ id: string, createdAt: Date, Conversation?: Array<{ speaker: string, text: string }> }>} transcripts
 * @returns {Promise<string>}
 */
export async function generateAssistantReply(query, chatHistory, transcripts) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY is not set')

  const { rankTranscriptsByRelevance } = await import('./groqSemanticSearch.js')
  const ranked = transcripts.length > 0 && query.trim()
    ? await rankTranscriptsByRelevance(query, transcripts)
    : transcripts

  const contextParts = []
  for (let i = 0; i < Math.min(MAX_CTX_TRANSCRIPTS, ranked.length); i++) {
    const t = ranked[i]
    const lines = (t.Conversation ?? []).map((l) => `${l.speaker}: ${l.text}`).join('\n')
    const text = lines.length > MAX_CHARS_PER_TRANSCRIPT
      ? lines.slice(0, MAX_CHARS_PER_TRANSCRIPT) + '...'
      : lines
    if (text.trim()) {
      const date = t.createdAt ? new Date(t.createdAt).toLocaleDateString() : ''
      contextParts.push(`### Transcript ${i + 1}${date ? ` (${date})` : ''}\n${text}`)
    }
  }

  const transcriptContext = contextParts.length > 0
    ? `\n\nRelevant transcript excerpts:\n\n${contextParts.join('\n\n')}`
    : '\n\nThe user has no transcripts yet, or none match the query. Politely say you can only answer questions about their recorded transcripts, and suggest they record and transcribe a conversation first.'

  const systemPrompt = `You are a helpful assistant that answers questions based ONLY on the user's transcript excerpts provided below.
- Answer using the transcript context when available.
- For follow-up questions, use the conversation history and transcript context to give coherent answers.
- If the transcripts don't contain relevant information, say so clearly and suggest what might help.
- Be concise and direct.
- Do not make up or hallucinate information not present in the transcripts.`
    + transcriptContext

  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.slice(-12).map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : String(m.content ?? ''),
    })),
    { role: 'user', content: query.trim() },
  ]

  const res = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 1024,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Assistant chat failed: ${res.status} ${errText}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content?.trim()
  return content || "I couldn't generate a response. Please try again."
}
