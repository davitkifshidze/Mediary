#!/usr/bin/env node
/* ============================================================
   **ცარიელი მდგომარეობის ტექსტი — მხოლოდ `EmptyState`-ით.**

   „ამ ჩანაწერს ფოტო ჯერ არ აქვს." ნაცრისფერ აბზაცად ეწერა და გვერდი
   გაფუჭებულს ჰგავდა: არც ნახატი, არც ჩარჩო, არც შემდეგი ნაბიჯი. ცარიელ
   ადგილს ერთი კომპონენტი ხატავს (`ui/empty-state.tsx`) — ანიმაციური
   ილუსტრაციით, სათაურით, მინიშნებითა და ღილაკით; ბარათის შიგნით — `compact`.

   მოწმდება i18n-გასაღები, რომლის ბოლო სეგმენტი ცარიელ მდგომარეობას ამბობს:
   `empty…`, `nothing…`, `no` + დიდი ასო (`noResults`, `noVideos`). ასეთი
   `t('…')` დასაშვებია მხოლოდ:
   1. `<EmptyState …>`-ის ატრიბუტში (`title`, `hint`);
   2. კომპონენტის `empty…` ატრიბუტში (`emptyText`, `emptyTitle`, `emptyHint`,
      `empty`) — ის მას `EmptyState`-ს გადასცემს.

   ⚠️ **`LABELS` — გასაღებები, რომლებიც ცარიელ მდგომარეობას არ აღწერს**, თუმცა
   სახელი ჰგავს: მნიშვნელობის წარწერა („სტატუსის გარეშე", „ვადის გარეშე"),
   ღილაკის ტექსტი („ურნის დაცლა"), შედეგის სტრიქონი რიგში, გაფრთხილება
   გასაღების არქონაზე. ახალი გასაღები ან `EmptyState`-ზე მიდის, ან აქ ემატება —
   მიზეზით.

   ⚠️ სკრიპტი და არა Vitest-ის ტესტი — `error-codes.mjs`-ის მიზეზით
   (`src`-ს `@types/node` განზრახ არ აქვს).
   ============================================================ */
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(import.meta.dirname, '..', 'src')

const EMPTY_KEY = /^(empty|nothing|no[A-Z])|Empty$/

/** სახელით ჰგავს, შინაარსით — არა (იხ. ზემოთ) */
const LABELS = new Set([
  // მნიშვნელობის წარწერა — „X-ის გარეშე", „ცარიელია", აღწერის შემცვლელი ტექსტი
  'detail.noDescription',
  'duty.noWorkplace',
  'duty.workplace.noRate',
  'duty.shift.noRate',
  'duty.calc.noRate',
  'share.noExpiry',
  'share.page.noExpiry',
  'storage.noLimit',
  'settings.noDelay',
  'settings.noChanges',
  'videos.noType',
  'videos.noStatus',
  'songs.noPlaylist',
  'credentials.empty',
  'import.noFile',
  'import.noTitle',
  'admin.noUsers',
  'modules.noAccess',
  'transfer.noRecords',
  'transfer.zipEmpty',
  'goals.barEmpty',
  'notes.remindersEmpty',
  // არჩევანის პუნქტი ან ველის მინიშნება
  'duty.workplace.noDefault',
  'duty.workplace.leaveEmpty',
  'personal.move.noPerson',
  'personal.move.noAlbum',
  'videos.noCourse',
  'genres.optLeaveEmpty',
  'sync.modeEmpty',
  'customModules.classifierEmpty',
  // რიგისა და სინქრონიზაციის შედეგი, შეჯამება, toast
  'queue.result.empty',
  'queue.summary.empty',
  'castSync.summary.empty',
  'castSync.result.noTmdbId',
  'castSync.result.tmdbEmpty',
  'castSync.nothingToRun',
  'castSync.nothingStale',
  'castSync.emptyLibrary',
  'castSync.noTmdb',
  'sync.noTmdb',
  'translate.nothingToDo',
  'places.route.noRoutes',
  'bookmarks.refresh.bulkEmpty',
  // გაფრთხილება ან მიზეზი — რაღაც აკლია (გასაღები, უფლება, მისამართი), სია კი ცარიელი არ არის
  'actor.noTmdbId',
  'gallery.noTmdbId',
  'translate.noKey',
  'translate.noTmdbKey',
  'videos.local.noFfmpeg',
  'playback.noEmbed',
  'places.route.noHome',
  'duty.workplace.noRateBanner',
  'share.noSections',
  'share.page.noModule',
  'share.page.noCreateRight',
  'modules.noAccessHint',
  'import.noFiles',
  'auth.noAccount',
  // ღილაკი — „ურნის დაცლა"
  'trash.emptyAction',
  // ერთ ფაილში წარწერაა, სხვაგან — ცარიელი მდგომარეობა (`ფაილი#გასაღები`)
  'components/PublicProfileCard.tsx#publicProfile.noShareable',
  'pages/ChatPage.tsx#chat.noMessages',
  'pages/RolesPage.tsx#roles.noAccess',
])

const problems = []
const report = process.argv.includes('--report')

/**
 * გამხსნელი ტეგის ბოლო — პირველი `>` ფრჩხილებისა და ბრჭყალების გარეთ.
 * ⚠️ `{…}`-ის შიგნით კომენტარი გამოტოვებულია: მასში კენტი აპოსტროფი ან ბრჭყალი
 * „სტრიქონს" გახსნიდა და ტეგი ფაილის ბოლომდე გაგრძელდებოდა.
 */
function tagEnd(text, start) {
  let depth = 0
  let quote = null
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === quote) quote = null
    } else if (depth > 0 && c === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2)
      i = close === -1 ? text.length : close + 1
    } else if (depth > 0 && c === '/' && text[i + 1] === '/' && text[i - 1] !== ':') {
      const close = text.indexOf('\n', i)
      i = close === -1 ? text.length : close
    } else if (c === '"' || c === "'" || c === '`') quote = c
    else if (c === '{') depth++
    else if (c === '}') depth--
    else if (c === '>' && depth === 0) return i
  }
  return text.length - 1
}

/** ტეგის ატრიბუტი, რომლის `{…}` მნიშვნელობაშიც `pos` ხვდება */
function attributeAt(text, start, end, pos) {
  let depth = 0
  let name = null
  for (let i = start; i <= end; i++) {
    const c = text[i]
    if (c === '{') {
      if (depth === 0) name = text.slice(start, i).match(/([A-Za-z][\w-]*)=$/)?.[1] ?? null
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0 && pos < i) return name
    }
    if (depth > 0 && i === pos) {
      // ვაგრძელებთ — სახელი უკვე ვიცით, დახურვას ველოდებით
    }
  }
  return name
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length

function check(file) {
  const rel = path.relative(SRC, file).replaceAll('\\', '/')
  const text = fs.readFileSync(file, 'utf8')

  const uses = [...text.matchAll(/\bt\(\s*(['"`])([\w.-]+)\1/g)].filter((m) => {
    const key = m[2]
    return EMPTY_KEY.test(key.split('.').pop()) && !LABELS.has(key) && !LABELS.has(`${rel}#${key}`)
  })
  if (!uses.length) return

  // ყველა გამხსნელი ტეგი: [start, end, name]
  const tags = []
  for (const m of text.matchAll(/<([A-Za-z][\w.]*)(?=[\s/>])/g)) tags.push([m.index, tagEnd(text, m.index), m[1]])

  for (const m of uses) {
    const pos = m.index
    const where = `${rel}:${lineOf(text, pos)}`
    // ყველაზე შიდა ტეგი, რომლის გამხსნელ ნაწილშიც გამოძახება დგას
    const tag = tags.filter(([s, e]) => s < pos && pos < e).pop()
    if (tag) {
      if (tag[2] === 'EmptyState') continue
      const attr = attributeAt(text, tag[0], tag[1], pos)
      if (attr && /^empty/i.test(attr)) continue
      problems.push(`${where}  ${m[2]}  <${tag[2]} ${attr ?? '?'}=…>`)
      continue
    }
    problems.push(`${where}  ${m[2]}  ტექსტად`)
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
  console.log(problems.join('\n'))
  console.log(`სულ: ${problems.length}`)
  process.exit(0)
}

if (problems.length) {
  console.error('ცარიელი მდგომარეობის ტექსტი EmptyState-ის გარეთ:\n  ' + problems.join('\n  '))
  process.exit(1)
}
console.log('ცარიელ მდგომარეობას ყველგან EmptyState ხატავს.')
