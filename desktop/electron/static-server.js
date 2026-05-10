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

function startStaticServer(serveDir, port = 0) {
  return new Promise((resolve, reject) => {
    const server = createStaticServer(serveDir);
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, port: addr.port, url: `http://127.0.0.1:${addr.port}` });
    });
    server.on("error", reject);
  });
}

module.exports = { startStaticServer };
