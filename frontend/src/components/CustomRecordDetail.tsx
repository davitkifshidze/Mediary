import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Download, ExternalLink, FileText, Images, Play, SquarePen, Star, Trash2, Upload, X } from 'lucide-react'
import {
  fetchCustomFieldValues,
  fetchCustomFields,
  type CustomFieldDefinition,
  type CustomFieldFile,
  type ModuleInfo,
} from '@/api/account'
import {
  createCustomRecordNote,
  customRecordFilesKey,
  deleteCustomRecordFile,
  deleteCustomRecordNote,
  fetchCustomRecordFiles,
  fetchCustomRecordNotes,
  updateCustomRecordNote,
  uploadCustomRecordFiles,
  type CustomRecord,
  type CustomRecordFile,
} from '@/api/customRecords'
import { storageUrl } from '@/lib/api'
import { useDateFormat } from '@/lib/dates'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useModuleFields } from '@/lib/fields'
import { useModules } from '@/lib/modules'
import { useContentLang } from '@/lib/settings'
import { statusName, statusTone } from '@/lib/statuses'
import { STATUS_BADGE } from '@/lib/statusStyles'
import { DetailFacts, DetailHero, DetailPhotos, DetailSection } from '@/components/DetailHero'
import { useFileViewer } from '@/components/FileViewer'
import { RecordNotes } from '@/components/RecordNotes'
import { errorMessage } from '@/lib/errors'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { ModuleIcon } from '@/components/ModuleIcon'
import { PrivateFileLink } from '@/components/PrivateFile'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { cn, formatBytes } from '@/lib/utils'

/* ============================================================
   **პირადი მოდულის ჩანაწერის ფანჯარა (Tasks §37.3).**

   §26.4-ის რიგი: თავში მთავარი ფოტო, სტატუსი და მოკლე ცნობები, მერე
   აღწერა, ბმული და — ⚠️ **დამატებითი ველები**. საბაზისო მოდულის ფანჯარა
   მათ არ აჩვენებს (ისინი იქ მეორეხარისხოვანია), პირად მოდულში კი ისინია
   მოდულის **შიგთავსი** (რეცეპტის ინგრედიენტები, ნივთის ფასი) — ამიტომ
   აქ იკითხება, ფორმაზე კი იწერება.
   ============================================================ */

export function CustomRecordDetail({
  module,
  record,
  onClose,
  onEdit,
  onPlay,
}: {
  module: ModuleInfo
  record: CustomRecord
  onClose: () => void
  onEdit: () => void
  /** §37.5 — ბმული დასაკრავია: ფლეერს გადაეცემა და ფანჯარა იკეტება */
  onPlay?: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const fields = useModuleFields(module.key)
  const fmt = useDateFormat()
  const { has } = useModules()

  const definitions = useQuery({
    queryKey: ['custom-fields', module.key],
    queryFn: () => fetchCustomFields(module.key),
  })
  const values = useQuery({
    queryKey: ['custom-field-values', module.key, record.id],
    queryFn: () => fetchCustomFieldValues(module.key, record.id),
  })

  const extras = (definitions.data ?? []).filter((d) => d.enabled !== false)
  const filled = extras.filter((d) => hasValue(values.data?.[d.key]))
  const image = storageUrl(record.image)

  return (
    <ModalShell title={record.title} onClose={onClose} wide>
      <div className="mt-4 space-y-6">
        <DetailHero
          image={image}
          alt={record.title}
          shape="wide"
          fallback={<ModuleIcon name={module.icon} className="size-8 text-muted-foreground" />}
          badges={
            <>
              {record.status && (
                <Badge size="row" className={STATUS_BADGE[statusTone(record.status)]}>
                  {statusName(record.status, lang)}
                </Badge>
              )}
              {record.is_favorite && (
                <Badge size="row" className="bg-secondary">
                  <Star className="size-3.5 fill-current text-[var(--favorite)]" />
                  {t('filter.favorite')}
                </Badge>
              )}
              <VisibilityBadge value={record.visibility} size="row" />
            </>
          }
        >
          <DetailFacts>
            {record.category && (
              <span className="inline-flex items-center gap-1">
                <span className="text-foreground">{fields.label('category')}:</span>
                <ModuleIcon name={record.category.icon} className="size-3.5" />
                {dictionaryName(record.category, lang)}
              </span>
            )}
            {record.finished_at && (
              <span>
                <span className="text-foreground">{t('customModules.finishedAt')}:</span> {fmt.date(record.finished_at)}
              </span>
            )}
            {record.created_at && (
              <span>
                <span className="text-foreground">{t('customModules.addedAt')}:</span> {fmt.date(record.created_at)}
              </span>
            )}
          </DetailFacts>

          {record.tags.length > 0 && (
            <p className="flex flex-wrap gap-1">
              {record.tags.map((tag) => (
                <span key={tag} className="rounded-md bg-secondary px-1.5 py-0.5 text-xs">
                  #{tag}
                </span>
              ))}
            </p>
          )}
        </DetailHero>

        {/* §37.5 — ჩემი ფოტოები (ვიტრინა); ვებიდან მოტანილი გალერეის გვერდზეა */}
        <Photos module={module} record={record} />

        {record.description && (
          <DetailSection title={fields.label('description')}>
            <p className="whitespace-pre-line text-sm leading-relaxed">{record.description}</p>
          </DetailSection>
        )}

        {record.url && (
          <DetailSection title={fields.label('url')}>
            <a
              href={record.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1.5 text-sm text-primary hover:text-primary/70"
            >
              <ExternalLink className="size-4 shrink-0" />
              <span className="truncate">{record.domain ?? record.url}</span>
            </a>
            {onPlay && (
              <Button type="button" variant="outline" size="sm" className="ml-3" onClick={onPlay}>
                <Play className="size-3.5" />
                {t('playback.playInPlayer')}
              </Button>
            )}
          </DetailSection>
        )}

        {filled.length > 0 && (
          <DetailSection title={t('customModules.extraFields')}>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {filled.map((def) => (
                <div key={def.key} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{fieldLabel(def, i18n.language)}</dt>
                  <dd className="mt-0.5 text-sm">
                    <FieldValue def={def} value={values.data?.[def.key]} />
                  </dd>
                </div>
              ))}
            </dl>
          </DetailSection>
        )}

        <DetailSection title={t('customModules.docsTitle')}>
          <Docs module={module} record={record} />
        </DetailSection>

        <DetailSection title={t('customModules.notesTitle')}>
          <RecordNotes
            queryKey={['custom-record-notes', module.key, record.id]}
            api={{
              list: () => fetchCustomRecordNotes(module.key, record.id),
              create: (input) => createCustomRecordNote(module.key, record.id, input.body),
              update: (id, input) => updateCustomRecordNote(module.key, id, input.body),
              remove: (id) => deleteCustomRecordNote(module.key, id),
            }}
            placeholder={t('customModules.notePlaceholder')}
            addLabel={t('actions.add')}
            emptyTitle={t('customModules.notesEmpty')}
            emptyHint={t('recordNotes.emptyHint')}
          />
        </DetailSection>
      </div>

      <ModalFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('actions.close')}
        </Button>
        {/* §37.4 — ჩანაწერი გალერეის მშობელია: ვებიდან ფოტო/ვიდეო და გადატანილი
            ფოტოები მის გალერეის გვერდზეა (წიგნის/ადგილის იგივე გვერდი) */}
        {has('gallery') && (
          <Link
            to={`/gallery/records/${module.key}/${record.id}`}
            state={{ title: record.title }}
            className={buttonVariants({ variant: 'outline' })}
          >
            <Images className="size-4" />
            {t('customModules.gallery')}
          </Link>
        )}
        <Button type="button" variant="edit" onClick={onEdit}>
          <SquarePen className="size-4" />
          {t('actions.edit')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}

/** დამატებითი ველის სახელი — მორგებულს ნაგულისხმევი ლეიბლი არ აქვს, ე.ი. key-ია ნაცვალი */
function fieldLabel(def: CustomFieldDefinition, lang: string): string {
  return (lang === 'ka' ? def.label_ka || def.label_en : def.label_en || def.label_ka) || def.key
}

function hasValue(value: unknown): boolean {
  if (value == null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim() !== ''

  return true
}

/** ერთი მნიშვნელობა თავისი ტიპის მიხედვით — ფორმის (`CustomFieldsCard`) სარკე, მხოლოდ წასაკითხად */
function FieldValue({ def, value }: { def: CustomFieldDefinition; value: unknown }) {
  const { t } = useTranslation()
  const fmt = useDateFormat()

  switch (def.type) {
    case 'switch':
      return value ? (
        <Check className="size-4 text-emerald-600" aria-label={t('customModules.yes')} />
      ) : (
        <X className="size-4 text-muted-foreground" aria-label={t('customModules.no')} />
      )
    case 'date':
      return <>{fmt.date(String(value))}</>
    case 'list':
      return (
        <span className="flex flex-wrap gap-1">
          {(value as string[]).map((item) => (
            <span key={item} className="rounded-md bg-secondary px-1.5 py-0.5 text-xs">
              {item}
            </span>
          ))}
        </span>
      )
    case 'link':
      return (
        <a
          href={String(value)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-1 text-primary hover:text-primary/70"
        >
          <ExternalLink className="size-3.5 shrink-0" />
          <span className="truncate">{String(value)}</span>
        </a>
      )
    case 'file':
      return (
        <span className="flex flex-col gap-1">
          {(value as CustomFieldFile[]).map((file) => (
            <PrivateFileLink
              key={file.id}
              url={file.url}
              name={file.name}
              className={cn('inline-flex max-w-full items-center gap-1.5 text-primary hover:text-primary/70')}
            >
              <FileText className="size-3.5 shrink-0" />
              <span className="truncate">{file.name ?? t('customModules.file')}</span>
            </PrivateFileLink>
          ))}
        </span>
      )
    default:
      return <span className="whitespace-pre-line break-words">{String(value)}</span>
  }
}

/* ---------- §37.5 — ჩანაწერის საკუთარი ფაილები ---------- */

/** ატვირთვის საერთო ქცევა — ფოტოსაც და დოკუმენტსაც ერთი და იგივე სჭირდება (თამაშის ფორმა) */
function useRecordFiles(module: ModuleInfo, record: CustomRecord, kind: CustomRecordFile['kind']) {
  const qc = useQueryClient()
  const { toast } = useToast()

  const query = useQuery({
    queryKey: [...customRecordFilesKey(module.key, record.id), kind],
    queryFn: () => fetchCustomRecordFiles(module.key, record.id, kind),
  })

  const done = () => {
    qc.invalidateQueries({ queryKey: customRecordFilesKey(module.key, record.id) })
    // 17.1 — ატვირთვა/წაშლა კვოტას ცვლის, ჰედერის ინდიკატორიც უნდა განახლდეს
    qc.invalidateQueries({ queryKey: ['storage'] })
    qc.invalidateQueries({ queryKey: ['me'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const upload = useMutation({
    mutationFn: (picked: File[]) => uploadCustomRecordFiles(module.key, record.id, kind, picked),
    onSuccess: done,
    onError: fail,
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteCustomRecordFile(module.key, id),
    onSuccess: done,
    onError: fail,
  })

  return { query, upload, remove }
}

/** ჩემი ფოტოები — ვიტრინა (§22.2/§26.4-ის ფორმა): ატვირთვა და წაშლა აქვეა */
function Photos({ module, record }: { module: ModuleInfo; record: CustomRecord }) {
  const { t } = useTranslation()
  const { query, upload, remove } = useRecordFiles(module, record, 'image')

  return (
    <DetailPhotos
      title={t('customModules.photosTitle')}
      hint={t('customModules.photosHint')}
      items={(query.data ?? []).map((file) => ({ id: file.id, src: file.url, title: file.original_name }))}
      loading={query.isLoading}
      uploading={upload.isPending}
      onUpload={(picked) => upload.mutate(picked)}
      onDelete={(id) => remove.mutate(id)}
      uploadLabel={t('customModules.addPhotos')}
      emptyTitle={t('customModules.photosEmpty')}
      deleteTitle={t('customModules.photoDeleteTitle')}
    />
  )
}

/** თანმხლები დოკუმენტები — სახელი ღილაკია და ონლაინ მნახველს ხსნის */
function Docs({ module, record }: { module: ModuleInfo; record: CustomRecord }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const { query, upload, remove } = useRecordFiles(module, record, 'doc')
  const files = query.data ?? []
  /* ⚠️ `resolve: storageUrl` — ეს ფაილები **საჯარო დისკზეა** (`custom/{key}/files`);
     დისკს backend წყვეტს და არა ფრონტი (§17.5). */
  const viewer = useFileViewer({ resolve: storageUrl, onDelete: (id) => remove.mutate(id) })

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
        {upload.isPending ? t('actions.saving') : t('customModules.addDocs')}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          if (picked.length) upload.mutate(picked)
          e.target.value = ''
        }}
      />

      {!query.isLoading && !files.length && (
        <p className="text-xs text-muted-foreground">{t('customModules.docsEmpty')}</p>
      )}

      <ul className="space-y-1.5">
        {files.map((file) => (
          <li key={file.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <button
              type="button"
              onClick={() => viewer.open(file)}
              className="min-w-0 flex-1 cursor-pointer truncate text-left hover:text-primary"
              title={t('files.viewerOpen')}
            >
              {file.original_name ?? file.url}
            </button>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatBytes(file.size)}</span>
            <a
              href={storageUrl(file.url) ?? '#'}
              download
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('books.fileDownload')}
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground"
            >
              <Download className="size-4" />
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-destructive"
              onClick={async () => {
                const ok = await confirm({
                  title: t('books.fileDeleteTitle'),
                  description: t('books.fileDeleteHint', { name: file.original_name ?? file.url }),
                  variant: 'destructive',
                })
                if (ok) remove.mutate(file.id)
              }}
              aria-label={t('actions.delete')}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>

      {viewer.node}
    </div>
  )
}
