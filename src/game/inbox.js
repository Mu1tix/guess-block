export const INBOX_HOSTS = ['https://ntfy.sh', 'https://ntfy.tedomum.net']
export const INBOX_TOPIC = 'guess-block-mu1tix-inbox-v1'
export const INBOX_GAME = 'guess-block'

function wrap(knowledge) {
  return {
    game: INBOX_GAME,
    v: 1,
    at: Date.now(),
    knowledge,
  }
}

export function isInboxItem(raw) {
  if (!raw || raw.game !== INBOX_GAME || raw.v !== 1 || !raw.knowledge) return false
  const k = raw.knowledge
  return k && typeof k === 'object' && k.attributes && k.values
}

async function postTo(host, body) {
  const res = await fetch(`${host}/${INBOX_TOPIC}`, {
    method: 'POST',
    headers: {
      Title: 'GuessBlock knowledge',
      Tags: 'book',
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body,
  })
  if (!res.ok) throw new Error(`inbox ${res.status}`)
}

export async function sendContribution(knowledge) {
  const packed = wrap(knowledge)
  const body = JSON.stringify(packed)
  if (body.length > 3500) {
    throw new Error('too-large')
  }
  let lastError
  for (const host of INBOX_HOSTS) {
    try {
      await postTo(host, body)
      return { ok: true }
    } catch (err) {
      lastError = err
    }
  }
  throw lastError || new Error('send-failed')
}

function parsePoll(text) {
  const items = []
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (row.event && row.event !== 'message') continue
    let raw = row.message
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw)
      } catch {
        continue
      }
    }
    if (isInboxItem(raw)) items.push({ id: row.id || String(raw.at), at: raw.at, knowledge: raw.knowledge })
  }
  return items
}

export async function fetchContributions() {
  let lastError
  for (const host of INBOX_HOSTS) {
    try {
      const res = await fetch(`${host}/${INBOX_TOPIC}/json?poll=1`)
      if (!res.ok) throw new Error(`poll ${res.status}`)
      return parsePoll(await res.text())
    } catch (err) {
      lastError = err
    }
  }
  throw lastError || new Error('poll-failed')
}
