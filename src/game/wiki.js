import { extractCandidate, teachAttribute } from './learner.js'
import { normalize } from './parser.js'

const PAGE_CACHE = 'guess-block-wiki-pages-v3'
const FUEL_CACHE = 'guess-block-wiki-fuel-v1'
const ENDPOINT_CACHE = 'guess-block-wiki-endpoint'
const FUEL_PAGE = '烧炼/燃料时间表'
const TTL = 7 * 24 * 60 * 60 * 1000
const UA = 'GuessBlock/0.1 (educational local game; wiki lookup)'

const ENDPOINTS = [
  {
    id: 'bili',
    api: 'https://wiki.biligame.com/mc/api.php',
    pageUrl: (title) => `https://wiki.biligame.com/mc/${encodeURIComponent(title)}`,
  },
  {
    id: 'zh',
    api: 'https://zh.minecraft.wiki/api.php',
    pageUrl: (title) => `https://zh.minecraft.wiki/w/${encodeURIComponent(title)}`,
  },
  ...(import.meta.env.DEV
    ? [
        {
          id: 'proxy',
          api: '/wiki-api/api.php',
          pageUrl: (title) => `https://wiki.biligame.com/mc/${encodeURIComponent(title)}`,
        },
      ]
    : []),
]

function readCache(key) {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null')
    if (!raw || Date.now() - raw.at > TTL) return null
    return raw.data
  } catch {
    return null
  }
}

function writeCache(key, data) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }))
  } catch {
    /* quota */
  }
}

function preferredEndpoints() {
  const remembered = readCache(ENDPOINT_CACHE)
  if (!remembered) return ENDPOINTS
  return [
    ...ENDPOINTS.filter((e) => e.id === remembered),
    ...ENDPOINTS.filter((e) => e.id !== remembered),
  ]
}

async function fetchApi(api, params, timeoutMs) {
  const query = new URLSearchParams({
    format: 'json',
    origin: '*',
    utf8: '1',
    ...params,
  })
  const href = `${api}?${query.toString()}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const headers = { Accept: 'application/json' }
    if (typeof window === 'undefined') headers['User-Agent'] = UA
    const res = await fetch(href, { signal: ctrl.signal, headers })
    if (!res.ok) throw new Error(`wiki ${res.status}`)
    const data = await res.json()
    if (data.error) throw new Error(data.error.info || 'wiki error')
    return data
  } finally {
    clearTimeout(timer)
  }
}

async function wikiGet(params) {
  let lastError
  for (const ep of preferredEndpoints()) {
    try {
      const timeout = ep.id === 'zh' ? 4000 : 8000
      const data = await fetchApi(ep.api, params, timeout)
      writeCache(ENDPOINT_CACHE, ep.id)
      return { data, endpoint: ep }
    } catch (err) {
      lastError = err
    }
  }
  throw lastError || new Error('Wiki 全部源不可用')
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/''+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function prepareHtml(html) {
  let h = String(html || '')
  h = h.replace(/<div[^>]*id="toc"[^>]*>[\s\S]*?<\/div>/i, ' ')
  h = h.replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
  const marks = [
    h.search(/id="历史"/),
    h.search(/id="导航"/),
    h.search(/class="[^"]*navbox/),
  ].filter((i) => i > 0)
  if (marks.length) h = h.slice(0, Math.min(...marks))
  return h
}

function parseInfobox(html) {
  const box = {}
  const rowRe =
    /infobox-row-label[\s\S]*?>([\s\S]*?)<\/div>[\s\S]*?infobox-row-field[\s\S]*?>([\s\S]*?)<\/div>/gi
  let match
  while ((match = rowRe.exec(html))) {
    const label = stripHtml(match[1]).replace(/\s+/g, '')
    const field = stripHtml(match[2]).replace(/\s+/g, '')
    if (label) box[label] = field
  }
  const grab = (label) => {
    if (box[label]) return box[label]
    const found = Object.keys(box).find((k) => k.includes(label))
    return found ? box[found] : ''
  }
  return {
    raw: box,
    tool: grab('合适挖掘工具') || grab('挖掘工具'),
    light: grab('亮度'),
    renewable: grab('可再生'),
    redstone: grab('红石导体'),
    solid: grab('固体方块') || grab('固体'),
    suffocate: grab('窒息生物') || grab('窒息'),
    flammable: grab('可燃') || grab('可被烧毁'),
    gravity: grab('重力'),
    transparent: grab('透明'),
  }
}

function ynToken(token) {
  const t = String(token || '')
  if (/^(是|true|yes)/i.test(t) || /是/.test(t) && !/否/.test(t)) {
    if (t === '是' || t.startsWith('是')) return 'yes'
  }
  if (/^(否|无|false|no)/i.test(t) || t.includes('否') || t === '无') return 'no'
  return ''
}

async function resolveTitle(block) {
  const dataWrap = await wikiGet({
    action: 'query',
    titles: block.name,
    redirects: '1',
  })
  const page = Object.values(dataWrap.data.query?.pages || {})[0]
  if (page && !page.missing && page.title) return { title: page.title, endpoint: dataWrap.endpoint }

  const search = await wikiGet({
    action: 'query',
    list: 'search',
    srsearch: block.name,
    srlimit: '1',
  })
  const title = search.data.query?.search?.[0]?.title
  if (!title) return { title: '', endpoint: search.endpoint }
  return { title, endpoint: search.endpoint }
}

async function fetchPage(title) {
  const cached = readCache(`${PAGE_CACHE}:${title}`)
  if (cached) return cached
  const { data, endpoint } = await wikiGet({
    action: 'parse',
    page: title,
    prop: 'text',
    redirects: '1',
    disablelimitreport: '1',
  })
  const html = prepareHtml(data.parse?.text?.['*'] || '')
  const infobox = parseInfobox(html)
  const text = stripHtml(html).slice(0, 16000)
  const page = {
    title: data.parse?.title || title,
    text,
    infobox,
    url: endpoint.pageUrl(data.parse?.title || title),
    source: endpoint.id,
  }
  writeCache(`${PAGE_CACHE}:${title}`, page)
  return page
}

function parseFuelNames(html) {
  const names = new Set()
  for (const m of String(html || '').matchAll(/title="([^"]+)"/g)) {
    const t = m[1].trim()
    if (t.length < 2 || t.length > 24) continue
    if (/页面不存在|编辑|分类:|Category:|Java|基岩|物品堆叠|特殊:|Template:|模板:|^File:|^文件:/.test(t)) {
      continue
    }
    names.add(t)
  }
  return [...names]
}

async function fetchFuelNames() {
  const cached = readCache(FUEL_CACHE)
  if (Array.isArray(cached) && cached.length) return cached
  const { data } = await wikiGet({
    action: 'parse',
    page: FUEL_PAGE,
    prop: 'text',
    redirects: '1',
    disablelimitreport: '1',
  })
  const names = parseFuelNames(data.parse?.text?.['*'] || '')
  if (names.length) writeCache(FUEL_CACHE, names)
  return names
}

function isFuelPhrase(phrase, raw) {
  return /燃料/.test(normalize(`${raw} ${phrase}`))
}

function fuelAnswer(target, names) {
  if (!names?.length) return ''
  const labels = [target.name, ...(target.aliases || [])]
  return labels.some((n) => names.includes(n)) ? 'yes' : 'no'
}

function wikiResult(learned, phrase, answer, extra = {}) {
  const path = learned?.path || `Wiki / ${phrase}`
  return {
    label: path,
    answer,
    source: 'wiki',
    created: false,
    attr: learned?.attr || null,
    path,
    ...extra,
  }
}

function fromInfobox(phrase, box) {
  const n = normalize(phrase)
  if (/发光|光源|亮度|会亮/.test(n)) {
    const light = Number(String(box.light).replace(/[^\d.]/g, ''))
    if (Number.isFinite(light)) return light > 0 ? 'yes' : 'no'
  }
  if (/可再生/.test(n)) return ynToken(box.renewable)
  if (/窒息/.test(n)) return ynToken(box.suffocate)
  if (/红石/.test(n)) return ynToken(box.redstone)
  if (/固体/.test(n)) return ynToken(box.solid)
  if (/透明/.test(n)) return ynToken(box.transparent)
  if (/可燃|能烧|会烧|燃烧|着火/.test(n)) return ynToken(box.flammable)
  if (/重力|会掉落|掉下来/.test(n)) {
    const g = box.gravity
    if (!g) return ''
    if (/是|会|受重力/.test(g)) return 'yes'
    if (/否|无|不受/.test(g)) return 'no'
  }
  if (/用镐|需要镐|要镐|镐子/.test(n)) {
    if (!box.tool) return ''
    if (box.tool === '无' || /无/.test(box.tool)) return 'no'
    return /镐/.test(box.tool) ? 'yes' : 'no'
  }
  if (/用斧|需要斧|斧头/.test(n)) {
    if (!box.tool) return ''
    return /斧/.test(box.tool) ? 'yes' : 'no'
  }
  if (/用锹|铲子|铲/.test(n)) {
    if (!box.tool) return ''
    return /锹|铲/.test(box.tool) ? 'yes' : 'no'
  }
  return ''
}

function phraseVariants(phrase) {
  const set = new Set([phrase, phrase.replace(/给/g, '为'), phrase.replace(/为/g, '给')])
  const pairs = [
    ['再生锚', '重生锚'],
    ['萤石', '荧石'],
    ['地狱', '下界'],
    ['岩浆', '熔岩'],
    ['木头', '木质'],
  ]
  for (const [a, b] of pairs) {
    for (const cur of [...set]) {
      if (cur.includes(a)) set.add(cur.replaceAll(a, b))
      if (cur.includes(b)) set.add(cur.replaceAll(b, a))
    }
  }
  return [...set].filter((x) => x.length >= 2)
}

function polarity(phrase, text) {
  const variants = phraseVariants(phrase).sort((a, b) => b.length - a.length)
  const main = String(text || '')
  let yes = 0
  let no = 0
  for (const key of variants) {
    let from = 0
    let seen = false
    while (from < main.length) {
      const idx = main.indexOf(key, from)
      if (idx < 0) break
      seen = true
      const win = main.slice(Math.max(0, idx - 28), idx + key.length + 28)
      if (/不能|无法|不会|不是|没有(?!被)|禁止/.test(win)) no += 1
      else if (/可以|能够|用于|用来|会发|会以|可被|可在|自然生成|出现在|发出/.test(win)) yes += 1
      from = idx + key.length
      if (seen) break
    }
  }
  if (yes > 0 && no === 0) return 'yes'
  if (no > 0 && yes === 0) return 'no'
  return 'unknown'
}

/**
 * 查阅 Minecraft Wiki（优先国内可访问源）。能确定才返回 yes/no。
 */
export async function answerFromWiki(raw, target, learned) {
  const phrase = extractCandidate(raw) || learned?.attr?.label
  if (!phrase) {
    return { ...learned, source: learned?.source || 'none', wikiError: '' }
  }

  try {
    if (isFuelPhrase(phrase, raw)) {
      try {
        const names = await fetchFuelNames()
        const answer = fuelAnswer(target, names)
        if (answer === 'yes' || answer === 'no') {
          if (learned?.attr) teachAttribute(target.id, learned.attr.id, answer === 'yes')
          return wikiResult(learned, phrase, answer)
        }
      } catch (err) {
        console.warn('燃料表查阅失败', err)
      }
    }

    const found = await resolveTitle(target)
    if (!found.title) {
      return { ...learned, source: learned?.source || 'pending', wikiMiss: true }
    }
    const page = await fetchPage(found.title)
    let answer = fromInfobox(phrase, page.infobox)
    if (!answer) answer = polarity(phrase, page.text)

    if (answer !== 'yes' && answer !== 'no') {
      return {
        ...learned,
        source: learned?.source || 'pending',
        wikiMiss: true,
        wikiTitle: page.title,
      }
    }

    if (learned?.attr) {
      teachAttribute(target.id, learned.attr.id, answer === 'yes')
    }

    return wikiResult(learned, phrase, answer, {
      wikiTitle: page.title,
      wikiUrl: page.url,
    })
  } catch (err) {
    console.warn('Wiki 查阅失败', err)
    return {
      ...learned,
      source: learned?.source || 'none',
      wikiError: '连不上百科',
    }
  }
}

export const WIKI_CREDIT =
  '优先使用国内可访问的 Minecraft Wiki 接口；官方站若被拦截会自动换源。许可多为 CC BY-NC-SA。'
