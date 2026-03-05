# Recording & transcripts (Record AI backend)

Record voice conversations, store them in Azure, and get text transcripts. You can use **Azure Speech** (with speaker diarization), **Wisprflow.ai**, or a **Whisper**-compatible API.

## Overview

- **Frontend** (`record_app`): Expo/React Native app. Sign in, start/stop recording in the Assistant tab, view transcripts in the Transcript tab.
- **Backend** (this repo): Node/Express API. Handles auth, notes, and **recording upload → Azure Blob storage → transcription** (Azure, Wisprflow.ai, or Whisper; see below).

## Recording & transcript flow

1. User taps **Start Recording** in the Assistant tab (expo-av).
2. User taps **Stop** → app uploads the audio file to the backend.
3. Backend uploads the file to **Azure Blob Storage**, creates a `Transcript` row (status `processing`), and returns immediately.
4. A **background job** runs **transcription** (Azure, Wisprflow.ai, or Whisper; see **Transcription provider** below), then saves `Conversation` rows (speaker + text) and sets the transcript status to `completed` or `failed`.
5. User opens the **Transcript** tab to see all transcripts and tap one to read the conversation by speaker.

## Backend structure (relevant parts)

```
record_backend/
├── src/
│   ├── routes/
│   │   └── transcripts.js   # POST /upload, GET /, GET /:id, DELETE /:id
│   ├── services/
│   │   ├── azureStorage.js  # Blob upload + optional SAS URL
│   │   ├── azureSpeech.js   # Azure batch transcription + diarization
│   │   ├── whisperSpeech.js # Whisper-compatible API
│   │   ├── wisprSpeech.js   # Wisprflow.ai API
│   │   ├── transcriptionProvider.js  # Picks Azure, Wispr, or Whisper from env
│   │   └── transcriptionJob.js  # Background: provider → Conversation rows
│   └── middleware/
├── prisma/
│   └── schema.prisma       # Transcript, Conversation models
└── .env.example
```

## Setup

1. **Install**

   ```bash
   npm install
   ```

2. **Database**

   Set `DATABASE_URL` in `.env` (PostgreSQL). Then:

   ```bash
   npm run db:push
   npm run db:generate
   ```

3. **Azure**

   - **Storage (recordings)**  
     Create a Storage account and a container (e.g. `recordings`). In `.env`:

     - `AZURE_STORAGE_CONNECTION_STRING` – full connection string.  
     - Optional: `AZURE_STORAGE_ACCOUNT_NAME` and `AZURE_STORAGE_ACCOUNT_KEY` if you want SAS read URLs (e.g. for playback); otherwise the backend can parse these from the connection string.  
     - Optional: `AZURE_STORAGE_CONTAINER` (default: `recordings`), `AZURE_STORAGE_SAS_READ_DAYS` (default: 7).

   - **Speech (transcription + diarization)** – optional if you use Whisper instead (see below).  
     Create a Speech resource. In `.env`:

     - `AZURE_SPEECH_KEY` – subscription key.  
     - `AZURE_SPEECH_REGION` – e.g. `eastus`, `westus2`.

   The Speech service must be able to read the audio URL. If the blob is private, use a SAS URL (the backend can generate one when account name/key are set).

4. **Transcription provider (Azure, Wisprflow.ai, or Whisper)**  
   Choose one:

   - **Azure Speech** (default if `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are set):  
     Set `TRANSCRIPTION_PROVIDER=azure` or leave unset. Supports speaker diarization (Speaker 1, Speaker 2, …).

   - **Wisprflow.ai** ([wisprflow.ai](https://wisprflow.ai)):  
     Get an API key from Wisprflow, then in `.env`:
     - `TRANSCRIPTION_PROVIDER=wispr`
     - `WISPR_API_KEY=your-api-key`
     - Optional: `WISPR_LANGUAGE=en` (ISO 639-1).  
     API expects base64 16kHz WAV; max 25MB or 6 minutes. Single speaker output ("Speaker 1").

   - **Whisper** (free when self-hosted):  
     Run any OpenAI-compatible Whisper server that exposes `POST /v1/audio/transcriptions`. Then in `.env`:
     - `TRANSCRIPTION_PROVIDER=whisper`
     - `WHISPER_API_URL=http://localhost:9000` (or your server URL)
     - Optional: `WHISPER_RESPONSE_FORMAT=verbose_json`, `WHISPER_MODEL=whisper-1`  
     All lines appear as "Speaker 1".

5. **Other env**

   - `JWT_SECRET` – for auth tokens.  
   - `GMAIL_USER` / `GMAIL_PASS` – for OTP / password-reset emails (optional).  
   - `PORT` – default 3000.

6. **Run**

   ```bash
   npm run dev
   ```

## How to get Azure env variables (steps)

### 1. AZURE_STORAGE_CONNECTION_STRING & AZURE_STORAGE_CONTAINER

**Create a Storage account and container**

1. Go to [Azure Portal](https://portal.azure.com) → **Create a resource** → search **Storage account** → **Create**.
2. Fill in:
   - **Subscription**: your subscription
   - **Resource group**: create or use existing (e.g. `record-ai-rg`)
   - **Storage account name**: e.g. `recordaistorage` (must be globally unique, lowercase, numbers only)
   - **Region**: e.g. East US
   - Leave other options as default → **Review** → **Create**.
3. When deployment finishes, open the storage account.
4. **Connection string**:  
   Left menu → **Security + networking** → **Access keys**. Under **key1**, click **Show** and copy **Connection string**. Paste it into `.env` as:
   ```env
   AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net"
   ```
5. **Container**:  
   Left menu → **Data storage** → **Containers** → **+ Container**. Name it `recordings` (or any name you prefer). Create it.  
   Set in `.env`:
   ```env
   AZURE_STORAGE_CONTAINER=recordings
   ```

---

### 2. AZURE_SPEECH_KEY & AZURE_SPEECH_REGION

**Create a Speech resource**

1. In Azure Portal → **Create a resource** → search **Speech** (or **Cognitive Services**).
2. Choose **Speech** (the one with “Speech-to-text, text-to-speech…”) → **Create**.
3. Fill in:
   - **Subscription** and **Resource group**: same as above (or new).
   - **Region**: e.g. **East US** (note this for `AZURE_SPEECH_REGION`).
   - **Name**: e.g. `record-ai-speech`.
   - **Pricing tier**: F0 (free) or S0 (standard).  
   → **Review + create** → **Create**.
4. When deployment finishes, open the Speech resource.
5. **Key**:  
   Left menu → **Keys and Endpoint**. Copy **KEY 1** (or KEY 2). In `.env`:
   ```env
   AZURE_SPEECH_KEY="paste-key-here"
   ```
6. **Region**:  
   On the same **Keys and Endpoint** page, note **Location/Region** (e.g. `eastus`). In `.env`:
   ```env
   AZURE_SPEECH_REGION=eastus
   ```
   Use the short region code (e.g. `eastus`, `westus2`) without spaces.

---

**Example `.env` (Azure section):**

```env
AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=recordaistorage;AccountKey=yourAccountKey...;EndpointSuffix=core.windows.net"
AZURE_STORAGE_CONTAINER=recordings
AZURE_SPEECH_KEY="your-speech-key-here"
AZURE_SPEECH_REGION=eastus
```

---

## Environment variables (reference)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `AZURE_STORAGE_CONNECTION_STRING` | Storage account connection string |
| `AZURE_STORAGE_CONTAINER` | Container name (default: `recordings`) |
| `AZURE_STORAGE_ACCOUNT_NAME` | Optional; for SAS URL generation |
| `AZURE_STORAGE_ACCOUNT_KEY` | Optional; for SAS URL generation |
| `TRANSCRIPTION_PROVIDER` | `azure`, `wispr`, or `whisper` (default: azure if Speech keys set, else wispr if `WISPR_API_KEY` set, else whisper) |
| `AZURE_SPEECH_KEY` | Azure Speech resource key (when using Azure) |
| `AZURE_SPEECH_REGION` | Azure Speech region (e.g. `eastus`) |
| `WISPR_API_KEY` | Wisprflow.ai API key (when using Wispr) |
| `WISPR_LANGUAGE` | Optional; ISO 639-1 language code (e.g. `en`) for Wispr |
| `WHISPER_API_URL` | Base URL of Whisper-compatible API (e.g. `http://localhost:9000`) when using Whisper |
| `WHISPER_RESPONSE_FORMAT` | Optional; e.g. `verbose_json` for segments |
| `WHISPER_MODEL` | Optional; e.g. `whisper-1` |

## API (transcripts)

All transcript routes require `Authorization: Bearer <token>`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/transcripts/upload` | Upload recording (multipart field `recording`). Returns `{ id, recordingUrl, status }`. |
| `GET` | `/transcripts` | List current user’s transcripts (with conversations). |
| `GET` | `/transcripts/:id` | One transcript and its conversation lines. |
| `DELETE` | `/transcripts/:id` | Delete transcript (and its conversations). |

## Scaling

Transcription runs in-process in the background after each upload. For higher load, add a job queue (e.g. Bull/BullMQ with Redis) and a worker that calls the same transcription logic by `transcriptId` so the API stays fast and workers can scale independently.
