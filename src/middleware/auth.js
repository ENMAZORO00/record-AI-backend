import jwt from 'jsonwebtoken'
import { prisma } from '../config/prisma.js'

function normalizedFullPath(req) {
  const raw = `${req.baseUrl || ''}${req.path || ''}`.replace(/\/{2,}/g, '/')
  if (raw.length > 1 && raw.endsWith('/')) return raw.slice(0, -1)
  return raw || '/'
}

/** Routes a user may call while their company exists but is not yet verified. */
const UNVERIFIED_COMPANY_ALLOWED = new Set([
  'GET:/auth/me',
  'POST:/auth/logout',
  'GET:/companies/me',
  'POST:/companies',
])

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { company: { select: { id: true, verified: true } } },
    })
    if (!user) {
      return res.status(401).json({ error: 'User not found' })
    }
    if (user.companyId && user.company && !user.company.verified) {
      const key = `${req.method.toUpperCase()}:${normalizedFullPath(req)}`
      if (!UNVERIFIED_COMPANY_ALLOWED.has(key)) {
        return res.status(403).json({
          error:
            'Your company account is pending verification. You can sign in once an administrator has approved your company.',
          code: 'COMPANY_PENDING_VERIFICATION',
        })
      }
    }
    req.user = user
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
