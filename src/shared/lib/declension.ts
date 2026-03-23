/**
 * Returns the correct Russian noun form for a given number.
 * @param n - The number to match against.
 * @param one - Form for 1 (e.g. "файл").
 * @param few - Form for 2–4 (e.g. "файла").
 * @param many - Form for 5+ and teens (e.g. "файлов").
 */
export function declension(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100
  const lastDigit = abs % 10
  if (abs > 10 && abs < 20) return many
  if (lastDigit > 1 && lastDigit < 5) return few
  if (lastDigit === 1) return one
  return many
}
