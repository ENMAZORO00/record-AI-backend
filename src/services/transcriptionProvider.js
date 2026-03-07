/**
 * Transcription provider abstraction.
 * Set TRANSCRIPTION_PROVIDER=azure | whisper | wispr | groq
 * (default: azure if AZURE_SPEECH_KEY set, else wispr if WISPR_API_KEY set, else groq if GROQ_API_KEY set, else whisper).
 * Returns phrases as [{ speaker, text }] for Conversation rows.
 */
import {
  submitTranscription,
  waitForTranscriptionAndGetPhrases,
} from './azureSpeech.js'
import { transcribeFromUrl } from './whisperSpeech.js'
import { transcribeFromUrl as transcribeFromUrlWispr } from './wisprSpeech.js'

function getProvider() {
  const envProvider = (process.env.TRANSCRIPTION_PROVIDER || '').toLowerCase()
  if (envProvider === 'wispr') return 'wispr'
  if (envProvider === 'whisper') return 'whisper'
  if (envProvider === 'groq') return 'groq'
  if (envProvider === 'azure') return 'azure'
  if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) return 'azure'
  if (process.env.WISPR_API_KEY) return 'wispr'
  if (process.env.GROQ_API_KEY) return 'groq'
  if (process.env.WHISPER_API_URL) return 'whisper'
  return 'azure'
}

/**
 * Get transcription phrases from a recording URL.
 * @param {string} recordingUrl - URL to the audio file (must be fetchable by this process; for Azure provider, Azure Speech service must also be able to reach it)
 * @param {object} [options]
 * @param {string} [options.displayName] - For Azure batch job display name
 * @param {string} [options.locale='en-US']
 * @param {string} [options.transcriptId] - For Azure: not used; for compatibility
 * @returns {Promise<Array<{ speaker: string, text: string }>>}
 */
export async function getPhrasesFromRecording(recordingUrl, options = {}) {
  const provider = getProvider()
  const { displayName = 'recording', locale = 'en-US' } = options

  // Groq uses OpenAI-compatible Whisper API; auto-set URL/model when not configured
  if (provider === 'groq') {
    if (!process.env.WHISPER_API_URL) process.env.WHISPER_API_URL = 'https://api.groq.com/openai'
    if (!process.env.WHISPER_MODEL) process.env.WHISPER_MODEL = 'whisper-large-v3-turbo'
  }

  if (provider === 'wispr') {
    return transcribeFromUrlWispr(recordingUrl, locale)
  }

  if (provider === 'whisper' || provider === 'groq') {
    return transcribeFromUrl(recordingUrl, locale)
  }

  if (provider === 'azure') {
    const submitted = await submitTranscription(recordingUrl, displayName, locale)
    const selfUrl = submitted.self
    const filesUrl = submitted.links?.files
    if (!selfUrl || !filesUrl) throw new Error('Azure Speech submit response missing self or files link')
    return waitForTranscriptionAndGetPhrases(selfUrl, filesUrl)
  }

  throw new Error(`Unknown TRANSCRIPTION_PROVIDER: ${provider}. Use 'azure', 'whisper', 'wispr', or 'groq'.`)
}

export { getProvider }
