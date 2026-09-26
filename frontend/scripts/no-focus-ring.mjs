#!/usr/bin/env node
/* ============================================================
   **ფოკუსის ნიშანი და აიქონ-ღილაკის ჰოვერის ფონი — არსად** (Tasks §5).

   შენი გადაწყვეტილება (Q1): ფოკუსზე არც რგოლი, არც ჩარჩო — კლავიატურითაც;
   აიქონ-ღილაკის ჰოვერზე მხოლოდ აიქონი ინძრევა, ფონი არ ეფერება. ორივე
   კლასებით ბრუნდება (`focus-visible:ring-2`, `hover:bg-muted`) და ამას ვერც
   `tsc` ხედავს, ვერც oxlint — ამიტომ lint-ის ნაწილია.

   ⚠️ **ორი რამ განზრახ რჩება:** ღია სიის შიგნით მონიშნული ვარიანტის ფონი
   (`focus:bg-*`) — ის არჩევის კურსორია; და emoji-picker-ის უჯრა — არჩევის
   ბადეა და არა აიქონ-ღილაკი.

   ⚠️ სკრიპტი და არა Vitest-ის ტესტი — `error-codes.mjs`-ის მიზეზით
   (`src`-ს `@types/node` განზრახ არ აქვს).
   ============================================================ */
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(import.meta.dirname, '..', 'src')
const ALLOW_HOVER_BG = new Set([path.join('components', 'ui', 'emoji-picker.tsx')])

/** ფოკუსის რგოლი/ჩარჩო ნებისმიერი ვარიანტით */
const FOCUS = /\b(?:focus|focus-visible|focus-within)(?::[a-z-]+)*:(?:ring|outline-(?!none\b)|border-|shadow-)[^\s"'`]*/g
/** კლასის სტრიქონი */
const STRING = /(["'`])((?:(?!\1)[^\n])*?)\1/g

const problems = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(tsx?|css)$/.test(entry.name)) check(full)
  }
}

function check(file) {
  const rel = path.relative(SRC, file)
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)

  lines.forEach((line, i) => {
    for (const m of line.matchAll(FOCUS)) problems.push(`${rel}:${i + 1}  ფოკუსის ნიშანი: ${m[0]}`)

    if (ALLOW_HOVER_BG.has(rel)) return
    for (const m of line.matchAll(STRING)) {
      const body = m[2]
      if (body.includes('place-items-center') && /\bsize-(\d|\[)/.test(body) && /\bhover:bg-(?!transparent\b)/.test(body)) {
        problems.push(`${rel}:${i + 1}  აიქონ-ღილაკის ჰოვერის ფონი`)
      }
    }
  })
}

walk(SRC)

if (problems.length) {
  console.error('Tasks §5 — ფოკუსის ნიშანი ან აიქონის ჰოვერის ფონი დაბრუნდა:\n  ' + problems.join('\n  '))
  process.exit(1)
}
console.log('ფოკუსის ნიშანი და აიქონის ჰოვერის ფონი არ არის.')
