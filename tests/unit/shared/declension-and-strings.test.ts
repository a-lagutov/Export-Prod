import { describe, expect, it } from 'vitest'
import { declension } from '../../../src/shared/lib/declension'
import {
  DECLENSION_FILE,
  exportBtnLabel,
  placeBtnLabel,
  placeResultMessage,
  progressProcessing,
  selectedFramesLabel,
} from '../../../src/shared/config/strings'

describe('declension', () => {
  const fileForm = (count: number) => declension(count, ...DECLENSION_FILE)

  it.each([
    [1, 'файл'],
    [21, 'файл'],
    [101, 'файл'],
    [2, 'файла'],
    [3, 'файла'],
    [4, 'файла'],
    [22, 'файла'],
    [0, 'файлов'],
    [5, 'файлов'],
    [10, 'файлов'],
    [11, 'файлов'],
    [12, 'файлов'],
    [14, 'файлов'],
    [19, 'файлов'],
    [111, 'файлов'],
    [112, 'файлов'],
    [25, 'файлов'],
  ])('%i → %s', (count, expected) => {
    expect(fileForm(count)).toBe(expected)
  })

  it('uses the absolute value for negative numbers', () => {
    expect(fileForm(-1)).toBe('файл')
    expect(fileForm(-3)).toBe('файла')
    expect(fileForm(-11)).toBe('файлов')
  })
})

describe('UI string templates', () => {
  it('exportBtnLabel declines "файл"', () => {
    expect(exportBtnLabel(1)).toBe('Экспорт · 1 файл')
    expect(exportBtnLabel(3)).toBe('Экспорт · 3 файла')
    expect(exportBtnLabel(42)).toBe('Экспорт · 42 файла')
    expect(exportBtnLabel(15)).toBe('Экспорт · 15 файлов')
  })

  it('placeBtnLabel and selectedFramesLabel decline "фрейм"', () => {
    expect(placeBtnLabel(1)).toBe('Поместить 1 фрейм в секции')
    expect(placeBtnLabel(5)).toBe('Поместить 5 фреймов в секции')
    expect(selectedFramesLabel(2)).toBe('Выделено 2 фрейма на странице')
  })

  it('progressProcessing shows a 1-based index', () => {
    expect(progressProcessing(0, 3, 'JPG/a/b/c/1x1.jpg')).toBe('Обработка 1/3: JPG/a/b/c/1x1.jpg')
  })

  it('placeResultMessage handles 1, 2–4 and 5–20', () => {
    expect(placeResultMessage(1, 'JPG', 'Ch', 'VK', 'cr')).toBe(
      '1 фрейм помещён в JPG / Ch / VK / cr',
    )
    expect(placeResultMessage(3, 'JPG', 'Ch', 'VK', 'cr')).toBe(
      '3 фрейма помещено в JPG / Ch / VK / cr',
    )
    expect(placeResultMessage(11, 'JPG', 'Ch', 'VK', 'cr')).toBe(
      '11 фреймов помещено в JPG / Ch / VK / cr',
    )
  })

  it('placeResultMessage declines counts above 20 like declension()', () => {
    expect(placeResultMessage(21, 'JPG', 'Ch', 'VK', 'cr')).toBe(
      '21 фрейм помещён в JPG / Ch / VK / cr',
    )
    expect(placeResultMessage(22, 'JPG', 'Ch', 'VK', 'cr')).toBe(
      '22 фрейма помещено в JPG / Ch / VK / cr',
    )
  })
})
