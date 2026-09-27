import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Download, FileText, Loader2, Trash2, Upload } from 'lucide-react'
import type { UploadKindLimit } from '@/api/account'
import { deleteNoteFile, fetchNoteFiles, uploadNoteFiles, type NoteFile } from '@/api/notes'
import { PrivateFileLink } from '@/components/PrivateFile'
import { FileViewer } from '@/components/FileViewer'
import { errorMessage } from '@/lib/errors'
import { acceptFor, uploadProblem, type PendingUpload, type PendingUploads } from '@/lib/pendingUploads'
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

   ⚠️ **ჯერ შეუნახავ ჩანაწერზეც** (Tasks §23.4): ფაილი ბრაუზერში ინახება
   (`lib/pendingUploads.ts`) — სურათი წინასწარი ხედით, დოკუმენტი/ვიდეო სიაში,
   ორივე წაშლით — და შენახვისას ჩანაწერს ებმის. აქამდე აქ „ჯერ შეინახე"
   ეწერა, ე.ი. ფაილის მისაბმელად ჩანაწერი ჯერ უნდა შეგექმნა და მერე ხელახლა
   გაგეხსნა.

   ⚠️ ატვირთვები **კვოტაზე გადის** (§13.1 → 17.1): ლიმიტის ამოწურვაზე backend
   413-ს აბრუნებს და toast ცხადად წერს, რამდენი დარჩა. ⚠️ ზომა და ფორმატი
   ახლა **ბრაუზერშიც** მოწმდება (იგივე `/uploads/limits`), თორემ 100 MB-ზე
   დიდ ვიდეოზე შენახვამდე ვერ გაიგებდი, რომ არ გამოდგება.

   ⚠️ ფაილები `notes/`-შია, ე.ი. **პრივატულ დისკზე** (§17.5) — ბადე მათ
   blob-ად კითხულობს (`privateDisk`) და `/storage/*` მათ ვერ ხედავს.
   ============================================================ */

type Kind = NoteFile['kind']

/** სამივე სექცია ერთად — სათაური, ახსნა, **ლიმიტი** და შიგთავსი */
export function NoteUploads({
  noteId,
  pending,
}: {
  noteId: number | null
  /** ფორმის შენახვამდე არჩეული ფაილები (§23.4); დეტალების ფანჯარას არ სჭირდება */
  pending?: PendingUploads<Kind>
}) {
  const { t } = useTranslation()
  const { data: limits } = useUploadLimits()

  /* ⚠️ ლიმიტი **სერვერიდან** მოდის და ფრონტზე არ დუბლირდება: ნამდვილი ჭერი
     `php.ini`-ზეც არის დამოკიდებული, ე.ი. კოდში ჩაწერილი რიცხვი მოიტყუებოდა. */
  const hint = (kind: Kind) =>
    limitHint(limitFor(limits, kind), (rest) => t('uploads.moreFormats', { count: rest }))

  const body = (kind: Kind) => (
    <>
      {noteId == null ? null : kind === 'image' ? (
        <Images noteId={noteId} limit={limitFor(limits, kind)} />
      ) : (
        <Files noteId={noteId} kind={kind} limit={limitFor(limits, kind)} />
      )}
      {/* შენახვამდე — ან შენახვის შემდეგ ჩავარდნილი (ხელახლა ცდისთვის) */}
      {pending && (noteId == null || pending.of(kind).length > 0) && (
        <Pending kind={kind} pending={pending} limit={limitFor(limits, kind)} canAdd={noteId == null} />
      )}
      {noteId == null && !pending && <SaveFirst />}
    </>
  )

  return (
    <div className="space-y-6">
      <section>
        <SectionHead title={t('notes.imagesTitle')} hint={t('notes.imagesHint')} limit={hint('image')} />
        {body('image')}
      </section>

      <section>
        <SectionHead title={t('notes.filesTitle')} hint={t('notes.filesHint')} limit={hint('doc')} />
        {body('doc')}
      </section>

      <section>
        <SectionHead title={t('notes.videosTitle')} hint={t('notes.videosHint')} limit={hint('video')} />
        {body('video')}
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

/** „ჯერ შეინახე" — ფაილს `note_entry_id` სჭირდება (მხოლოდ `pending`-ის გარეშე) */
function SaveFirst() {
  const { t } = useTranslation()

  return <p className="text-xs text-muted-foreground">{t('notes.uploadsSaveFirst')}</p>
}

/**
 * **არჩეულის გაფილტვრა ბრაუზერში** (§23.4) — გამოუსადეგარი toast-ით
 * სახელდება და არ იგზავნება; დანარჩენი გადის.
 */
function useScreen(kind: Kind, limit: UploadKindLimit | undefined) {
  const { t } = useTranslation()
  const { toast } = useToast()

  return (picked: File[]): File[] => {
    const ok: File[] = []

    for (const file of picked) {
      const problem = uploadProblem(file, kind, limit)

      if (problem) {
        toast({
          title: t(problem === 'too_large' ? 'uploads.tooLarge' : 'uploads.wrongType', {
            name: file.name,
            max: limit ? formatBytes(limit.max_bytes) : '',
          }),
          variant: 'error',
        })
      } else {
        ok.push(file)
      }
    }

    return ok
  }
}

/** ფაილის ღილაკი + დამალული `<input>` — სამივე ადგილას ერთნაირი */
function PickButton({
  kind,
  limit,
  busy,
  onPicked,
}: {
  kind: Kind
  limit: UploadKindLimit | undefined
  busy?: boolean
  onPicked: (files: File[]) => void
}) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const screen = useScreen(kind, limit)

  const label = kind === 'image' ? 'notes.addImages' : kind === 'video' ? 'notes.addVideos' : 'notes.addFiles'

  return (
    <>
      <Button variant="outline" size="sm" className="mb-3" disabled={busy} onClick={() => input.current?.click()}>
        <Upload className="size-3.5" />
        {busy ? t('actions.saving') : t(label)}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        // ⚠️ §23.4 — დოკუმენტებსაც აქვს `accept` (აქამდე მხოლოდ სურათსა და ვიდეოს)
        accept={acceptFor(kind, limit)}
        onChange={(e) => {
          const picked = screen(Array.from(e.target.files ?? []))
          if (picked.length) onPicked(picked)
          e.target.value = ''
        }}
      />
    </>
  )
}

/* ---------- შენახვამდე ---------- */

/**
 * **შეუნახავი ფაილები** — „ზუსტად რედაქტირების ხედი" (§23.4): სურათი იმავე
 * ბადეში (`blob:` წინასწარი ხედით), დოკუმენტი/ვიდეო იმავე რიგებით.
 * ⚠️ შენახვის შემდეგ ჩავარდნილიც აქ რჩება — მიზეზით, რომ ხელახლა სცადო.
 */
function Pending({
  kind,
  pending,
  limit,
  canAdd,
}: {
  kind: Kind
  pending: PendingUploads<Kind>
  limit: UploadKindLimit | undefined
  /** შენახვის შემდეგ ახალი ფაილი ჩვეულებრივ ატვირთვაზე მიდის — აქ აღარ ემატება */
  canAdd: boolean
}) {
  const { t } = useTranslation()
  const items = pending.of(kind)

  return (
    <div>
      {canAdd && <PickButton kind={kind} limit={limit} onPicked={(files) => pending.add(kind, files)} />}

      {kind === 'image' && items.length > 0 && (
        <PhotoGrid
          items={items.map((item) => ({
            id: item.key,
            src: item.preview ?? '',
            title: item.file.name,
            size: item.file.size,
          }))}
          onDelete={(ids) => ids.forEach((id) => pending.remove(id))}
        />
      )}

      {kind !== 'image' && items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <PendingRow key={item.key} item={item} onRemove={() => pending.remove(item.key)} />
          ))}
        </ul>
      )}

      {/* სურათის ჩავარდნის მიზეზი ბადეში არ ჩანს — ქვემოთ ცალკე */}
      {kind === 'image' &&
        items
          .filter((item) => item.status === 'error')
          .map((item) => (
            <p key={item.key} className="mt-1.5 flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="size-3.5 shrink-0" />
              {item.file.name} — {item.error}
            </p>
          ))}

      {canAdd && !items.length && (
        <p className="text-xs text-muted-foreground">{t('notes.uploadsPending')}</p>
      )}
    </div>
  )
}

function PendingRow({ item, onRemove }: { item: PendingUpload<Kind>; onRemove: () => void }) {
  const { t } = useTranslation()

  return (
    <li className="rounded-md border border-border px-2 py-1.5 text-sm">
      <div className="flex items-center gap-2">
        {item.status === 'uploading' ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <FileText className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatBytes(item.file.size)}</span>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-destructive"
          disabled={item.status === 'uploading'}
          onClick={onRemove}
          aria-label={t('actions.delete')}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      {item.status === 'error' && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="size-3.5 shrink-0" />
          {item.error}
        </p>
      )}
    </li>
  )
}

/* ---------- ატვირთვები ---------- */

/** ატვირთვის საერთო ქცევა — სამივე ბლოკს ერთი და იგივე სჭირდება */
function useNoteFiles(noteId: number, kind: Kind) {
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

function Images({ noteId, limit }: { noteId: number; limit: UploadKindLimit | undefined }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { query, upload, remove } = useNoteFiles(noteId, 'image')
  const images = query.data ?? []

  return (
    <div>
      <PickButton kind="image" limit={limit} busy={upload.isPending} onPicked={(files) => upload.mutate(files)} />

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

function Files({
  noteId,
  kind,
  limit,
}: {
  noteId: number
  kind: 'video' | 'doc'
  limit: UploadKindLimit | undefined
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()
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
      <PickButton kind={kind} limit={limit} busy={upload.isPending} onPicked={(picked) => upload.mutate(picked)} />

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
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground"
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
