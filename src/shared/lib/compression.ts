import * as config from '../config/index'

/**
 * Decodes PNG bytes into an HTMLCanvasElement by creating a temporary Blob URL.
 * @param pngBytes - Raw PNG data exported from Figma.
 * @returns A canvas element with the image drawn on it.
 */
export function pngBytesToCanvas(pngBytes: Uint8Array): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    const blob = new Blob([pngBytes as BlobPart], { type: 'image/png' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      canvas.getContext('2d')!.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      resolve(canvas)
    }
    img.src = url
  })
}

/**
 * Encodes a canvas to a Blob using the specified MIME type and quality.
 * @param canvas - Source canvas to encode.
 * @param mimeType - Target MIME type (e.g. `"image/jpeg"`, `"image/webp"`).
 * @param quality - Encoding quality from 0.0 to 1.0 (ignored for PNG).
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), mimeType, quality)
  })
}

/**
 * Finds the highest quality value that produces a Blob within the target size
 * using binary search over the quality range [0.0, 1.0].
 * @param canvas - Source canvas to encode.
 * @param mimeType - Target MIME type (JPG or WebP).
 * @param targetSize - Maximum allowed file size in bytes.
 * @returns The largest Blob that fits within targetSize, or the smallest possible if none fit.
 */
export async function binarySearchQuality(
  canvas: HTMLCanvasElement,
  mimeType: string,
  targetSize: number,
): Promise<Blob> {
  let low = 0.0,
    high = 1.0
  let best: Blob | null = null
  async function iterate(remainingIterations: number): Promise<Blob> {
    if (remainingIterations <= 0) return best ?? canvasToBlob(canvas, mimeType, 0)
    const mid = (low + high) / 2
    const blob = await canvasToBlob(canvas, mimeType, mid)
    if (blob.size <= targetSize) {
      best = blob
      low = mid
    } else {
      high = mid
    }
    return iterate(remainingIterations - 1)
  }
  return iterate(config.JPG_SEARCH_ITERATIONS)
}

/**
 * Compresses a PNG to fit within the target size by reducing color quantization levels.
 * Uses binary search over the levels range defined in config (PNG_LEVELS_MIN–PNG_LEVELS_MAX).
 * @param canvas - Source canvas with the original image.
 * @param targetSize - Maximum allowed file size in bytes.
 * @returns A PNG Blob within the target size, or the most compressed version if target is unreachable.
 */
export async function compressPngToTarget(
  canvas: HTMLCanvasElement,
  targetSize: number,
): Promise<Blob> {
  const { width, height } = canvas
  const ctx = canvas.getContext('2d')!
  const originalImageData = ctx.getImageData(0, 0, width, height)

  async function quantize(levels: number): Promise<Blob> {
    const tmpCanvas = document.createElement('canvas')
    tmpCanvas.width = width
    tmpCanvas.height = height
    const tmpCtx = tmpCanvas.getContext('2d')!
    const imgData = tmpCtx.createImageData(width, height)
    const sourcePixels = originalImageData.data,
      destPixels = imgData.data
    const step = 256 / levels
    for (let i = 0; i < sourcePixels.length; i += 4) {
      destPixels[i] = Math.round(Math.round(sourcePixels[i] / step) * step)
      destPixels[i + 1] = Math.round(Math.round(sourcePixels[i + 1] / step) * step)
      destPixels[i + 2] = Math.round(Math.round(sourcePixels[i + 2] / step) * step)
      destPixels[i + 3] = sourcePixels[i + 3]
    }
    tmpCtx.putImageData(imgData, 0, 0)
    return canvasToBlob(tmpCanvas, 'image/png')
  }

  let low = config.PNG_LEVELS_MIN,
    high = config.PNG_LEVELS_MAX,
    best: Blob | null = null
  async function iterate(remainingIterations: number): Promise<Blob> {
    if (remainingIterations <= 0) return best ?? quantize(config.PNG_LEVELS_MIN)
    const mid = Math.floor((low + high) / 2)
    const blob = await quantize(mid)
    if (blob.size <= targetSize) {
      best = blob
      low = mid + 1
    } else {
      high = mid - 1
    }
    return iterate(remainingIterations - 1)
  }
  return iterate(8)
}

/**
 * Converts a raw PNG frame (exported from Figma) to the target format, applying size compression if needed.
 * For JPG/WebP uses quality binary search; for PNG uses color quantization binary search.
 * @param pngBytes - Raw PNG bytes from Figma export.
 * @param format - Target format: `"jpg"`, `"png"`, or `"webp"`.
 * @param limit - Maximum file size in bytes, or null for no limit (maximum quality).
 * @returns A Blob in the target format.
 */
export async function convertFrame(
  pngBytes: Uint8Array,
  format: string,
  limit: number | null,
): Promise<Blob> {
  const canvas = await pngBytesToCanvas(pngBytes)
  if (format === 'png') {
    return limit ? compressPngToTarget(canvas, limit) : canvasToBlob(canvas, 'image/png')
  }
  const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/webp'
  return limit ? binarySearchQuality(canvas, mimeType, limit) : canvasToBlob(canvas, mimeType, 1.0)
}
