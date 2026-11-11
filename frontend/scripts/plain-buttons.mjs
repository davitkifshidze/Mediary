#!/usr/bin/env node
/* ============================================================
   **ტექსტიანი ღილაკი — ყოველთვის ჩარჩოთი, ფონით, აიქონით და ჰოვერით.**

   შენი სიტყვები: „ყველა ღილაკს ჩარჩო, ფონი, აიქონი და ჰოვერი" — „დამალვა",
   „სიის ჩვენება", „გასუფთავება" შიშველ ტექსტად ეწერა და ვერ მიხვდებოდი, ღილაკია
   თუ წარწერა. წესი **ტექსტიან** ღილაკს ეხება; მხოლოდ-აიქონ ღილაკი (✕, ისრები,
   ⋯, გული) რჩება, როგორც არის — ფონისა და ჩარჩოს გარეშე.

   მოწმდება:
   1. **`<Button variant="ghost">` ტექსტით** — `ghost` არც ჩარჩოს ხატავს, არც ფონს;
      ტექსტიანზე `outline` (ან სხვა შევსებული ვარიანტი) იწერება.
   2. **`<Button>` ტექსტით და აიქონის გარეშე** — ნებისმიერ ვარიანტზე.
   3. **ნედლი `<button>` ტექსტით** — ან `Button` კომპონენტი, ან დასახელებული
      სახეობა `data-kind`-ით: ის ღილაკი **არ არის** — ჩანართია, მენიუს პუნქტი,
      ბარათი, სტრიქონი, ჩიპი, აკორდეონის სათაური ან ტექსტში ჩასმული ბმული.
      სახეობას თავისი ვიზუალი აქვს და ღილაკის ჩარჩო მას არ სჭირდება; სიაში
      არარსებული სახეობა შეცდომაა, რომ „გამონაკლისი" ახალ წესად არ იქცეს.
      ორ სახეობას სკრიპტი თვითონ ცნობს: მენიუს პუნქტს (`actionItemClass(…)`)
      და ARIA-ვიჯეტის ნაწილს (`role="tab"`, `option`, `radio`, `combobox`…).
   4. **`buttonVariants({ variant: 'ghost' })` აიქონის ზომის გარეშე** — ბმული
      ღილაკის იერით იმავე წესს ემორჩილება.

   ⚠️ „ტექსტი" JSX-ის ტექსტია ან გამოსახულება, რომელიც სიტყვას ხატავს (`t(…)`,
   სტრიქონი, `label`/`title`/`name`…); პირობითი აიქონი (`{open ? <A /> : <B />}`)
   ტექსტი არ არის, არც შედარების სტრიქონი (`v === 'list'`) და არც შემფუთავი
   კომპონენტის `{children}` — რა ჩაიდება, გამომძახებელზე ჩანს და არა აქ.
   „აიქონი" — თავის თავში დახურული კომპონენტი (`<Plus />`, `<ModuleIcon … />`),
   `<svg>`, `<img>` ან `icon`-ის შემცველი გამოსახულება.

   ⚠️ სკრიპტი და არა Vitest-ის ტესტი — `error-codes.mjs`-ის მიზეზით
   (`src`-ს `@types/node` განზრახ არ აქვს).
   ============================================================ */
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(import.meta.dirname, '..', 'src')

/**
 * ნედლი `<button>`-ის დასაშვები სახეობები — თითოს თავისი ვიზუალი აქვს:
 * ჩანართი/სეგმენტი · მენიუს პუნქტი · მთლიანად დასაჭერი ბარათი · სიის სტრიქონი ·
 * ფოტოს/ვიდეოს ფილა · ჩიპი · გადამრთველი · გასაშლელი სექციის სათაური ·
 * სათაურში ჩასმული ბმული · ველის იერის ტრიგერი · კალენდრის უჯრა ·
 * ცხრილის სვეტის სათაური.
 */
const KINDS = new Set([
  'tab',
  'menu-item',
  'card',
  'row',
  'tile',
  'chip',
  'toggle',
  'accordion',
  'link',
  'field',
  'calendar',
  'header',
])

/** სახეობა, რომელსაც თვითონ ტეგი ამბობს — `data-kind` ზედმეტია */
const OWN_KIND = /\bactionItemClass\(|\brole="(tab|option|radio|combobox|menuitem|menuitemradio|menuitemcheckbox|switch|checkbox)"/

const problems = []
const report = process.argv.includes('--report')

/** გამხსნელი ტეგის ბოლო — პირველი `>` ფრჩხილებისა და ბრჭყალების გარეთ */
function tagEnd(text, start) {
  let depth = 0
  let quote = null
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === quote) quote = null
    } else if (c === '"' || c === "'" || c === '`') quote = c
    else if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0) return i
  }
  return text.length - 1
}

/** დამხურავი ტეგის პოზიცია, ჩადგმული იმავე სახელის ტეგების გათვალისწინებით */
function closeOf(text, from, name) {
  const open = new RegExp(`<${name}\\b`, 'g')
  const close = `</${name}>`
  let depth = 1
  let i = from
  while (depth > 0) {
    const nextClose = text.indexOf(close, i)
    if (nextClose === -1) return -1
    open.lastIndex = i
    const nextOpen = open.exec(text)
    if (nextOpen && nextOpen.index < nextClose) {
      const end = tagEnd(text, nextOpen.index)
      if (text[end - 1] !== '/') depth++
      i = end + 1
    } else {
      depth--
      i = nextClose + close.length
      if (depth === 0) return nextClose
    }
  }
  return -1
}

/** შვილებიდან ყველა ტეგი ამოღებული (შიგთავსი რჩება), JSX-კომენტარები — მოშორებული */
function stripTags(children) {
  let out = ''
  let i = 0
  while (i < children.length) {
    if (children.startsWith('{/*', i)) {
      const end = children.indexOf('*/}', i)
      i = end === -1 ? children.length : end + 3
    } else if (children[i] === '<' && /[A-Za-z/]/.test(children[i + 1] ?? '')) {
      i = tagEnd(children, i) + 1
    } else out += children[i++]
  }
  return out
}

/** `{…}` გამოსახულებები ზედა დონეზე */
function expressions(text) {
  const out = []
  let depth = 0
  let start = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{' && depth++ === 0) start = i
    else if (text[i] === '}' && --depth === 0) out.push(text.slice(start + 1, i))
  }
  return out
}

const WORDY = /\bt\(|\bi18n\.|['"`][^'"`]*\p{L}{2,}[^'"`]*['"`]|\b(label|title|name|text|caption|heading|message)\b/u

/** შედარების მარჯვენა მხარე (`=== 'list'`) სტრიქონია, მაგრამ ეკრანზე არ იხატება */
const COMPARED = /[!=]==?\s*(['"`])[^'"`]*\1/g

function hasText(children) {
  const bare = stripTags(children)
  const literal = bare.replace(/\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, ' ')
  if (/\p{L}{2,}/u.test(literal)) return true
  return expressions(bare).some((expr) => WORDY.test(expr.replace(COMPARED, ' ')))
}

function hasIcon(children) {
  if (/<(svg|img)\b/.test(children)) return true
  if (/<[A-Z][\w.]*\b[^<>]*\/>/.test(children)) return true
  if (/<[a-z]+\.[A-Za-z]+\b[^<>]*\/>/.test(children)) return true // `<cut.icon />`
  return expressions(children).some((expr) => /icon/i.test(expr))
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length

function check(file) {
  const rel = path.relative(SRC, file).replaceAll('\\', '/')
  const text = fs.readFileSync(file, 'utf8')

  for (const m of text.matchAll(/<(Button|button)\b/g)) {
    const end = tagEnd(text, m.index)
    const tag = text.slice(m.index, end + 1)
    if (tag.endsWith('/>')) continue

    const close = closeOf(text, end + 1, m[1])
    if (close === -1) continue
    const children = text.slice(end + 1, close)
    if (!hasText(children)) continue

    const where = `${rel}:${lineOf(text, m.index)}`

    if (m[1] === 'Button') {
      if (/\bvariant=\{?["'`]ghost["'`]/.test(tag)) problems.push(`${where}  ტექსტიანი ghost — variant="outline"`)
      else if (/\bvariant=\{[^}]*ghost/.test(tag)) problems.push(`${where}  ტექსტიანი ღილაკი პირობითი ghost-ით — შევსებული ვარიანტი`)
      if (!hasIcon(children)) problems.push(`${where}  ტექსტიანი ღილაკი აიქონის გარეშე`)
      continue
    }

    if (OWN_KIND.test(tag)) continue
    const kind = tag.match(/\bdata-kind="([^"]+)"/)?.[1]
    if (!kind) problems.push(`${where}  ნედლი ტექსტიანი <button> — Button ან data-kind`)
    else if (!KINDS.has(kind)) problems.push(`${where}  უცნობი data-kind="${kind}"`)
  }

  // ბმული ღილაკის იერით (`buttonVariants()` `<a>`-ზე ან `<Link>`-ზე): `ghost` მხოლოდ აიქონის ზომით
  for (const m of text.matchAll(/buttonVariants\(\{[^}]*\}\)/g)) {
    if (/variant:\s*['"]ghost['"]/.test(m[0]) && !/size:\s*['"]icon['"]/.test(m[0])) {
      problems.push(`${rel}:${lineOf(text, m.index)}  buttonVariants ghost-ით აიქონის ზომის გარეშე — variant: 'outline'`)
    }
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) check(full)
  }
}

walk(SRC)

if (report) {
  const by = {}
  for (const p of problems) {
    const kind = p.split('  ')[1]
    by[kind] = (by[kind] ?? 0) + 1
  }
  console.log(problems.join('\n'))
  console.log(JSON.stringify(by, null, 2))
  process.exit(0)
}

if (problems.length) {
  console.error('ტექსტიანი ღილაკი ყოველთვის ჩარჩოთი, ფონით, აიქონით და ჰოვერით:\n  ' + problems.join('\n  '))
  process.exit(1)
}
console.log('ტექსტიან ღილაკებს ჩარჩო, ფონი, აიქონი და ჰოვერი აქვს.')
