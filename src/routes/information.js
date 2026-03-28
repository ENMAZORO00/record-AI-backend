import { Router } from 'express'
import { prisma } from '../config/prisma.js'

const router = Router()

function normalizeBulletsInput(body) {
  const { bullets } = body
  if (!Array.isArray(bullets) || bullets.length === 0) return null
  const cleaned = bullets
    .filter((b) => typeof b === 'string')
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => b.slice(0, 2000))
    .slice(0, 50)
  return cleaned.length ? cleaned : null
}

router.get('/', async (req, res, next) => {
  try {
    const items = await prisma.information.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    })
    res.json(items)
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const titleRaw = req.body?.title
    const title =
      typeof titleRaw === 'string' && titleRaw.trim()
        ? titleRaw.trim().slice(0, 200)
        : null

    const fromBullets = normalizeBulletsInput(req.body)
    let text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''

    if (fromBullets) {
      if (!text) text = fromBullets.join('\n\n')
    }

    if (!text) {
      return res.status(400).json({ error: 'Text is required' })
    }

    const item = await prisma.information.create({
      data: {
        title,
        text,
        bullets: fromBullets,
        userId: req.user.id,
      },
    })
    res.status(201).json(item)
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const { count } = await prisma.information.deleteMany({
      where: { id: req.params.id, userId: req.user.id },
    })
    if (count === 0) return res.status(404).json({ error: 'Information not found' })
    res.status(204).send()
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Information not found' })
    next(err)
  }
})

export default router
