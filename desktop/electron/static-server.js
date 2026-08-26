const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
};

function createStaticServer(serveDir) {
  const server = http.createServer((req, res) => {
    let filePath = path.join(serveDir, url.parse(req.url).pathname || "/");

    if (filePath.endsWith("/")) {
      filePath = path.join(filePath, "index.html");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    fs.readFile(filePath, (err, data) => {
      if (err) {
        // SPA fallback: serve index.html for any unknown route
        fs.readFile(path.join(serveDir, "index.html"), (err2, data2) => {
          if (err2) {
            res.writeHead(404);
            res.end("Not Found");
          } else {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(data2);
          }
        });
      } else {
        res.writeHead(200, { "Content-Type": contentType });
        res.end(data);
      }
    });
  });

  return server;
}

/**
 * Serve `out/` on loopback for the app's own window.
 *
 * The preferred port is a convenience, never a requirement: nothing outside this process needs
 * to know the number, so a port already in use is no reason to fail. It asks for `preferred`
 * once and then takes any free port the OS offers. The caller must use the RETURNED url — the
 * old code listened on a chosen port but pointed the window at the constant, so a busy 3200
 * would have loaded whatever else was on 3200 into the POS shell.
 */
function startStaticServer(serveDir, preferred = 0) {
  return new Promise((resolve, reject) => {
    const server = createStaticServer(serveDir);
    let fellBack = false;

    server.on("listening", () => {
      const addr = server.address();
      resolve({ server, port: addr.port, url: `http://127.0.0.1:${addr.port}` });
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE" && preferred !== 0 && !fellBack) {
        fellBack = true;
        console.warn(`[Static] Port ${preferred} is in use — taking any free port instead.`);
        server.listen(0, "127.0.0.1");
        return;
      }
      reject(err);
    });

    server.listen(preferred, "127.0.0.1");
  });
}

module.exports = { startStaticServer };
