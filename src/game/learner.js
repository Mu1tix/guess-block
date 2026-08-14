import communitySeed from '../data/community.json'
import { BASE_BRANCHES } from '../data/taxonomy.js'
import { logUnrecognized } from './unrecognized.js'
import { normalize } from './parser.js'

const KEY = 'guess-block-learned-v1'
export const CONTRIBUTE_REPO = 'Mu1tix/guess-block'

function emptyDb() {
  return {
    version: 1,
    attributes: {},
    values: {},
  }
}

function asDb(raw) {
  if (!raw || typeof raw !== 'object') return emptyDb()
  return {
    version: 1,
    attributes: raw.attributes || {},
    values: raw.values || {},
  }
}

/**
 * extra 覆盖 base 的同名是/否；分类会合并别名。
 */
export function mergeLearned(base, extra) {
  const left = asDb(base)
  const right = asDb(extra)
  const attributes = { ...left.attributes }
  for (const [id, attr] of Object.entries(right.attributes)) {
    const prev = attributes[id]
    if (!prev) {
      attributes[id] = attr
      continue
    }
    attributes[id] = {
      ...prev,
      ...attr,
      keys: [...new Set([...(prev.keys || []), ...(attr.keys || [])])],
      examples: [...new Set([...(prev.examples || []), ...(attr.examples || [])])],
    }
  }
  const values = { ...left.values }
  for (const [blockId, row] of Object.entries(right.values)) {
    values[blockId] = { ...(values[blockId] || {}), ...row }
  }
  return { version: 1, attributes, values }
}

function loadLocalOnly() {
  if (typeof localStorage === 'undefined') return emptyDb()
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!raw || raw.version !== 1) return emptyDb()
    return asDb(raw)
  } catch {
    return emptyDb()
  }
}

export function loadLearned() {
  return mergeLearned(communitySeed, loadLocalOnly())
}

export function saveLearned(db) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(db))
}

export function resetLearned() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(KEY)
}

/**
 * 本机比社区库多出来的部分，用来发给作者审核。
 */
export function contributionPayload() {
  const seed = asDb(communitySeed)
  const full = loadLearned()
  const attributes = {}
  for (const [id, attr] of Object.entries(full.attributes)) {
    if (!seed.attributes[id]) attributes[id] = attr
  }
  const values = {}
  for (const [blockId, row] of Object.entries(full.values)) {
    const extra = {}
    for (const [attrId, value] of Object.entries(row)) {
      if (typeof value !== 'boolean') continue
      if (seed.values[blockId]?.[attrId] === value) continue
      extra[attrId] = value
    }
    if (Object.keys(extra).length) values[blockId] = extra
  }
  return { version: 1, attributes, values }
}

export function contributionStats(payload = contributionPayload()) {
  const attrCount = Object.keys(payload.attributes).length
  const valueCount = Object.values(payload.values).reduce(
    (n, row) => n + Object.values(row).filter((v) => typeof v === 'boolean').length,
    0,
  )
  return { attrCount, valueCount, empty: attrCount === 0 && valueCount === 0 }
}

export function contributeIssueUrl(payload) {
  const title = `知识贡献 ${new Date().toISOString().slice(0, 10)}`
  const body = [
    '请审核后再并入 `src/data/community.json`，不要直接相信未核对的是/否。',
    '',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
  ].join('\n')
  return `https://github.com/${CONTRIBUTE_REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
}

function stripQuestionTail(text) {
  return String(text || '')
    .replace(/的吗$|吗$|的么$|么$|嘛$|呢$|啊$|呀$/g, '')
    .replace(/的方块$|方块$|一种$|一个$/g, '')
    .replace(/^的/, '')
}

/**
 * 从问句抽出可能的新属性名。抽不出则返回 null。
 */
export function extractCandidate(raw) {
  const n = normalize(raw)
  if (!n || n.length < 2) return null

  const patterns = [
    /能不能(.+)/,
    /能否(.+)/,
    /可否(.+)/,
    /会不会(.+)/,
    /有没有(.+)/,
    /需不需要(.+)/,
    /是不是(.+)/,
    /是否(.+)/,
    /可不可以(.+)/,
    /可以(.+)/,
    /能够(.+)/,
    /需要(.+)/,
    /能(.+)/,
    /会(.+)/,
    /有(.+)/,
    /要(.+)/,
    /是(.+)/,
  ]

  for (const pattern of patterns) {
    const match = n.match(pattern)
    if (!match) continue
    const phrase = stripQuestionTail(match[1]).replace(/^当/, '')
    if (phrase.length >= 2 && phrase.length <= 14 && !/^[不否]/.test(phrase)) {
      return phrase
    }
  }

  const fallback = stripQuestionTail(n)
  if (
    fallback.length >= 2 &&
    fallback.length <= 10 &&
    !/猜|什么|哪个|多少|怎么/.test(fallback)
  ) {
    return fallback
  }
  return null
}

function guessParentId(phrase) {
  const n = normalize(phrase)
  for (const branch of BASE_BRANCHES) {
    if (branch.id === 'uncategorized') continue
    if (branch.keys.some((k) => n.includes(normalize(k)))) return branch.id
  }
  return 'uncategorized'
}

function similarAttr(phrase, attributes) {
  const n = normalize(phrase)
  const list = Object.values(attributes)
  const exact = list.find(
    (a) => normalize(a.label) === n || a.keys.some((k) => normalize(k) === n),
  )
  if (exact) return exact

  return list.find((a) => {
    const labels = [a.label, ...a.keys].map(normalize).filter((x) => x.length >= 2)
    return labels.some(
      (x) =>
        (n.includes(x) || x.includes(n)) &&
        Math.min(n.length, x.length) / Math.max(n.length, x.length) >= 0.5,
    )
  })
}

function makeId(phrase) {
  return `l_${phrase}`
}

function branchLabel(id) {
  return BASE_BRANCHES.find((b) => b.id === id)?.label || '未分类'
}

/**
 * 确保问句对应一条学习属性：能合并到旧的就合并，否则新建并挂到分类树。
 */
export function ensureAttribute(raw, db = loadLearned()) {
  const phrase = extractCandidate(raw)
  if (!phrase) return { db, attr: null, created: false, phrase: null }

  const existing = similarAttr(phrase, db.attributes)
  if (existing) {
    if (!existing.keys.includes(phrase) && existing.label !== phrase) {
      existing.keys = [...existing.keys, phrase]
      existing.examples = [...new Set([...(existing.examples || []), raw.trim()])]
      saveLearned(db)
    }
    return { db, attr: existing, created: false, phrase }
  }

  const parentId = guessParentId(phrase)
  const attr = {
    id: makeId(phrase),
    label: phrase,
    parentId,
    keys: [phrase],
    examples: [raw.trim()],
    createdAt: Date.now(),
  }
  db.attributes[attr.id] = attr
  saveLearned(db)
  return { db, attr, created: true, phrase }
}

function matchLearnedAttr(raw, db) {
  const n = normalize(raw)
  const phrase = extractCandidate(raw)
  const list = Object.values(db.attributes)
  if (phrase) {
    const byPhrase = similarAttr(phrase, db.attributes)
    if (byPhrase) return byPhrase
  }
  return list.find((a) =>
    [a.label, ...a.keys].some((k) => {
      const x = normalize(k)
      return x.length >= 2 && n.includes(x)
    }),
  )
}

/**
 * 用已学习的属性回答。answer 可能是 yes/no/unknown。
 * classified 表示已经进入分类树（即使还不会答）。
 */
export function answerLearned(raw, target) {
  const db = loadLearned()
  let attr = matchLearnedAttr(raw, db)
  let created = false

  if (!attr) {
    const ensured = ensureAttribute(raw, db)
    attr = ensured.attr
    created = ensured.created
  }

  if (!attr) {
    logUnrecognized(raw)
    return {
      label: '未识别',
      answer: 'unknown',
      source: 'none',
      created: false,
      attr: null,
      path: '',
    }
  }

  const path = `${branchLabel(attr.parentId)} / ${attr.label}`
  const stored = db.values[target.id]?.[attr.id]
  if (stored === true || stored === false) {
    return {
      label: path,
      answer: stored ? 'yes' : 'no',
      source: 'learned',
      created: false,
      attr,
      path,
    }
  }

  return {
    label: path,
    answer: 'unknown',
    source: created ? 'new' : 'pending',
    created,
    attr,
    path,
  }
}

export function teachAttribute(blockId, attrId, yes) {
  const db = loadLearned()
  if (!db.attributes[attrId]) return db
  if (!db.values[blockId]) db.values[blockId] = {}
  db.values[blockId][attrId] = !!yes
  saveLearned(db)
  return db
}

export function countFilled(attrId, db = loadLearned()) {
  return Object.values(db.values).filter((row) => typeof row[attrId] === 'boolean')
    .length
}

export function knowledgeTree(db = loadLearned()) {
  const attrs = Object.values(db.attributes).sort((a, b) =>
    a.label.localeCompare(b.label, 'zh'),
  )
  return BASE_BRANCHES.map((branch) => ({
    ...branch,
    items: attrs.filter((a) => a.parentId === branch.id).map((a) => ({
      ...a,
      filled: countFilled(a.id, db),
    })),
  }))
}

export function knowledgeStats(db = loadLearned()) {
  const attrCount = Object.keys(db.attributes).length
  const valueCount = Object.values(db.values).reduce(
    (n, row) => n + Object.values(row).filter((v) => typeof v === 'boolean').length,
    0,
  )
  const blockCount = Object.keys(db.values).length
  return { attrCount, valueCount, blockCount }
}

export function exportLearnedJson() {
  return JSON.stringify(loadLearned(), null, 2)
}

export function importLearnedJson(text) {
  const incoming = JSON.parse(text)
  if (!incoming || typeof incoming !== 'object') throw new Error('文件格式不对')
  const db = loadLearned()
  db.attributes = { ...db.attributes, ...(incoming.attributes || {}) }
  const values = incoming.values || {}
  for (const [blockId, row] of Object.entries(values)) {
    db.values[blockId] = { ...(db.values[blockId] || {}), ...row }
  }
  saveLearned(db)
  return db
}

export function downloadLearned() {
  const blob = new Blob([exportLearnedJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'guess-block-learned.json'
  a.click()
  URL.revokeObjectURL(url)
}
