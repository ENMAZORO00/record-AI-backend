/**
 * Wisprflow.ai speech-to-text (https://wisprflow.ai).
 * Env: WISPR_API_KEY (Bearer token), optional WISPR_LANGUAGE (e.g. "en").
 * API expects base64-encoded 16kHz WAV; max 25MB or 6 minutes.
 */
const WISPR_API_URL = 'https://platform-api.wisprflow.ai/api/v1/dash/api'

async function fetchAudioBuffer(contentUrl) {
  const res = await fetch(contentUrl)
  if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status} ${res.statusText}`)
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Transcribe audio via Wisprflow.ai REST API.
 * @param {Buffer} audioBuffer - Audio bytes (ideally 16kHz WAV for best results)
 * @param {string} [language='en'] - ISO 639-1 code(s); array of one forces that language
 * @returns {Promise<{ text: string, detected_language?: string }>}
 */
export async function transcribeWithWispr(audioBuffer, language = 'en') {
  const apiKey = process.env.WISPR_API_KEY
  if (!apiKey) throw new Error('WISPR_API_KEY is not set')
  const lang = process.env.WISPR_LANGUAGE || language
  const languageList = Array.isArray(lang) ? lang : [lang]

  const audioBase64 = audioBuffer.toString('base64')
  const body = {
    audio: audioBase64,
    language: languageList,
    context: { app: { type: 'other' } },
  }

  const res = await fetch(WISPR_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Wisprflow API failed: ${res.status} ${errText}`)
  }
  return res.json()
}

/**
 * Parse Wispr response into conversation phrases (single speaker).
 * @param {object} result - API response with `text`
 * @returns {Array<{ speaker: string, text: string }>}
 */
export function parseWisprToConversations(result) {
  const out = []
  if (!result || result.text == null) return out
  const text = String(result.text).trim()
  if (text) out.push({ speaker: 'Speaker 1', text })
  return out
}

/**
 * Transcribe from a recording URL (fetch audio, then call Wispr).
 * @param {string} contentUrl - URL to audio file
 * @param {string} [locale='en-US'] - Mapped to ISO 639-1 (e.g. en-US -> en)
 * @returns {Promise<Array<{ speaker: string, text: string }>>}
 */
export async function transcribeFromUrl(contentUrl, locale = 'en-US') {
  const buffer = await fetchAudioBuffer(contentUrl)
  const lang = locale.split('-')[0] || 'en'
  const result = await transcribeWithWispr(buffer, lang)
  return parseWisprToConversations(result)
}
