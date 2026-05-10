import { Badge } from "@/components/ui/badge"

const STATUS_CONFIG = {
  DRAFT:                    { label: 'Draft',               style: 'bg-muted text-muted-foreground border-border' },
  PARTIALLY_FULFILLED:      { label: 'Partial',             style: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  PENDING_PAYMENT:          { label: 'Pending Payment',     style: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  PAYMENT_VERIFYING:        { label: 'Verifying',           style: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  CONFIRMED:                { label: 'Confirmed',           style: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  PROCESSING:               { label: 'Processing',          style: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  DISPATCHED:               { label: 'Dispatched',          style: 'bg-purple-500/10 text-purple-600 border-purple-500/30' },
  DELIVERED:                { label: 'Delivered',           style: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  COMPLETED:                { label: 'Completed',           style: 'bg-emerald-600/10 text-emerald-700 border-emerald-600/30' },
  PAYMENT_FAILED:           { label: 'Payment Failed',      style: 'bg-tibetan/10 text-tibetan border-tibetan/30' },
  CANCELLATION_REQUESTED:   { label: 'Cancel Requested',    style: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  CANCELLED:                { label: 'Cancelled',           style: 'bg-tibetan/10 text-tibetan border-tibetan/30' },
  REFUND_REQUESTED:         { label: 'Refund Requested',    style: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  REFUND_APPROVED:          { label: 'Refund Approved',     style: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  REFUND_REJECTED:          { label: 'Refund Rejected',     style: 'bg-tibetan/10 text-tibetan border-tibetan/30' },
  REFUND_PROCESSING:        { label: 'Refund Processing',   style: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  REFUNDED:                 { label: 'Refunded',            style: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  REPLACEMENT_REQUESTED:    { label: 'Replace Requested',   style: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  REPLACEMENT_DISPATCHED:   { label: 'Replace Dispatched',  style: 'bg-purple-500/10 text-purple-600 border-purple-500/30' },
  REPLACEMENT_DELIVERED:    { label: 'Replaced',            style: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
}

/**
 * @param {{ status: string, size?: 'sm'|'default' }} props
 */
export function OrderStatusBadge({ status, size = 'default' }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, style: 'bg-muted text-muted-foreground' }
  return (
    <span className={`
      inline-flex items-center rounded-full border px-2 py-0.5 font-medium whitespace-nowrap
      ${size === 'sm' ? 'text-[10px]' : 'text-xs'}
      ${cfg.style}
    `}>
      {cfg.label}
    </span>
  )
}
