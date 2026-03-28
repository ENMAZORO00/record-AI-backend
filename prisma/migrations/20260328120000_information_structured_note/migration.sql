-- AlterTable
ALTER TABLE "Information" ADD COLUMN "title" TEXT,
ADD COLUMN "bullets" JSONB,
ADD COLUMN "transcriptId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Information_transcriptId_key" ON "Information"("transcriptId");

-- AddForeignKey
ALTER TABLE "Information" ADD CONSTRAINT "Information_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE SET NULL ON UPDATE CASCADE;
