#!/usr/bin/env node
/* ============================================================
   **`w-auto` ტრიგერი — მხოლოდ `SelectFitValue`-ით** (Tasks §38).

   ჩამოსაშლელი სია ტრიგერზე ვიწრო აღარ იქნება (`select.tsx` — ქვედა
   ზღვარი ტრიგერია), მაგრამ ტრიგერზე გრძელი ვარიანტი სიას აფართოებს. ფიქსირებული
   სიგანის ტრიგერზე ეს იშვიათი გამონაკლისია; `w-auto` ტრიგერზე კი — ყოველდღიური
   შემთხვევა: მისი სიგანე **არჩეულს** მიჰყვება, ე.ი. „20"-ის არჩევისას სია „ყველას"
   სიგანით იხსნება და ტრიგერზე ისევ განიერია — სწორედ §38-ის ხარვეზი.
   `SelectFitValue` ტრიგერს უგრძელესი ვარიანტის სიგანეს აძლევს.

   ამას ვერც `tsc` ხედავს, ვერც oxlint, ვერც jsdom-ის ტესტი (განლაგება არ აქვს),
   ამიტომ lint-ის ნაწილია.

   ⚠️ სკრიპტი და არა Vitest-ის ტესტი — `error-codes.mjs`-ის მიზეზით
   (`src`-ს `@types/node` განზრახ არ აქვს).
   ============================================================ */
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(import.meta.dirname, '..', 'src')
/** ტრიგერის ბლოკი — გახსნიდან დახურვამდე (შიგნით მხოლოდ მნიშვნელობა ზის) */
const TRIGGER = /<SelectTrigger\b[\s\S]*?<\/SelectTrigger>/g

const problems = []
let seen = 0

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.endsWith('.tsx')) check(full)
  }
}

function check(file) {
  const rel = path.relative(SRC, file)
  const text = fs.readFileSync(file, 'utf8')

  for (const m of text.matchAll(TRIGGER)) {
    if (!/\bw-auto\b/.test(m[0])) continue
    seen++
    if (!m[0].includes('<SelectFitValue')) {
      const line = text.slice(0, m.index).split('\n').length
      problems.push(`${rel}:${line}  w-auto ტრიგერი SelectFitValue-ის გარეშე`)
    }
  }
}

walk(SRC)

/* ⚠️ ცარიელი შედეგი ორაზროვანია — „ყველა წესრიგშია" და „რეგექსმა ვერაფერი
   იპოვა" ერთნაირად გამოიყურება. დღეს ასეთი ტრიგერი ოთხია (`NumberPick`,
   ცხრილის „გვერდზე", ფაილების დალაგება, გალერეის ფილტრები). */
if (seen === 0) {
  console.error('Tasks §38 — w-auto ტრიგერი ვერ ვიპოვე; სკრიპტი აღარ კითხულობს წყაროს სწორად.')
  process.exit(1)
}
if (problems.length) {
  console.error('Tasks §38 — ჩამოსაშლელი ტრიგერზე განიერი იქნება:\n  ' + problems.join('\n  '))
  process.exit(1)
}
console.log(`w-auto ტრიგერები (${seen}) SelectFitValue-ით არის.`)
