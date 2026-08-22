/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  transpilePackages: ['@nexus-bhutan/sync-core'],

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'img.pelbu.com' },
    ],
  },

  // ONNX Runtime WASM needs cross-origin isolation to use SharedArrayBuffer (WebGPU/WASM threads).
  async headers() {
    return [
      {
        source: '/onnx/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
      {
        source: '/models/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ]
  },

  // ONNX Runtime is client-only — keep it out of the server bundle.
  serverExternalPackages: ['onnxruntime-web'],
}

export default nextConfig
