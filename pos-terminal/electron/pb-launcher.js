const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const PB_URL = "http://127.0.0.1:8090";
const MAX_RETRIES = 30;

function getPocketBaseBinary() {
  const platform = process.platform;
  const arch = process.arch;
  const base = path.join(__dirname, "..", "pb");

  const candidates = [
    path.join(base, `pocketbase_${platform}_${arch}`),
    path.join(base, "pocketbase"),
    path.join(base, platform === "win32" ? "pocketbase.exe" : "pocketbase"),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  // Fallback: look in PATH
  return "pocketbase";
}

function waitForPBReady(retries = 0) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${PB_URL}/api/health`, (res) => {
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        reject(new Error(`Health check returned ${res.statusCode}`));
      }
    });
    req.on("error", () => {
      if (retries < MAX_RETRIES) {
        setTimeout(() => {
          waitForPBReady(retries + 1).then(resolve).catch(reject);
        }, 500);
      } else {
        reject(new Error("PocketBase failed to start within timeout"));
      }
    });
    req.setTimeout(2000, () => {
      req.destroy();
      if (retries < MAX_RETRIES) {
        setTimeout(() => {
          waitForPBReady(retries + 1).then(resolve).catch(reject);
        }, 500);
      } else {
        reject(new Error("PocketBase health check timeout"));
      }
    });
  });
}

function launchPocketBase() {
  const binary = getPocketBaseBinary();
  const dataDir = path.join(__dirname, "..", "pb", "pb_data");

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  console.log(`[PB] Starting PocketBase: ${binary}`);
  console.log(`[PB] Data dir: ${dataDir}`);

  const proc = spawn(binary, ["serve", "--dir", dataDir, "--http", "127.0.0.1:8090"], {
    stdio: "pipe",
    detached: false,
  });

  proc.stdout.on("data", (data) => {
    console.log(`[PB] ${data.toString().trim()}`);
  });

  proc.stderr.on("data", (data) => {
    console.error(`[PB] ${data.toString().trim()}`);
  });

  proc.on("close", (code) => {
    console.log(`[PB] PocketBase exited with code ${code}`);
  });

  return { proc, ready: () => waitForPBReady() };
}

module.exports = { launchPocketBase, PB_URL };
