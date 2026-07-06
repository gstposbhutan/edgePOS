const { spawn } = require("child_process");

// ── Cash-drawer kick ──────────────────────────────────────────────────────────
// The receipt path (electron/printer.js) prints via webContents.print → the OS
// driver, which can't carry the raw ESC/POS pulse that pops a cash drawer. So we
// send the drawer-kick bytes straight to the printer through the Windows print
// spooler in RAW mode, via a PowerShell P/Invoke to winspool.drv — NO native
// module to electron-rebuild (matches printer.js's deliberate no-native-deps
// stance). Windows-only; a graceful no-op on dev machines (mac/linux).
//
// ESC p 0 25 250 — pulse connector pin 2, ~50ms on / ~500ms off. The near-universal
// "kick the drawer" command for ESC/POS thermal printers (the drawer is wired to
// the printer's RJ11 port).
const KICK_BYTES = [0x1b, 0x70, 0x00, 0x19, 0xfa];

// Resolve the printer to pulse: the configured device, else the OS default.
async function resolvePrinterName(mainWindow, settings) {
  const configured = ((settings && settings.printer_device_name) || "").trim();
  if (configured) return configured;
  if (!mainWindow || mainWindow.isDestroyed()) return "";
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    const def = (printers || []).find((p) => p.isDefault) || (printers || [])[0];
    return def ? def.name : "";
  } catch {
    return "";
  }
}

function buildPsScript(printerName) {
  const bytesLiteral = KICK_BYTES.join(",");
  const safeName = String(printerName).replace(/'/g, "''"); // PowerShell single-quote escape
  return `
$ErrorActionPreference = 'Stop'
$src = @'
using System;
using System.Runtime.InteropServices;
public class PelbuRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public struct DOCINFOA { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool OpenPrinter(string src, out IntPtr h, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter")] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", CharSet=CharSet.Ansi)] public static extern bool StartDocPrinter(IntPtr h, int level, ref DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter")] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter")] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter")] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter")] public static extern bool WritePrinter(IntPtr h, byte[] data, int count, out int written);
  public static void Kick(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("OpenPrinter failed for '" + printer + "'");
    try {
      DOCINFOA di = new DOCINFOA(); di.pDocName = "Pelbu Cash Drawer"; di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, ref di)) throw new Exception("StartDocPrinter failed");
      if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter failed");
      int written;
      WritePrinter(h, data, data.Length, out written);
      EndPagePrinter(h);
      EndDocPrinter(h);
    } finally { ClosePrinter(h); }
  }
}
'@
Add-Type -TypeDefinition $src -Language CSharp
[PelbuRawPrinter]::Kick('${safeName}', [byte[]](${bytesLiteral}))
`;
}

// Pop the cash drawer. Returns {success, error?}. Never throws.
async function kickDrawer(mainWindow, settings) {
  if (process.platform !== "win32") {
    return { success: false, error: "Cash drawer is only supported on Windows terminals" };
  }
  const printerName = await resolvePrinterName(mainWindow, settings);
  if (!printerName) return { success: false, error: "No printer configured for the cash drawer" };

  const encoded = Buffer.from(buildPsScript(printerName), "utf16le").toString("base64");
  return new Promise((resolve) => {
    const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], { windowsHide: true });
    let stderr = "";
    ps.stderr.on("data", (d) => { stderr += d.toString(); });
    ps.on("error", (err) => resolve({ success: false, error: err.message }));
    ps.on("close", (code) => {
      if (code === 0) resolve({ success: true });
      else resolve({ success: false, error: stderr.trim().split("\n")[0] || `drawer kick exited ${code}` });
    });
  });
}

module.exports = { kickDrawer };
