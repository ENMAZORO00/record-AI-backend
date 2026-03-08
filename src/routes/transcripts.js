import { Router } from 'express'
import multer from 'multer'
import { prisma } from '../config/prisma.js'
import { uploadRecording, deleteRecording } from '../services/azureStorage.js'
import { runTranscriptionJob } from '../services/transcriptionJob.js'
import { rankTranscriptsByRelevance } from '../services/groqSemanticSearch.js'

const router = Router()

const MAX_FILE_MB = 100
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/mp3', 'audio/x-m4a']
    if (allowed.includes(file.mimetype) || file.mimetype?.startsWith('audio/')) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Use audio (e.g. mpeg, wav, webm).'), false)
    }
  },
})

function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `File too large. Max ${MAX_FILE_MB}MB.` })
    }
    return res.status(400).json({ error: err.message || 'Upload failed' })
  }
  next(err)
}

/**
 * POST /transcripts/upload
 * Body: multipart/form-data with field "recording" (audio file).
 * Returns: { id, recordingUrl, status: 'processing' }. Transcription runs in background.
 */
router.post('/upload', upload.single('recording'), handleUploadError, async (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No recording file provided. Use form field "recording".' })
    }
    const userId = req.user.id
    const ext = req.file.mimetype === 'audio/wav' || req.file.mimetype === 'audio/x-wav' ? 'wav' : 'm4a'
    const blobName = `${userId}/${Date.now()}.${ext}`

    const { url } = await uploadRecording(
      req.file.buffer,
      blobName,
      req.file.mimetype || 'audio/mpeg'
    )

    const transcript = await prisma.transcript.create({
      data: {
        userId,
        recordingUrl: url,
        status: 'processing',
      },
    })

    // Run transcription in background (non-blocking)
    setImmediate(() => {
      runTranscriptionJob(transcript.id).catch((err) => {
        console.error('Background transcription error:', err)
      })
    })

    res.status(201).json({
      id: transcript.id,
      recordingUrl: transcript.recordingUrl,
      status: transcript.status,
      createdAt: transcript.createdAt,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /transcripts
 * List current user's transcripts (newest first).
 */
router.get('/', async (req, res, next) => {
  try {
    const list = await prisma.transcript.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        Conversation: { orderBy: { id: 'asc' } },
      },
    })
    res.json(list)
  } catch (err) {
    next(err)
  }
})

/**
 * POST /transcripts/search
 * Semantic search over user's transcripts using Groq chat API (LLM ranking).
 * Body: { query: string }
 */
router.post('/search', async (req, res, next) => {
  try {
    const query = (req.body?.query ?? '').toString().trim()
    const list = await prisma.transcript.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        Conversation: { orderBy: { id: 'asc' } },
      },
    })

    if (query === '' || list.length === 0) {
      return res.json(list)
    }

    const ranked = await rankTranscriptsByRelevance(query, list)
    res.json(ranked)
  } catch (err) {
    next(err)
  }
})

/**
 * GET /transcripts/:id
 * Single transcript with conversations.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const t = await prisma.transcript.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: {
        Conversation: { orderBy: { id: 'asc' } },
      },
    })
    if (!t) return res.status(404).json({ error: 'Transcript not found' })
    res.json(t)
  } catch (err) {
    next(err)
  }
})

/**
 * DELETE /transcripts/:id
 * Deletes transcript from Postgres and audio blob from Azure.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const t = await prisma.transcript.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    })
    if (!t) return res.status(404).json({ error: 'Transcript not found' })
    if (t.recordingUrl) {
      await deleteRecording(t.recordingUrl)
    }
    await prisma.transcript.delete({ where: { id: t.id } })
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

export default router
