/**
 * Azure Blob Storage service for recording uploads.
 * Requires AZURE_STORAGE_CONNECTION_STRING. For SAS URLs (e.g. for Speech to read),
 * also set AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY, or we parse account from connection string.
 */
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} from '@azure/storage-blob'

const containerName = process.env.AZURE_STORAGE_CONTAINER || 'recordings'
const SAS_VALID_DAYS = parseInt(process.env.AZURE_STORAGE_SAS_READ_DAYS || '7', 10)

let blobServiceClient = null
let sharedKeyCredential = null

function parseConnectionString(connStr) {
  const parts = {}
  connStr.split(';').forEach((p) => {
    const [key, ...v] = p.split('=')
    if (key && v.length) parts[key.trim()] = v.join('=').trim()
  })
  return parts
}

function getBlobServiceClient() {
  if (blobServiceClient) return blobServiceClient
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!connStr) throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set')
  blobServiceClient = BlobServiceClient.fromConnectionString(connStr)
  return blobServiceClient
}

function getSharedKeyCredential() {
  if (sharedKeyCredential) return sharedKeyCredential
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY
  if (accountName && accountKey) {
    sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey)
    return sharedKeyCredential
  }
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!connStr) return null
  const parsed = parseConnectionString(connStr)
  const name = parsed.AccountName
  const key = parsed.AccountKey
  if (name && key) {
    sharedKeyCredential = new StorageSharedKeyCredential(name, key)
    return sharedKeyCredential
  }
  return null
}

/**
 * Ensure the recordings container exists.
 */
export async function ensureContainer() {
  const client = getBlobServiceClient()
  const container = client.getContainerClient(containerName)
  await container.createIfNotExists({ access: 'private' })
  return container
}

/**
 * Upload a buffer to blob storage and return URL (with SAS for read if credentials available).
 * @param {Buffer} buffer - File buffer
 * @param {string} blobName - Blob name (e.g. userId/timestamp.ext)
 * @param {string} contentType - MIME type (e.g. audio/mpeg, audio/wav)
 * @returns {Promise<{ url: string, blobName: string }>}
 */
export async function uploadRecording(buffer, blobName, contentType = 'audio/mpeg') {
  const client = getBlobServiceClient()
  const container = client.getContainerClient(containerName)
  await container.createIfNotExists({ access: 'private' })

  const blockBlob = container.getBlockBlobClient(blobName)
  await blockBlob.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: contentType },
  })

  const cred = getSharedKeyCredential()
  let url = blockBlob.url
  if (cred) {
    const expiresOn = new Date(Date.now() + SAS_VALID_DAYS * 24 * 60 * 60 * 1000)
    const sasParams = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse('r'),
        startsOn: new Date(),
        expiresOn,
      },
      cred
    )
    url = `${blockBlob.url}?${sasParams.toString()}`
  }
  return { url, blobName }
}
