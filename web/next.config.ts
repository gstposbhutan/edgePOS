import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',

  // Allow external image domains
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },

  // Allow ONNX Runtime WASM files to be served correctly
  async headers() {
    return [
      {
        source: '/onnx/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy',  value: 'require-corp' },
        ],
      },
      {
        source: '/models/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy',  value: 'require-corp' },
        ],
      },
    ]
  },

  // Exclude ONNX Runtime from server-side bundling — client-only
  serverExternalPackages: ['onnxruntime-web'],

  // Turbopack config (Next.js 16 default bundler)
  turbopack: {},
}

export default nextConfig
