const os = require("os");
const { execFileSync } = require("child_process");

// Stable per-terminal identity for the license machine-lock + cash_registers binding +
// sync external_id prefix. On Windows it uses the OS MachineGuid (registry) — stable
// across reboots / NIC changes, only changes on an OS reinstall — which is far more
// reliable than a MAC (Hyper-V / VPN / USB adapters + MAC randomization). Falls back to
// the first real MAC, then hostname, on non-Windows / locked-down boxes.

function readMachineGuid() {
  try {
    const out = execFileSync(
      "reg",
      ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
      { encoding: "utf8" }
    );
    const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
    if (m) return m[1].toLowerCase();
  } catch (e) {
    // not Windows / no registry access
  }
  return null;
}

function firstMac() {
  try {
    const nets = os.networkInterfaces();
    const macs = [];
    for (const ifname of Object.keys(nets)) {
      for (const ni of nets[ifname] || []) {
        if (!ni.internal && ni.mac && ni.mac !== "00:00:00:00:00:00") macs.push(ni.mac.toLowerCase());
      }
    }
    if (macs.length) { macs.sort(); return macs[0].replace(/:/g, ""); }
  } catch (e) { /* fall through */ }
  return null;
}

let cached = null;
function getMachineId() {
  if (cached) return cached;
  if (process.platform === "win32") {
    const guid = readMachineGuid();
    if (guid) return (cached = "win-" + guid);
  }
  const mac = firstMac();
  if (mac) return (cached = "mac-" + mac);
  return (cached = "host-" + os.hostname());
}

module.exports = { getMachineId };
