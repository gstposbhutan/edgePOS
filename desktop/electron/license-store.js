const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { verifyLicense } = require("./license");
const { getMachineId } = require("./machine-id");

// The activated .lic lives in the OS user-data dir (writable, per-install). It is the single
// source of truth: on every boot we re-verify it against this machine and derive the sync
// config from its payload. See docs/label-maker-plan.md + the licensing design.
function licensePath() {
  return path.join(app.getPath("userData"), "license.lic");
}

function readLicense() {
  try {
    return fs.readFileSync(licensePath(), "utf8").trim();
  } catch {
    return null;
  }
}

function saveLicense(lic) {
  fs.writeFileSync(licensePath(), String(lic).trim(), "utf8");
}

function clearLicense() {
  try { fs.unlinkSync(licensePath()); } catch { /* already absent */ }
}

// Verify the stored license against THIS machine. { valid, payload?, reason? }.
function checkLicense() {
  const lic = readLicense();
  if (!lic) return { valid: false, reason: "missing" };
  return verifyLicense(lic, getMachineId());
}

module.exports = { licensePath, readLicense, saveLicense, clearLicense, checkLicense };
