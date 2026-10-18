#!/usr/bin/env node
/* ============================================================
   **მოქმედებების რიგი — ერთი სიმაღლე, `h-9`**.

   შენი სიტყვები: „გახსნილ ვიდეოში რჩეული სხვა სიმაღლისაა, ვიდრე რედაქტირების
   ღილაკი — ერთი ზომები უნდა იყოს, სიმაღლეში მაინც" · „ფილმებში სტატუსი,
   საჯარო სიმაღლეში სხვაა — პატარაა, ვიდრე რჩეული". ღილაკი `sm`-ია, რჩეული
   `sm`, ბეჯი `row` — სამივე `h-9`. დარღვევა კლასით/პროპით ბრუნდება და მას
   ვერც `tsc` ხედავს, ვერც oxlint — ამიტომ lint-ის ნაწილია.

   მოწმდება ორი რამ:
   1. **`FavoriteButton size="xs"`** (`h-7`) — მხოლოდ ვიდეოს ბარათის სათაურის
      ზოლში (`VideoCard.tsx`); მოქმედებების რიგში — არა.
   2. **დეტალის თავის ბეჯები** (`DetailHero badges={…}`) — იქ რჩეული, „საჯარო"
      და სტატუსი ერთ რიგშია, ე.ი. `StatusBadge`/`EnumStatusBadge`/`Badge`
      `size="row"`-ის გარეშე (~20 px) სხვა სიმაღლისაა.

   ⚠️ `VisibilityBadge`-ს პატარა ვარიანტი აღარ აქვს (ყოველთვის `h-9`) — მას
   ეს სკრიპტი აღარ სჭირდება. შესვლების ბეჯი (`VisitBadge`, `h-7`) აღარ არსებობს.
   ⚠️ სკრიპტი და არა Vitest-ის ტესტი — `error-codes.mjs`-ის მიზეზით
   (`src`-ს `@types/node` განზრახ არ აქვს).
   ============================================================ */
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(import.meta.dirname, '..', 'src')
const ALLOW_XS_FAVORITE = new Set([path.join('components', 'VideoCard.tsx')])

const problems = []

/** `<Tag …>`-ის ტექსტი პირველ `>`-მდე, რომელიც `{…}`-ის შიგნით არ არის */
function tagAt(text, start) {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0) return text.slice(start, i + 1)
  }
  return text.slice(start)
}

/** `badges={` პროპის შიგთავსი — დაბალანსებული `{…}` */
function propBody(text, open) {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) return text.slice(open, i + 1)
  }
  return text.slice(open)
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length

function check(file) {
  const rel = path.relative(SRC, file)
  const text = fs.readFileSync(file, 'utf8')

  if (!ALLOW_XS_FAVORITE.has(rel)) {
    for (const m of text.matchAll(/<FavoriteButton\b/g)) {
      if (/\bsize="xs"/.test(tagAt(text, m.index))) problems.push(`${rel}:${lineOf(text, m.index)}  FavoriteButton size="xs" მოქმედებების რიგში`)
    }
  }

  if (!text.includes('<DetailHero')) return
  for (const m of text.matchAll(/\bbadges=\{/g)) {
    const open = m.index + m[0].length - 1
    const body = propBody(text, open)
    for (const tag of body.matchAll(/<(StatusBadge|EnumStatusBadge|Badge)\b/g)) {
      if (!/\bsize="row"/.test(tagAt(body, tag.index))) {
        problems.push(`${rel}:${lineOf(text, open + tag.index)}  ${tag[1]} დეტალის თავში size="row"-ის გარეშე`)
      }
    }
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
  console.error('მოქმედებების რიგში ყველაფერი h-9 უნდა იყოს:\n  ' + problems.join('\n  '))
  process.exit(1)
}
console.log('მოქმედებების რიგები ერთი სიმაღლისაა (h-9).')
