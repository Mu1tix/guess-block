<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import {
  BLOCK_COUNT,
  GAME_VERSION,
  MAX_GUESSES,
  MAX_QUESTIONS,
  blocks,
} from './data/blocks.js'
import { applyInput, createState } from './game/engine.js'
import {
  downloadLearned,
  importLearnedJson,
  knowledgeStats,
  knowledgeTree,
  resetLearned,
  teachAttribute,
} from './game/learner.js'
import { EXAMPLE_QUESTIONS } from './game/parser.js'
import { clearUnrecognized, readUnrecognized } from './game/unrecognized.js'
import { WIKI_CREDIT } from './game/wiki.js'

const screen = ref('home')
const state = ref(null)
const input = ref('')
const notice = ref('')
const unrecognized = ref([])
const tree = ref([])
const stats = ref({ attrCount: 0, valueCount: 0, blockCount: 0 })
const historyEl = ref(null)
const fieldEl = ref(null)
const importEl = ref(null)
const looking = ref(false)

const playing = computed(() => state.value?.status === 'playing')
const ended = computed(
  () => state.value && state.value.status !== 'playing',
)
const pendingTeach = computed(() => state.value?.pendingTeach || [])

function refreshKnowledge() {
  tree.value = knowledgeTree()
  stats.value = knowledgeStats()
  unrecognized.value = readUnrecognized()
}

onMounted(refreshKnowledge)

function start() {
  state.value = createState(blocks)
  input.value = ''
  notice.value = ''
  screen.value = 'game'
  nextTick(() => fieldEl.value?.focus())
}

function goHome() {
  screen.value = 'home'
  refreshKnowledge()
}

function openKnowledge() {
  refreshKnowledge()
  screen.value = 'knowledge'
}

function useExample(text) {
  input.value = text
  fieldEl.value?.focus()
}

async function submit() {
  if (!state.value || looking.value) return
  looking.value = true
  if (/[吗麼么？?]/.test(input.value)) {
    notice.value = '正在查阅 Minecraft Wiki…'
  }
  try {
    const result = await applyInput(state.value, input.value, blocks)
    state.value = result.state
    notice.value = result.notice
    if (!result.notice) input.value = ''
    await nextTick()
    if (historyEl.value) {
      historyEl.value.scrollTop = historyEl.value.scrollHeight
    }
    if (state.value.status === 'playing') fieldEl.value?.focus()
  } finally {
    looking.value = false
  }
}

function onTeach(item, yes) {
  if (!state.value) return
  teachAttribute(state.value.target.id, item.attrId, yes)
  state.value = {
    ...state.value,
    pendingTeach: state.value.pendingTeach.filter((x) => x.attrId !== item.attrId),
  }
}

function onSkipTeach(item) {
  if (!state.value) return
  state.value = {
    ...state.value,
    pendingTeach: state.value.pendingTeach.filter((x) => x.attrId !== item.attrId),
  }
}

function onClearLog() {
  clearUnrecognized()
  unrecognized.value = []
}

function onResetLearned() {
  if (!confirm('清空本机学到的分类和是/否标注？内置方块数据不会被删。')) return
  resetLearned()
  refreshKnowledge()
}

async function onImportFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try {
    const text = await file.text()
    importLearnedJson(text)
    refreshKnowledge()
  } catch {
    alert('导入失败，请确认是本游戏导出的 JSON。')
  }
}
</script>

<template>
  <div class="page">
    <header class="brand">
      <div class="cube" aria-hidden="true" />
      <div>
        <h1>猜方块</h1>
        <p>{{ GAME_VERSION }} · {{ BLOCK_COUNT }} 个常见方块</p>
      </div>
    </header>

    <section v-if="screen === 'home'" class="panel">
      <h2>怎么玩</h2>
      <ul class="rules">
        <li>系统悄悄选一个方块。</li>
        <li>你可以提问，例如「它会发光吗？」系统回答 是 / 否 / 不确定。</li>
        <li>也可以直接猜名字，例如「萤石」「glowstone」。</li>
        <li>提问 {{ MAX_QUESTIONS }} 次，猜测 {{ MAX_GUESSES }} 次。猜中即胜。</li>
        <li>听不懂的问题会先查中文 Minecraft Wiki；查到就立刻记入知识库并回答。</li>
        <li>Wiki 也查不清时，会归入分类树，本局结束后仍可手动教是/否。</li>
      </ul>
      <p class="notice" style="margin: 12px 0">
        已学习 {{ stats.attrCount }} 个新分类，标注了 {{ stats.valueCount }} 条是/否。
      </p>
      <button class="btn" type="button" @click="start">开始一局</button>
      <button class="btn ghost" type="button" @click="openKnowledge">知识库</button>
    </section>

    <section v-if="screen === 'home' && unrecognized.length" class="unrec">
      <strong>完全无法拆开的句子</strong>
      <ul>
        <li v-for="item in unrecognized.slice().reverse().slice(0, 8)" :key="item.at">
          {{ item.text }}
        </li>
      </ul>
      <button class="btn tiny ghost" type="button" @click="onClearLog">清空记录</button>
    </section>

    <section v-if="screen === 'knowledge'">
      <div class="panel">
        <h2>学习知识库</h2>
        <p class="rules" style="padding-left: 0">
          新问题会先查中文 Minecraft Wiki。查到的是/否会立刻写入本机知识库。
          Wiki 没有把握时<strong>不会编造</strong>，本局结束后仍可手动教。
          条目版权归 Wiki 作者，许可为 CC BY-NC-SA。
        </p>
        <p class="notice">
          {{ stats.attrCount }} 个学习分类 · {{ stats.valueCount }} 条标注 ·
          覆盖 {{ stats.blockCount }} 个方块
        </p>
        <p class="hint">{{ WIKI_CREDIT }}</p>
      </div>
      <div v-for="branch in tree" :key="branch.id" class="panel tree-branch">
        <h2>{{ branch.label }}</h2>
        <p class="hint">{{ branch.hint }}</p>
        <p v-if="!branch.items.length" class="hint">还没有学到这一类的新问题。</p>
        <ul v-else class="attr-list">
          <li v-for="item in branch.items" :key="item.id">
            <strong>{{ item.label }}</strong>
            <span>已标注 {{ item.filled }} 个方块</span>
          </li>
        </ul>
      </div>
      <input
        ref="importEl"
        type="file"
        accept="application/json,.json"
        hidden
        @change="onImportFile"
      />
      <button class="btn" type="button" @click="downloadLearned">导出学习数据</button>
      <button class="btn ghost" type="button" @click="importEl?.click()">导入学习数据</button>
      <button class="btn ghost" type="button" @click="onResetLearned">清空学习数据</button>
      <button class="btn ghost" type="button" @click="goHome">返回首页</button>
    </section>

    <template v-if="screen === 'game' && state">
      <div class="stats">
        <div class="stat">
          <b>{{ state.questionsLeft }}</b>
          <span>剩余提问</span>
        </div>
        <div class="stat">
          <b>{{ state.guessesLeft }}</b>
          <span>剩余猜测</span>
        </div>
      </div>

      <div v-if="ended" class="panel result">
        <p v-if="state.status === 'won'">猜中了</p>
        <p v-else>本局结束</p>
        <div class="name">{{ state.target.name }}</div>
        <p class="notice">id：{{ state.target.id }}</p>

        <div v-if="pendingTeach.length" class="teach">
          <h2>教系统（只针对本局谜底）</h2>
          <p class="hint">选是或否后，下次再问同类问题就可以直接答。</p>
          <div v-for="item in pendingTeach" :key="item.attrId" class="teach-row">
            <p>
              「{{ state.target.name }}」—— {{ item.label }}？
              <span class="path">{{ item.path }}</span>
            </p>
            <div class="teach-actions">
              <button class="btn tiny" type="button" @click="onTeach(item, true)">是</button>
              <button class="btn tiny ghost" type="button" @click="onTeach(item, false)">否</button>
              <button class="btn tiny ghost" type="button" @click="onSkipTeach(item)">跳过</button>
            </div>
          </div>
        </div>

        <button class="btn" type="button" @click="start">再来一局</button>
        <button class="btn ghost" type="button" @click="goHome">返回首页</button>
      </div>

      <div ref="historyEl" class="history">
        <div v-if="!state.history.length" class="empty">
          试着问一句，或直接猜方块名。例如：
          <div class="chips">
            <button
              v-for="q in EXAMPLE_QUESTIONS"
              :key="q"
              class="chip"
              type="button"
              @click="useExample(q)"
            >
              {{ q }}
            </button>
          </div>
        </div>
        <div
          v-for="(item, i) in state.history"
          :key="i"
          class="item"
          :class="item.kind"
        >
          <div class="q">{{ item.input }}</div>
          <div class="a">{{ item.text }}</div>
        </div>
      </div>

      <form class="composer" @submit.prevent="submit">
        <input
          ref="fieldEl"
          v-model="input"
          :disabled="!playing || looking"
          maxlength="40"
          placeholder="提问或输入方块名"
          autocomplete="off"
        />
        <button class="btn" type="submit" :disabled="!playing || looking">
          {{ looking ? '查阅中' : '发送' }}
        </button>
      </form>
      <p class="notice">{{ notice }}</p>
    </template>
  </div>
</template>
