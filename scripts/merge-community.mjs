/**
 * 把朋友提交的 JSON 并入项目社区库（需你先看过内容）。
 * 用法：node scripts/merge-community.mjs 朋友发来的.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mergeLearned } from '../src/game/learner.js'

const file = process.argv[2]
if (!file) {
  console.error('用法: node scripts/merge-community.mjs <贡献文件.json>')
  process.exit(1)
}

const root = resolve(import.meta.dirname, '..')
const communityPath = resolve(root, 'src/data/community.json')
const base = JSON.parse(readFileSync(communityPath, 'utf8'))
const incoming = JSON.parse(readFileSync(resolve(file), 'utf8'))
const merged = mergeLearned(base, incoming)
writeFileSync(communityPath, `${JSON.stringify(merged, null, 2)}\n`)
const attr = Object.keys(merged.attributes).length
const values = Object.values(merged.values).reduce(
  (n, row) => n + Object.values(row).filter((v) => typeof v === 'boolean').length,
  0,
)
console.log(`已写入 src/data/community.json（${attr} 个分类，${values} 条是/否）`)
console.log('审核无误后再发布网页，朋友刷新即可用到。')
