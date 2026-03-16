# B2B schema migration

Your database is out of sync with Prisma’s migration history (drift). Use one of these approaches.

---

## Option 1: Add B2B only (keeps existing tables)

Applies only the B2B migration: adds `Company`, `CompanyInvite`, `Meeting`, `MeetingParticipant` and the new columns on `User` and `Transcript`. Does **not** drop tables like `Workspace`, `CompanyMember`, `ScheduledSession` if they exist.

```bash
cd record_backend
npx prisma migrate deploy
npx prisma generate
```

If you see **“drift”** or “migration history” errors, baseline first then deploy:

```bash
npx prisma migrate resolve --applied 0_baseline
npx prisma migrate deploy
npx prisma generate
```

**If your DB already has a `Company` table** with a different structure, the migration may fail. Then either drop/rename that table and run `migrate deploy` again, or use Option 2.

---

## Option 2: Force DB to match current schema (drops extra tables)

Use this only if you do **not** need to keep tables that are not in `schema.prisma` (e.g. `Workspace`, `CompanyMember`, `ScheduledSession`). **This can delete data.**

```bash
cd record_backend
npx prisma db push
```

Then create migration history so future `migrate dev` works:

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_baseline/migration.sql
npx prisma migrate resolve --applied 0_baseline
```

(If you already ran Option 1, you can skip the `migrate resolve` step.)

---

## Summary

| Goal | Command |
|------|--------|
| Apply only B2B, keep other tables | `npx prisma migrate resolve --applied 0_baseline` then `npx prisma migrate deploy` |
| Make DB exactly match schema (may drop tables) | `npx prisma db push` |
| Regenerate client after any migration | `npx prisma generate` |
