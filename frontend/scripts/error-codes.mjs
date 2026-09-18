#!/usr/bin/env node
/* ============================================================
   **backend-ის ყოველი მანქანური კოდი `CODES`-ში უნდა იყოს** (Tasks FEAT-01).

   ⚠️ GAP-01-ში 39 კოდი დაგროვდა სწორედ იმიტომ, რომ ამ კავშირს **არაფერი
   არ იცავდა**: `errorMessage()` უცნობ კოდს სიტყვასიტყვით აბრუნებს, ე.ი.
   მომხმარებელი toast-ში `module_not_enabled`-ს ხედავს. `tsc`, lint და
   i18n-ის აუდიტი ამას ვერ ხედავენ — შემოწმება რეპოს ორ ნახევარს კვეთს.

   ⚠️ **სკრიპტი და არა Vitest-ის ტესტი**: `src`-ს `@types/node` განზრახ არ
   აქვს (ის ბრაუზერის კოდია და `process`/`fs` იქ არ უნდა ჩანდეს), ე.ი.
   `node:fs`-ის მკითხველი ტესტი `tsc -b`-ს ატეხდა. `unused-exports.mjs`-ის
   იგივე პრეცედენტი.

   ⚠️ **მეორე ნახევარი — `CODES` ⊆ ორივე ლოკალი — უკვე `errors.test.ts`-შია**
   და აქ განზრახ არ მეორდება: ერთი ფაქტი ერთ ადგილას.
   ============================================================ */
import fs from 'node:fs'
import path from 'node:path'

const FRONTEND = path.resolve(import.meta.dirname, '..')
const BACKEND = path.resolve(FRONTEND, '..', 'backend')
const ROOTS = ['app', 'bootstrap', 'routes']

/** კოდის ფორმა — `snake_case`, მინიმუმ ორი სეგმენტი */
const CODE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/

/**
 * ⚠️ **ხუთივე ფორმა საჭიროა.** კოდი `'message' => …`-ის გარდა ოთხი სხვა
 * გზითაც ბრუნდება და `grep "'message'"` მათ **ვერ ხედავს**:
 * `abort_unless(…, 422, 'code')` · `ChatService::fail('code')` ·
 * `['reason' => 'code']` (კონტროლერი მას `message`-ად აბრუნებს) და
 * `new HttpException(419, 'code')` — ეს უკანასკნელი `csrf_token_mismatch`-ია,
 * ე.ი. ფორმის საჭიროების ცოცხალი მტკიცება.
 */
const PATTERNS = [
  /'message'\s*=>\s*'([^']+)'/g,
  /'reason'\s*=>\s*'([^']+)'/g,
  /\bfail\(\s*'([^']+)'/g,
  /abort[a-z_]*\([^;]*?,\s*\d{3},\s*'([^']+)'/gs,
  /HttpException\(\s*\d{3},\s*'([^']+)'/g,
]

/* ⚠️ backend-ის გარეშე (ცალკე გაშვებული frontend) შემოწმება გამოტოვდება და
   არა ჩავარდება — თორემ `npm run lint` იქ სამუდამოდ წითელი იქნებოდა. */
if (!fs.existsSync(BACKEND)) {
  console.log('backend/ ვერ მოიძებნა — მანქანური კოდების შემოწმება გამოტოვდა.')
  process.exit(0)
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)

    return e.isDirectory() ? walk(full) : full.endsWith('.php') ? [full] : []
  })
}

/** `CODES`-ის სია — მასივის ბლოკიდან და არა მთელი ფაილიდან */
function registered() {
  const src = fs.readFileSync(path.join(FRONTEND, 'src', 'lib', 'errors.ts'), 'utf8')
  const block = src.slice(src.indexOf('export const CODES = ['), src.indexOf('] as const'))

  if (!block) throw new Error('`CODES` ვერ მოიძებნა `src/lib/errors.ts`-ში')

  return new Set([...block.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]))
}

const found = new Map()

for (const root of ROOTS) {
  for (const file of walk(path.join(BACKEND, root))) {
    const src = fs.readFileSync(file, 'utf8')

    for (const pattern of PATTERNS) {
      for (const match of src.matchAll(pattern)) {
        if (!CODE.test(match[1])) continue

        const where = path.relative(BACKEND, file).split(path.sep).join('/')
        found.set(match[1], (found.get(match[1]) ?? new Set()).add(where))
      }
    }
  }
}

const known = registered()

/* ⚠️ ჯერ თვითონ წამკითხველები: გადარქმეული საქაღალდე ან შეცვლილი ფორმა
   შემოწმებას **უხმოდ** გაატარებდა ცარიელ სიაზე. */
if (found.size < 50 || !found.has('storage_quota_exceeded') || !found.has('csrf_token_mismatch')) {
  console.error(`სკანერი გაფუჭდა: ნაპოვნია ${found.size} კოდი და ღუზები არ იძებნება.`)
  process.exit(1)
}

if (known.size < 50) {
  console.error('`CODES` ვერ წაიკითხა — მასივის ბლოკი გადარქმეულია?')
  process.exit(1)
}

const missing = [...found.keys()].filter((code) => !known.has(code)).sort()

if (missing.length) {
  console.error(`მანქანური კოდი CODES-ში არ არის (${missing.length}):`)
  for (const code of missing) console.error(`  ${code} ← ${[...found.get(code)].join(', ')}`)
  console.error('\nშედეგი: toast-ში ის snake_case-ად გამოჩნდება. დაამატე `src/lib/errors.ts`-ს და ორივე ლოკალს.')
  process.exit(1)
}

console.log(`მანქანური კოდები: ${found.size} ნაპოვნი, ყველა რეგისტრირებული.`)
