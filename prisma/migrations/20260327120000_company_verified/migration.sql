-- AlterTable
ALTER TABLE "Company" ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false;

-- Existing companies remain usable until manually reviewed; new signups start unverified.
UPDATE "Company" SET "verified" = true;
