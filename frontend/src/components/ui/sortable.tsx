import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ============================================================
   **Drag & drop — ერთი კომპონენტი ყველა სიისა და ბადისთვის** (Tasks §11, Q3).

   შენი სიტყვები: „როდესაც ხელს მოკიდებ რომელიმეს, სადაც იყო, იქ დარჩეს
   გაუფერულებული ბლოკი; სადაც მიგაქვს, იქ ჯდებოდეს წყვეტილი ხაზებით; სხვები
   ჩამოცურდნენ ზევით-ქვევით და გქონდეს ვიზუალური ხედვა, სად როგორ ჯდება —
   ეს ყველგან, აბსოლუტურად".

   `@dnd-kit/core + sortable` (Q3 ⭐): ბადე და სია ერთნაირად, სქროლის
   კონტეინერი, `DragOverlay`, კლავიატურის სენსორი. ვიზუალი:
   - **მაუსთან ნამდვილი ბარათი** (`DragOverlay`, ჩრდილით და ოდნავ გადიდებული) —
     ⚠️ ის აღებული ელემენტის **DOM-ის ასლია** (`outerHTML`), ე.ი. რვა
     გამომძახებლიდან არცერთს ბარათი ცალკე კომპონენტად არ სჭირდება;
   - **წყვეტილი სლოტი** იქ, სადაც ბარათი ჩაჯდება: ეს თვითონ აღებული ელემენტია,
     რომელსაც dnd-kit ახალ ადგილზე გადააქვს, შიგთავსი კი გაფერმკრთალებული
     და უფერო რჩება (`SLOT_CLASS`) — „გაუფერულებული ბლოკი" და „წყვეტილი
     ხაზები" ერთ ადგილას, რადგან მეზობლები თავისუფალ ადგილს თვითონ ავსებენ;
   - **დანარჩენები ცურავენ** `transform`-ით, 150 ms.

   ⚠️ **აიღება მთელი ელემენტი** (`PointerSensor` 6 px-იანი ზღურბლით — ღილაკზე
   დაჭერა დაჭერად რჩება), კლავიატურა კი **სახელურზეა** (`SortableHandle`:
   ფოკუსი → Space → ისრები → Space; Esc აუქმებს). სახელურის გარეშე ელემენტი
   თვითონ არის ფოკუსირებადი. ⚠️ ინპუტებიანი ბარათი (`CustomFieldsEditor`)
   `handle`-რეჟიმშია — იქ ტექსტის მონიშვნა გადათრევად არ უნდა წაიკითხოს.

   ⚠️ **`disabled`** — ელემენტი სიაშია, მაგრამ არ ითრევა და ვერც გადაინაცვლებს
   (დამალული მსახიობები); `SortableItem` ასეთზე სენსორებს არ აკიდებს.
   ============================================================ */

export type SortableId = UniqueIdentifier

/** აღებული ელემენტი თავის ახალ სლოტზე — გაფერმკრთალებული და წყვეტილი */
const SLOT_CLASS = 'opacity-40 grayscale border-dashed! border-2! border-primary/60! bg-primary/5!'

const TRANSITION = { duration: 150, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }

interface HandleContextValue {
  attributes: Record<string, unknown>
  onKeyDown?: (event: KeyboardEvent) => void
  setActivatorNodeRef: (element: HTMLElement | null) => void
  disabled: boolean
}

const HandleContext = createContext<HandleContextValue | null>(null)

/** DOM-ის ასლი მაუსთან — ზომა აღებული ელემენტისაა, რომ ბადეშიც ზუსტად ჯდებოდეს */
interface Ghost {
  html: string
  width: number
  height: number
}

function ghostOf(id: SortableId): Ghost | null {
  const element = [...document.querySelectorAll<HTMLElement>('[data-sortable-id]')].find(
    (el) => el.dataset.sortableId === String(id),
  )
  if (!element) return null

  const rect = element.getBoundingClientRect()

  return { html: element.outerHTML, width: rect.width, height: rect.height }
}

export function Sortable<T extends SortableId>({
  ids,
  onReorder,
  layout = 'list',
  children,
}: {
  ids: readonly T[]
  /** მთელი ახალი რიგი ერთად — `sort_order` თანმიმდევრული რჩება */
  onReorder: (ids: T[]) => void
  /** `list` — ვერტიკალური სია; `grid` — ბადე (მოდულები, მსახიობები, ალბომები) */
  layout?: 'list' | 'grid'
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const [ghost, setGhost] = useState<Ghost | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const position = useCallback((id: UniqueIdentifier) => ids.indexOf(id as T) + 1, [ids])

  /* ⚠️ განცხადებები ეკრანის წამკითხველისთვის — ქართულად, პოზიციებით და არა
     id-ებით (`'movie'`, `17`) — ის არავის არაფერს ეუბნება. */
  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart: ({ active }) => t('sortable.pickedUp', { from: position(active.id), total: ids.length }),
      onDragOver: ({ over }) => (over ? t('sortable.movedOver', { to: position(over.id), total: ids.length }) : undefined),
      onDragEnd: ({ over }) => (over ? t('sortable.dropped', { to: position(over.id), total: ids.length }) : t('sortable.cancelled')),
      onDragCancel: () => t('sortable.cancelled'),
    }),
    [ids.length, position, t],
  )

  const onDragStart = (event: DragStartEvent) => setGhost(ghostOf(event.active.id))

  const onDragEnd = (event: DragEndEvent) => {
    setGhost(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const from = ids.indexOf(active.id as T)
    const to = ids.indexOf(over.id as T)
    if (from < 0 || to < 0) return

    onReorder(arrayMove([...ids], from, to))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setGhost(null)}
      onDragOver={(_event: DragOverEvent) => undefined}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t('sortable.instructions') } }}
    >
      <SortableContext items={ids as T[]} strategy={layout === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}>
        {children}
      </SortableContext>

      <DragOverlay dropAnimation={{ duration: 150, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }}>
        {ghost && (
          <div
            data-testid="sortable-ghost"
            className="pointer-events-none scale-[1.02] cursor-grabbing rounded-xl shadow-lg"
            style={{ width: ghost.width, height: ghost.height }}
            // ⚠️ ჩვენივე DOM-ის ასლია (React-ის მიერ უკვე დაცული ტექსტით) და არა გარე სტრიქონი
            dangerouslySetInnerHTML={{ __html: ghost.html }}
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}

type ItemProps = Omit<HTMLAttributes<HTMLElement>, 'id'> & {
  id: SortableId
  /** `li` სიაში, `div` ბადეში */
  as?: ElementType
  /** სიაშია, მაგრამ არ ითრევა (დამალული მსახიობი) */
  disabled?: boolean
  /** კლავიატურა და აღება მხოლოდ `SortableHandle`-ზეა (ინპუტებიანი ბარათი) */
  handle?: boolean
  ref?: Ref<HTMLElement>
  children?: ReactNode
}

export function SortableItem({ id, as: Tag = 'li', disabled = false, handle = false, className, style, children, ref, ...rest }: ItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
    transition: TRANSITION,
  })

  const { onPointerDown, onKeyDown, ...otherListeners } = (listeners ?? {}) as {
    onPointerDown?: (event: React.PointerEvent) => void
    onKeyDown?: (event: KeyboardEvent) => void
  } & Record<string, unknown>

  const handleContext = useMemo<HandleContextValue>(
    () => ({ attributes: attributes as unknown as Record<string, unknown>, onKeyDown, setActivatorNodeRef, disabled }),
    [attributes, onKeyDown, setActivatorNodeRef, disabled],
  )

  const mergedRef = useCallback(
    (element: HTMLElement | null) => {
      setNodeRef(element)
      if (typeof ref === 'function') ref(element)
      else if (ref && typeof ref === 'object') (ref as { current: HTMLElement | null }).current = element
    },
    [ref, setNodeRef],
  )

  const dragStyle: CSSProperties = {
    ...style,
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  }

  /* სახელურის გარეშე ელემენტი თვითონ არის კლავიატურის აქტივატორი; სახელურით —
     მხოლოდ მაუსის აღება რჩება მასზე (მთელი ზოლი აიღება), კლავიატურა სახელურზეა */
  const activator = disabled
    ? {}
    : handle
      ? { onPointerDown }
      : { ...attributes, ...otherListeners, onPointerDown, onKeyDown }

  return (
    <HandleContext.Provider value={handle ? handleContext : null}>
      <Tag
        {...rest}
        {...activator}
        ref={mergedRef}
        data-sortable-id={String(id)}
        data-dragging={isDragging ? 'true' : undefined}
        style={dragStyle}
        className={cn(className, !disabled && 'cursor-grab active:cursor-grabbing', isDragging && SLOT_CLASS)}
      >
        {children}
      </Tag>
    </HandleContext.Provider>
  )
}

/**
 * სახელური — ერთი სახე ყველა სიაზე (ყოფილი `DragHandle`). `handle`-რეჟიმში
 * სწორედ ის არის კლავიატურის აქტივატორი და ფოკუსირებადია; სხვაგან მხოლოდ ნიშანია.
 */
export function SortableHandle({ className }: { className?: string }) {
  const { t } = useTranslation()
  const ctx = useContext(HandleContext)

  if (ctx && !ctx.disabled) {
    /* ⚠️ `span` და არა `button` (role/tabIndex dnd-kit-ის `attributes`-იდან მოდის): რიგის
       პირველი ნამდვილი `<button>` მთავარი მოქმედება უნდა დარჩეს, სახელური კი მხოლოდ გასაღებია */
    return (
      <span
        ref={ctx.setActivatorNodeRef}
        {...ctx.attributes}
        onKeyDown={ctx.onKeyDown}
        title={t('actions.drag')}
        aria-label={t('actions.drag')}
        data-sortable-handle=""
        className={cn('grid size-7 shrink-0 cursor-grab place-items-center rounded-md text-muted-foreground active:cursor-grabbing', className)}
      >
        <GripVertical className="size-4" />
      </span>
    )
  }

  return (
    <span className={cn('shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing', className)} title={t('actions.drag')} aria-hidden>
      <GripVertical className="size-4" />
    </span>
  )
}
