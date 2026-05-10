import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyPaymentImage } from '@/lib/vision/server-payment-ocr'

const MAX_ATTEMPTS = 3

async function validateToken(serviceClient, orderId, token) {
  if (!token) return { error: 'Payment token is required', status: 400 }

  const { data: order, error } = await serviceClient
    .from('orders')
    .select('id, order_no, status, grand_total, payment_token, payment_token_expires_at, seller_id, buyer_whatsapp, entities!seller_id(name)')
    .eq('id', orderId)
    .single()

  if (error || !order) return { error: 'Order not found', status: 404 }
  if (order.payment_token !== token) return { error: 'Invalid payment link', status: 400 }
  if (!order.payment_token_expires_at || new Date() > new Date(order.payment_token_expires_at)) {
    return { error: 'Payment link has expired. Please contact the store for a new link.', status: 400 }
  }
  if (order.status !== 'DELIVERED') {
    return { error: `Order is not ready for payment (current status: ${order.status})`, status: 400 }
  }

  return { order }
}

// GET — validate token and return public order info (no auth required)
export async function GET(request, { params }) {
  try {
    const { orderId } = await params
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    const serviceClient = createServiceClient()
    const result = await validateToken(serviceClient, orderId, token)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const { order } = result
    return NextResponse.json({
      order_no: order.order_no,
      grand_total: order.grand_total,
      seller_name: order.entities?.name,
      status: order.status,
    })

  } catch (error) {
    console.error('[shop/pay GET]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST — verify payment screenshot and complete order (no auth required, token is credential)
export async function POST(request, { params }) {
  try {
    const { orderId } = await params
    const body = await request.json()
    const { token, imageBase64, mimeType = 'image/jpeg' } = body

    if (!imageBase64) {
      return NextResponse.json({ error: 'Payment screenshot is required' }, { status: 400 })
    }

    const serviceClient = createServiceClient()
    const result = await validateToken(serviceClient, orderId, token)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const { order } = result

    // Check existing attempt count
    const { count: attemptCount } = await serviceClient
      .from('payment_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)

    if ((attemptCount ?? 0) >= MAX_ATTEMPTS) {
      return NextResponse.json({
        verified: false,
        reason: 'Maximum verification attempts reached. Please contact the store.',
        attemptsLeft: 0,
      })
    }

    // Record this attempt
    const { data: attempt } = await serviceClient
      .from('payment_attempts')
      .insert({ order_id: orderId, status: 'PENDING' })
      .select('id')
      .single()

    let ocrResult
    try {
      ocrResult = await verifyPaymentImage({
        imageBase64,
        mimeType,
        expectedAmount: order.grand_total,
      })
    } catch (ocrErr) {
      await serviceClient
        .from('payment_attempts')
        .update({ status: 'FAILED', gateway_response: { error: ocrErr.message } })
        .eq('id', attempt?.id)

      return NextResponse.json({ verified: false, reason: ocrErr.message, attemptsLeft: MAX_ATTEMPTS - (attemptCount ?? 0) - 1 })
    }

    await serviceClient
      .from('payment_attempts')
      .update({
        status: ocrResult.verified ? 'SUCCESS' : 'FAILED',
        gateway_ref: ocrResult.verifyId,
        gateway_response: ocrResult,
      })
      .eq('id', attempt?.id)

    if (!ocrResult.verified) {
      const attemptsLeft = MAX_ATTEMPTS - (attemptCount ?? 0) - 1
      return NextResponse.json({
        verified: false,
        reason: ocrResult.reason,
        attemptsLeft,
      })
    }

    // Payment verified — complete the order
    const paymentMethod = ocrResult.paymentMethod
      ? ocrResult.paymentMethod.toUpperCase().replace(/[^A-Z]/g, '')
      : 'MBOB'

    const validMethods = ['MBOB', 'MPAY', 'RTGS', 'CASH', 'CREDIT']
    const resolvedMethod = validMethods.includes(paymentMethod) ? paymentMethod : 'MBOB'

    await serviceClient
      .from('orders')
      .update({
        status: 'COMPLETED',
        payment_token: null,
        payment_token_expires_at: null,
        payment_ref: ocrResult.referenceNo,
        ocr_verify_id: ocrResult.verifyId,
        payment_method: resolvedMethod,
        completed_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    // Send receipt via WhatsApp (fire-and-forget)
    const gatewayUrl = process.env.NEXT_PUBLIC_WHATSAPP_GATEWAY_URL || 'http://localhost:3001'
    if (order.buyer_whatsapp) {
      fetch(`${gatewayUrl}/api/send-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: order.buyer_whatsapp,
          invoiceId: orderId,
          orderNo: order.order_no,
          entityName: order.entities?.name,
          grandTotal: order.grand_total,
        }),
      }).catch(() => {})
    }

    return NextResponse.json({
      success: true,
      order_no: order.order_no,
      referenceNo: ocrResult.referenceNo,
    })

  } catch (error) {
    console.error('[shop/pay POST]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
