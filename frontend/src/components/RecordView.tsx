import { createContext, useContext, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal, SquarePen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RecordActionMenu, RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'
import { Sortable, SortableHandle, SortableItem, type SortableId } from '@/components/ui/sortable'
import type { RecordLayout } from '@/lib/recordLayout'
import { cn } from '@/lib/utils'

/* ============================================================
   **ჩანაწერის ერთი რენდერი სამ განლაგებაში** (Tasks §45.4).

   მოდული ერთხელ აღწერს ჩანაწერს — ფოტო, სათაური, მეტა-ხაზი, დამატებითი
   (პროგრესი, აღწერა, ჩიპები), ტეგები, მოქმედებების ზოლი (`RecordActionBar`) და
   კონტექსტური მენიუ (§7) — და `RecordList`-ის განლაგება წყვეტს, როგორ დაიხატოს:

   - **სტრიქონები** — ახლანდელი რიგი, ზუსტად იმავე ფორმით (§29.1-ის ზოლით);
   - **ბარათები** — ფართო ფოტო ზემოთ (ვიდეოს ბარათის სტილით), სათაური, მეტა,
     ტეგები, ქვემოთ იგივე ზოლი (ვიწრო ბარათში ის ორ ხაზად იშლება);
   - **ბადე** — კომპაქტური უჯრა: ფოტო + სათაური; მოქმედებები ჰოვერზე
     („რედაქტირება" + „მეტი" — მთელი მენიუ) და მარჯვენა ღილაკზე.

   ⚠️ **ფოტოს ფორმა მოდულისაა** (`poster` 2:3 — წიგნი; `wide` — თამაში, ვიდეო;
   `square` — ბუკმარკი, ჩანაწერი). ბადეში ფორმა რჩება (ყდის ჩამოჭრა კვადრატად
   სათაურს მოჭრიდა), ბარათში კი ფართო ჩარჩოა და პოსტერი **მთლიანად** ჩანს
   (`object-contain`), თორემ 2:3 ყდა ბარათს სამჯერ გააგრძელებდა.

   ⚠️ **ჰოვერის ღილაკები ფოტოს ღილაკის ძმებია და არა შვილები** (ღილაკი ღილაკში
   არ ჯდება); ფენა `pointer-events-none`-ია და მხოლოდ ჰოვერზე/ფოკუსზე იღებს
   დაჭერას — `PosterUploader`-ის წესი, რომ უხილავმა ღილაკმა ფოტოზე დაჭერა არ
   მოიპაროს.

   ⚠️ **drag & drop (§11) სამივეში** — `RecordList`-ის `sortable` + `sortId`:
   სტრიქონებში ვერტიკალური სია, ბარათებსა და ბადეში — ბადის სტრატეგია.
   ============================================================ */

const LayoutContext = createContext<RecordLayout>('rows')

/* ⚠️ კონტეინერის ზღვრები (`<main>` `@container`-ია, §20.4) — დამკვრელის პანელით
   მიწოლილ გვერდზე სვეტები თავისით იკლებს (`MovieGrid`-ის წესი) */
const LIST: Record<RecordLayout, string> = {
  rows: 'space-y-2',
  cards: 'grid grid-cols-1 gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3 @7xl:grid-cols-4',
  grid: 'grid grid-cols-2 gap-3 @2xl:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-6 @7xl:grid-cols-8',
}

export function RecordList<T extends SortableId>({
  layout,
  children,
  sortable,
  className,
}: {
  layout: RecordLayout
  children: ReactNode
  /** §11 — ხელით დალაგება (ფლეილისტები): მთელი ახალი რიგი ერთად */
  sortable?: { ids: readonly T[]; onReorder: (ids: T[]) => void }
  className?: string
}) {
  return (
    <LayoutContext.Provider value={layout}>
      <ul className={cn(LIST[layout], className)} data-layout={layout} data-testid="record-list">
        {sortable ? (
          <Sortable ids={sortable.ids} onReorder={sortable.onReorder} layout={layout === 'rows' ? 'list' : 'grid'}>
            {children}
          </Sortable>
        ) : (
          children
        )}
      </ul>
    </LayoutContext.Provider>
  )
}

type Shape = 'poster' | 'wide' | 'square'

const ROW_PHOTO: Record<Shape, string> = { poster: 'h-16 w-11', wide: 'h-14 w-24', square: 'size-12' }
const GRID_PHOTO: Record<Shape, string> = { poster: 'aspect-[2/3]', wide: 'aspect-video', square: 'aspect-square' }

export interface RecordViewProps {
  title: string
  /** ფოტოსა და სათაურზე დაჭერა — დეტალის ფანჯარა (სიმღერაზე — დაკვრა) */
  onOpen: () => void
  /** ფოტოს ღილაკის წარწერა (ეკრანის წამკითხველისთვის) */
  openLabel: string
  /** სათაური ტექსტია და არა ღილაკი (სიმღერას ფანჯარა არ აქვს — ფოტო უკრავს) */
  staticTitle?: boolean
  photo?: string | null
  shape?: Shape
  /** რიგის ფოტოს ზომის გადაფარვა (სამაგიდოს `size-14`, კურსის `size-16`) */
  rowPhotoClassName?: string
  /** ფოტოს არქონისას — მოდულის აიქონი ან ფავიკონი */
  placeholder: ReactNode
  /** ფოტოზე ჰოვერისას (სიმღერის ▶) */
  photoHover?: ReactNode
  /** სათაურის გვერდით (ხილვადობის ბეჯი) */
  titleAside?: ReactNode
  /** სათაურის ქვეშ — ერთი ხაზი (`gap-x-2`-იანი ნაწილები) */
  meta?: ReactNode
  /** მეტას ქვეშ — პროგრესი, აღწერა, ჩიპები (სტრიქონსა და ბარათში) */
  extra?: ReactNode
  tags?: readonly string[]
  /** `#` ტეგის წინ — ჩანაწერებს არ აქვს */
  hashTags?: boolean
  /** მოქმედებების ზოლი (`RecordActionBar`) — სტრიქონსა და ბარათში */
  bar: ReactNode
  /** კონტექსტური მენიუ (§7) — ბადეში „მეტიც" ესაა */
  actions: MenuAction[]
  /** ბადის ჰოვერზე „რედაქტირება" (ზოლი იქ არ ჩანს) */
  onEdit?: () => void
  /** §11 — `RecordList`-ის `sortable`-ის წევრი */
  sortId?: SortableId
  testId?: string
  photoTestId?: string
  titleTestId?: string
}

export function RecordView(props: RecordViewProps) {
  const layout = useContext(LayoutContext)
  const { actions, sortId, testId } = props

  const body = layout === 'cards' ? <CardBody {...props} /> : layout === 'grid' ? <TileBody {...props} /> : <RowBody {...props} />
  const className = ROOT[layout]

  return (
    <RecordContextMenu actions={actions}>
      {sortId != null ? (
        <SortableItem id={sortId} handle className={className} data-testid={testId} data-record-layout={layout}>
          {body}
        </SortableItem>
      ) : (
        <li className={className} data-testid={testId} data-record-layout={layout}>
          {body}
        </li>
      )}
    </RecordContextMenu>
  )
}

const ROOT: Record<RecordLayout, string> = {
  rows: 'flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2',
  cards: 'flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card',
  grid: 'group/tile flex flex-col overflow-hidden rounded-xl border border-border bg-card',
}

/* ---------- ნაწილები ---------- */

function Photo({
  props,
  className,
  big = false,
}: {
  props: RecordViewProps
  className: string
  /** ბარათი/ბადე: დიდი აიქონი და პოსტერი მთლიანად */
  big?: boolean
}) {
  const { photo, placeholder, photoHover, onOpen, openLabel, photoTestId, shape = 'square' } = props

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={openLabel}
      className={cn('group/photo relative grid shrink-0 cursor-pointer place-items-center overflow-hidden bg-muted', className)}
      data-testid={photoTestId}
    >
      {photo ? (
        <img
          src={photo}
          alt=""
          loading="lazy"
          className={cn('size-full', big && shape === 'poster' ? 'object-contain' : 'object-cover')}
        />
      ) : (
        <span className={cn('grid size-full place-items-center text-muted-foreground', big && '[&_img]:size-10 [&_svg]:size-8')}>
          {placeholder}
        </span>
      )}
      {photoHover && (
        <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition-opacity group-hover/photo:opacity-100">
          {photoHover}
        </span>
      )}
    </button>
  )
}

function Title({ props, small = false }: { props: RecordViewProps; small?: boolean }) {
  const { title, onOpen, staticTitle, titleAside, titleTestId } = props
  const text = small ? 'text-xs' : 'text-sm'

  const heading = staticTitle ? (
    <p className={cn('truncate font-medium', text)} title={title} data-testid={titleTestId}>
      {title}
    </p>
  ) : (
    <button
      type="button"
      onClick={onOpen}
      className={cn('block max-w-full cursor-pointer truncate text-left font-medium hover:text-primary', text)}
      title={title}
      data-testid={titleTestId}
    >
      {title}
    </button>
  )

  if (!titleAside || small) return heading

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {heading}
      {titleAside}
    </div>
  )
}

function Meta({ props, className }: { props: RecordViewProps; className?: string }) {
  if (!props.meta) return null

  return (
    <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-0.5 truncate text-xs text-muted-foreground', className)}>
      {props.meta}
    </p>
  )
}

function Tags({ props }: { props: RecordViewProps }) {
  const { tags, hashTags = true } = props
  if (!tags?.length) return null

  return (
    <p className="mt-1 flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span key={tag} className="rounded-[5px] bg-secondary px-1.5 py-0.5 text-[11px]">
          {hashTags ? `#${tag}` : tag}
        </span>
      ))}
    </p>
  )
}

/* ---------- სტრიქონი (ახლანდელი რიგი) ---------- */

function RowBody(props: RecordViewProps) {
  const { shape = 'square', rowPhotoClassName, extra, bar, sortId } = props

  return (
    <>
      {sortId != null && <SortableHandle />}
      <Photo props={props} className={cn('rounded-md', rowPhotoClassName ?? ROW_PHOTO[shape])} />

      <div className="min-w-0 flex-1">
        <Title props={props} />
        <Meta props={props} />
        {extra}
        <Tags props={props} />
      </div>

      {bar}
    </>
  )
}

/* ---------- ბარათი ---------- */

function CardBody(props: RecordViewProps) {
  const { extra, bar, sortId } = props

  return (
    <>
      <div className="relative">
        <Photo props={props} className="block aspect-video w-full" big />
        {sortId != null && <SortableHandle className="absolute left-2 top-2 bg-background/90" />}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <Title props={props} />
        <Meta props={props} className="mt-1 whitespace-normal" />
        {extra}
        <Tags props={props} />
        {/* ⚠️ ზოლი ვიწრო ბარათში ორ ხაზად იშლება (`[&>*]:flex-wrap` — ზოლის ძირი) */}
        <div className="mt-auto pt-3">
          <div className="border-t border-border pt-2 [&>*]:flex-wrap" data-testid="record-card-bar">
            {bar}
          </div>
        </div>
      </div>
    </>
  )
}

/* ---------- ბადის უჯრა ---------- */

function TileBody(props: RecordViewProps) {
  const { t } = useTranslation()
  const { shape = 'square', actions, onEdit, sortId } = props

  return (
    <>
      <div className="relative">
        <Photo props={props} className={cn('block w-full', GRID_PHOTO[shape])} big />
        {sortId != null && <SortableHandle className="absolute left-1.5 top-1.5 bg-background/90" />}

        {/* მოქმედებები ჰოვერზე/ფოკუსზე; გახსნილ მენიუსთან ფენა ჩანს (`data-state=open`) */}
        <div
          className={cn(
            'pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 p-2 opacity-0 transition-opacity',
            'group-hover/tile:opacity-100 group-focus-within/tile:opacity-100 has-[[data-state=open]]:opacity-100',
          )}
          data-testid="record-tile-actions"
        >
          <div className="pointer-events-none flex flex-col items-center gap-2 group-hover/tile:pointer-events-auto group-focus-within/tile:pointer-events-auto">
            {onEdit && (
              <Button type="button" variant="edit" size="sm" className="bg-background" onClick={onEdit}>
                <SquarePen className="size-3.5" />
                {t('actions.edit')}
              </Button>
            )}
            <RecordActionMenu
              actions={actions}
              trigger={
                <Button type="button" variant="outline" size="sm" className="bg-background">
                  <MoreHorizontal className="size-3.5" />
                  {t('actions.more')}
                </Button>
              }
            />
          </div>
        </div>
      </div>

      <div className="px-2.5 py-2">
        <Title props={props} small />
      </div>
    </>
  )
}
