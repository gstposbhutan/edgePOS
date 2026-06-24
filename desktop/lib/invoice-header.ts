"use client";

import { getPB, getTerminalId } from "@/lib/pb-client";
import { generateOrderNo } from "@/lib/gst";
import { todayCompact } from "@/lib/date-utils";

type PBClient = ReturnType<typeof getPB>;

/**
 * Peek the next order number for this terminal + day, for the live invoice
 * header BEFORE checkout. DISPLAY ONLY — the real number is minted at checkout,
 * and checkout calls this same helper, so preview === final in the
 * single-terminal case. Under concurrent offline terminals the preview can
 * differ from the eventual number; the `POS-{TERMINAL}-` prefix in order_no
 * prevents real collisions. Same caveat the web next-invoice route documents.
 */
export async function peekNextOrderNo(pb: PBClient = getPB()): Promise<string> {
  const today = todayCompact();
  const terminalId = getTerminalId();
  const count = await pb.collection("orders").getList(1, 1, {
    filter: `order_no ~ "POS-${terminalId}-${today}-"`,
    sort: "-created_at",
    requestKey: null,
  });
  return generateOrderNo(terminalId, today, (count.totalItems || 0) + 1);
}
