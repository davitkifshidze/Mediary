import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Check, ExternalLink, FileText, Images, SquarePen, Star, X } from 'lucide-react'
import {
  fetchCustomFieldValues,
  fetchCustomFields,
  type CustomFieldDefinition,
  type CustomFieldFile,
  type ModuleInfo,
} from '@/api/account'
import type { CustomRecord } from '@/api/customRecords'
import { storageUrl } from '@/lib/api'
import { useDateFormat } from '@/lib/dates'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useModuleFields } from '@/lib/fields'
import { useModules } from '@/lib/modules'
import { useContentLang } from '@/lib/settings'
import { statusName, statusTone } from '@/lib/statuses'
import { STATUS_BADGE } from '@/lib/statusStyles'
import { DetailFacts, DetailHero, DetailSection } from '@/components/DetailHero'
import { ModuleIcon } from '@/components/ModuleIcon'
import { PrivateFileLink } from '@/components/PrivateFile'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { cn } from '@/lib/utils'

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
}: {
  module: ModuleInfo
  record: CustomRecord
  onClose: () => void
  onEdit: () => void
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
