/**
 * Product image storage on S3, served publicly via CloudFront (img.<domain>).
 *
 * Credentials come from the EC2 instance role (edgepos-ec2-role) over IMDS —
 * there are NO access keys on disk. The bucket stays private (Block Public
 * Access ON); only CloudFront (OAC) can read it. Objects are content-addressed
 * (sha256) so they can be cached immutably forever.
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createHash } from 'crypto'

const REGION   = process.env.AWS_REGION || 'ap-south-2'
const BUCKET   = process.env.S3_IMAGES_BUCKET
const CDN_BASE = (process.env.IMAGE_CDN_URL || '').replace(/\/+$/, '')

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif':  'gif',
}

let _client
function client() {
  if (!_client) _client = new S3Client({ region: REGION })
  return _client
}

/** Whether the given MIME type is an accepted product-image format. */
export function isAllowedImageType(mime) {
  return Object.prototype.hasOwnProperty.call(EXT_BY_MIME, mime)
}

/** True once the bucket + CDN base URL are configured (env present). */
export function isStorageConfigured() {
  return Boolean(BUCKET && CDN_BASE)
}

/**
 * Upload a product image and return its public CloudFront URL.
 * Key is content-addressed: products/<sha256>.<ext>.
 *
 * @param {Buffer} buffer  raw image bytes
 * @param {string} mime    image MIME type (must pass isAllowedImageType)
 * @returns {Promise<{url: string, key: string}>}
 */
export async function uploadProductImage(buffer, mime) {
  if (!isStorageConfigured()) {
    throw new Error('Image storage not configured (set S3_IMAGES_BUCKET and IMAGE_CDN_URL)')
  }
  const ext = EXT_BY_MIME[mime]
  if (!ext) throw new Error(`Unsupported image type: ${mime}`)

  const sha = createHash('sha256').update(buffer).digest('hex')
  const key = `products/${sha}.${ext}`

  await client().send(new PutObjectCommand({
    Bucket:       BUCKET,
    Key:          key,
    Body:         buffer,
    ContentType:  mime,
    CacheControl: 'public, max-age=31536000, immutable',
  }))

  return { url: `${CDN_BASE}/${key}`, key }
}

/**
 * Upload a desktop installer asset and return its public CloudFront URL.
 * Key: releases/<version>/<fileName>. Served from the same bucket/CDN.
 *
 * @param {Buffer} buffer    raw installer bytes
 * @param {string} version   release version (e.g. "1.0.0")
 * @param {string} fileName  original file name (e.g. "Pelbu-POS-Setup-1.0.0.exe")
 * @returns {Promise<{url: string, key: string, size: number, sha256: string}>}
 */
export async function uploadReleaseAsset(buffer, version, fileName) {
  if (!isStorageConfigured()) {
    throw new Error('Storage not configured (set S3_IMAGES_BUCKET and IMAGE_CDN_URL)')
  }
  const safeVersion = String(version).replace(/[^0-9A-Za-z._-]/g, '')
  const safeName = String(fileName).replace(/[^0-9A-Za-z._-]/g, '_')
  const key = `releases/${safeVersion}/${safeName}`
  const sha256 = createHash('sha256').update(buffer).digest('hex')

  await client().send(new PutObjectCommand({
    Bucket:       BUCKET,
    Key:          key,
    Body:         buffer,
    ContentType:  'application/octet-stream',
    CacheControl: 'public, max-age=31536000, immutable',
  }))

  return { url: `${CDN_BASE}/${key}`, key, size: buffer.length, sha256 }
}
