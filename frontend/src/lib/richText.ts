import type { CSSProperties } from 'react'
import { Marked, type Token, type Tokens } from 'marked'

/* ============================================================
   **ფორმატიანი ტექსტი — Markdown ტექსტად (Tasks §47, Q12).**

   აღწერები (ყველა მოდულის, ორივე ენაზე), ჩანაწერის ტექსტი და ჩანიშვნები
   TipTap-ის რედაქტორით იწერება (`ui/rich-text.tsx`) და Markdown-ის
   სტრიქონად ინახება; ჩვენება — `ui/markdown.tsx`. ⚠️ ძველი უბრალო ტექსტი
   Markdown-შიც ტექსტია, ე.ი. მიგრაცია არ სჭირდება.

   ⚠️ **ერთი წამკითხველი ორივე მხარეს.** რედაქტორიც და ჩვენებაც `createMarked()`-ის
   ასლით კითხულობს, თორემ რედაქტორში სიად დანახული ტექსტი ჩვენებაზე აბზაცად
   გამოჩნდებოდა. კონფიგი ძველი ტექსტისთვისაა მორგებული:

   - `breaks` — ერთი ახალი ხაზი ხაზის გადატანაა (`whitespace-pre-line`-ის
     ქცევა, რაც აქამდე ჩანდა); რედაქტორიც ხაზის გადატანას `\n`-ად წერს.
   - **setext-სათაური გამორთულია** — „ტექსტი\n-----" (YouTube-ის აღწერის
     გამყოფი) სათაურად აღარ იქცევა, „-----" ხაზი ხდება.
   - **4 ჰარით დაწყებული ხაზი კოდი აღარაა** — ლექსი თუ შეწეული სია ძველ
     ტექსტში კოდის ბლოკად გამოჩნდებოდა; კოდი მხოლოდ ``` -ითაა.
   - **HTML არ იკითხება** (ბლოკიც და ხაზის შიგნითაც) — `<b>` ტექსტია, როგორც
     აქამდე: რედაქტორი მას ფორმატად აქცევდა, ჩვენება კი ტექსტად აჩვენებდა.
   - GFM — შიშველი ბმული ბმულია (YouTube-ის აღწერა ბმულებით ჩანს).
   ============================================================ */

/** აღწერის ზღვარი — backend-ის `RichText::MAX` (სარკე `RegistryConsistencyTest`-შია) */
export const RICH_TEXT_MAX = 20000

/** ჩანიშვნის ზღვარი — backend-ის `RichText::NOTE_MAX` */
export const NOTE_TEXT_MAX = 5000

/** რედაქტორის სიმაღლის ქვედა ზღვარი — `text-sm`-ის ხაზი (1.25rem) × სტრიქონები + პადინგი */
export function richTextMinHeight(rows: number): CSSProperties {
  return { '--rt-min': `${rows * 1.25 + 1}rem` } as CSSProperties
}

/** ახალი, ერთნაირად აწყობილი წამკითხველი — ⚠️ TipTap თავის ასლს ცვლის (`use`), ამიტომ საერთო არ არის */
export function createMarked(): Marked {
  return new Marked({
    gfm: true,
    breaks: true,
    tokenizer: {
      lheading: () => undefined,
      code: () => undefined,
      html: () => undefined,
      tag: () => undefined,
    },
  })
}

const reader = createMarked()

export function markdownTokens(text: string): Token[] {
  return reader.lexer(text)
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** HTML-ის ერთეულები ტექსტში (`&nbsp;` — TipTap-ის ცარიელი აბზაცი, `&amp;` …) */
export function decodeEntities(s: string): string {
  return s.replace(/&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? whole
    const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
  })
}

/**
 * Markdown → უბრალო ტექსტი: სიებისა და ბარათების წინასწარი ხედი (`line-clamp`)
 * და ჩანიშვნების ძებნა. ბლოკები ახალი ხაზით იყოფა, ფორმატი ქრება.
 */
export function plainText(markdown: string | null | undefined): string {
  if (!markdown) return ''
  return blocksText(markdownTokens(markdown))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function blocksText(tokens: Token[]): string {
  return tokens.map(blockText).filter(Boolean).join('\n')
}

function blockText(token: Token): string {
  switch (token.type) {
    case 'space':
    case 'hr':
    case 'def':
      return ''
    case 'list':
      return (token as Tokens.List).items.map((item) => blocksText(item.tokens)).join('\n')
    case 'blockquote':
      return blocksText((token as Tokens.Blockquote).tokens)
    case 'code':
      return (token as Tokens.Code).text
    case 'table': {
      const table = token as Tokens.Table
      return [table.header, ...table.rows].map((row) => row.map((cell) => inlineText(cell.tokens)).join(' · ')).join('\n')
    }
    default:
      return 'tokens' in token && token.tokens ? inlineText(token.tokens) : decodeEntities(token.raw)
  }
}

function inlineText(tokens: Token[]): string {
  return tokens
    .map((token) => {
      switch (token.type) {
        case 'br':
          return '\n'
        case 'codespan':
        case 'escape':
        case 'image':
          return (token as Tokens.Codespan).text
        default:
          return 'tokens' in token && token.tokens?.length
            ? inlineText(token.tokens)
            : decodeEntities('text' in token ? String(token.text) : token.raw)
      }
    })
    .join('')
}

/* ============================================================
   **ჩასმა** — „ფორმატი რჩება" (47.2).

   ⚠️ ProseMirror HTML-ის ტექსტში ჩაწერილ `\n`-ს **ჰარად** აქცევს — ხაზის
   გადატანა მისთვის მხოლოდ ელემენტია (`<p>`, `<br>` …). YouTube-ის აღწერა კი
   ზუსტად ასეა აწყობილი: span-ები `white-space: pre-wrap`-ით და შიგ `\n`.
   ორი გზა ორ შემთხვევაზე:

   - `keepLineBreaks()` — HTML-ს ასეთი სტილის ელემენტში `\n` → `<br>` (Chrome
     ასლს გამოთვლილ სტილს უწერს), ბმულები და სქელი ადგილზე რჩება;
   - `pasteAsMarkdown()` — სტილი თუ არ ჩანს და HTML-ს ხაზის არც ერთი ელემენტი
     არ აქვს (Firefox), ან ბუფერში მხოლოდ ტექსტია — ტექსტი Markdown-ად
     იკითხება: ახალი ხაზები და შიშველი ბმულები ორივე რჩება.
   ============================================================ */

const PRE_WHITESPACE = /white-space:\s*(pre|pre-wrap|pre-line|break-spaces)\b/i
const LINE_ELEMENTS = /<(p|div|li|h[1-6]|br|tr|pre|blockquote)\b/i

/** ბუფერის ტექსტი Markdown-ად წავიკითხოთ, თუ HTML-ს ხაზები დაეკარგება? */
export function pasteAsMarkdown(html: string, text: string): boolean {
  if (!text.trim()) return false
  if (!html.trim()) return true
  return text.includes('\n') && !LINE_ELEMENTS.test(html) && !PRE_WHITESPACE.test(html)
}

/** `white-space: pre*`-იანი ელემენტის ტექსტში `\n` → `<br>` */
export function keepLineBreaks(html: string): string {
  if (!html.includes('\n') || !PRE_WHITESPACE.test(html)) return html

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  const texts: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if ((node as Text).data.includes('\n') && preformatted(node.parentElement)) texts.push(node as Text)
  }
  if (!texts.length) return html

  for (const node of texts) {
    const parts = node.data.split('\n')
    const pieces = parts.flatMap((part, i) => (i ? [doc.createElement('br'), doc.createTextNode(part)] : [doc.createTextNode(part)]))
    node.replaceWith(...pieces)
  }
  return doc.body.innerHTML
}

function preformatted(el: Element | null): boolean {
  for (let node = el; node && node.tagName !== 'BODY'; node = node.parentElement) {
    if (PRE_WHITESPACE.test(node.getAttribute('style') ?? '')) return true
  }
  return false
}
