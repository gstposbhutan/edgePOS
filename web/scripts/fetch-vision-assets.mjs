#!/usr/bin/env node
/**
 * Put the vision runtime where the browser can fetch it.
 *
 * Two things have to be under `web/public/` before the camera pad can load a model, and NEITHER
 * belongs in git — one is a 38 MB pair of WebAssembly binaries that already ships inside
 * node_modules, the other is a model file we do not author:
 *
 *   public/onnx/    ONNX Runtime Web's WASM binaries, copied out of node_modules. The engine
 *                   points `ort.env.wasm.wasmPaths` at this folder; without it EVERY execution
 *                   provider fails and the pad reports "check model file and browser support",
 *                   which sends you looking at the model when the runtime is what is missing.
 *                   The `.jsep` pair is the WebGPU build — dropping it silently costs the GPU
 *                   path and falls back to CPU.
 *   public/models/  the detection model itself (see MODEL_CONFIG.MODEL_URL).
 *
 * Same shape as desktop/scripts/fetch-pocketbase.mjs: a build step, not a commit.
 *
 *   node scripts/fetch-vision-assets.mjs          # copy the runtime, report on the model
 *   node scripts/fetch-vision-assets.mjs --model <url|path>   # also install a model
 */
import { copyFile, mkdir, stat, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.resolve(HERE, '..')
const ORT_DIST = path.resolve(WEB, '..', 'node_modules', 'onnxruntime-web', 'dist')
const ONNX_OUT = path.join(WEB, 'public', 'onnx')
const MODEL_OUT = path.join(WEB, 'public', 'models', 'yolov8n.onnx')

// The plain build is the CPU/WASM path; the .jsep build is what WebGPU runs on. Each needs its
// loader .mjs beside it — ORT fetches the pair by name from wasmPaths.
const RUNTIME_FILES = [
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
]

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

async function copyRuntime() {
  if (!existsSync(ORT_DIST)) {
    console.error(`✗ onnxruntime-web is not installed (looked in ${ORT_DIST}).`)
    console.error('  Run `npm install` at the repo root first.')
    process.exitCode = 1
    return
  }
  await mkdir(ONNX_OUT, { recursive: true })
  let total = 0
  for (const name of RUNTIME_FILES) {
    const from = path.join(ORT_DIST, name)
    if (!existsSync(from)) {
      console.warn(`  ! ${name} is not in this onnxruntime-web build — skipped`)
      continue
    }
    await copyFile(from, path.join(ONNX_OUT, name))
    total += (await stat(from)).size
  }
  console.log(`✓ ONNX runtime → public/onnx/ (${mb(total)})`)
}

/** An ONNX file starts with a protobuf field header; an HTML error page does not. */
async function looksLikeOnnx(file) {
  const head = (await readFile(file)).subarray(0, 16).toString('latin1')
  return !head.includes('<') && !head.toLowerCase().includes('html')
}

async function installModel(source) {
  await mkdir(path.dirname(MODEL_OUT), { recursive: true })
  if (/^https?:/.test(source)) {
    const res = await fetch(source, { redirect: 'follow' })
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`)
    await writeFile(MODEL_OUT, Buffer.from(await res.arrayBuffer()))
  } else {
    await copyFile(path.resolve(source), MODEL_OUT)
  }
  // A 404 page saved under a .onnx name fails later as "all execution providers failed", which
  // is a miserable way to find out. Catch it here instead.
  if (!(await looksLikeOnnx(MODEL_OUT))) {
    throw new Error('that is not an ONNX file — the download returned a web page')
  }
  console.log(`✓ model → public/models/yolov8n.onnx (${mb((await stat(MODEL_OUT)).size)})`)
}

const argv = process.argv.slice(2)
const modelArg = argv.includes('--model') ? argv[argv.indexOf('--model') + 1] : null

await copyRuntime()

if (modelArg) {
  await installModel(modelArg)
} else if (existsSync(MODEL_OUT)) {
  console.log(`✓ model already present (${mb((await stat(MODEL_OUT)).size)})`)
} else {
  console.log('• no model at public/models/yolov8n.onnx — the camera pad will report a load failure.')
  console.log('  Install one with: node scripts/fetch-vision-assets.mjs --model <url or path>')
  // Ultralytics publishes .pt only — the .onnx has to be exported. Their own image is amd64,
  // so it will not run on this arm64 box ("exec format error"); a plain python:3.11-slim does,
  // once the libs opencv links against are present.
  console.log('  Ultralytics publishes .pt, not .onnx. Export one (works on arm64):')
  console.log('    curl -sLO https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt')
  console.log('    docker run --rm -v "$PWD:/out" -w /out python:3.11-slim bash -c \\')
  console.log('      "apt-get -qq update && apt-get -qq install -y libxcb1 libgl1 libglib2.0-0 >/dev/null;" \\')
  console.log('      "pip install -q ultralytics onnx; yolo export model=yolov8n.pt format=onnx opset=17"')
}
