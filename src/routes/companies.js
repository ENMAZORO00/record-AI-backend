import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma.js";
import { sendEmployeeCredentialsEmail } from "../services/email.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();
const SALT_ROUNDS = 10;

function getDefaultPassword() {
  const env = process.env.DEFAULT_EMPLOYEE_PASSWORD;
  if (env && String(env).trim().length >= 6) return String(env).trim();
  return crypto
    .randomBytes(8)
    .toString("base64")
    .replace(/[+/=]/g, "")
    .slice(0, 12);
}

/**
 * GET /companies/invites/:token — public, no auth required
 */
router.get("/invites/:token", async (req, res, next) => {
  try {
    const token = (req.params.token ?? "").trim();
    if (!token) {
      return res.status(400).json({ error: "Invite token is required" });
    }
    const invite = await prisma.companyInvite.findUnique({
      where: { token },
      include: {
        company: { select: { id: true, name: true } },
        invitedBy: { select: { name: true, email: true } },
      },
    });
    if (!invite) {
      return res.status(404).json({ error: "Invite not found" });
    }
    if (new Date() > invite.expiresAt) {
      return res.status(400).json({ error: "Invite has expired" });
    }
    res.json({
      companyName: invite.company.name,
      companyId: invite.company.id,
      invitedBy: invite.invitedBy.name,
      email: invite.email,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /companies/register
 * Register a new company without authentication. User must already exist.
 * Body: { email: string, companyName: string }
 */
router.post("/register", async (req, res, next) => {
  try {
    const email = (req.body?.email ?? "").toString().trim().toLowerCase();
    const companyName = (req.body?.companyName ?? "").toString().trim();

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    if (!companyName) {
      return res.status(400).json({ error: "Company name is required" });
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        company: { select: { id: true, name: true, verified: true } },
      },
    });

    if (!user) {
      return res
        .status(404)
        .json({ error: "User not found. Please sign up first." });
    }

    if (user.companyId) {
      return res
        .status(409)
        .json({ error: "User already belongs to a company" });
    }

    const existingAdmin = await prisma.company.findUnique({
      where: { adminUserId: user.id },
    });

    if (existingAdmin) {
      return res
        .status(409)
        .json({ error: "User is already an admin of a company" });
    }

    // Create the company
    const company = await prisma.company.create({
      data: {
        name: companyName,
        adminUserId: user.id,
        verified: false,
      },
    });

    // Link user to company
    await prisma.user.update({
      where: { id: user.id },
      data: { companyId: company.id, companyRole: "admin" },
    });

    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        company: { select: { id: true, name: true, verified: true } },
      },
    });

    res.status(201).json({
      company: {
        id: company.id,
        name: company.name,
        verified: company.verified,
      },
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        companyId: updatedUser.companyId,
        companyRole: updatedUser.companyRole,
        companyName: updatedUser.company?.name,
        companyVerified: updatedUser.company?.verified === true,
      },
    });
  } catch (err) {
    next(err);
  }
});

// All routes below require authentication
router.use(authMiddleware);

/**
 * POST /companies
 * Register a new company. Caller becomes admin. One company per user.
 * Body: { name: string }
 */
router.post("/", async (req, res, next) => {
  try {
    const name = (req.body?.name ?? "").toString().trim();
    if (!name) {
      return res.status(400).json({ error: "Company name is required" });
    }
    const user = req.user;
    if (user.companyId) {
      return res.status(409).json({ error: "You already belong to a company" });
    }
    const existingAdmin = await prisma.company.findUnique({
      where: { adminUserId: user.id },
    });
    if (existingAdmin) {
      return res
        .status(409)
        .json({ error: "You are already an admin of a company" });
    }

    const company = await prisma.company.create({
      data: {
        name,
        adminUserId: user.id,
        verified: false,
      },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { companyId: company.id, companyRole: "admin" },
    });

    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        company: { select: { id: true, name: true, verified: true } },
      },
    });

    res.status(201).json({
      company: {
        id: company.id,
        name: company.name,
        verified: company.verified,
      },
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        companyId: updatedUser.companyId,
        companyRole: updatedUser.companyRole,
        companyName: updatedUser.company?.name,
        companyVerified: updatedUser.company?.verified === true,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /companies/me
 * Get current user's company (if any).
 */
router.get("/me", async (req, res, next) => {
  try {
    const user = req.user;
    if (!user.companyId) {
      return res.status(404).json({ error: "You are not in a company" });
    }
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { id: true, name: true, verified: true },
    });
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }
    res.json({
      company: {
        id: company.id,
        name: company.name,
        verified: company.verified,
      },
      companyRole: user.companyRole,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /companies/me/members
 * List all members in the same company. Requires user to be in a company.
 */
router.get("/me/members", async (req, res, next) => {
  try {
    const user = req.user;
    if (!user.companyId) {
      return res.status(403).json({ error: "You are not in a company" });
    }
    const members = await prisma.user.findMany({
      where: { companyId: user.companyId },
      select: { id: true, name: true, email: true, companyRole: true },
      orderBy: [{ companyRole: "desc" }, { name: "asc" }],
    });
    res.json({
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        companyRole: m.companyRole,
        isCurrentUser: m.id === user.id,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /companies/invites
 * Add an employee by email: create or link user with default password, add to company, email credentials.
 * Admin only. Body: { email: string, name?: string }
 */
router.post("/invites", async (req, res, next) => {
  try {
    const admin = req.user;
    if (!admin.companyId || admin.companyRole !== "admin") {
      return res
        .status(403)
        .json({ error: "Only company admin can add members" });
    }
    const email = (req.body?.email ?? "").toString().trim().toLowerCase();
    const name = (req.body?.name ?? "").toString().trim() || "Employee";
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    if (email === admin.email.toLowerCase()) {
      return res.status(400).json({ error: "You cannot add yourself" });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, companyId: true, password: true },
    });

    if (existingUser?.companyId === admin.companyId) {
      return res
        .status(409)
        .json({ error: "This user is already in your company" });
    }
    if (existingUser?.companyId) {
      return res
        .status(409)
        .json({ error: "This user already belongs to another company" });
    }

    const plainPassword = getDefaultPassword();
    const hashedPassword = await bcrypt.hash(plainPassword, SALT_ROUNDS);

    if (existingUser) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          companyId: admin.companyId,
          companyRole: "employee",
          ...(existingUser.password ? {} : { password: hashedPassword }),
        },
      });
    } else {
      await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          companyId: admin.companyId,
          companyRole: "employee",
          isVerified: true,
        },
      });
    }

    const company = await prisma.company.findUnique({
      where: { id: admin.companyId },
      select: { name: true },
    });

    setImmediate(() => {
      sendEmployeeCredentialsEmail(
        email,
        company.name,
        admin.name,
        email,
        plainPassword,
      ).catch((err) => {
        console.error("Employee credentials email failed:", err);
      });
    });

    res
      .status(201)
      .json({
        message: "Employee added. Login details sent to their email.",
        email,
      });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /companies/join
 * Accept an invite and join the company. User must be logged in and not already in a company.
 * Body: { inviteToken: string }
 */
router.post("/join", async (req, res, next) => {
  try {
    const inviteToken = (req.body?.inviteToken ?? req.body?.token ?? "")
      .toString()
      .trim();
    if (!inviteToken) {
      return res.status(400).json({ error: "Invite token is required" });
    }
    const user = req.user;
    if (user.companyId) {
      return res.status(409).json({ error: "You already belong to a company" });
    }

    const invite = await prisma.companyInvite.findUnique({
      where: { token: inviteToken },
      include: { company: { select: { id: true, name: true } } },
    });
    if (!invite) {
      return res.status(404).json({ error: "Invite not found" });
    }
    if (new Date() > invite.expiresAt) {
      await prisma.companyInvite
        .delete({ where: { id: invite.id } })
        .catch(() => {});
      return res.status(400).json({ error: "Invite has expired" });
    }
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      return res
        .status(403)
        .json({ error: "This invite was sent to a different email address" });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { companyId: invite.companyId, companyRole: "employee" },
      }),
      prisma.companyInvite.delete({ where: { id: invite.id } }),
    ]);

    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        company: { select: { id: true, name: true, verified: true } },
      },
    });

    res.json({
      message: "Joined company successfully",
      company: {
        id: invite.company.id,
        name: invite.company.name,
        verified: updatedUser.company?.verified === true,
      },
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        companyId: updatedUser.companyId,
        companyRole: updatedUser.companyRole,
        companyName: updatedUser.company?.name,
        companyVerified: updatedUser.company?.verified === true,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
