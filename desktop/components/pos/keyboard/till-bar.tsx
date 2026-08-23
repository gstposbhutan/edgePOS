"use client";

interface TillBarProps {
  /** Which surface this bar sits on — "Counter" on the ticket, "Tender" on the payment sheet. */
  title: string;
  /** Buyer on the ticket; walk-in when nobody is attached. */
  buyer?: string | null;
  /** Whole-ticket GST exemption, which changes what the bill charges. */
  taxExempt?: boolean;
  /** Alt+T — catalog rates already contain GST, so it is extracted rather than added. */
  gstIncluded?: boolean;
  /** Active price tier, when it is not the plain retail one. */
  priceList?: string | null;
  /** Right-hand hint, e.g. "F11 Day" on the counter or "Esc close" on a sheet. */
  hint?: string;
}

/**
 * The till's status strip (spec WF-01). RanceLab puts the standing facts of the sale on one
 * line above the ticket — which surface you are on, the tax basis, the currency and the buyer —
 * so a cashier can confirm at a glance what the next bill will be, without opening anything.
 */
export function TillBar({ title, buyer, taxExempt = false, gstIncluded = false, priceList, hint }: TillBarProps) {
  // The price tier only earns a slot when it is not the default — it reprices the whole ticket,
  // so a cashier must not be able to ring a wholesale bill without seeing why.
  const status = [
    // The basis changes what every rate on the ticket means, so it is stated, not implied.
    taxExempt ? "GST exempt" : gstIncluded ? "GST 5% incl" : "GST 5%",
    "Nu",
    buyer?.trim() || "walk-in",
    ...(priceList && priceList !== "Retail" ? [priceList] : []),
  ].join(" · ");

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-primary text-primary-foreground text-xs shrink-0">
      <span className="h-[18px] w-[18px] rounded-full border-[1.5px] border-current opacity-80" aria-hidden />
      <span className="font-medium">{title}</span>
      <span className="flex-1 opacity-70 truncate" data-testid="till-status">{status}</span>
      {hint && <span className="opacity-80 whitespace-nowrap">{hint}</span>}
    </div>
  );
}
