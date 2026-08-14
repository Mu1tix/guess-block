import { MAX_GUESSES, MAX_QUESTIONS } from '../data/blocks.js'
import { answerLearned } from './learner.js'
import { answerBuiltin, interpret } from './parser.js'
import { answerFromWiki } from './wiki.js'

export function createState(list) {
  const target = list[Math.floor(Math.random() * list.length)]
  return {
    target,
    questionsLeft: MAX_QUESTIONS,
    guessesLeft: MAX_GUESSES,
    history: [],
    pendingTeach: [],
    status: 'playing',
  }
}

function verdict(answer) {
  if (answer === 'yes') return { text: '是', kind: 'yes' }
  if (answer === 'no') return { text: '否', kind: 'no' }
  return { text: '不确定', kind: 'unknown' }
}

function resolveQuestion(raw, target) {
  const builtin = answerBuiltin(raw, target)
  if (builtin) return { ...builtin, source: 'builtin', attr: null, created: false }

  return answerLearned(raw, target)
}

function rememberTeach(pending, result, raw) {
  if (!result.attr) return pending
  if (result.answer === 'yes' || result.answer === 'no') return pending
  if (pending.some((x) => x.attrId === result.attr.id)) {
    return pending.map((x) =>
      x.attrId === result.attr.id && !x.example
        ? { ...x, example: raw.trim() }
        : x,
    )
  }
  return [
    ...pending,
    {
      attrId: result.attr.id,
      label: result.attr.label,
      path: result.path || result.label,
      example: raw.trim(),
    },
  ]
}

export async function applyInput(state, raw, list) {
  if (!state || state.status !== 'playing') {
    return { state, notice: '本局已经结束，请再来一局。' }
  }

  const parsed = interpret(raw, list)
  if (parsed.type === 'empty') {
    return { state, notice: '先输入问题或方块名。' }
  }

  if (parsed.type === 'guess') {
    if (state.guessesLeft <= 0) {
      return { state, notice: '猜测次数已经用完。' }
    }
    const correct = parsed.block.id === state.target.id
    const guessesLeft = state.guessesLeft - 1
    const item = {
      kind: correct ? 'win' : 'miss',
      input: raw.trim(),
      text: correct
        ? `正确！谜底就是「${state.target.name}」。`
        : `不是「${parsed.block.name}」。`,
    }
    let status = state.status
    if (correct) status = 'won'
    else if (guessesLeft <= 0) status = 'lost'
    return {
      state: {
        ...state,
        guessesLeft,
        status,
        history: [...state.history, item],
      },
      notice: '',
    }
  }

  if (state.questionsLeft <= 0) {
    return { state, notice: '提问次数已经用完，请直接猜方块名。' }
  }

  let result = resolveQuestion(raw, state.target)
  if (result.answer === 'unknown') {
    result = await answerFromWiki(raw, state.target, result)
  }
  const v = verdict(result.answer)
  let text = `${v.text}${result.label ? `（${result.label}）` : ''}`
  if (result.source === 'learned') {
    text += ' · 已学习'
  } else if (result.source === 'wiki') {
    text += ' · 来自 Minecraft Wiki'
  } else if (result.wikiError) {
    text = '不确定（没连上 Wiki，本局结束后可教我）'
  } else if (result.wikiMiss) {
    text = '不确定（已查百科，没有明确依据，结束后可教我）'
  } else if (result.source === 'new') {
    text = `不确定（已归入「${result.path}」，本局结束后可教我是/否）`
  } else if (result.source === 'pending') {
    text = `不确定（已有分类「${result.path}」，该方块还没教过）`
  } else if (result.source === 'none') {
    text = '不确定（这句没法拆成属性，换个「它是/会/能……吗」试试）'
  }

  const pendingTeach = rememberTeach(state.pendingTeach, result, raw)

  return {
    state: {
      ...state,
      questionsLeft: state.questionsLeft - 1,
      pendingTeach,
      history: [...state.history, { kind: v.kind, input: raw.trim(), text }],
    },
    notice: '',
  }
}
