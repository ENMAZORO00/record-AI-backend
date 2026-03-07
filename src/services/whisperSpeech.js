/**
 * Whisper-compatible speech-to-text (open source, free when self-hosted).
 * Works with OpenAI-compatible APIs: self-hosted, Groq, etc.
 *
 * Env: WHISPER_API_URL (e.g. http://localhost:9000 or https://api.groq.com/openai for Groq)
 *      Optional: WHISPER_API_KEY or GROQ_API_KEY - for authenticated APIs (e.g. Groq)
 *      Optional: WHISPER_RESPONSE_FORMAT=verbose_json for segments
 *      Optional: WHISPER_MODEL (whisper-1 for self-hosted; whisper-large-v3-turbo for Groq)
 */

/**
 * Fetch audio from a URL (e.g. Azure Blob SAS URL) and return buffer.
 * @param {string} contentUrl
 * @returns {Promise<Buffer>}
 */
async function fetchAudioBuffer(contentUrl) {
  const res = await fetch(contentUrl)
  if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status} ${res.statusText}`)
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Transcribe audio buffer via Whisper-compatible HTTP API.
 * Uses OpenAI-style endpoint: POST /v1/audio/transcriptions with multipart file.
 * @param {Buffer} audioBuffer
 * @param {string} [filename='audio.m4a']
 * @param {string} [mimeType='audio/mpeg']
 * @returns {Promise<{ text?: string, segments?: Array<{ start: number, end: number, text: string }> }>}
 */
export async function transcribeWithWhisper(audioBuffer, filename = 'audio.m4a', mimeType = 'audio/mpeg') {
  const baseUrl = (process.env.WHISPER_API_URL || '').replace(/\/$/, '')
  if (!baseUrl) throw new Error('WHISPER_API_URL is not set')
  const endpoint = `${baseUrl}/v1/audio/transcriptions`
  const responseFormat = process.env.WHISPER_RESPONSE_FORMAT || 'verbose_json'

  const form = new FormData()
  form.append('file', new Blob([audioBuffer], { type: mimeType }), filename)
  form.append('model', process.env.WHISPER_MODEL || 'whisper-1')
  form.append('response_format', responseFormat)

  const apiKey = process.env.GROQ_API_KEY || process.env.WHISPER_API_KEY
  const headers = {}
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: form,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Whisper API failed: ${res.status} ${errText}`)
  }
  return res.json()
}

/**
 * Parse Whisper API response into conversation phrases.
 * No speaker diarization: all lines are "Speaker 1". Supports full text or segments.
 * @param {object} result - API response (text or segments)
 * @returns {Array<{ speaker: string, text: string }>}
 */
export function parseWhisperToConversations(result) {
  const out = []
  if (!result) return out
  if (result.segments && Array.isArray(result.segments)) {
    for (const seg of result.segments) {
      const text = (seg.text || '').trim()
      if (text) out.push({ speaker: 'Speaker 1', text })
    }
  }
  if (out.length === 0 && result.text) {
    const text = String(result.text).trim()
    if (text) out.push({ speaker: 'Speaker 1', text })
  }
  return out
}

/**
 * Transcribe from a recording URL (fetch audio, then call Whisper).
 * @param {string} contentUrl - URL to audio file (e.g. Azure Blob SAS URL)
 * @param {string} [locale] - Ignored for Whisper; kept for API compatibility
 * @returns {Promise<Array<{ speaker: string, text: string }>>}
 */
export async function transcribeFromUrl(contentUrl, _locale = 'en-US') {
  const buffer = await fetchAudioBuffer(contentUrl)
  const ext = contentUrl.includes('.wav') ? 'wav' : 'm4a'
  const mime = ext === 'wav' ? 'audio/wav' : 'audio/mpeg'
  const result = await transcribeWithWhisper(buffer, `audio.${ext}`, mime)
  return parseWhisperToConversations(result)
}
