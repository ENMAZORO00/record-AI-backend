import express from 'express'
import cors from 'cors'
import notesRouter from './routes/notes.js'
import authRouter from './routes/auth.js'
import transcriptsRouter from './routes/transcripts.js'
import assistantRouter from './routes/assistant.js'
import chatsRouter from './routes/chats.js'
import informationRouter from './routes/information.js'
import { errorHandler } from './middleware/errorHandler.js'
import { authMiddleware } from './middleware/auth.js'

const app = express()
app.use(cors())
app.use(express.json())
app.use('/auth', authRouter)
app.use('/notes', authMiddleware, notesRouter)
app.use('/transcripts', authMiddleware, transcriptsRouter)
app.use('/assistant', authMiddleware, assistantRouter)
app.use('/chats', authMiddleware, chatsRouter)
app.use('/information', authMiddleware, informationRouter)
app.use(errorHandler)

export default app
