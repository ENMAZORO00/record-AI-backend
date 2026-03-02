import { Router } from 'express'
import { prisma } from '../config/prisma.js'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const notes = await prisma.note.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    })
    res.json(notes)
  } catch (err) {
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const note = await prisma.note.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    })
    if (!note) return res.status(404).json({ error: 'Note not found' })
    res.json(note)
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const { title, content } = req.body
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content required' })
    }
    const note = await prisma.note.create({
      data: { title, content, userId: req.user.id },
    })
    res.status(201).json(note)
  } catch (err) {
    next(err)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const { title, content } = req.body
    const { count } = await prisma.note.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { ...(title && { title }), ...(content !== undefined && { content }) },
    })
    if (count === 0) return res.status(404).json({ error: 'Note not found' })
    const note = await prisma.note.findUnique({ where: { id: req.params.id } })
    res.json(note)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Note not found' })
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const { count } = await prisma.note.deleteMany({
      where: { id: req.params.id, userId: req.user.id },
    })
    if (count === 0) return res.status(404).json({ error: 'Note not found' })
    res.status(204).send()
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Note not found' })
    next(err)
  }
})

export default router
