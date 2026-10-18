import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Markdown } from '@/components/ui/markdown'
import { RichText } from '@/components/ui/rich-text'
import { keepLineBreaks, pasteAsMarkdown, plainText } from '@/lib/richText'
import i18n from '@/i18n'

/* ============================================================
   **ფორმატიანი ტექსტი**.

   მოწმდება: ჩვენება (სქელი, სია, სათაური, ბმული ახალ ჩანართში) და მისი
   უსაფრთხოება (`<script>`/`onerror`/`javascript:` ტექსტად რჩება); ძველი
   უბრალო ტექსტი (ახალი ხაზები, „-----", შეწეული ხაზი) უცვლელად ჩანს;
   უბრალო ტექსტი ბარათისთვის; ჩასმის წესები; რედაქტორი — Markdown-ით
   ჩატვირთვა ცვლილების გარეშე, ჩასმა (ახალი ხაზები, შიშველი ბმული, `_`
   გაქცევის გარეშე), ზოლის „სქელი", „გაშლა" და ზღვრის მთვლელი.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// ⚠️ jsdom-ს განლაგება არ აქვს — ProseMirror კურსორის კოორდინატებს ამ მეთოდებით ითვლის
beforeAll(() => {
  const rect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) })
  Range.prototype.getBoundingClientRect = rect as unknown as Range['getBoundingClientRect']
  Range.prototype.getClientRects = (() => []) as unknown as Range['getClientRects']
  document.elementFromPoint = () => null
})

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function render(node: ReturnType<typeof h>) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(node))
  return container
}

/* ---------- ჩვენება ---------- */

describe('Markdown (display)', () => {
  it('draws formatting: bold, italics, lists, a heading below the page title, quotes, code', async () => {
    const box = await render(
      h(Markdown, { text: '## Plot\n\n**Bold** and *soft*\n\n- one\n- two\n\n1. first\n\n> quoted\n\nuse `npm`' }),
    )
    expect(box.querySelector('h4')?.textContent).toBe('Plot')
    expect(box.querySelector('strong')?.textContent).toBe('Bold')
    expect(box.querySelector('em')?.textContent).toBe('soft')
    expect([...box.querySelectorAll('ul li')].map((li) => li.textContent)).toEqual(['one', 'two'])
    expect(box.querySelector('ol li')?.textContent).toBe('first')
    expect(box.querySelector('blockquote')?.textContent).toBe('quoted')
    expect(box.querySelector('code')?.textContent).toBe('npm')
  })

  it('opens links in a new tab and turns bare addresses into links', async () => {
    const box = await render(h(Markdown, { text: 'See [docs](https://laravel.com/docs) or https://youtu.be/abc_d' }))
    const links = [...box.querySelectorAll('a')]
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://laravel.com/docs', 'https://youtu.be/abc_d'])
    expect(links.every((a) => a.target === '_blank' && a.rel === 'noopener noreferrer')).toBe(true)
  })

  it('keeps scripts, event handlers and javascript: links as plain text', async () => {
    const box = await render(
      h(Markdown, { text: '<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">\n\n[click](javascript:alert(3))' }),
    )
    expect(box.querySelector('script')).toBeNull()
    expect(box.querySelector('img')).toBeNull()
    expect(box.querySelector('a')).toBeNull()
    expect(box.querySelector('[onerror]')).toBeNull()
    expect(box.textContent).toContain('<script>alert(1)</script>')
    expect(box.textContent).toContain('click')
  })

  it('shows old plain text unchanged: line breaks, a dashed separator, an indented line', async () => {
    const box = await render(h(Markdown, { text: 'Line one\nLine two\nTitle\n-----\n    indented line' }))
    expect(box.querySelector('p')?.innerHTML).toBe('Line one<br>Line two')
    expect(box.querySelector('h3, h4, h5, h6')).toBeNull()
    expect(box.querySelector('pre')).toBeNull()
    expect(box.querySelector('hr')).not.toBeNull()
    expect(box.textContent).toContain('indented line')
  })
})

describe('plainText (cards, note search)', () => {
  it('drops the formatting and keeps the words', () => {
    expect(plainText('**Bold** _soft_ [docs](https://x.dev) `code` &amp; more')).toBe('Bold soft docs code & more')
    expect(plainText('## Title\n\n- one\n- two')).toBe('Title\none\ntwo')
    expect(plainText(null)).toBe('')
  })
})

describe('paste rules', () => {
  it('reads plain text as Markdown, and flat HTML too when its line breaks would be lost', () => {
    expect(pasteAsMarkdown('', 'a\nb')).toBe(true)
    expect(pasteAsMarkdown('<span>a\nb</span>', 'a\nb')).toBe(true)
    expect(pasteAsMarkdown('<p>a</p><p>b</p>', 'a\nb')).toBe(false)
    expect(pasteAsMarkdown('<span style="white-space: pre-wrap">a\nb</span>', 'a\nb')).toBe(false)
  })

  it('turns newlines of pre-wrap text (a YouTube description) into line breaks and keeps its links', () => {
    const html = '<span style="white-space: pre-wrap;">One\nTwo <a href="https://x.dev">x.dev</a></span>'
    const out = keepLineBreaks(html)
    expect(out).toContain('One<br>Two')
    expect(out).toContain('href="https://x.dev"')
    expect(keepLineBreaks('<p>one\ntwo</p>')).toBe('<p>one\ntwo</p>')
  })
})

/* ---------- რედაქტორი ---------- */

async function mountEditor(initial: string, props: Record<string, unknown> = {}) {
  const onChange = vi.fn()

  function Harness() {
    const [value, setValue] = useState(initial)
    return h(RichText, {
      id: 'rt',
      label: 'Description',
      value,
      onChange: (v: string) => {
        setValue(v)
        onChange(v)
      },
      ...props,
    })
  }

  await render(h(Harness))
  // ზარმაცი ჩატვირთვა — სანამ ProseMirror არ გამოჩნდება
  for (let i = 0; i < 50 && !document.querySelector('#rt.ProseMirror'); i++) {
    await act(async () => new Promise((r) => setTimeout(r, 10)))
  }
  const editable = document.querySelector<HTMLElement>('#rt.ProseMirror')
  expect(editable).not.toBeNull()
  return { editable: editable!, onChange }
}

function button(label: string) {
  return document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
}

async function pasteText(target: HTMLElement, text: string, html = '') {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown }
  event.clipboardData = {
    getData: (type: string) => (type === 'text/plain' ? text : type === 'text/html' ? html : ''),
    types: html ? ['text/plain', 'text/html'] : ['text/plain'],
    files: [],
    items: [],
  }
  await act(async () => {
    target.dispatchEvent(event)
  })
}

describe('RichText (editor)', () => {
  it('loads Markdown as formatting and does not rewrite an untouched text', async () => {
    const { editable, onChange } = await mountEditor('Hello **world**\nsecond line')
    expect(editable.querySelector('strong')?.textContent).toBe('world')
    expect(editable.querySelector('br')).not.toBeNull()
    expect(document.querySelector('[role="toolbar"]')).not.toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('pasted text keeps its new lines and bare links, without escaping', async () => {
    const { editable, onChange } = await mountEditor('')
    await pasteText(editable, 'Line one\nhttps://example.com/a_b')
    expect(onChange).toHaveBeenLastCalledWith('Line one\nhttps://example.com/a_b')
    expect(editable.querySelector('a')?.getAttribute('href')).toBe('https://example.com/a_b')
  })

  it('an edit at the end leaves the rest of a YouTube description byte for byte', async () => {
    const text =
      'Official video\nListen: https://lnk.to/a_b?x=1&y=2\nwww.example.com · mail@example.com\n\n' +
      '- Track one\n- Track two\n\n**Credits** — snake_case & more'
    const { editable, onChange } = await mountEditor(text)
    // კურსორი ტექსტის ბოლოს — ProseMirror DOM-ის მონიშვნას ფოკუსიან რედაქტორში კითხულობს
    await act(async () => {
      editable.focus()
      const selection = document.getSelection()!
      selection.selectAllChildren(editable)
      selection.collapseToEnd()
      document.dispatchEvent(new Event('selectionchange'))
      await new Promise((r) => setTimeout(r, 30))
    })
    await pasteText(editable, '!')
    expect(onChange).toHaveBeenLastCalledWith(`${text}!`)
  })

  it('the toolbar makes the selection bold', async () => {
    const { editable, onChange } = await mountEditor('plain words')
    await act(async () => {
      editable.focus()
      editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }))
    })
    await act(async () => button(i18n.t('richText.bold')).click())
    expect(onChange).toHaveBeenLastCalledWith('**plain words**')
  })

  it('expands to the full window and comes back', async () => {
    await mountEditor('text')
    await act(async () => button(i18n.t('richText.expand')).click())
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.querySelector('#rt.ProseMirror')).not.toBeNull()
    expect(dialog?.textContent).toContain('Description')

    await act(async () => (dialog!.querySelector(`button[aria-label="${i18n.t('richText.collapse')}"]`) as HTMLButtonElement).click())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(container!.querySelector('#rt.ProseMirror')).not.toBeNull()
  })

  it('shows the counter only near the limit', async () => {
    await mountEditor('x'.repeat(50), { maxLength: 100 })
    expect(document.querySelector('[data-testid="rich-text-counter"]')).toBeNull()
    act(() => root?.unmount())
    container?.remove()

    await mountEditor('x'.repeat(90), { maxLength: 100 })
    expect(document.querySelector('[data-testid="rich-text-counter"]')?.textContent).toContain('90')
  })
})
