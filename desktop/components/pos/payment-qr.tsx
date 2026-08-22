"use client";

import { useMemo } from "react";
import { toSVG } from "bwip-js/browser";
import { buildNqrcPayload, type NqrcMerchant } from "@/lib/nqrc";
import { useSettings } from "@/hooks/use-settings";

/**
 * Dynamic Bhutan NQRC payment QR for the ONLINE method — shown before the journal-number step so the
 * customer scans it with their bank app (merchant + exact amount auto-filled). Builds the QR entirely
 * offline from the merchant config synced into the local settings singleton. Renders nothing when the
 * vendor hasn't configured a merchant QR.
 */
export function PaymentQr({ amount, reference }: { amount: number; reference?: string }) {
  const { settings } = useSettings();

  const svg = useMemo(() => {
    const merchant: NqrcMerchant = {
      enabled: !!settings?.nqrc_enabled,
      merchantName: settings?.nqrc_merchant_name || settings?.store_name,
      merchantCity: settings?.nqrc_merchant_city,
      accountId: settings?.nqrc_account_id,
      pspGuid: settings?.nqrc_psp_guid,
      mcc: settings?.nqrc_mcc,
      accountTag: settings?.nqrc_account_tag || "26",
    };
    const payload = buildNqrcPayload(merchant, amount, { reference });
    if (!payload) return null;
    try {
      return toSVG({ bcid: "qrcode", text: payload, scale: 3 });
    } catch {
      return null;
    }
  }, [settings, amount, reference]);

  if (!svg) return null;

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg bg-white p-3 border border-border">
      <div
        className="w-[200px] h-[200px] [&>svg]:w-full [&>svg]:h-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="text-sm font-semibold text-slate-900">Scan to pay Nu. {Number(amount).toFixed(2)}</p>
      <p className="text-[10px] text-slate-500">Bhutan QR — mBoB / BNB / any bank app</p>
    </div>
  );
}
