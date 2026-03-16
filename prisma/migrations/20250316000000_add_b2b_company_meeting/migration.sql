-- Add B2B: Company, CompanyInvite, Meeting, MeetingParticipant; User.companyId, User.companyRole; Transcript.meetingId
-- Uses IF NOT EXISTS so safe to run on DBs that may already have some of these.

-- CreateTable Company (skip if already exists with different structure)
CREATE TABLE IF NOT EXISTS "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- If Company already existed without B2B columns, add them
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "adminUserId" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

-- Only create index if column exists (handles pre-existing Company with different shape)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Company' AND column_name = 'adminUserId') THEN
        CREATE UNIQUE INDEX IF NOT EXISTS "Company_adminUserId_key" ON "Company"("adminUserId");
    END IF;
END $$;

-- CreateTable CompanyInvite
CREATE TABLE IF NOT EXISTS "CompanyInvite" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyInvite_token_key" ON "CompanyInvite"("token");
CREATE INDEX IF NOT EXISTS "CompanyInvite_companyId_idx" ON "CompanyInvite"("companyId");
CREATE INDEX IF NOT EXISTS "CompanyInvite_email_idx" ON "CompanyInvite"("email");
CREATE INDEX IF NOT EXISTS "CompanyInvite_token_idx" ON "CompanyInvite"("token");

-- CreateTable Meeting
CREATE TABLE IF NOT EXISTS "Meeting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "transcriptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Meeting_transcriptId_key" ON "Meeting"("transcriptId");
CREATE INDEX IF NOT EXISTS "Meeting_companyId_idx" ON "Meeting"("companyId");
CREATE INDEX IF NOT EXISTS "Meeting_createdById_idx" ON "Meeting"("createdById");
CREATE INDEX IF NOT EXISTS "Meeting_transcriptId_idx" ON "Meeting"("transcriptId");

-- CreateTable MeetingParticipant
CREATE TABLE IF NOT EXISTS "MeetingParticipant" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MeetingParticipant_meetingId_userId_key" ON "MeetingParticipant"("meetingId", "userId");
CREATE INDEX IF NOT EXISTS "MeetingParticipant_meetingId_idx" ON "MeetingParticipant"("meetingId");
CREATE INDEX IF NOT EXISTS "MeetingParticipant_userId_idx" ON "MeetingParticipant"("userId");

-- User: add companyId, companyRole (ignore if columns already exist)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "companyRole" TEXT;
CREATE INDEX IF NOT EXISTS "User_companyId_idx" ON "User"("companyId");

-- Transcript: add meetingId (ignore if already exists)
ALTER TABLE "Transcript" ADD COLUMN IF NOT EXISTS "meetingId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Transcript_meetingId_key" ON "Transcript"("meetingId");
CREATE INDEX IF NOT EXISTS "Transcript_meetingId_idx" ON "Transcript"("meetingId");

-- Add foreign keys only if they don't exist (PostgreSQL 12+ we can use IF NOT EXISTS for constraints via separate ALTER)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Company_adminUserId_fkey') THEN
        ALTER TABLE "Company" ADD CONSTRAINT "Company_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyInvite_companyId_fkey') THEN
        ALTER TABLE "CompanyInvite" ADD CONSTRAINT "CompanyInvite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyInvite_invitedById_fkey') THEN
        ALTER TABLE "CompanyInvite" ADD CONSTRAINT "CompanyInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Meeting_companyId_fkey') THEN
        ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Meeting_createdById_fkey') THEN
        ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Meeting_transcriptId_fkey') THEN
        ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MeetingParticipant_meetingId_fkey') THEN
        ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MeetingParticipant_userId_fkey') THEN
        ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_companyId_fkey') THEN
        ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Transcript_meetingId_fkey') THEN
        ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
