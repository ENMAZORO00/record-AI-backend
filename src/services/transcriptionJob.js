/**
 * Background job: take a Transcript (with recordingUrl, status processing),
 * run transcription (Azure or Whisper per TRANSCRIPTION_PROVIDER), then save Conversation rows.
 */
import { prisma } from '../config/prisma.js'
import { getPhrasesFromRecording } from './transcriptionProvider.js'

export async function runTranscriptionJob(transcriptId) {
  const transcript = await prisma.transcript.findFirst({
    where: { id: transcriptId },
  })
  if (!transcript || transcript.status !== 'processing') return
  if (!transcript.recordingUrl) {
    await prisma.transcript.update({
      where: { id: transcriptId },
      data: { status: 'failed' },
    })
    return
  }
  try {
    const phrases = await getPhrasesFromRecording(transcript.recordingUrl, {
      displayName: `rec-${transcriptId}`,
      locale: 'en-US',
      transcriptId,
    })
    if (phrases.length > 0) {
      await prisma.conversation.createMany({
        data: phrases.map((p) => ({
          transcriptId,
          speaker: p.speaker,
          text: p.text,
        })),
      })
    }
    await prisma.transcript.update({
      where: { id: transcriptId },
      data: { status: 'completed' },
    })
  } catch (err) {
    console.error('Transcription job failed for', transcriptId, err)
    await prisma.transcript.update({
      where: { id: transcriptId },
      data: { status: 'failed' },
    }).catch(() => {})
  }
}
