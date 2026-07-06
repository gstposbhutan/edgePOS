const { BrowserWindow } = require("electron");

// ── Silent print to an OS-installed printer ───────────────────────────────────
// We drive whatever printer Windows already knows about (vendor driver) via
// Electron's `webContents.print({ silent: true, ... })`. This replaces the old
// raw escpos-USB path: no native `usb`/`escpos-usb` deps to electron-rebuild, and
// it works with any printer the OS recognises (thermal, A4, PDF). The receipt is
// rendered to a hidden BrowserWindow as compact thermal HTML and printed at the
// configured paper width.
//
// Every exported function takes the main window so it can reach a live
// `webContents` for `getPrintersAsync()` — see main.js, which holds `mainWindow`
// and passes it through the IPC handlers.

function esc(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function money(n) {
  const v = Number(n);
  return (Number.isFinite(v) ? v : 0).toFixed(2);
}

// Resolve the list of OS printers via the main window's webContents.
async function listPrinters(mainWindow) {
  if (!mainWindow || mainWindow.isDestroyed()) return [];
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return (printers || []).map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      isDefault: !!p.isDefault,
    }));
  } catch (err) {
    console.error("[Printer] getPrintersAsync failed:", err.message);
    return [];
  }
}

// Compact thermal-receipt HTML. Mirrors the on-screen preview in
// components/pos/receipt-modal.tsx (same content + order) so what the cashier
// sees matches what prints. Body width = configured paper width (mm); monospace.
function buildReceiptHtml(order, settings) {
  const s = settings || {};
  const width = Number(s.printer_paper_width) || 80;
  const storeName = s.store_name || "Pelbu";
  const items = Array.isArray(order.items) ? order.items : [];
  const rawDate = order.created_at || order.created;
  const date = rawDate ? new Date(rawDate).toLocaleString("en-IN") : "";
  const payment = String(order.payment_channel || order.payment_method || "").toUpperCase();
  const gstTotal = Number(order.gst_total) || 0;

  const itemRows = items
    .map(
      (i) => `
        <tr>
          <td class="name">${esc(i.name)}</td>
          <td class="num">${esc(i.quantity)}</td>
          <td class="num">${money(i.total)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${width}mm;
    font-family: "Courier New", monospace;
    font-size: 11px;
    line-height: 1.35;
    color: #000;
    background: #fff;
  }
  body { padding: 2mm; }
  .center { text-align: center; }
  .store { font-size: 14px; font-weight: bold; }
  .muted { font-size: 9px; }
  .rule { border-top: 1px dashed #000; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 1px 0; font-size: 10px; }
  td.num { text-align: right; white-space: nowrap; padding-left: 4px; }
  td.name { word-break: break-word; }
  .meta td { font-size: 10px; }
  .meta td.label { color: #000; }
  .meta td.val { text-align: right; }
  .totals td { font-size: 10px; }
  .totals td.amt { text-align: right; }
  .totals tr.grand td { font-size: 12px; font-weight: bold; padding-top: 2px; }
  .sig { font-size: 8px; word-break: break-all; margin-top: 4px; }
  .footer { font-size: 9px; }
</style>
</head>
<body>
  <div class="center">
    <div class="store">${esc(storeName)}</div>
    ${s.store_address ? `<div class="muted">${esc(s.store_address)}</div>` : ""}
    ${s.tpn_gstin ? `<div class="muted">TPN: ${esc(s.tpn_gstin)}</div>` : ""}
    <div class="muted">TAX INVOICE — GST 2026</div>
  </div>
  <div class="rule"></div>
  <table class="meta">
    <tr><td class="label">Invoice</td><td class="val">${esc(order.order_no)}</td></tr>
    ${date ? `<tr><td class="label">Date</td><td class="val">${esc(date)}</td></tr>` : ""}
    ${payment ? `<tr><td class="label">Payment</td><td class="val">${esc(payment)}</td></tr>` : ""}
    ${order.customer_name ? `<tr><td class="label">Customer</td><td class="val">${esc(order.customer_name)}</td></tr>` : ""}
  </table>
  <div class="rule"></div>
  <table>
    <thead>
      <tr>
        <td class="name"><strong>Item</strong></td>
        <td class="num"><strong>Qty</strong></td>
        <td class="num"><strong>Total</strong></td>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="rule"></div>
  <table class="totals">
    <tr><td>Subtotal</td><td class="amt">${money(order.subtotal)}</td></tr>
    ${Number(order.bill_discount) > 0 ? `<tr><td>Invoice discount</td><td class="amt">- ${money(order.bill_discount)}</td></tr>` : ""}
    ${gstTotal > 0 ? `<tr><td>GST</td><td class="amt">${money(order.gst_total)}</td></tr>` : ""}
    <tr class="grand"><td>TOTAL</td><td class="amt">${money(order.grand_total)}</td></tr>
    ${gstTotal === 0 ? `<tr><td colspan="2" class="center muted">Tax Exempt</td></tr>` : ""}
  </table>
  ${
    order.digital_signature
      ? `<div class="sig">Transaction Reference<br/>${esc(order.digital_signature)}</div>`
      : ""
  }
  <div class="rule"></div>
  <div class="center footer">
    <div>Computer-generated invoice</div>
    <div>${esc(s.receipt_footer || "Thank you for your business!")}</div>
  </div>
</body>
</html>`;
}

// Render the receipt to a hidden window and send it to the printer silently.
// pageSize is in microns: width = paperWidth(mm) * 1000; height derived from the
// rendered body height (px → mm at 96dpi → microns), clamped to a sane minimum so
// a near-empty receipt still has feed. The hidden window is destroyed on every
// exit path (print success, print failure, load error) to avoid leaks.
function printReceipt(mainWindow, order, settings) {
  return new Promise((resolve, reject) => {
    const s = settings || {};
    const paperWidth = Number(s.printer_paper_width) || 80;
    const copies = Number(s.printer_copies) || 1;
    const deviceName = (s.printer_device_name || "").trim();

    const win = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: false },
    });

    let settled = false;
    const cleanup = () => {
      if (!win.isDestroyed()) win.destroy();
    };
    const done = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve(true);
    };

    win.webContents.once("did-finish-load", async () => {
      try {
        const heightPx = await win.webContents.executeJavaScript("document.body.scrollHeight");
        const widthMicrons = Math.round(paperWidth * 1000);
        // px → mm at 96dpi, round up to whole mm, then mm → microns. Clamp to a
        // minimum so a short receipt isn't truncated by an over-small page.
        const heightMm = Math.max(40, Math.ceil((Number(heightPx) || 0) / 96 * 25.4));
        const heightMicrons = heightMm * 1000;

        const opts = {
          silent: true,
          printBackground: true,
          margins: { marginType: "none" },
          pageSize: { width: widthMicrons, height: heightMicrons },
          copies,
        };
        if (deviceName) opts.deviceName = deviceName;

        win.webContents.print(opts, (success, failureReason) => {
          if (success) done(null);
          else done(new Error(failureReason || "Print failed"));
        });
      } catch (err) {
        done(err);
      }
    });

    win.webContents.once("did-fail-load", (_e, _code, desc) => {
      done(new Error(desc || "Failed to load receipt"));
    });

    const html = buildReceiptHtml(order, s);
    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html)).catch((err) => done(err));
  });
}

// {connected, name}: connected if the configured device exists in the OS printer
// list; with no device configured, connected if a default printer exists.
async function getPrinterStatus(mainWindow, settings) {
  const s = settings || {};
  const printers = await listPrinters(mainWindow);
  const deviceName = (s.printer_device_name || "").trim();

  if (deviceName) {
    const match = printers.find((p) => p.name === deviceName);
    return { connected: !!match, name: match ? match.displayName : deviceName };
  }

  const def = printers.find((p) => p.isDefault) || printers[0];
  return { connected: !!def, name: def ? def.displayName : "Not configured" };
}

// Print a small sample receipt through the same path.
function testPrint(mainWindow, settings) {
  const s = settings || {};
  return printReceipt(
    mainWindow,
    {
      order_no: "TEST-001",
      created_at: new Date().toISOString(),
      payment_method: "CASH",
      customer_name: "Test Customer",
      items: [{ name: "Test Product", quantity: 1, unit_price: 100, total: 105 }],
      subtotal: 100,
      gst_total: 5,
      grand_total: 105,
      digital_signature: "test-signature",
    },
    {
      store_name: s.store_name || "Test Store",
      store_address: s.store_address || "",
      tpn_gstin: s.tpn_gstin || "",
      receipt_footer: s.receipt_footer || "Printer OK!",
      printer_paper_width: s.printer_paper_width || 80,
      printer_device_name: s.printer_device_name || "",
      printer_copies: s.printer_copies || 1,
    }
  );
}

module.exports = { printReceipt, getPrinterStatus, testPrint, listPrinters, buildReceiptHtml };
