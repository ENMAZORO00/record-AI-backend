import { Router } from "express";
import multer from "multer";
import { prisma } from "../config/prisma.js";
import { uploadRecording, deleteRecording } from "../services/azureStorage.js";
import { runTranscriptionJob } from "../services/transcriptionJob.js";
import { rankTranscriptsByRelevance } from "../services/groqSemanticSearch.js";
import {
  getTranscriptsForUser,
  getTranscriptForUser,
} from "../services/transcriptAccess.js";
import { sendTranscriptShareEmail } from "../services/email.js";

const router = Router();
const MAX_SHARES_PER_TRANSCRIPT = 3;

const MAX_FILE_MB = 100;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "audio/mpeg",
      "audio/mp4",
      "audio/m4a",
      "audio/wav",
      "audio/x-wav",
      "audio/webm",
      "audio/mp3",
      "audio/x-m4a",
    ];
    if (
      allowed.includes(file.mimetype) ||
      file.mimetype?.startsWith("audio/")
    ) {
      cb(null, true);
    } else {
      cb(
        new Error("Invalid file type. Use audio (e.g. mpeg, wav, webm)."),
        false,
      );
    }
  },
});

function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ error: `File too large. Max ${MAX_FILE_MB}MB.` });
    }
    return res.status(400).json({ error: err.message || "Upload failed" });
  }
  next(err);
}

/**
 * POST /transcripts/upload
 * Body: multipart/form-data with field "recording" (audio file), optional "meetingId" (string).
 * If meetingId: user must be a meeting participant and meeting must not already have a transcript.
 * Returns: { id, recordingUrl, status: 'processing', meetingId? }. Transcription runs in background.
 */
router.post(
  "/upload",
  upload.single("recording"),
  handleUploadError,
  async (req, res, next) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res
          .status(400)
          .json({
            error: 'No recording file provided. Use form field "recording".',
          });
      }
      const userId = req.user.id;
      const meetingIdRaw = req.body?.meetingId;
      let meetingId =
        typeof meetingIdRaw === "string" ? meetingIdRaw.trim() || null : null;

      if (meetingId) {
        const meeting = await prisma.meeting.findUnique({
          where: { id: meetingId },
          include: { participants: { select: { userId: true } } },
        });
        if (!meeting) {
          return res.status(404).json({ error: "Meeting not found" });
        }
        const isParticipant = meeting.participants.some(
          (p) => p.userId === userId,
        );
        if (!isParticipant) {
          return res
            .status(403)
            .json({ error: "You are not a participant of this meeting" });
        }
        if (meeting.transcriptId) {
          return res
            .status(400)
            .json({ error: "This meeting already has a recording" });
        }
      }

      const ext =
        req.file.mimetype === "audio/wav" || req.file.mimetype === "audio/x-wav"
          ? "wav"
          : "m4a";
      const blobName = `${userId}/${Date.now()}.${ext}`;

      const { url } = await uploadRecording(
        req.file.buffer,
        blobName,
        req.file.mimetype || "audio/mpeg",
      );

      const transcript = await prisma.transcript.create({
        data: {
          userId,
          recordingUrl: url,
          status: "processing",
          ...(meetingId ? { meetingId } : {}),
        },
      });

      if (meetingId) {
        await prisma.meeting.update({
          where: { id: meetingId },
          data: { transcriptId: transcript.id },
        });

        // Automatically share transcript with all meeting participants except the owner
        const meeting = await prisma.meeting.findUnique({
          where: { id: meetingId },
          include: { participants: { select: { userId: true } } },
        });
        if (meeting) {
          const participantIds = meeting.participants
            .map((p) => p.userId)
            .filter((id) => id !== userId);
          if (participantIds.length > 0) {
            await prisma.transcriptShare.createMany({
              data: participantIds.map((sharedWithId) => ({
                transcriptId: transcript.id,
                sharedWithId,
              })),
              skipDuplicates: true,
            });
          }
        }
      }

      // Run transcription in background (non-blocking)
      setImmediate(() => {
        runTranscriptionJob(transcript.id).catch((err) => {
          console.error("Background transcription error:", err);
        });
      });

      const payload = {
        id: transcript.id,
        recordingUrl: transcript.recordingUrl,
        status: transcript.status,
        createdAt: transcript.createdAt,
      };
      if (meetingId) payload.meetingId = meetingId;
      res.status(201).json(payload);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /transcripts
 * List current user's transcripts (owned + shared), newest first.
 */
router.get("/", async (req, res, next) => {
  try {
    const list = await getTranscriptsForUser(req.user.id);
    res.json(list);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /transcripts/search
 * Semantic search over user's transcripts (owned + shared) using Groq chat API.
 * Body: { query: string }
 */
router.post("/search", async (req, res, next) => {
  try {
    const query = (req.body?.query ?? "").toString().trim();
    const list = await getTranscriptsForUser(req.user.id);

    if (query === "" || list.length === 0) {
      return res.json(list);
    }

    const ranked = await rankTranscriptsByRelevance(query, list);
    res.json(ranked);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /transcripts/:id/shares
 * List emails this transcript is shared with (owner only).
 */
router.get("/:id/shares", async (req, res, next) => {
  try {
    const t = await prisma.transcript.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!t) return res.status(404).json({ error: "Transcript not found" });

    const shares = await prisma.transcriptShare.findMany({
      where: { transcriptId: req.params.id },
      include: { sharedWith: { select: { email: true, name: true } } },
    });
    res.json(
      shares.map((s) => ({
        email: s.sharedWith.email,
        name: s.sharedWith.name,
      })),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * POST /transcripts/:id/share
 * Share transcript with a user by email (owner only). Max 3 people.
 * Body: { email: string }
 */
router.post("/:id/share", async (req, res, next) => {
  try {
    const transcriptId = req.params.id;
    const emailRaw = (req.body?.email ?? "").toString().trim().toLowerCase();
    if (!emailRaw) {
      return res.status(400).json({ error: "Email is required" });
    }

    const t = await prisma.transcript.findFirst({
      where: { id: transcriptId, userId: req.user.id },
    });
    if (!t) return res.status(404).json({ error: "Transcript not found" });

    if (req.user.email.toLowerCase() === emailRaw) {
      return res.status(400).json({ error: "Cannot share with yourself" });
    }

    const recipient = await prisma.user.findUnique({
      where: { email: emailRaw },
    });
    if (!recipient) {
      return res.status(404).json({ error: "No user found with that email" });
    }

    const existingCount = await prisma.transcriptShare.count({
      where: { transcriptId },
    });
    if (existingCount >= MAX_SHARES_PER_TRANSCRIPT) {
      return res.status(400).json({
        error: `Maximum ${MAX_SHARES_PER_TRANSCRIPT} people can be shared with per transcript`,
      });
    }

    const existing = await prisma.transcriptShare.findUnique({
      where: {
        transcriptId_sharedWithId: { transcriptId, sharedWithId: recipient.id },
      },
    });
    if (existing) {
      return res.status(400).json({ error: "Already shared with this user" });
    }

    await prisma.transcriptShare.create({
      data: { transcriptId, sharedWithId: recipient.id },
    });

    setImmediate(() => {
      sendTranscriptShareEmail(
        recipient.email,
        req.user.name,
        req.user.email,
      ).catch((err) => {
        console.error("Failed to send share notification email:", err);
      });
    });

    res.status(201).json({ success: true, email: recipient.email });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /transcripts/:id/share
 * Unshare transcript from a user (owner only).
 * Query: ?email=user@example.com
 */
router.delete("/:id/share", async (req, res, next) => {
  try {
    const transcriptId = req.params.id;
    const emailRaw = (req.query?.email ?? "").toString().trim().toLowerCase();
    if (!emailRaw) {
      return res
        .status(400)
        .json({ error: "Email query parameter is required" });
    }

    const t = await prisma.transcript.findFirst({
      where: { id: transcriptId, userId: req.user.id },
    });
    if (!t) return res.status(404).json({ error: "Transcript not found" });

    const recipient = await prisma.user.findUnique({
      where: { email: emailRaw },
    });
    if (!recipient) {
      return res.status(404).json({ error: "No user found with that email" });
    }

    await prisma.transcriptShare.deleteMany({
      where: {
        transcriptId,
        sharedWithId: recipient.id,
      },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * GET /transcripts/:id
 * Single transcript (owner or shared user). Includes isOwner flag.
 */
router.get("/:id", async (req, res, next) => {
  try {
    const result = await getTranscriptForUser(req.params.id, req.user.id);
    if (!result) return res.status(404).json({ error: "Transcript not found" });
    res.json({ ...result.transcript, isOwner: result.isOwner });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /transcripts/:id
 * Individual transcript: owner only. Meeting transcript: company admin only.
 */
router.delete("/:id", async (req, res, next) => {
  try {
    const transcriptId = req.params.id;
    const user = req.user;
    const t = await prisma.transcript.findUnique({
      where: { id: transcriptId },
      include: { meeting: { include: { company: true } } },
    });
    if (!t) return res.status(404).json({ error: "Transcript not found" });

    if (t.meetingId) {
      // Meeting transcript: only company admin can delete
      if (!t.meeting?.company) {
        return res.status(404).json({ error: "Transcript not found" });
      }
      const company = await prisma.company.findUnique({
        where: { id: t.meeting.companyId },
      });
      if (!company || company.adminUserId !== user.id) {
        return res
          .status(403)
          .json({
            error: "Only the company admin can delete this meeting transcript",
          });
      }
    } else {
      // Individual transcript: only owner can delete
      if (t.userId !== user.id) {
        return res.status(404).json({ error: "Transcript not found" });
      }
    }

    if (t.recordingUrl) {
      await deleteRecording(t.recordingUrl);
    }
    if (t.meetingId) {
      await prisma.meeting.update({
        where: { id: t.meetingId },
        data: { transcriptId: null },
      });
    }
    await prisma.transcript.delete({ where: { id: t.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
