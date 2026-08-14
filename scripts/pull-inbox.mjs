/**
 * 从收件箱拉取朋友一键发来的知识，写成 inbox/*.json，供你审核后并入社区库。
 * 用法：node scripts/pull-inbox.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fetchContributions } from '../src/game/inbox.js'

const dir = resolve(import.meta.dirname, '..', 'inbox')
mkdirSync(dir, { recursive: true })

const items = await fetchContributions()
if (!items.length) {
  console.log('收件箱是空的。朋友在游戏里点「一键发给作者」之后再试。')
  process.exit(0)
}

for (const item of items) {
  const stamp = new Date(item.at || Date.now()).toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const name = `${stamp}-${String(item.id).slice(-8)}.json`
  const path = resolve(dir, name)
  writeFileSync(path, `${JSON.stringify(item.knowledge, null, 2)}\n`)
  console.log(`已保存 ${name}`)
}

console.log(`共 ${items.length} 条。请打开 inbox 文件夹核对，确认后执行：`)
console.log('  node scripts/merge-community.mjs inbox/文件名.json')
