import express from 'express'
import cors from 'cors'
import notesRouter from './routes/notes.js'
import authRouter from './routes/auth.js'
import { errorHandler } from './middleware/errorHandler.js'
import { authMiddleware } from './middleware/auth.js'

const app = express()
app.use(cors())
app.use(express.json())
app.use('/auth', authRouter)
app.use('/notes', authMiddleware, notesRouter)
app.use(errorHandler)

export default app
