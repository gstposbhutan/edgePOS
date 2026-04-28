import { networkInterfaces } from "os";

/** @type {import('next').NextConfig} */

// Auto-detect LAN IPs for dev HMR
function getLanIps() {
  const ips = [];
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

const lanIps = getLanIps();

const nextConfig = {
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: process.cwd(),
  },
  // Allow HMR WebSocket from this machine's LAN IP(s)
  allowedDevOrigins: lanIps,
  // Static export only during production build
  ...(process.env.NODE_ENV === "production" && {
    output: "export",
    distDir: "out",
    assetPrefix: "./",
    trailingSlash: true,
  }),
};

export default nextConfig;
