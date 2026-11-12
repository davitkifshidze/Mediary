#!/usr/bin/env node
/* ============================================================
   **მენიუს ყოველ პუნქტს თავისი აიქონი აქვს.**

   შენი სიტყვები: „მენიუს პუნქტებს აიქონი აკლია". უაიქონო პუნქტი აიქონიანების
   გვერდით ტექსტს მარცხნივ სწევს და სია ორ სვეტად იკითხება — წიგნის, თამაშის,
   კურსისა და ადგილის სტატუსების ქვემენიუ და თვითონ „სტატუსი ▸" ასე იხატებოდა.

   მოწმდება ორი რამ:
   1. **`MenuAction.icon` ტიპში სავალდებულოა** (`components/ui/record-menu.tsx`).
      სანამ ასეა, უაიქონო პუნქტს `tsc` თვითონ აწითლებს — ყველა მოდულში, ქვემენიუს
      პუნქტებშიც. ველი `icon?:`-ად რომ დაბრუნდეს, ეს დაცვა ჩუმად გაქრებოდა.
   2. **ხელით აწყობილი პუნქტი** — `actionItemClass(…)`-იანი ღილაკი/ბმული და
      `<ContextMenuItem>` — შიგნით აიქონს ხატავს: თავის თავში დახურულ კომპონენტს
      (`<Trash2 … />`, `<action.icon … />`) ან `{icon}`-ს.

   ⚠️ სკრიპტი და არა Vitest-ის ტესტი — `error-codes.mjs`-ის მიზეზით
   (`src`-ს `@types/node` განზრახ არ აქვს).
   ============================================================ */
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(import.meta.dirname, '..', 'src')
const RECORD_MENU = path.join('components', 'ui', 'record-menu.tsx')

const problems = []

/** `<Tag …>`-ის ტექსტი პირველ `>`-მდე, რომელიც არც `{…}`-ის და არც ბრჭყალების შიგნით არ არის */
function tagAt(text, start) {
  let depth = 0
  let quote = null
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === quote) quote = null
    } else if (c === '"' || c === "'" || c === '`') quote = c
    else if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0) return text.slice(start, i + 1)
  }
  return text.slice(start)
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length

/** აიქონი პუნქტის შიგთავსში: დახურული კომპონენტი (`<X />`, `<a.icon />`) ან `{icon}` */
const ICON = /<(?:[A-Z]\w*|[a-z]\w*\.[\w.]+)\b[^<]*?\/>|\{\s*icon\s*\}/

function checkType(text) {
  const open = text.indexOf('export interface MenuAction {')
  if (open < 0) {
    problems.push(`${RECORD_MENU}  MenuAction ინტერფეისი ვერ მოიძებნა`)
    return
  }

  const body = text.slice(open, text.indexOf('\n}', open))
  if (!/^\s*icon:\s/m.test(body)) {
    problems.push(`${RECORD_MENU}:${lineOf(text, open)}  MenuAction.icon სავალდებულო უნდა იყოს (icon: …, არა icon?: …)`)
  }
}

function check(file) {
  const rel = path.relative(SRC, file)
  const text = fs.readFileSync(file, 'utf8')

  if (rel === RECORD_MENU) checkType(text)

  for (const m of text.matchAll(/<(button|a|Link|ContextMenuItem)\b/g)) {
    const tag = tagAt(text, m.index)
    if (m[1] !== 'ContextMenuItem' && !/\bactionItemClass\(/.test(tag)) continue
    // თავის თავში დახურული ტეგი პუნქტი ვერ იქნება — ტექსტი არ აქვს
    if (tag.endsWith('/>')) continue

    const from = m.index + tag.length
    const close = text.indexOf(`</${m[1]}>`, from)
    const body = close < 0 ? text.slice(from) : text.slice(from, close)

    if (!ICON.test(body)) problems.push(`${rel}:${lineOf(text, m.index)}  მენიუს პუნქტი აიქონის გარეშე`)
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.tsx$/.test(entry.name) && !entry.name.endsWith('.test.tsx')) check(full)
  }
}

walk(SRC)

if (problems.length) {
  console.error('მენიუს ყოველ პუნქტს აიქონი უნდა ჰქონდეს:\n  ' + problems.join('\n  '))
  process.exit(1)
}

console.log('მენიუს ყოველ პუნქტს აიქონი აქვს, MenuAction.icon სავალდებულოა.')
