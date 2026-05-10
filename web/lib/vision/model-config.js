/**
 * Vision model configuration.
 * Swap MODEL_URL to YOLO26 when available — pipeline is model-agnostic.
 *
 * Current test model: YOLOv8n (nano) — same ONNX end-to-end architecture.
 * Production model:   yolo26s_end2end.onnx
 */

export const MODEL_CONFIG = {
  // Model URL — served from /public/models/ or a CDN
  // Download YOLOv8n ONNX: https://github.com/ultralytics/assets/releases
  MODEL_URL: '/models/yolov8n.onnx',

  // Input resolution fed to YOLO (downsampled from 4K)
  INPUT_WIDTH:  640,
  INPUT_HEIGHT: 640,

  // Inference thresholds
  CONFIDENCE_THRESHOLD: 0.45,
  IOU_THRESHOLD:        0.45,  // NMS overlap threshold

  // Number of COCO classes (YOLOv8n default — override for custom model)
  NUM_CLASSES: 80,

  // Execution providers in priority order
  // WebGPU → WASM multi-threaded → CPU
  EXECUTION_PROVIDERS: ['webgpu', 'wasm'],

  // WASM config — multi-threaded for older hardware
  WASM_CONFIG: {
    numThreads:   4,
    simd:         true,
    proxy:        false,
  },

  // 4K capture resolution
  CAMERA_WIDTH:  3840,
  CAMERA_HEIGHT: 2160,

  // Frame skip — process every Nth frame to maintain UI responsiveness
  // Adaptive: decreases if inference is slow
  FRAME_SKIP_BASE: 3,

  // GPU memory threshold (MB) — scale down quality above this
  GPU_MEMORY_THRESHOLD: 2048,
}

/**
 * COCO class names (YOLOv8n default).
 * Replace with product category names for custom YOLO26 model.
 */
export const CLASS_NAMES = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train',
  'truck', 'boat', 'traffic light', 'fire hydrant', 'stop sign',
  'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
  'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag',
  'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball', 'kite',
  'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
  'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana',
  'apple', 'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza',
  'donut', 'cake', 'chair', 'couch', 'potted plant', 'bed', 'dining table',
  'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone',
  'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock',
  'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush',
]
