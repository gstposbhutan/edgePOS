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

  // SKU matching. A match here AUTO-ADDS a line to a real bill, so a near-tie is refused
  // outright: a wrong item on the ticket is worse for a shop than no item at all, because the
  // cashier has to notice it to undo it.
  //
  // These numbers are MEASURED, not guessed. Embedding each catalog photo with MobileNetV3 and
  // querying with a 60% centre crop of the same photo — roughly what the pad sees when an item
  // is held up — gives the correct product first every time, but at cosine scores of only
  // 0.50-0.73. An earlier 0.75 threshold would therefore have matched NOTHING, ever, while
  // looking perfectly reasonable in the source.
  //
  // The absolute score is the weak signal; the MARGIN is the strong one (0.18-0.58 in the same
  // run). So the threshold sits below the weakest correct match with room for a live camera to
  // be worse than a clean photo, and the margin does the discriminating.
  //
  // Re-measure when the catalog grows: margins shrink as more near-neighbours arrive, and a
  // shop with two similar packets is exactly where a false positive would first appear.
  MATCH_THRESHOLD: 0.45,
  MATCH_MARGIN:    0.08,

  // The pad's own hint is "hold items in view to auto-add", so when the detector finds no box
  // at all we still embed the middle of the frame and try to match that. Without this, any
  // product COCO has never heard of — which is most of a Bhutanese grocery — can never be
  // recognised no matter how complete the catalog is.
  CENTER_CROP_FRACTION: 0.6,

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
