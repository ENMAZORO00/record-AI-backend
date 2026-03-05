/**
 * Azure Speech Services - Batch transcription with speaker diarization.
 * Env: AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (e.g. eastus)
 */
const API_VERSION = '2024-11-15'
const POLL_INTERVAL_MS = 15 * 1000 // 15 seconds
const MAX_POLL_ATTEMPTS = 120 // 30 min at 15s

function getBaseUrl() {
  const region = process.env.AZURE_SPEECH_REGION
  if (!region) throw new Error('AZURE_SPEECH_REGION is not set')
  return `https://${region}.api.cognitive.microsoft.com/speechtotext`
}

function getHeaders() {
  const key = process.env.AZURE_SPEECH_KEY
  if (!key) throw new Error('AZURE_SPEECH_KEY is not set')
  return {
    'Ocp-Apim-Subscription-Key': key,
    'Content-Type': 'application/json',
  }
}

/**
 * Submit a batch transcription job (single audio URL, diarization enabled).
 * @param {string} contentUrl - Public or SAS URL to the audio file (must be readable by Azure)
 * @param {string} displayName - Job display name
 * @param {string} locale - e.g. 'en-US'
 * @returns {Promise<{ self: string, status: string }>} - Transcription resource and status
 */
export async function submitTranscription(contentUrl, displayName, locale = 'en-US') {
  const base = getBaseUrl()
  const res = await fetch(`${base}/transcriptions:submit?api-version=${API_VERSION}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      contentUrls: [contentUrl],
      locale,
      displayName: displayName || 'Recording',
      properties: {
        diarizationEnabled: true,
        timeToLiveHours: 48,
      },
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Azure Speech submit failed: ${res.status} ${errText}`)
  }
  return res.json()
}

/**
 * Get transcription status.
 * @param {string} transcriptionUrl - Full self URL from submit response
 */
export async function getTranscriptionStatus(transcriptionUrl) {
  const res = await fetch(transcriptionUrl, { headers: getHeaders() })
  if (!res.ok) throw new Error(`Get status failed: ${res.status}`)
  return res.json()
}

/**
 * List transcription result files (returns values with kind and links.contentUrl).
 */
export async function listTranscriptionFiles(filesUrl) {
  const res = await fetch(filesUrl, { headers: getHeaders() })
  if (!res.ok) throw new Error(`List files failed: ${res.status}`)
  return res.json()
}

/**
 * Fetch JSON from a content URL (transcription result). May require same auth.
 */
export async function fetchTranscriptionResult(contentUrl) {
  const res = await fetch(contentUrl, { headers: getHeaders() })
  if (!res.ok) throw new Error(`Fetch result failed: ${res.status}`)
  return res.json()
}

/**
 * Parse recognizedPhrases into { speaker, text } array.
 * Speaker can be number (1, 2) or "Speaker 1"; we normalize to "Speaker N".
 */
export function parsePhrasesToConversations(transcriptionResult) {
  const out = []
  const phrases = transcriptionResult.recognizedPhrases || []
  for (const p of phrases) {
    if (p.recognitionStatus !== 'Success') continue
    const speakerId = p.speaker != null ? p.speaker : 0
    const speaker = typeof speakerId === 'number' ? `Speaker ${speakerId + 1}` : String(speakerId)
    const text = (p.nBest && p.nBest[0] && p.nBest[0].display) ? p.nBest[0].display : ''
    if (text.trim()) out.push({ speaker, text: text.trim() })
  }
  return out
}

/**
 * Poll until status is Succeeded or Failed; then return the first transcription result file content (parsed).
 */
export async function waitForTranscriptionAndGetPhrases(transcriptionSelfUrl, filesUrl) {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const statusBody = await getTranscriptionStatus(transcriptionSelfUrl)
    const status = statusBody.status
    if (status === 'Succeeded') {
      const filesBody = await listTranscriptionFiles(filesUrl)
      const transcriptionFile = (filesBody.values || []).find((f) => f.kind === 'Transcription')
      if (!transcriptionFile || !transcriptionFile.links?.contentUrl) {
        return []
      }
      const resultJson = await fetchTranscriptionResult(transcriptionFile.links.contentUrl)
      return parsePhrasesToConversations(resultJson)
    }
    if (status === 'Failed') {
      throw new Error('Azure Speech transcription job failed')
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error('Transcription timed out')
}
