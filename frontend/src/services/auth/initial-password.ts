export function initialPasswordFor(name: string): string {
  const strip = (value: string) => value.replace(/[^A-Za-z0-9]/g, '')
  const [first = ''] = name.trim().split(/\s+/)

  const firstWord = strip(first)
  const whole = strip(name)

  const stem = firstWord.length >= 3 ? firstWord : whole.length >= 3 ? whole : 'Employee'

  return `${stem}@123`
}
