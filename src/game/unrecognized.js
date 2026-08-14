const KEY = 'guess-block-unrecognized'

export function logUnrecognized(text) {
  if (typeof localStorage === 'undefined') return
  const line = String(text || '').trim()
  if (!line) return
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]')
    if (list.some((x) => x.text === line)) return
    list.push({ text: line, at: Date.now() })
    localStorage.setItem(KEY, JSON.stringify(list.slice(-80)))
  } catch {
    /* ignore quota */
  }
}

export function readUnrecognized() {
  if (typeof localStorage === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

export function clearUnrecognized() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(KEY)
}
