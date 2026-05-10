/**
 * Payment OCR Client Helper
 * Captures a frame from a video element and sends it to
 * the server-side Gemini Vision API for payment verification.
 */

/**
 * Capture a frame from a video element as a base64 JPEG.
 * @param {HTMLVideoElement} videoEl
 * @param {number} quality - JPEG quality 0-1 (default 0.92)
 * @returns {{ base64: string, mimeType: string }}
 */
export function captureFrame(videoEl, quality = 0.92) {
  const canvas = document.createElement('canvas')
  canvas.width  = videoEl.videoWidth  || 1280
  canvas.height = videoEl.videoHeight || 720
  const ctx = canvas.getContext('2d')
  ctx.drawImage(videoEl, 0, 0)

  const dataUrl   = canvas.toDataURL('image/jpeg', quality)
  const base64    = dataUrl.split(',')[1]
  return { base64, mimeType: 'image/jpeg' }
}

/**
 * Verify a payment screenshot against an expected amount.
 * Calls the server-side /api/payment-verify route.
 *
 * @param {HTMLVideoElement} videoEl - camera feed showing payment screen
 * @param {number} expectedAmount - order grand_total
 * @returns {Promise<{
 *   verified: boolean,
 *   verifyId: string|null,
 *   extractedAmount: number|null,
 *   referenceNo: string|null,
 *   confidence: number,
 *   reason: string
 * }>}
 */
export async function verifyPaymentScreenshot(videoEl, expectedAmount) {
  const { base64, mimeType } = captureFrame(videoEl)

  const response = await fetch('/api/payment-verify', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64:    base64,
      mimeType,
      expectedAmount,
      currency: 'Nu.',
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    return {
      verified:        false,
      verifyId:        null,
      extractedAmount: null,
      referenceNo:     null,
      confidence:      0,
      reason:          err.reason ?? `Server error ${response.status}`,
    }
  }

  return response.json()
}
