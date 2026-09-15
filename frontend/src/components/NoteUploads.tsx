import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, Trash2, Upload } from 'lucide-react'
import { deleteNoteFile, fetchNoteFiles, uploadNoteFiles, type NoteFile } from '@/api/notes'
import { PrivateFileLink } from '@/components/PrivateFile'
import { FileViewer } from '@/components/FileViewer'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { PhotoGrid } from '@/components/ui/photo-grid'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { limitFor, limitHint, useUploadLimits } from '@/lib/uploadLimits'
import { formatBytes } from '@/lib/utils'

/* ============================================================
   **ჩანაწერის ატვირთვები — სამი სექცია, ორ ადგილას (2026-09-14).**

   სურათები · დოკუმენტები · ვიდეოები. ⚠️ აქამდე ეს მთლიანად `NoteDetail`-ში
   იჯდა, ე.ი. **დამატება/რედაქტირების ფორმას ატვირთვა საერთოდ არ ჰქონდა** —
   ჩანაწერს ქმნიდი, შემდეგ კი ფაილის მისაბმელად სხვა მოდალში უნდა შესულიყავი.
   ახლა ერთი კომპონენტია და ორივე ადგილას დგას (`NoteReminders`-ის პრეცედენტი).

   ⚠️ **ჯერ შეუნახავ ჩანაწერზე ატვირთვა არ იდგმება** — `note_entry_files`-ს
   `note_entry_id` სჭირდება: სექციები ჩანს (რომ იცოდე, რა გელოდება), კონტროლის
   ნაცვლად კი მინიშნებაა. ზუსტად `CustomFieldsCard`-ის ქცევა.

   ⚠️ ატვირთვები **კვოტაზე გადის** (§13.1 → 17.1): ლიმიტის ამოწურვაზე backend
   413-ს აბრუნებს და toast ცხადად წერს, რამდენი დარჩა.

   ⚠️ ფაილები `notes/`-შია, ე.ი. **პრივატულ დისკზე** (§17.5) — ბადე მათ
   blob-ად კითხულობს (`privateDisk`) და `/storage/*` მათ ვერ ხედავს.
   ============================================================ */

/** სამივე სექცია ერთად — სათაური, ახსნა, **ლიმიტი** და შიგთავსი */
export function NoteUploads({ noteId }: { noteId: number | null }) {
  const { t } = useTranslation()
  const { data: limits } = useUploadLimits()

  /* ⚠️ ლიმიტი **სერვერიდან** მოდის და ფრონტზე არ დუბლირდება: ნამდვილი ჭერი
     `php.ini`-ზეც არის დამოკიდებული, ე.ი. კოდში ჩაწერილი რიცხვი მოიტყუებოდა. */
  const hint = (kind: 'image' | 'doc' | 'video') =>
    limitHint(limitFor(limits, kind), (rest) => t('uploads.moreFormats', { count: rest }))

  return (
    <div className="space-y-6">
      <section>
        <SectionHead title={t('notes.imagesTitle')} hint={t('notes.imagesHint')} limit={hint('image')} />
        {noteId == null ? <SaveFirst /> : <Images noteId={noteId} />}
      </section>

      <section>
        <SectionHead title={t('notes.filesTitle')} hint={t('notes.filesHint')} limit={hint('doc')} />
        {noteId == null ? <SaveFirst /> : <Files noteId={noteId} kind="doc" />}
      </section>

      <section>
        <SectionHead title={t('notes.videosTitle')} hint={t('notes.videosHint')} limit={hint('video')} />
        {noteId == null ? <SaveFirst /> : <Files noteId={noteId} kind="video" />}
      </section>
    </div>
  )
}

/**
 * სექციის თავი — სათაური, ერთი ახსნა და **ლიმიტის ნიშანი**.
 *
 * ⚠️ ლიმიტი ცალკე ნიშნად დგას და არა ახსნის ტექსტში ჩაწერილი: ის ერთადერთი
 * რიცხვია, რომელიც კითხვას „რატომ არ აიტვირთა" პასუხობს, და თვალი მას
 * წინადადებაში ვერ პოულობდა.
 */
function SectionHead({ title, hint, limit }: { title: string; hint: string; limit: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{hint}</span>
        {limit && (
          <span className="rounded-md bg-muted px-1.5 py-0.5 leading-none tabular-nums">{limit}</span>
        )}
      </p>
    </div>
  )
}

/** „ჯერ შეინახე" — ფაილს `note_entry_id` სჭირდება */
function SaveFirst() {
  const { t } = useTranslation()

  return <p className="text-xs text-muted-foreground">{t('notes.uploadsSaveFirst')}</p>
}

/* ---------- ატვირთვები ---------- */

/** ატვირთვის საერთო ქცევა — სამივე ბლოკს ერთი და იგივე სჭირდება */
function useNoteFiles(noteId: number, kind: NoteFile['kind']) {
  const qc = useQueryClient()
  const { toast } = useToast()

  const query = useQuery({
    queryKey: ['note-files', noteId, kind],
    queryFn: () => fetchNoteFiles(noteId, kind),
  })

  const done = () => {
    qc.invalidateQueries({ queryKey: ['note-files', noteId] })
    qc.invalidateQueries({ queryKey: ['notes'] })
    // 17.1 — ატვირთვა/წაშლა კვოტას ცვლის, ჰედერის ინდიკატორიც უნდა განახლდეს
    qc.invalidateQueries({ queryKey: ['storage'] })
    qc.invalidateQueries({ queryKey: ['me'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const upload = useMutation({
    mutationFn: (picked: File[]) => uploadNoteFiles(noteId, kind, picked),
    onSuccess: done,
    onError: fail,
  })

  const remove = useMutation({ mutationFn: deleteNoteFile, onSuccess: done, onError: fail })

  return { query, upload, remove }
}

function Images({ noteId }: { noteId: number }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const { query, upload, remove } = useNoteFiles(noteId, 'image')
  const images = query.data ?? []

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        className="mb-3"
        disabled={upload.isPending}
        onClick={() => input.current?.click()}
      >
        <Upload className="size-3.5" />
        {upload.isPending ? t('actions.saving') : t('notes.addImages')}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept="image/*"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          if (picked.length) upload.mutate(picked)
          e.target.value = ''
        }}
      />

      {/* §2.9 — საერთო ბადე: ბიბლიოთეკის lightbox, მონიშვნები, ჩამოტვირთვა.
          ⚠️ `privateDisk` — ფაილები `notes/`-შია, ე.ი. პრივატულ დისკზე და
          blob-ად იკითხება (§17.5); `/storage/*` მათ ვერ ხედავს. */}
      <PhotoGrid
        privateDisk
        emptyText={t('notes.imagesEmpty')}
        items={images.map((file) => ({
          id: file.id,
          src: file.url,
          title: file.original_name,
          size: file.size,
        }))}
        onDelete={async (ids) => {
          const ok = await confirm({ title: t('notes.fileDeleteTitle'), variant: 'destructive' })
          if (ok) ids.forEach((id) => remove.mutate(id))
        }}
      />
    </div>
  )
}

function Files({ noteId, kind }: { noteId: number; kind: 'video' | 'doc' }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const { query, upload, remove } = useNoteFiles(noteId, kind)
  const files = query.data ?? []

  // ⚠️ მნახველი **ამ კომპონენტმა უნდა დახატოს** — პორტალის წესი (`GroupsCut`)
  const [viewing, setViewing] = useState<NoteFile | null>(null)

  const drop = async (id: number) => {
    const ok = await confirm({ title: t('notes.fileDeleteTitle'), variant: 'destructive' })
    if (ok) {
      remove.mutate(id)
      setViewing(null)
    }
  }

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        className="mb-3"
        disabled={upload.isPending}
        onClick={() => input.current?.click()}
      >
        <Upload className="size-3.5" />
        {upload.isPending ? t('actions.saving') : t(kind === 'video' ? 'notes.addVideos' : 'notes.addFiles')}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={kind === 'video' ? 'video/*' : undefined}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          if (picked.length) upload.mutate(picked)
          e.target.value = ''
        }}
      />

      {!query.isLoading && !files.length && (
        <p className="text-xs text-muted-foreground">
          {t(kind === 'video' ? 'notes.videosEmpty' : 'notes.filesEmpty')}
        </p>
      )}

      <ul className="space-y-1.5">
        {files.map((file) => (
          <li
            key={file.id}
            className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
          >
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            {/* ⚠️ სახელი **ღილაკია** — ონლაინ მნახველი (2026-09-14): აქამდე
                200 KB PDF-ის სანახავადაც ფაილი დისკზე უნდა ჩამოგეწერა. */}
            <button
              type="button"
              onClick={() => setViewing(file)}
              className="min-w-0 flex-1 cursor-pointer truncate text-left hover:text-primary"
              title={t('files.viewerOpen')}
            >
              {file.original_name ?? file.url}
            </button>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatBytes(file.size)}
            </span>
            <PrivateFileLink
              url={file.url}
              name={file.original_name}
              download
              aria-label={t('books.fileDownload')}
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Download className="size-4" />
            </PrivateFileLink>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-destructive"
              onClick={() => drop(file.id)}
              aria-label={t('actions.delete')}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>

      {viewing && (
        <FileViewer
          file={{
            id: viewing.id,
            url: viewing.url,
            name: viewing.original_name,
            mime: viewing.mime,
            size: viewing.size,
            // ⚠️ `note`-ის ფაილები **პრივატულ დისკზეა** (§17.5)
            private: true,
          }}
          onClose={() => setViewing(null)}
          onDelete={() => drop(viewing.id)}
        />
      )}
    </div>
  )
}
