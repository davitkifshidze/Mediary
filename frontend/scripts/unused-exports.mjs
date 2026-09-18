#!/usr/bin/env node
/* ============================================================
   **გამოუყენებელი ექსპორტების შემოწმება (Tasks DEBT-07).**

   ⚠️ `tsc`-ის `noUnusedLocals` **ექსპორტს ვერ ხედავს**: მოდულის გარეთ
   გატანილი სახელი „გამოყენებულია" მისთვის იმის მიუხედავად, იმპორტირებს თუ
   არა ვინმე. ასე დაგროვდა ექვსი მკვდარი ექსპორტი `src/lib`-ში, მათ შორის
   მკვდარი hook და მთელი ემოჯი-ცხრილის უმიზნო გაბრტყელება ჩატვირთვაზე.

   ⚠️ **დამოკიდებულება განზრახ არ დაემატა.** oxlint-ს ასეთი წესი არ აქვს
   (`import/no-unused-modules` მის სქემაში არ არსებობს), `knip` კი ერთი
   შემოწმებისთვის მთელი ხელსაწყოა — პროექტს კი ხელით დაწერილი i18n-აუდიტის
   პრეცედენტი აქვს.

   ⚠️ **ტესტში გამოყენება ითვლება გამოყენებად.** ზოგი ექსპორტი სწორედ
   ტესტისთვისაა (`errors.ts`-ის `CODES` ამას თავის docblock-ში წერს), ე.ი.
   მათი დაბრალება ცრუ განგაში იქნებოდა.

   ⚠️ **პასუხი კონსერვატიულია**: სახელი ჩაითვლება გამოყენებულად, თუ იგი
   სხვა ფაილში სადმე ჩნდება. ე.ი. ცრუ **დადებითი** პრაქტიკულად გამორიცხულია
   (და სწორედ ისაა საშიში ავტომატურ შემოწმებაში), ცრუ უარყოფითი კი —
   შესაძლებელი. ეს შეგნებული არჩევანია: მცველი, რომელიც ხმაურობს, გამოირთვება.
   ============================================================ */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..', 'src')

/** შესვლის წერტილები — მათ იმპორტს `index.html`/Vite აკეთებს და არა კოდი */
const ENTRIES = new Set(['main.tsx', 'App.tsx'])

/**
 * **ნაგულისხმევად მხოლოდ `src/lib` მოწმდება; `--all` მთელ `src`-ს სკანირებს.**
 *
 * ⚠️ ეს **განზრახი შეზღუდვაა და არა სიზარმაცე.** `src/lib` საერთო
 * დამხმარეების საქაღალდეა — იქ მკვდარი ექსპორტი პირდაპირ ატყუებს მკითხველს
 * („ეს ფუნქცია სადღაც გამოიყენება") და სწორედ იქ დაგროვდა ექვსივე.
 *
 * ⚠️ `--all` **დღეს 56 ნაპოვარს აბრუნებს `src/api`-დან** (მაგ. `api/movies.ts`
 * მთლიანად — ის „უკუთავსებადობის shim-ია" და მას აღარავინ კითხულობს). მათი
 * გასუფთავება ცალკე სამუშაოა: ზოგი განზრახ ავსებს API-ს ზედაპირს და თითოეული
 * ხელით უნდა შემოწმდეს. ე.ი. `lint`-ში მათი ჩაგდება მცველს **პირველსავე
 * დღეს გამორთვამდე მიიყვანდა**.
 */
const SCOPE = process.argv.includes('--all') ? ROOT : path.join(ROOT, 'lib')

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)

    return e.isDirectory() ? walk(full) : /\.tsx?$/.test(e.name) ? [full] : []
  })
}

const files = walk(ROOT)
const sources = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]))


/* ⚠️ **მხოლოდ runtime-ექსპორტები**: `type`/`interface` განზრახ გარეთაა.
   მკვდარი ტიპი კომპილაციისას ქრება, ე.ი. არც კოდს ზრდის და არც ქცევას
   ჰპირდება; ისინი ხშირად საკუთარი ფაილის ხელმოწერებშია გამოყენებული და
   მომხმარებლისთვისაა გატანილი. მკვდარი **მნიშვნელობა** კი პირიქით —
   bundle-ში ჯდება და მკითხველს ატყუებს (`useViewLabel` მკვდარი hook იყო,
   `ALL_EMOJI` მთელ ცხრილს ბრტყელებდა ჩატვირთვაზე). */
const DECL = /^export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function|class|enum)\s+([A-Za-z_$][\w$]*)/gm

const dead = []

for (const [file, src] of sources) {
  // ⚠️ ვეძებთ მხოლოდ `SCOPE`-ში, მაგრამ **გამოყენებას მთელ `src`-ში** ვითვლით
  if (!file.startsWith(SCOPE + path.sep) || ENTRIES.has(path.basename(file))) continue

  const names = new Set()
  for (const m of src.matchAll(DECL)) names.add(m[1])

  for (const name of names) {
    const used = [...sources].some(
      ([other, text]) => other !== file && new RegExp(String.raw`\b${name}\b`).test(text),
    )

    if (!used) dead.push(`${path.relative(ROOT, file).split(path.sep).join('/')}: ${name}`)
  }
}

if (dead.length) {
  console.error(`გამოუყენებელი ექსპორტი (${dead.length}):`)
  for (const row of dead.sort()) console.error(`  ${row}`)
  console.error('\nწაშალე, ან გახადე მოდულის შიდა (`export`-ის გარეშე).')
  process.exit(1)
}

console.log('გამოუყენებელი ექსპორტი არ არის.')
