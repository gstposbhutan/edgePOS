const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");
const net = require("net");
const { app } = require("electron");

// The terminal owns a port on the loopback interface, and it is not the only thing on the machine
// that wants one. A shopkeeper's PC may be running anything — and a developer's certainly is: a
// VS Code forwarded port sat on 8090 for two days and turned a till into a 3.7 GB brick, because
// PocketBase could not bind, the app booted anyway, and the renderer spent 700 sockets talking to
// an editor. So the port is a RANGE, the app takes the first one it can actually hold, and the
// renderer is TOLD which one rather than assuming.
const PB_HOST = "127.0.0.1";
const PB_PORT_START = 8090;
const PB_PORT_END = 8099;
const MAX_RETRIES = 30;

let activeUrl = `http://${PB_HOST}:${PB_PORT_START}`;
let outputTail = "";
let exitInfo = null;

/** The URL PocketBase actually ended up on. Only meaningful after launchPocketBase() resolves. */
function getPbUrl() {
  return activeUrl;
}

/**
 * The last thing PocketBase said before it died — the line that names the real cause ("bind:
 * Only one usage of each socket address…", a failing migration, a corrupt data dir). Without this
 * the operator sees "Could not start local database" and has nothing to act on.
 */
function getLastError() {
  const lines = outputTail.split("\n").map((l) => l.trim()).filter(Boolean);
  const spoken = lines.filter((l) => /error|fatal|panic/i.test(l));
  return (spoken.length ? spoken : lines).pop() || "";
}

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

/** Can we actually hold this port right now? Binding it is the only honest test. */
function canBind(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, PB_HOST);
  });
}

async function findFreePort() {
  for (let port = PB_PORT_START; port <= PB_PORT_END; port++) {
    if (await canBind(port)) return port;
  }
  return null;
}

/**
 * Wait until OUR PocketBase answers. Two things are checked, not one: that something replies, and
 * that the reply is PocketBase's. Between the free-port probe and PocketBase's own bind there is a
 * gap in which another process can take the port, and a terminal that mirrors its day's takings
 * into a stranger is worse than one that refuses to start.
 */
function waitForPBReady(retries = 0) {
  return new Promise((resolve, reject) => {
    if (exitInfo) {
      reject(new Error(getLastError() || `PocketBase exited with code ${exitInfo.code}`));
      return;
    }
    const again = (why) => {
      if (retries < MAX_RETRIES) {
        setTimeout(() => { waitForPBReady(retries + 1).then(resolve).catch(reject); }, 500);
      } else {
        reject(new Error(getLastError() || why));
      }
    };
    const req = http.get(`${activeUrl}/api/health`, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => {
        if (res.statusCode !== 200) return again(`Health check returned ${res.statusCode}`);
        // PocketBase answers {"code":200,"message":"API is healthy.",...}. Anything else on this
        // port is somebody else's server wearing our address.
        if (!/healthy/i.test(body)) {
          reject(new Error(`Port ${activeUrl} is held by another application, not the local database.`));
          return;
        }
        resolve(true);
      });
    });
    req.on("error", () => again("PocketBase failed to start within timeout"));
    req.setTimeout(2000, () => { req.destroy(); again("PocketBase health check timeout"); });
  });
}

async function launchPocketBase(dataDirOverride) {
  const binary = getPocketBaseBinary();
  const dataDir = dataDirOverride || path.join(getAppBase(), "pb", "pb_data");

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  outputTail = "";
  exitInfo = null;

  const port = await findFreePort();
  if (port === null) {
    const err = new Error(
      `Ports ${PB_PORT_START}-${PB_PORT_END} on ${PB_HOST} are all in use. Close whatever is holding them and start Pelbu POS again.`
    );
    err.code = "EPBNOPORT";
    throw err;
  }
  activeUrl = `http://${PB_HOST}:${port}`;

  const migrationsDir = path.join(getAppBase(), "pb", "pb_migrations");
  const hooksDir = path.join(getAppBase(), "pb", "pb_hooks");

  const args = ["serve", "--dir", dataDir, "--http", `${PB_HOST}:${port}`];
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
  console.log(`[PB] Listening on: ${activeUrl}`);

  const proc = spawn(binary, args, {
    stdio: "pipe",
    detached: false,
  });

  // PocketBase reports its fatal bind/migration errors on stdout as readily as stderr, so both
  // feed the tail the dialog will quote.
  const remember = (data) => {
    outputTail = (outputTail + data.toString()).slice(-4000);
  };
  proc.stdout.on("data", (data) => { remember(data); console.log(`[PB] ${data.toString().trim()}`); });
  proc.stderr.on("data", (data) => { remember(data); console.error(`[PB] ${data.toString().trim()}`); });

  proc.on("error", (err) => {
    outputTail += `\n${err.message}`;
    exitInfo = { code: -1 };
  });

  proc.on("close", (code) => {
    console.log(`[PB] PocketBase exited with code ${code}`);
    exitInfo = { code };
  });

  return { proc, port, url: activeUrl, ready: () => waitForPBReady() };
}

module.exports = { launchPocketBase, getPbUrl, getLastError, PB_HOST, PB_PORT_START, PB_PORT_END };
