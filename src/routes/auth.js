import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { OAuth2Client } from 'google-auth-library'
import { prisma } from '../config/prisma.js'
import { authMiddleware } from '../middleware/auth.js'
import { sendOtpEmail, sendPasswordResetOtpEmail } from '../services/email.js'

const router = Router()
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
const SALT_ROUNDS = 10
const OTP_EXPIRY_MS = 10 * 60 * 1000
const OTP_LENGTH = 6

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function formatUserForResponse(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    ...(user.companyId && {
      companyId: user.companyId,
      companyRole: user.companyRole,
      companyName: user.company?.name,
    }),
  }
}

router.post('/signup', async (req, res, next) => {
  try {
    const { name, email, password } = req.body
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' })
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' })
    }
    const otp = generateOtp()
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS)
    await prisma.otp.deleteMany({ where: { email: email.toLowerCase().trim() } })
    await prisma.otp.create({
      data: {
        email: email.toLowerCase().trim(),
        otp,
        expiresAt,
      },
    })
    await sendOtpEmail(email, otp)
    res.status(200).json({
      message: 'OTP sent to your email',
      email: email.toLowerCase().trim(),
      tempData: { name: name.trim(), password },
    })
  } catch (err) {
    next(err)
  }
})

router.post('/verify-otp', async (req, res, next) => {
  try {
    const { email, otp, name, password } = req.body
    if (!email?.trim() || !otp?.trim() || !name?.trim() || !password) {
      return res.status(400).json({ error: 'Email, OTP, name and password are required' })
    }
    const record = await prisma.otp.findFirst({
      where: { email: email.toLowerCase().trim() },
      orderBy: { createdAt: 'desc' },
    })
    if (!record) {
      return res.status(400).json({ error: 'No OTP found for this email' })
    }
    if (record.otp !== otp.trim()) {
      return res.status(400).json({ error: 'Invalid OTP' })
    }
    if (new Date() > record.expiresAt) {
      await prisma.otp.delete({ where: { id: record.id } })
      return res.status(400).json({ error: 'OTP has expired' })
    }
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS)
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
      },
      include: { company: { select: { id: true, name: true } } },
    })
    await prisma.otp.deleteMany({ where: { email: email.toLowerCase().trim() } })
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )
    res.status(201).json({
      user: formatUserForResponse(user),
      token,
    })
  } catch (err) {
    next(err)
  }
})

router.post('/google', async (req, res, next) => {
  try {
    const { idToken } = req.body
    if (!idToken?.trim()) {
      return res.status(400).json({ error: 'Google ID token is required' })
    }
    const clientId = process.env.GOOGLE_CLIENT_ID
    if (!clientId) {
      return res.status(500).json({ error: 'Google auth not configured' })
    }
    const ticket = await googleClient.verifyIdToken({
      idToken: idToken.trim(),
      audience: clientId,
    })
    const payload = ticket.getPayload()
    const googleId = payload.sub
    const email = (payload.email || '').toLowerCase().trim()
    const name = (payload.name || payload.email || 'User').trim()
    if (!email) {
      return res.status(400).json({ error: 'Google account email is required' })
    }
    let user = await prisma.user.findUnique({
      where: { googleId },
      include: { company: { select: { id: true, name: true } } },
    })
    if (!user) {
      const existing = await prisma.user.findUnique({ where: { email } })
      if (existing) {
        user = await prisma.user.update({
          where: { id: existing.id },
          data: { googleId },
          include: { company: { select: { id: true, name: true } } },
        })
      } else {
        user = await prisma.user.create({
          data: { name, email, googleId },
          include: { company: { select: { id: true, name: true } } },
        })
      }
    }
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )
    res.json({
      user: formatUserForResponse(user),
      token,
    })
  } catch (err) {
    if (err.message?.includes('Token used too late') || err.message?.includes('audience')) {
      return res.status(401).json({ error: 'Invalid Google token' })
    }
    next(err)
  }
})

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email?.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { company: { select: { id: true, name: true } } },
    })
    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )
    res.json({
      user: formatUserForResponse(user),
      token,
    })
  } catch (err) {
    next(err)
  }
})

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { company: { select: { id: true, name: true } } },
    })
    if (!user) {
      return res.status(401).json({ error: 'User not found' })
    }
    res.json({ user: formatUserForResponse(user) })
  } catch (err) {
    next(err)
  }
})

router.post('/logout', authMiddleware, (req, res, next) => {
  try {
    // Token verified by authMiddleware; user is authenticated
    res.json({ message: 'Logged out successfully' })
  } catch (err) {
    next(err)
  }
})

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body
    if (!email?.trim()) {
      return res.status(400).json({ error: 'Email is required' })
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }
    const normalizedEmail = email.toLowerCase().trim()
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user || !user.password) {
      return res.status(404).json({ error: 'No account found with this email' })
    }
    const otp = generateOtp()
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS)
    await prisma.otp.deleteMany({ where: { email: normalizedEmail } })
    await prisma.otp.create({
      data: { email: normalizedEmail, otp, expiresAt },
    })
    await sendPasswordResetOtpEmail(email, otp)
    res.status(200).json({
      message: 'Password reset code sent to your email',
      email: normalizedEmail,
    })
  } catch (err) {
    next(err)
  }
})

router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body
    if (!email?.trim() || !otp?.trim() || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Email, OTP, new password and confirm password are required' })
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }
    const normalizedEmail = email.toLowerCase().trim()
    const record = await prisma.otp.findFirst({
      where: { email: normalizedEmail },
      orderBy: { createdAt: 'desc' },
    })
    if (!record) {
      return res.status(400).json({ error: 'No reset code found for this email' })
    }
    if (record.otp !== otp.trim()) {
      return res.status(400).json({ error: 'Invalid code' })
    }
    if (new Date() > record.expiresAt) {
      await prisma.otp.delete({ where: { id: record.id } })
      return res.status(400).json({ error: 'Code has expired. Please request a new one.' })
    }
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user) {
      return res.status(400).json({ error: 'Account not found' })
    }
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS)
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    })
    await prisma.otp.deleteMany({ where: { email: normalizedEmail } })
    res.status(200).json({ message: 'Password reset successfully' })
  } catch (err) {
    next(err)
  }
})

export default router
