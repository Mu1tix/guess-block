export function normalize(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[？?！!。.\s]/g, '')
    .replace(/它|这个方块|这个|那是|是不是/g, '')
}

function namesOf(block) {
  return [block.name, block.id, ...(block.aliases || [])]
}

function exactBlock(text, list) {
  const n = normalize(text)
  if (!n) return null
  return (
    list.find((b) => namesOf(b).some((x) => normalize(x) === n)) || null
  )
}

function blockMentioned(text, list) {
  const n = normalize(text)
  const hits = list
    .map((b) => {
      const labels = namesOf(b)
        .map(normalize)
        .filter(Boolean)
        .sort((a, c) => c.length - a.length)
      const label = labels.find((x) => x.length >= 2 && n.includes(x))
      return label ? { block: b, len: label.length } : null
    })
    .filter(Boolean)
    .sort((a, c) => c.len - a.len)
  return hits[0]?.block || null
}

function yn(value) {
  if (value === true) return 'yes'
  if (value === false) return 'no'
  return 'unknown'
}

function hasCat(block, ...cats) {
  return cats.some((c) => block.category?.includes(c))
}

function hasColor(block, ...colors) {
  return colors.some((c) => block.color?.includes(c))
}

function hasDim(block, dim) {
  return block.dimension?.includes(dim)
}

const COLOR_RULES = [
  { keys: ['红色', '红的'], colors: ['red'] },
  { keys: ['橙色', '橘色', '橙的'], colors: ['orange'] },
  { keys: ['黄色', '黄的'], colors: ['yellow'] },
  { keys: ['绿色', '绿的'], colors: ['green'] },
  { keys: ['青色', '青的'], colors: ['cyan'] },
  { keys: ['蓝色', '蓝的'], colors: ['blue'] },
  { keys: ['紫色', '紫的'], colors: ['purple'] },
  { keys: ['粉色', '粉红色', '粉的'], colors: ['pink'] },
  { keys: ['白色', '白的'], colors: ['white'] },
  { keys: ['黑色', '黑的'], colors: ['black'] },
  { keys: ['灰色', '灰的'], colors: ['gray'] },
  { keys: ['棕色', '褐色', '棕的', '褐的'], colors: ['brown'] },
]

const WOOD_RULES = [
  { keys: ['橡木', '橡树'], type: 'oak' },
  { keys: ['云杉'], type: 'spruce' },
  { keys: ['白桦', '桦木'], type: 'birch' },
  { keys: ['丛林'], type: 'jungle' },
  { keys: ['金合欢'], type: 'acacia' },
  { keys: ['深色橡木', '黑橡木'], type: 'dark_oak' },
  { keys: ['红树'], type: 'mangrove' },
  { keys: ['樱花'], type: 'cherry' },
  { keys: ['竹子', '竹'], type: 'bamboo' },
  { keys: ['绯红'], type: 'crimson' },
  { keys: ['诡异'], type: 'warped' },
]

/**
 * 每条规则：命中关键词后，用 get(block) 得到 yes/no/unknown
 * 长词、更具体的规则放前面。
 */
const ATTR_RULES = [
  {
    keys: ['自然生成', '天然生成', '天然的', '野外找到', '野外发现', '世界生成'],
    label: '自然生成',
    get: (b) => yn(b.natural),
  },
  {
    keys: ['工作台', '合成出来', '能合成', '可以合成', '合成的', '合成获得'],
    label: '可合成',
    get: (b) => yn(b.craftable),
  },
  {
    keys: ['钻石镐', '用钻石镐'],
    label: '需要钻石镐',
    get: (b) => yn(b.mineLevel >= 4),
  },
  {
    keys: ['铁镐', '用铁镐'],
    label: '需要铁镐',
    get: (b) => yn(b.mineLevel >= 3),
  },
  {
    keys: ['石镐', '用石镐'],
    label: '需要石镐',
    get: (b) => yn(b.mineLevel >= 2),
  },
  {
    keys: ['用镐', '需要镐', '要镐', '镐子'],
    label: '用镐',
    get: (b) => yn(b.tool === 'pickaxe'),
  },
  {
    keys: ['用斧', '需要斧', '要斧', '斧头'],
    label: '用斧',
    get: (b) => yn(b.tool === 'axe'),
  },
  {
    keys: ['用锹', '用铲子', '需要锹', '需要铲', '铲子'],
    label: '用锹',
    get: (b) => yn(b.tool === 'shovel'),
  },
  {
    keys: ['剪刀', '剪子'],
    label: '用剪刀',
    get: (b) => yn(b.tool === 'shears'),
  },
  {
    keys: ['锄'],
    label: '用锄',
    get: (b) => yn(b.tool === 'hoe'),
  },
  {
    keys: ['会发光', '能发光', '是光源', '发光的', '有亮度', '会亮'],
    label: '发光',
    get: (b) => yn(b.luminance > 0),
  },
  {
    keys: ['透明'],
    label: '透明',
    get: (b) => yn(b.transparent),
  },
  {
    keys: ['可燃', '能烧', '会烧', '燃烧', '着火', '能被火'],
    label: '可燃',
    get: (b) => yn(b.flammable),
  },
  {
    keys: ['重力', '会掉落', '会掉下来', '受重力'],
    label: '重力',
    get: (b) => yn(b.gravity),
  },
  {
    keys: ['液体', '流体'],
    label: '液体',
    get: (b) => yn(hasCat(b, 'fluid')),
  },
  {
    keys: ['固体'],
    label: '固体',
    get: (b) => yn(b.solid),
  },
  {
    keys: ['完整方块', '完整的'],
    label: '完整方块',
    get: (b) => yn(b.fullCube),
  },
  {
    keys: ['可再生'],
    label: '可再生',
    get: (b) => yn(b.renewable),
  },
  {
    keys: ['红石'],
    label: '红石相关',
    get: (b) => yn(b.redstone || hasCat(b, 'redstone')),
  },
  {
    keys: ['能装东西', '能放物品', '有储物', '有库存', '能储存'],
    label: '有储物',
    get: (b) => yn(b.hasInventory),
  },
  {
    keys: ['精准采集', '精准'],
    label: '常需精准采集',
    get: (b) => yn(b.silkTouch),
  },
  {
    keys: ['防爆', '抗爆炸', '炸不', '爆炸抗性'],
    label: '防爆',
    get: (b) => yn(b.blastResistant),
  },
  {
    keys: ['下界', '地狱', '地狱里', '下界里'],
    label: '下界',
    get: (b) => yn(hasDim(b, 'nether') || hasCat(b, 'nether')),
  },
  {
    keys: ['末地', '终端', '末地里'],
    label: '末地',
    get: (b) => yn(hasDim(b, 'end') || hasCat(b, 'end')),
  },
  {
    keys: ['主世界', '地上', '主世界里'],
    label: '主世界',
    get: (b) => yn(hasDim(b, 'overworld')),
  },
  {
    keys: ['矿石', '是矿'],
    label: '矿石',
    get: (b) => yn(hasCat(b, 'ore')),
  },
  {
    keys: ['原木', '菌柄'],
    label: '原木',
    get: (b) => yn(hasCat(b, 'log')),
  },
  {
    keys: ['木板'],
    label: '木板',
    get: (b) => yn(hasCat(b, 'planks')),
  },
  {
    keys: ['树叶', '叶子'],
    label: '树叶',
    get: (b) => yn(hasCat(b, 'leaves')),
  },
  {
    keys: ['木质', '木头做', '木类', '是木头', '木材', '木头'],
    label: '木质',
    get: (b) => yn(hasCat(b, 'wood') || !!b.woodType),
  },
  {
    keys: ['石质', '石头做', '是石头', '岩石'],
    label: '石质',
    get: (b) => yn(hasCat(b, 'stone')),
  },
  {
    keys: ['羊毛'],
    label: '羊毛',
    get: (b) => yn(hasCat(b, 'wool')),
  },
  {
    keys: ['玻璃'],
    label: '玻璃',
    get: (b) => yn(hasCat(b, 'glass')),
  },
  {
    keys: ['冰'],
    label: '冰',
    get: (b) => yn(hasCat(b, 'ice')),
  },
  {
    keys: ['植物'],
    label: '植物',
    get: (b) => yn(hasCat(b, 'plant')),
  },
  {
    keys: ['矿物块', '金属块', '锭合成的块'],
    label: '矿物块',
    get: (b) => yn(hasCat(b, 'metal_block')),
  },
  {
    keys: ['功能方块', '有功能', '能用的', '实用方块'],
    label: '功能方块',
    get: (b) => yn(hasCat(b, 'functional')),
  },
  {
    keys: ['泥土', '土壤'],
    label: '泥土类',
    get: (b) => yn(hasCat(b, 'dirt')),
  },
]

function looksLikeQuestion(raw) {
  return /[吗麼么？?]/.test(raw) || /是不是|有没有|能不能|会不会|是否|需不需要/.test(raw)
}

export function parseQuestion(raw, block) {
  const n = normalize(raw)

  for (const rule of WOOD_RULES) {
    if (rule.keys.some((k) => n.includes(normalize(k)))) {
      return {
        label: `${rule.keys[0]}类`,
        answer: yn(block.woodType === rule.type),
      }
    }
  }

  for (const rule of COLOR_RULES) {
    if (rule.keys.some((k) => n.includes(normalize(k)))) {
      return {
        label: rule.keys[0],
        answer: yn(hasColor(block, ...rule.colors)),
      }
    }
  }

  for (const rule of ATTR_RULES) {
    if (rule.keys.some((k) => n.includes(normalize(k)))) {
      return {
        label: rule.label,
        answer: rule.get(block),
      }
    }
  }

  return null
}

export const EXAMPLE_QUESTIONS = [
  '它是自然生成的吗？',
  '它会发光吗？',
  '需要用镐吗？',
  '它是下界的方块吗？',
  '它是木头吗？',
  '它是红色的吗？',
]

/**
 * @returns {{ type: 'empty'|'guess'|'question'|'unknown', block?: object, label?: string, raw: string }}
 */
export function interpret(raw, list) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return { type: 'empty', raw: trimmed }

  const exact = exactBlock(trimmed, list)
  if (exact) return { type: 'guess', block: exact, raw: trimmed }

  const mentioned = blockMentioned(trimmed, list)

  if (mentioned) {
    return { type: 'guess', block: mentioned, raw: trimmed }
  }

  const dummy = { category: [], color: [], dimension: [], woodType: null }
  if (looksLikeQuestion(trimmed) || parseQuestion(trimmed, dummy)) {
    return { type: 'question', raw: trimmed }
  }

  return { type: 'unknown', raw: trimmed }
}

export function answerBuiltin(raw, target) {
  return parseQuestion(raw, target)
}
