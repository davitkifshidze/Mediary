import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import HardBreak from '@tiptap/extension-hard-break'
import Link from '@tiptap/extension-link'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import { Slice } from '@tiptap/pm/model'
import type { marked } from 'marked'
import { Bold, Check, Code, Heading, Italic, Link2, List, ListOrdered, Maximize2, Minimize2, Minus, Quote, Unlink } from 'lucide-react'
import { FORM_TEXT_ROWS } from '@/components/ui/form-layout'
import { ModalShell } from '@/components/ui/modal-shell'
import type { RichTextProps } from '@/components/ui/rich-text'
import { LAYER_POPUP } from '@/lib/layers'
import { createMarked, keepLineBreaks, pasteAsMarkdown, richTextMinHeight } from '@/lib/richText'
import { cn } from '@/lib/utils'

/* ============================================================
   **TipTap-ის რედაქტორი** (Tasks §47.2) — `ui/rich-text.tsx`-ი მას ზარმაცად
   ტვირთავს. წერისას სქელი, სიები და ბმულები ჩანს (და არა `**`), ინახება კი
   Markdown-ის სტრიქონი.

   ⚠️ **ტექსტი გაქცევის გარეშე იწერება.** TipTap ჩვეულებრივ `_`-ს `\_`-ად,
   `&`-ს `&amp;`-ად წერს — მაშინ „snake_case"-ის ან „A&B"-ის ძებნა ბაზაში
   აღარ იპოვიდა (Q12: „ძებნა არ ფუჭდება"), CSV-ს კი ხმაური მოემატებოდა.
   ფასი: ხელით აკრეფილი `*x*` ჩვენებაზე დახრილად წაიკითხება — ზუსტად ის, რაც
   „Markdown ტექსტად"-ს ნიშნავს.
   ⚠️ **ხაზის გადატანა `\n`-ია** (და არა „  \n") და **შიშველი ბმული
   შიშველად რჩება** (და არა `[url](url)`) — ძველი უბრალო ტექსტი რედაქტირების
   შემდეგაც უბრალო ტექსტს ჰგავს და ზღვარს ორმაგი მისამართები არ ჭამს.
   ⚠️ **გარედან მოსული ღირებულება** (ფორმის ჩატვირთვა, ბმულიდან აღწერის
   შევსება) რედაქტორში `emitUpdate: false`-ით ჯდება — უცვლელი ტექსტი ხელახლა
   არ იწერება, ე.ი. გაუხსნელი ძველი აღწერა ბაიტამდე იგივე რჩება.
   ============================================================ */

/** ხაზის გადატანა `\n`-ად — ჩვენება `breaks`-ითაა */
const LineBreak = HardBreak.extend({ renderMarkdown: () => '\n' })

/**
 * შიშველი ბმული (ტექსტი = მისამართი, `www.…`, ელფოსტა) შიშველად — GFM მას
 * წაკითხვისას ისევ ბმულად ცნობს. ⚠️ mark-ი შიგთავსის ნაცვლად ჩანაცვლებით
 * (placeholder) იხატება, ნამდვილი ტექსტი `ctx.meta.markText`-შია.
 */
const BareLink = Link.extend({
  renderMarkdown(node, helpers, ctx) {
    const href = String(node.attrs?.href ?? '')
    const text = String(ctx.meta?.markText ?? '')
    const bare =
      (/^https?:\/\/\S+$/.test(href) && text === href) ||
      (/^www\.\S+$/.test(text) && href === `http://${text}`) ||
      (/^\S+@\S+$/.test(text) && href === `mailto:${text}`)
    if (bare) return helpers.renderChildren(node)
    return this.parent?.(node, helpers, ctx) ?? ''
  },
})

/** Markdown — ტექსტი გაქცევის გარეშე (იხ. ზემოთ) */
const RawMarkdown = Markdown.extend({
  onBeforeCreate(event) {
    this.parent?.(event)
    const manager = this.storage.manager as unknown as { encodeTextForMarkdown: (text: string) => string }
    manager.encodeTextForMarkdown = (text: string) => text
  },
})

function extensions(placeholder: string) {
  return [
    StarterKit.configure({ hardBreak: false, link: false, underline: false, trailingNode: false }),
    LineBreak,
    BareLink.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: 'https',
      HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
    }),
    Placeholder.configure({ placeholder }),
    RawMarkdown.configure({ marked: createMarked() as unknown as typeof marked }),
  ]
}

/** ცარიელი დოკუმენტი ცარიელ სტრიქონად (და არა `&nbsp;`-ად) */
function markdownOf(editor: Editor): string {
  return editor.isEmpty ? '' : editor.getMarkdown()
}

export default function RichTextEditor({ id, value, onChange, placeholder, maxLength, rows, label, autoFocus }: RichTextProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  // ⚠️ ბოლოს დაწერილი/მიღებული ტექსტი — გარედან მოსული `value` მხოლოდ მაშინ ჯდება, როცა სხვაა
  const last = useRef(value)
  const initial = useRef(value).current
  const change = useRef(onChange)
  change.current = onChange
  const editorRef = useRef<Editor | null>(null)

  const editorProps = useMemo(
    () => ({
      attributes: {
        id,
        class: 'fb-markdown fb-rich-text-body text-sm',
        role: 'textbox',
        'aria-multiline': 'true',
        ...(label ? { 'aria-label': label } : {}),
      },
      transformPastedHTML: keepLineBreaks,
      handlePaste: (view: Editor['view'], event: ClipboardEvent) => {
        const html = event.clipboardData?.getData('text/html') ?? ''
        const text = event.clipboardData?.getData('text/plain') ?? ''
        const { selection } = view.state
        // კოდში — ტექსტი ტექსტად; მონიშნულზე ჩასმული მისამართი — ბმული (`linkOnPaste`)
        if (selection.$from.parent.type.spec.code) return false
        if (!selection.empty && /^\s*https?:\/\/\S+\s*$/.test(text)) return false
        const markdown = editorRef.current?.markdown
        if (!pasteAsMarkdown(html, text) || !markdown) return false
        /* ⚠️ ღია ნაჭერი (`maxOpen`): პირველი და ბოლო აბზაცი არსებულ ხაზს ერწყმის —
           `insertContent` დახურულ აბზაცს სვამდა და სიტყვის ჩასმა ხაზს ორად ყოფდა. */
        const doc = view.state.schema.nodeFromJSON(markdown.parse(text))
        view.dispatch(view.state.tr.replaceSelection(Slice.maxOpen(doc.content)).scrollIntoView().setMeta('uiEvent', 'paste'))
        return true
      },
    }),
    [id, label],
  )

  const editor = useEditor({
    extensions: useMemo(() => extensions(placeholder ?? ''), [placeholder]),
    content: initial,
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    editorProps,
    onUpdate: ({ editor: ed }) => {
      const md = markdownOf(ed)
      last.current = md
      change.current(md)
    },
  })
  editorRef.current = editor

  useEffect(() => {
    if (!editor || value === last.current) return
    last.current = value
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
  }, [editor, value])

  const collapse = () => {
    setExpanded(false)
    // ფორმაში დაბრუნებისას კურსორი იქვე რჩება
    requestAnimationFrame(() => {
      if (editor && !editor.isDestroyed) editor.commands.focus()
    })
  }

  const counter =
    maxLength && value.length >= maxLength * 0.8 ? (
      <div
        className={cn(
          'px-3 pb-1.5 text-right text-xs tabular-nums',
          value.length > maxLength ? 'text-destructive' : 'text-muted-foreground',
        )}
        data-testid="rich-text-counter"
      >
        {t('richText.counter', { used: value.length.toLocaleString(), max: maxLength.toLocaleString() })}
      </div>
    ) : null

  const toolbar = (full: boolean) => (
    <Toolbar editor={editor}>
      <ToolButton
        label={full ? t('richText.collapse') : t('richText.expand')}
        onClick={() => (full ? collapse() : setExpanded(true))}
        className="ml-auto"
      >
        {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </ToolButton>
    </Toolbar>
  )

  return (
    <>
      <div className="fb-rich-text rounded-md border border-border bg-card shadow-sm" style={richTextMinHeight(rows ?? FORM_TEXT_ROWS)}>
        {toolbar(false)}
        {expanded ? <div className="fb-rich-text-body" aria-hidden="true" /> : <EditorContent editor={editor} />}
        {counter}
      </div>

      {expanded && (
        <ModalShell title={label ?? t('richText.title')} size="full" fill onClose={collapse}>
          <div className="fb-rich-text fb-rich-text--full flex min-h-0 flex-1 flex-col rounded-md border border-border bg-card shadow-sm">
            {toolbar(true)}
            <EditorContent editor={editor} className="min-h-0 flex-1 overflow-y-auto" />
            {counter}
          </div>
        </ModalShell>
      )}
    </>
  )
}

/* ---------- ზოლი ---------- */

function Toolbar({ editor, children }: { editor: Editor | null; children: ReactNode }) {
  const { t } = useTranslation()
  const on = useEditorState({
    editor,
    selector: ({ editor: ed }) =>
      ed
        ? {
            bold: ed.isActive('bold'),
            italic: ed.isActive('italic'),
            heading: ed.isActive('heading'),
            bullet: ed.isActive('bulletList'),
            ordered: ed.isActive('orderedList'),
            quote: ed.isActive('blockquote'),
            code: ed.isActive('code'),
            link: ed.isActive('link'),
          }
        : null,
  })

  if (!editor) return <div className="h-9 border-b border-border" />
  const chain = () => editor.chain().focus()

  return (
    <div role="toolbar" aria-label={t('richText.toolbar')} className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-0.5">
      <ToolButton label={t('richText.bold')} active={on?.bold} onClick={() => chain().toggleBold().run()}>
        <Bold className="size-4" />
      </ToolButton>
      <ToolButton label={t('richText.italic')} active={on?.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic className="size-4" />
      </ToolButton>
      <ToolButton label={t('richText.heading')} active={on?.heading} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
        <Heading className="size-4" />
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      <ToolButton label={t('richText.bulletList')} active={on?.bullet} onClick={() => chain().toggleBulletList().run()}>
        <List className="size-4" />
      </ToolButton>
      <ToolButton label={t('richText.orderedList')} active={on?.ordered} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered className="size-4" />
      </ToolButton>
      <ToolButton label={t('richText.quote')} active={on?.quote} onClick={() => chain().toggleBlockquote().run()}>
        <Quote className="size-4" />
      </ToolButton>
      <ToolButton label={t('richText.code')} active={on?.code} onClick={() => chain().toggleCode().run()}>
        <Code className="size-4" />
      </ToolButton>
      <ToolButton label={t('richText.rule')} onClick={() => chain().setHorizontalRule().run()}>
        <Minus className="size-4" />
      </ToolButton>
      <LinkButton editor={editor} active={!!on?.link} />
      {children}
    </div>
  )
}

function ToolButton({
  label,
  active,
  onClick,
  className,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      // ⚠️ `mousedown`-ზე ფოკუსი რედაქტორში რჩება — მონიშვნა არ იკარგება
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'grid size-8 shrink-0 cursor-pointer place-items-center rounded-md transition-colors',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** ბმული — მისამართის ველი პატარა ფანჯარაში; მონიშნულ ტექსტს ბმულად აქცევს, ცარიელ ადგილას მისამართს ჩასვამს */
function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [href, setHref] = useState('')

  const openChange = (next: boolean) => {
    if (next) setHref(String(editor.getAttributes('link').href ?? ''))
    setOpen(next)
  }

  const apply = () => {
    const url = href.trim()
    setOpen(false)
    if (!url) return
    const full = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`
    const chain = editor.chain().focus()
    if (editor.state.selection.empty && !active) {
      chain.insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: full } }] }).run()
    } else {
      chain.extendMarkRange('link').setLink({ href: full }).run()
    }
  }

  const remove = () => {
    setOpen(false)
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={openChange}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={t('richText.link')}
          title={t('richText.link')}
          aria-pressed={active}
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            'grid size-8 shrink-0 cursor-pointer place-items-center rounded-md transition-colors',
            active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Link2 className="size-4" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className={cn(LAYER_POPUP, 'flex w-80 max-w-[90vw] items-center gap-1.5 rounded-md border border-border bg-popover p-1.5 text-popover-foreground shadow-md')}
        >
          <input
            type="url"
            autoFocus
            aria-label={t('richText.linkUrl')}
            placeholder="https://"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              apply()
            }}
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-sm outline-none"
          />
          <button
            type="button"
            aria-label={t('richText.linkApply')}
            title={t('richText.linkApply')}
            disabled={!href.trim()}
            onClick={apply}
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check className="size-4" />
          </button>
          {active && (
            <button
              type="button"
              aria-label={t('richText.linkRemove')}
              title={t('richText.linkRemove')}
              onClick={remove}
              className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:text-destructive"
            >
              <Unlink className="size-4" />
            </button>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
