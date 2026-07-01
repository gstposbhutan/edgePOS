const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { app } = require("electron");

const PB_URL = "http://127.0.0.1:8090";
const MAX_RETRIES = 30;

function getAppBase() {
  // In production (packaged): use resourcesPath which is the real filesystem dir
  // outside the asar archive. In dev: use __dirname.
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar.unpacked");
  }
  return path.join(__dirname, "..");
}

function getPocketBaseBinary() {
  const base = path.join(getAppBase(), "pb");
  const platform = process.platform;
  // Platform-correct binary name. On Windows this is ALWAYS pocketbase.exe — never the bare
  // "pocketbase" (the repo ships a Linux ELF by that name, which would fail to run on Win).
  const exeName = platform === "win32" ? "pocketbase.exe" : "pocketbase";
  const archExt = platform === "win32" ? ".exe" : "";

  const candidates = [
    path.join(base, `pocketbase_${platform}_${process.arch}${archExt}`),
    path.join(base, exeName),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  return exeName;
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

function launchPocketBase(dataDirOverride) {
  const binary = getPocketBaseBinary();
  const dataDir = dataDirOverride || path.join(getAppBase(), "pb", "pb_data");

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const migrationsDir = path.join(getAppBase(), "pb", "pb_migrations");
  const hooksDir = path.join(getAppBase(), "pb", "pb_hooks");

  const args = ["serve", "--dir", dataDir, "--http", "127.0.0.1:8090"];
  if (fs.existsSync(migrationsDir)) {
    args.push("--migrationsDir", migrationsDir);
  }
  // Explicitly point PocketBase at the bundled hooks. PB defaults --hooksDir to
  // {dataDir}/../pb_hooks; in the packaged app the data dir is userData/pb_data, so that
  // default misses the hooks bundled under resources/app.asar.unpacked/pb/pb_hooks. Without
  // this the custom routes never load — notably /api/custom/sync-user, which mirrors each web
  // user's bcrypt hash into the terminal so store team logins work here (and audit hooks).
  if (fs.existsSync(hooksDir)) {
    args.push("--hooksDir", hooksDir);
  }

  console.log(`[PB] Starting PocketBase: ${binary}`);
  console.log(`[PB] Data dir: ${dataDir}`);

  const proc = spawn(binary, args, {
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
