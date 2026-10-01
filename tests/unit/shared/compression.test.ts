/**
 * Search/selection logic of shared/lib/compression.ts, run against a fake canvas whose encoded size
 * is a monotonic function of quality and of image "complexity" (distinct channel values).
 * Real codecs are not exercised here — that is level 2 (real browser).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  distinctChannelValues,
  gradientPixels,
  installFakeCanvas,
  type EncodeCall,
  type SizeModel,
} from '../../support/fake-canvas'

const WIDTH = 64
const HEIGHT = 4
const CONFIG_MODULE = '../../../src/shared/config/index'

/** JPG/WebP model: size grows linearly with quality and with image complexity. */
const rasterSizeModel: SizeModel = (pixels, _mimeType, quality) =>
  Math.round(((1000 + 9000 * (quality ?? 1)) * distinctChannelValues(pixels)) / 256)

/** PNG model: size grows with the number of distinct values (i.e. with quantisation levels). */
const pngSizeModel: SizeModel = (pixels) => distinctChannelValues(pixels) * 100

/**
 * Re-imports compression.ts, optionally with config overrides (config values are `const`,
 * so alternative modes are tested by mocking the config module).
 * @param overrides - Config exports to replace.
 * @returns The freshly imported compression module.
 */
async function loadCompression(overrides: Record<string, unknown> = {}) {
  vi.resetModules()
  vi.doMock(CONFIG_MODULE, async (importOriginal) => ({
    ...(await importOriginal<object>()),
    ...overrides,
  }))
  return import('../../../src/shared/lib/compression')
}

/**
 * Largest encoded size that fits the target, across all recorded encodes.
 * @param calls - Encode log.
 * @param target - Size limit in bytes.
 * @returns The largest fitting size, or -Infinity if none fit.
 */
function largestFitting(calls: EncodeCall[], target: number): number {
  return Math.max(...calls.filter((call) => call.size <= target).map((call) => call.size))
}

let consoleLog: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  // compression.ts reports the chosen method via logger.log → console.log; capture it quietly.
  consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.doUnmock(CONFIG_MODULE)
})

/**
 * Text of the last `... compress: method=...` log line.
 * @returns The log message, or '' if none was logged.
 */
function lastCompressLog(): string {
  const messages = consoleLog.mock.calls.map((args) => String(args[0]))
  return messages.filter((message) => message.includes('compress:')).pop() ?? ''
}

describe('compressRasterToTarget — fixed mode (current config: JPG_DITHER_CANDIDATES=false)', () => {
  it('returns the highest-quality encode that fits, after JPG_SEARCH_ITERATIONS encodes', async () => {
    const { calls, createSourceCanvas } = installFakeCanvas(rasterSizeModel)
    const compression = await loadCompression()
    const config = await import(CONFIG_MODULE)
    const target = 1500

    const blob = await compression.compressRasterToTarget(
      createSourceCanvas(WIDTH, HEIGHT, gradientPixels(WIDTH, HEIGHT)),
      'image/jpeg',
      target,
    )

    expect(calls).toHaveLength(config.JPG_SEARCH_ITERATIONS)
    expect(blob.size).toBeLessThanOrEqual(target)
    expect(blob.size).toBe(largestFitting(calls, target))
    expect(blob.type).toBe('image/jpeg')
  })

  it('always encodes the dithered image (values on the JPG_DITHER_LEVELS grid)', async () => {
    const { calls, createSourceCanvas } = installFakeCanvas(rasterSizeModel)
    const compression = await loadCompression()
    const { makeChannelQuantize } = await import('../../../src/shared/lib/dither')
    const config = await import(CONFIG_MODULE)
    const quantize = makeChannelQuantize(config.JPG_DITHER_LEVELS)

    await compression.compressRasterToTarget(
      createSourceCanvas(WIDTH, HEIGHT, gradientPixels(WIDTH, HEIGHT)),
      'image/webp',
      1500,
    )

    for (const call of calls) {
      for (let index = 0; index < call.pixels.length; index++) {
        if (index % 4 === 3) continue
        const value = call.pixels[index]
        expect(quantize(value, value, value, 255)[0]).toBe(value)
      }
    }
  })

  it('falls back to quality 0 (smallest possible) when nothing fits', async () => {
    const { calls, createSourceCanvas } = installFakeCanvas(rasterSizeModel)
    const compression = await loadCompression()
    const config = await import(CONFIG_MODULE)
    const target = 10

    const blob = await compression.compressRasterToTarget(
      createSourceCanvas(WIDTH, HEIGHT, gradientPixels(WIDTH, HEIGHT)),
      'image/jpeg',
      target,
    )

    expect(calls).toHaveLength(config.JPG_SEARCH_ITERATIONS + 1)
    const lastCall = calls[calls.length - 1]
    expect(lastCall.quality).toBe(0)
    expect(blob.size).toBe(lastCall.size)
    expect(blob.size).toBeGreaterThan(target)
  })
})

describe('compressRasterToTarget — candidates mode (JPG_DITHER_CANDIDATES=true, DITHER_METHOD=best)', () => {
  const candidateOverrides = { JPG_DITHER_CANDIDATES: true, DITHER_METHOD: 'best' }

  it('tries original + 3 dithered candidates and keeps the largest blob within the limit', async () => {
    const { calls, createSourceCanvas } = installFakeCanvas(rasterSizeModel)
    const compression = await loadCompression(candidateOverrides)
    const target = 2000

    const blob = await compression.compressRasterToTarget(
      createSourceCanvas(WIDTH, HEIGHT, gradientPixels(WIDTH, HEIGHT)),
      'image/jpeg',
      target,
    )

    expect(calls).toHaveLength(4 * 8)
    expect(blob.size).toBeLessThanOrEqual(target)
    expect(blob.size).toBe(largestFitting(calls, target))
  })

  it('prefers a fitting dithered candidate over an original that never fits', async () => {
    const { createSourceCanvas } = installFakeCanvas(rasterSizeModel)
    const compression = await loadCompression(candidateOverrides)
    // Original (~256 distinct values) is ≥1000 bytes even at q=0; dithered (≤64 values) is ~250.
    const target = 600

    const blob = await compression.compressRasterToTarget(
      createSourceCanvas(WIDTH, HEIGHT, gradientPixels(WIDTH, HEIGHT)),
      'image/jpeg',
      target,
    )

    expect(blob.size).toBeLessThanOrEqual(target)
    expect(lastCompressLog()).not.toContain('method=none')
  })

  it('when no candidate fits, returns the smallest over-limit blob (minimum excess)', async () => {
    const { calls, createSourceCanvas } = installFakeCanvas(rasterSizeModel)
    const compression = await loadCompression(candidateOverrides)
    const target = 100

    const blob = await compression.compressRasterToTarget(
      createSourceCanvas(WIDTH, HEIGHT, gradientPixels(WIDTH, HEIGHT)),
      'image/jpeg',
      target,
    )

    const qualityZeroSizes = calls.filter((call) => call.quality === 0).map((call) => call.size)
    expect(qualityZeroSizes).toHaveLength(4)
    expect(blob.size).toBe(Math.min(...qualityZeroSizes))
    expect(blob.size).toBeGreaterThan(target)
  })
})

describe('compressPngToTarget', () => {
  it('binary-searches quantisation levels and returns the largest PNG within the limit', async () => {
    const { calls, createSourceCanvas } = installFakeCanvas(pngSizeModel)
    const compression = await loadCompression()
    const config = await import(CONFIG_MODULE)
    const target = 3000

    const blob = await compression.compressPngToTarget(
      createSourceCanvas(WIDTH, HEIGHT, gradientPixels(WIDTH, HEIGHT)),
      target,
    )

    expect(calls).toHaveLength(config.PNG_SEARCH_ITERATIONS)
    expect(calls.every((call) => call.mimeType === 'image/png')).toBe(true)
    expect(blob.size).toBeLessThanOrEqual(target)
    expect(blob.size).toBe(largestFitting(calls, target))
    expect(lastCompressLog()).toMatch(/png compress: method=jarvis-judice-ninke levels=\d+\/256/)
  })

  it('falls back to Floyd-Steinberg at PNG_LEVELS_MIN when even the minimum does not fit', async () => {
    const { calls, createSourceCanvas } = installFakeCanvas(pngSizeModel)
    const compression = await loadCompression()

    const blob = await compression.compressPngToTarget(
      createSourceCanvas(WIDTH, HEIGHT, gradientPixels(WIDTH, HEIGHT)),
      50,
    )

    const fallback = calls[calls.length - 1]
    expect(blob.size).toBe(fallback.size)
    for (let index = 0; index < fallback.pixels.length; index++) {
      if (index % 4 !== 3) expect([0, 255]).toContain(fallback.pixels[index])
    }
    expect(lastCompressLog()).toContain('method=none')
  })

  it('with PNG_DITHER_CANDIDATES=true tries every method and picks the most levels', async () => {
    const { calls, createSourceCanvas } = installFakeCanvas(pngSizeModel)
    const compression = await loadCompression({
      PNG_DITHER_CANDIDATES: true,
      DITHER_METHOD: 'best',
    })
    const target = 3000

    const blob = await compression.compressPngToTarget(
      createSourceCanvas(WIDTH, HEIGHT, gradientPixels(WIDTH, HEIGHT)),
      target,
    )

    expect(calls).toHaveLength(3 * 8)
    expect(blob.size).toBeLessThanOrEqual(target)
  })
})
