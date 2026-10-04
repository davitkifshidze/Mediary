import { Fragment, useMemo, type ReactNode } from 'react'
import type { Token, Tokens } from 'marked'
import { decodeEntities, markdownTokens } from '@/lib/richText'
import { cn } from '@/lib/utils'

/* ============================================================
   **ფორმატიანი ტექსტის ჩვენება** (Tasks §47.3) — აღწერა, ჩანაწერის
   ტექსტი, ჩანიშვნა ყველა დეტალში.

   ⚠️ **HTML არ იწერება — ტოკენები React-ის ელემენტებად იხატება.** `marked`
   HTML-საც აგებს, მაგრამ `dangerouslySetInnerHTML` გამწმენდს (DOMPurify)
   მოითხოვდა; აქ ხე თვითონ იხატება, ე.ი. დაშვებული ელემენტების გარდა
   არაფერი გამოდის: ტექსტში ჩაწერილი `<script>` ან `<img onerror>` **ტექსტად**
   ჩანს — ზუსტად ისე, როგორც უბრალო ტექსტის დროს ჩანდა.

   ⚠️ ბმული — მხოლოდ http(s)/mailto/tel, ახალ ჩანართში, `rel="noopener
   noreferrer"`; სხვა სქემა (`javascript:` …) ბმული აღარაა, მხოლოდ ტექსტი.
   ⚠️ სურათი არ იტვირთება (უცხო სერვერი ნახვას დაითვლიდა) — მისი სახელი ბმულია.
   ⚠️ სათაური გვერდის სათაურზე დაბლაა: `#` → h3, `##` → h4 …
   ============================================================ */

export function Markdown({ text, className }: { text: string; className?: string }) {
  const tokens = useMemo(() => markdownTokens(text), [text])
  return (
    <div className={cn('fb-markdown', className)} data-testid="markdown">
      {tokens.map(block)}
    </div>
  )
}

const SAFE_HREF = /^(https?:|mailto:|tel:)/i

function safeHref(href: string | null | undefined): string | null {
  const url = (href ?? '').trim()
  return SAFE_HREF.test(url) ? url : null
}

function block(token: Token, key: number): ReactNode {
  switch (token.type) {
    case 'space':
    case 'def':
      return null
    case 'paragraph':
      return <p key={key}>{inline((token as Tokens.Paragraph).tokens)}</p>
    case 'heading': {
      const heading = token as Tokens.Heading
      const Tag = `h${Math.min(6, heading.depth + 2)}` as 'h3'
      return <Tag key={key}>{inline(heading.tokens)}</Tag>
    }
    case 'list': {
      const list = token as Tokens.List
      const items = list.items.map((item, i) => <li key={i}>{listItem(item, list.loose)}</li>)
      return list.ordered ? (
        <ol key={key} start={typeof list.start === 'number' && list.start !== 1 ? list.start : undefined}>
          {items}
        </ol>
      ) : (
        <ul key={key}>{items}</ul>
      )
    }
    case 'blockquote':
      return <blockquote key={key}>{(token as Tokens.Blockquote).tokens.map(block)}</blockquote>
    case 'code':
      return (
        <pre key={key}>
          <code>{(token as Tokens.Code).text}</code>
        </pre>
      )
    case 'hr':
      return <hr key={key} />
    case 'table':
      return table(token as Tokens.Table, key)
    case 'text':
      return <p key={key}>{'tokens' in token && token.tokens ? inline(token.tokens) : decodeEntities(token.raw)}</p>
    default:
      // უცნობი ბლოკი — ტექსტად (HTML-ს წამკითხველი საერთოდ არ ცნობს, `createMarked`)
      return token.raw.trim() ? <p key={key}>{token.raw.trim()}</p> : null
  }
}

/** მჭიდრო სიის პუნქტი აბზაცის გარეშე იხატება (`text`), ფართო — ბლოკებად */
function listItem(item: Tokens.ListItem, loose: boolean): ReactNode {
  return item.tokens.map((token, i) =>
    token.type === 'text' && !loose ? <Fragment key={i}>{inline((token as Tokens.Text).tokens ?? [])}</Fragment> : block(token, i),
  )
}

function table(t: Tokens.Table, key: number): ReactNode {
  return (
    <table key={key}>
      <thead>
        <tr>
          {t.header.map((cell, i) => (
            <th key={i}>{inline(cell.tokens)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {t.rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, i) => (
              <td key={i}>{inline(cell.tokens)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function inline(tokens: Token[] | undefined): ReactNode[] {
  return (tokens ?? []).map((token, i) => {
    switch (token.type) {
      case 'strong':
        return <strong key={i}>{inline((token as Tokens.Strong).tokens)}</strong>
      case 'em':
        return <em key={i}>{inline((token as Tokens.Em).tokens)}</em>
      case 'del':
        return <del key={i}>{inline((token as Tokens.Del).tokens)}</del>
      case 'codespan':
        return <code key={i}>{(token as Tokens.Codespan).text}</code>
      case 'br':
        return <br key={i} />
      case 'link':
      case 'image': {
        const link = token as Tokens.Link | Tokens.Image
        const href = safeHref(link.href)
        const children = token.type === 'link' ? inline((token as Tokens.Link).tokens) : link.text || link.href
        return href ? (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ) : (
          <Fragment key={i}>{children}</Fragment>
        )
      }
      case 'escape':
        return <Fragment key={i}>{(token as Tokens.Escape).text}</Fragment>
      case 'checkbox':
        return <Fragment key={i}>{(token as Tokens.Checkbox).checked ? '☑ ' : '☐ '}</Fragment>
      default:
        return 'tokens' in token && token.tokens?.length ? (
          <Fragment key={i}>{inline(token.tokens)}</Fragment>
        ) : (
          <Fragment key={i}>{decodeEntities('text' in token ? String(token.text) : token.raw)}</Fragment>
        )
    }
  })
}
