import { Router } from 'express'
import { prisma } from '../config/prisma.js'

const router = Router()

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
    const { text } = req.body
    const trimmed = typeof text === 'string' ? text.trim() : ''
    if (!trimmed) {
      return res.status(400).json({ error: 'Text is required' })
    }
    const item = await prisma.information.create({
      data: { text: trimmed, userId: req.user.id },
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
