import * as config from '../config/index'
import * as logger from '../logger'
import { ditherPixels, makeChannelQuantize, DITHER_METHODS } from './dither'
import type { DitherMethod } from './dither'

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
 * @returns A Blob encoded in the given MIME type.
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
 * Creates a temporary canvas from raw RGBA pixel data and encodes it as PNG.
 * @param pixels - RGBA pixel data (4 bytes per pixel, row-major).
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @returns A PNG Blob.
 */
function encodePng(pixels: Uint8ClampedArray, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.putImageData(new ImageData(pixels, width, height), 0, 0)
  return canvasToBlob(canvas, 'image/png')
}

/**
 * Creates a temporary canvas from raw RGBA pixel data and encodes it as the given MIME type.
 * @param pixels - RGBA pixel data (4 bytes per pixel, row-major).
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @param mimeType - Target MIME type (e.g. `"image/jpeg"`).
 * @param quality - Encoding quality 0.0–1.0.
 * @returns An encoded Blob.
 */
function encodeImage(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.putImageData(new ImageData(pixels, width, height), 0, 0)
  return canvasToBlob(canvas, mimeType, quality)
}

/**
 * Finds the highest quality value that produces a Blob within the target size,
 * using binary search over the quality range [0.0, 1.0].
 * @param pixels - RGBA pixel data to encode (4 bytes per pixel, row-major).
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @param mimeType - Target MIME type (JPG or WebP).
 * @param targetSize - Maximum allowed file size in bytes.
 * @returns The largest Blob that fits within targetSize, or the smallest possible if none fit.
 */
async function binarySearchQuality(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  mimeType: string,
  targetSize: number,
): Promise<Blob> {
  let low = 0.0,
    high = 1.0,
    best: Blob | null = null

  /**
   * Recursively halves the search range for the remaining number of iterations.
   * @param remainingIterations - How many iterations are left before stopping.
   * @returns The best Blob found so far, or the lowest-quality encode if none fits.
   */
  async function iterate(remainingIterations: number): Promise<Blob> {
    if (remainingIterations <= 0) return best ?? encodeImage(pixels, width, height, mimeType, 0)
    const mid = (low + high) / 2
    const blob = await encodeImage(pixels, width, height, mimeType, mid)
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
 * Compresses a PNG to fit within the target size by reducing per-channel colour
 * quantisation levels and applying dithering to maintain visual quality.
 *
 * Strategy: for each of three dithering algorithms (Bayer, Floyd-Steinberg,
 * Jarvis-Judice-Ninke), binary-search over the quantisation level range
 * (PNG_LEVELS_MIN – PNG_LEVELS_MAX) to find the highest level (best quality)
 * whose encoded PNG fits the limit.  The combination with the highest level is
 * used; ties are broken in favour of the algorithm listed last in DITHER_METHODS
 * (Jarvis-Judice-Ninke).
 * @param canvas - Source canvas with the original image.
 * @param targetSize - Maximum allowed file size in bytes.
 * @returns A PNG Blob within the target size.
 */
export async function compressPngToTarget(
  canvas: HTMLCanvasElement,
  targetSize: number,
): Promise<Blob> {
  const { width, height } = canvas
  const originalPixels = canvas.getContext('2d')!.getImageData(0, 0, width, height).data

  // When a specific method is configured, skip the multi-algorithm search.
  const methodsToTry = config.PNG_DITHER_CANDIDATES
    ? config.DITHER_METHOD === 'best'
      ? DITHER_METHODS
      : [config.DITHER_METHOD]
    : [config.DITHER_METHOD === 'best' ? 'jarvis-judice-ninke' : config.DITHER_METHOD]

  let bestBlob: Blob | null = null
  let bestLevels = 0
  let bestMethod: DitherMethod | null = null

  for (const method of methodsToTry) {
    let lo = config.PNG_LEVELS_MIN,
      hi = config.PNG_LEVELS_MAX,
      methodBestBlob: Blob | null = null,
      methodBestLevels = 0

    for (let i = 0; i < config.PNG_SEARCH_ITERATIONS; i++) {
      const mid = Math.floor((lo + hi) / 2)
      const dithered = ditherPixels(method, originalPixels, width, height, makeChannelQuantize(mid))
      const blob = await encodePng(dithered, width, height)
      if (blob.size <= targetSize) {
        methodBestBlob = blob
        methodBestLevels = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }

    // Accept this method if it achieves strictly more levels, or ties (higher-quality method wins).
    if (methodBestBlob && methodBestLevels >= bestLevels) {
      bestBlob = methodBestBlob
      bestLevels = methodBestLevels
      bestMethod = method
    }
  }

  logger.log(
    `png compress: method=${bestMethod ?? 'none'} levels=${bestLevels}/${config.PNG_LEVELS_MAX} size=${bestBlob?.size ?? 0}/${targetSize}`,
  )

  // Fallback: minimum levels with FS dithering.
  return (
    bestBlob ??
    encodePng(
      ditherPixels(
        'floyd-steinberg',
        originalPixels,
        width,
        height,
        makeChannelQuantize(config.PNG_LEVELS_MIN),
      ),
      width,
      height,
    )
  )
}

/**
 * Compresses a JPG or WebP frame to fit within the target size.
 *
 * Strategy: for each of three dithering pre-processing approaches (none, plus
 * Bayer, Floyd-Steinberg, Jarvis-Judice-Ninke at a fixed mild quantisation level
 * of JPG_DITHER_LEVELS), binary-search over quality (0–1) to find the highest
 * quality that fits.  Dithering at a mild level helps break up smooth gradients
 * before DCT encoding, reducing visible banding at moderate-to-low quality.
 * The approach that produces the largest Blob still within the limit is used
 * (most of the size budget consumed = highest quality).
 * @param canvas - Source canvas with the original image.
 * @param mimeType - Target MIME type (`"image/jpeg"` or `"image/webp"`).
 * @param targetSize - Maximum allowed file size in bytes.
 * @returns The best-quality Blob within the target size.
 */
export async function compressRasterToTarget(
  canvas: HTMLCanvasElement,
  mimeType: string,
  targetSize: number,
): Promise<Blob> {
  const { width, height } = canvas
  const originalPixels = canvas.getContext('2d')!.getImageData(0, 0, width, height).data
  const ditheredLevelQuantize = makeChannelQuantize(config.JPG_DITHER_LEVELS)

  const methodsToTry = config.DITHER_METHOD === 'best' ? DITHER_METHODS : [config.DITHER_METHOD]

  let bestBlob: Blob | null = null
  let bestLabel: DitherMethod | 'none' = 'none'

  if (config.JPG_DITHER_CANDIDATES) {
    // Candidates mode: try original + all dithered versions, pick the largest blob ≤ limit.
    const candidates: Array<{ label: DitherMethod | 'none'; pixels: Uint8ClampedArray }> = [
      { label: 'none', pixels: originalPixels },
      ...methodsToTry.map((method) => ({
        label: method,
        pixels: ditherPixels(method, originalPixels, width, height, ditheredLevelQuantize),
      })),
    ]
    for (const { label, pixels } of candidates) {
      const blob = await binarySearchQuality(pixels, width, height, mimeType, targetSize)
      const blobFits = blob.size <= targetSize
      const bestFits = bestBlob !== null && bestBlob.size <= targetSize
      // Prefer blobs within the limit (largest wins); if none fit, prefer smallest (min excess).
      if (
        !bestBlob ||
        (blobFits && (!bestFits || blob.size > bestBlob.size)) ||
        (!blobFits && !bestFits && blob.size < bestBlob.size)
      ) {
        bestBlob = blob
        bestLabel = label
      }
    }
  } else {
    // Fixed mode: always apply dithering, no comparison with original.
    const method = methodsToTry[methodsToTry.length - 1] // last = highest quality
    const dithered = ditherPixels(method, originalPixels, width, height, ditheredLevelQuantize)
    bestBlob = await binarySearchQuality(dithered, width, height, mimeType, targetSize)
    bestLabel = method
  }

  logger.log(
    `${mimeType.split('/')[1]} compress: method=${bestLabel} size=${bestBlob?.size ?? 0}/${targetSize}`,
  )

  return bestBlob!
}

/**
 * Converts a raw PNG frame (exported from Figma) to the target format, applying
 * size compression and dithering if needed.
 *   - JPG/WebP: multi-candidate quality binary search (original + 3 dithering pre-processings).
 *   - PNG: multi-algorithm dithering + quantisation level binary search.
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
  return limit
    ? compressRasterToTarget(canvas, mimeType, limit)
    : canvasToBlob(canvas, mimeType, 1.0)
}
