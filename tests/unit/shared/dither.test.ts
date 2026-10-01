import { describe, expect, it } from 'vitest'
import {
  DITHER_METHODS,
  ditherPixels,
  makeChannelQuantize,
  type QuantizeFn,
} from '../../../src/shared/lib/dither'

/**
 * Builds a flat RGBA image filled with one colour.
 * @param width - Width in px.
 * @param height - Height in px.
 * @param rgba - Fill colour.
 * @returns RGBA pixel data.
 */
function solidPixels(width: number, height: number, rgba: [number, number, number, number]) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(rgba, offset)
  return pixels
}

/**
 * Returns the set of values a uniform `levels`-step quantiser can output.
 * @param levels - Number of levels per channel.
 * @returns Allowed channel values.
 */
function quantisedGrid(levels: number): Set<number> {
  const quantize = makeChannelQuantize(levels)
  const grid = new Set<number>()
  for (let value = 0; value <= 255; value++) grid.add(quantize(value, value, value, 255)[0])
  return grid
}

describe('makeChannelQuantize', () => {
  it('2 levels snaps every channel to 0 or 255', () => {
    const quantize = makeChannelQuantize(2)
    expect(quantize(0, 127, 128, 255)).toEqual([0, 0, 255])
    expect(quantize(255, 10, 200, 0)).toEqual([255, 0, 255])
  })

  it('256 levels is lossless', () => {
    const quantize = makeChannelQuantize(256)
    for (let value = 0; value <= 255; value++) {
      expect(quantize(value, value, value, 255)).toEqual([value, value, value])
    }
  })

  it('N levels produces exactly N distinct values', () => {
    for (const levels of [2, 3, 16, 64]) {
      expect(quantisedGrid(levels).size).toBe(levels)
    }
  })
})

describe.each(DITHER_METHODS)('ditherPixels(%s)', (method) => {
  const width = 16
  const height = 16

  it('does not mutate the input and returns a same-sized array', () => {
    const input = solidPixels(width, height, [100, 150, 200, 255])
    const snapshot = new Uint8ClampedArray(input)
    const output = ditherPixels(method, input, width, height, makeChannelQuantize(4))
    expect(output).not.toBe(input)
    expect(output.length).toBe(input.length)
    expect(input).toEqual(snapshot)
  })

  it('only emits values from the quantiser and preserves alpha', () => {
    const levels = 4
    const grid = quantisedGrid(levels)
    const input = solidPixels(width, height, [100, 150, 200, 77])
    const output = ditherPixels(method, input, width, height, makeChannelQuantize(levels))
    for (let offset = 0; offset < output.length; offset += 4) {
      expect(grid.has(output[offset])).toBe(true)
      expect(grid.has(output[offset + 1])).toBe(true)
      expect(grid.has(output[offset + 2])).toBe(true)
      expect(output[offset + 3]).toBe(77)
    }
  })

  it('keeps the average brightness of a mid-grey close to the original (2 levels)', () => {
    const size = 32
    const input = solidPixels(size, size, [128, 128, 128, 255])
    const output = ditherPixels(method, input, size, size, makeChannelQuantize(2))
    let sum = 0
    for (let offset = 0; offset < output.length; offset += 4) sum += output[offset]
    const average = sum / (size * size)
    // Error diffusion / ordered dithering should land near 128, not collapse to 0 or 255.
    expect(average).toBeGreaterThan(100)
    expect(average).toBeLessThan(156)
  })

  it('is deterministic', () => {
    const input = solidPixels(width, height, [90, 90, 90, 255])
    const first = ditherPixels(method, input, width, height, makeChannelQuantize(3))
    const second = ditherPixels(method, input, width, height, makeChannelQuantize(3))
    expect(first).toEqual(second)
  })

  it('passes alpha to the quantiser', () => {
    const seenAlpha: number[] = []
    const recordingQuantize: QuantizeFn = (red, green, blue, alpha) => {
      seenAlpha.push(alpha)
      return [red, green, blue] as const
    }
    ditherPixels(method, solidPixels(2, 2, [1, 2, 3, 42]), 2, 2, recordingQuantize)
    expect(seenAlpha).toEqual([42, 42, 42, 42])
  })

  it('handles a 1×1 image', () => {
    const output = ditherPixels(
      method,
      solidPixels(1, 1, [200, 10, 128, 255]),
      1,
      1,
      makeChannelQuantize(2),
    )
    expect(Array.from(output)).toHaveLength(4)
  })
})

describe('DITHER_METHODS', () => {
  it('lists Jarvis-Judice-Ninke last (tie-break winner)', () => {
    expect(DITHER_METHODS[DITHER_METHODS.length - 1]).toBe('jarvis-judice-ninke')
  })
})
