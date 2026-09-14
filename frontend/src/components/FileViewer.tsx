import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FileQuestion, Loader2, Trash2 } from 'lucide-react'
import { usePrivateFileUrl } from '@/components/PrivateFile'
import { ModalShell } from '@/components/ui/modal-shell'
import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/utils'

/* ============================================================
   **ატვირთული ფაილის ონლაინ მნახველი (2026-09-14).**

   ⚠️ აქამდე დოკუმენტისა და ვიდეოს ერთადერთი გზა **ჩამოტვირთვა** იყო: 200 KB
   PDF-ის სანახავადაც კი ფაილი დისკზე უნდა ჩამოგეწერა და გარე პროგრამას
   გაეხსნა. ახლა თითოეულ ფაილს თავისი მნახველი აქვს, **ჩამოტვირთვა და წაშლა კი
   იქვეა** — სამივე ერთ ადგილას.

   ⚠️ **სახეობას `mime` წყვეტს და არა გაფართოება** (`kindOf`): სახელი შეიძლება
   საერთოდ არ ჰქონდეს (`7de61952-…jpg`-ც კი სერვერის სახელია), `mime` კი
   ატვირთვისას ჩაიწერა. გაფართოება მხოლოდ სათადარიგო გზაა.

   ⚠️ **პრივატული დისკი blob-ად იკითხება** (`usePrivateFileUrl`) — `/storage/*`
   მას ვერ ხედავს (§17.5), ე.ი. `<iframe src="/storage/…">` ცარიელი გამოვიდოდა.
   ერთი და იგივე კომპონენტი ორივე დისკს ემსახურება: `private` დროშა
   **backend-ის სათქმელია** და არა ფრონტის გამოსაცნობი.

   ⚠️ **რასაც ბრაუზერი ვერ ხსნის, ღიად ითქმება** — „ამ ფორმატს ონლაინ ვერ
   ვაჩვენებ, ჩამოტვირთე" — და არა ცარიელი შავი კვადრატი (`platform === 'other'`-ის
   წესი პლეიერიდან).
   ============================================================ */

export interface ViewableFile {
  id: number
  /** API-ს გზა (`/note-files/12`) ან საჯარო URL */
  url: string
  name?: string | null
  mime?: string | null
  size?: number | null
  /** ⚠️ პრივატულ დისკზეა თუ არა — backend-ის სათქმელი (§17.5) */
  private?: boolean
}

type Kind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'other'

/** `mime` პირველი, გაფართოება — სათადარიგო */
export function kindOf(file: ViewableFile): Kind {
  const mime = (file.mime ?? '').toLowerCase()

  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('text/') || mime === 'application/json') return 'text'

  const ext = (file.name ?? file.url).split('.').pop()?.toLowerCase() ?? ''

  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'ogv', 'mov', 'm4v'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) return 'audio'
  if (ext === 'pdf') return 'pdf'
  if (['txt', 'csv', 'md', 'log', 'json'].includes(ext)) return 'text'

  return 'other'
}

/** ბრაუზერში ნაჩვენები სახეობები — დანარჩენზე მხოლოდ ჩამოტვირთვაა */
export function canPreview(file: ViewableFile): boolean {
  return kindOf(file) !== 'other'
}

export function FileViewer({
  file,
  onClose,
  onDelete,
}: {
  file: ViewableFile
  onClose: () => void
  /** არ არის — მნახველი მხოლოდ კითხვადია (მაგ. სხვისი ფაილი) */
  onDelete?: () => void
}) {
  const { t } = useTranslation()

  /* ⚠️ პრივატულზე blob სჭირდება, საჯაროზე — პირდაპირი URL. hook ყოველთვის
     გამოიძახება (პირობითი hook რიგს გატეხდა), უბრალოდ `null`-ს იღებს. */
  const blob = usePrivateFileUrl(file.private ? file.url : null)
  const src = file.private ? blob.url : file.url
  const kind = kindOf(file)

  return (
    /* ⚠️ **`size="full"` და არა `wide`** (შენი მითითება, 2026-09-14): დოკუმენტის
       მნახველი იმ მოდალზე ვიწრო იყო, რომლიდანაც იხსნებოდა — ე.ი. PDF და ვიდეო
       უკანა ფანჯარაზე პატარა კვადრატში იჭყლიტებოდა.
       ⚠️ „უკან" ისარი აქ **არ გადაეცემა** — `ModalShell` მას თვითონ ხატავს,
       როცა დასტაში ქვემოთ სხვა მოდალია (დეტალის ფანჯარა). */
    <ModalShell title={file.name ?? t('files.viewerTitle')} onClose={onClose} size="full">
      <p className="mt-1 text-xs text-muted-foreground">
        {[file.mime, file.size ? formatBytes(file.size) : null].filter(Boolean).join(' · ')}
      </p>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-muted/30">
        {file.private && blob.loading && (
          <p className="grid h-64 place-items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </p>
        )}

        {file.private && blob.failed && (
          <p className="grid h-64 place-items-center px-6 text-center text-sm text-muted-foreground">
            {t('files.viewerFailed')}
          </p>
        )}

        {src && kind === 'image' && (
          <img src={src} alt={file.name ?? ''} className="max-h-[74vh] w-full object-contain" />
        )}

        {/* ⚠️ `controls` და არა ავტოგაშვება — ეს ბიბლიოთეკის პლეიერი არაა,
            აქ ფაილს უბრალოდ ათვალიერებ */}
        {src && kind === 'video' && (
          <video src={src} controls className="max-h-[74vh] w-full bg-black" />
        )}

        {src && kind === 'audio' && (
          <div className="p-6">
            <audio src={src} controls className="w-full" />
          </div>
        )}

        {/* ⚠️ PDF-ს და ტექსტს ბრაუზერის საკუთარი მნახველი ხსნის — ბიბლიოთეკა
            (pdf.js და მისთანები) **განზრახ არ დაემატა**: ~300 kB-ს დაამატებდა
            იმას, რასაც ყველა თანამედროვე ბრაუზერი ისედაც აკეთებს. */}
        {src && (kind === 'pdf' || kind === 'text') && (
          <iframe src={src} title={file.name ?? 'file'} className="h-[74vh] w-full bg-background" />
        )}

        {kind === 'other' && (
          <div className="grid h-64 place-items-center px-6 text-center">
            <div>
              <FileQuestion className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">{t('files.viewerUnsupported')}</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {onDelete ? (
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
            {t('actions.delete')}
          </Button>
        ) : (
          <span />
        )}

        {/* ⚠️ ჩამოტვირთვა **იმავე blob-იდან** — მეორე რექვესთი ზედმეტია და
            პრივატულზე `/storage/*`-ის ბმული ისედაც არ იმუშავებდა */}
        <a
          href={src ?? undefined}
          download={file.name ?? true}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3.5 py-2 text-sm font-medium transition-colors hover:bg-muted aria-disabled:pointer-events-none aria-disabled:opacity-50"
          aria-disabled={!src}
        >
          <Download className="size-4" />
          {t('books.fileDownload')}
        </a>
      </div>
    </ModalShell>
  )
}

/* ---------- გამოძახების მარტივი გზა ---------- */

/** ფაილის რიგი ისე, როგორც ყველა მოდულის API აბრუნებს */
export interface FileRow {
  id: number
  url: string
  original_name?: string | null
  mime?: string | null
  size?: number | null
}

/**
 * მდგომარეობა + მნახველი ერთად.
 *
 * ⚠️ **`node`-ს გამომძახებელი ხატავს** — hook-ს პორტალის დახატვა არ შეუძლია,
 * და სწორედ ეს არის `GroupsCut`-ის წესი: state და JSX ერთ კომპონენტში.
 * ⚠️ `resolve` საჯარო დისკისთვისაა (`storageUrl`), `private` კი პრივატულისთვის —
 * ორივე **გამომძახებლის სათქმელია**, თორემ ფრონტი დისკს გამოიცნობდა (§17.5).
 */
export function useFileViewer(opts: {
  private?: boolean
  resolve?: (url: string) => string | null | undefined
  onDelete?: (id: number) => void
} = {}) {
  const [row, setRow] = useState<FileRow | null>(null)

  const file: ViewableFile | null = row
    ? {
        id: row.id,
        url: (opts.resolve ? opts.resolve(row.url) : row.url) ?? row.url,
        name: row.original_name,
        mime: row.mime,
        size: row.size,
        private: opts.private,
      }
    : null

  return {
    open: (next: FileRow) => setRow(next),
    close: () => setRow(null),
    node: file ? (
      <FileViewer
        file={file}
        onClose={() => setRow(null)}
        onDelete={opts.onDelete ? () => opts.onDelete!(file.id) : undefined}
      />
    ) : null,
  }
}
