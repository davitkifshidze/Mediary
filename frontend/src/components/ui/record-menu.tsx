import { Fragment, type ReactNode, type ComponentType, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Check,
  Circle,
  CircleDot,
  ExternalLink,
  Info,
  Play,
  SquarePen,
  Star,
  Trash2,
} from 'lucide-react'
import type { Status } from '@/api/types'
import { enumStatusKey, enumStatusTone, statusName, statusTone, type EnumStatusDomain } from '@/lib/statuses'
import { cn } from '@/lib/utils'
import { ActionMenu, ActionMenuClose, actionItemClass } from '@/components/ui/action-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { ModuleIcon } from '@/components/ModuleIcon'
import { enumStatusIcon } from '@/components/StatusBadge'
import { statusStyle } from '@/lib/statusColor'
import { STATUS_TEXT } from '@/lib/statusStyles'

/* ============================================================
   **ჩანაწერის მოქმედებების ერთი სია — ორი წარმოდგენა**.

   შენი სიტყვები: „აბსოლუტურად ყველგან მჭირდება კონტექსტური მენიუები" ·
   „კონტექსტური მენიუც, სადაც მსგავსი ჩამონათვალებია, ყველგან დამჭირდება".

   ⚠️ **ერთი `MenuAction[]` სია, ორი გამომხატველი**: `RecordContextMenu`
   (მარჯვენა ღილაკი, Radix ContextMenu) და `RecordActionMenu` (`⋯` ღილაკი,
   `ActionMenu`-ზე). აქამდე `MovieCard`, ბუკმარკები და პირადი მოდული სიას
   ხელით წერდა ორჯერ — და ორი ასლი აუცილებლად გაშორდებოდა (ერთში „წაშლა"
   იქნებოდა, მეორეში არა). მსახიობებისა და ფოტოს უჯრის `castActions()`/
   `photoActions()` იმავე პრინციპზეა — ეს მათი განზოგადებაა ყველა სიისთვის.

   ⚠️ **დიალოგის გამხსნელი პუნქტი `setTimeout(…, 0)`-ით ეშვება** — ყველა,
   უპირობოდ: Radix-ის მენიუ დახურვისას ფოკუსს უკან აბრუნებს და მაშინვე
   გახსნილ დიალოგს ართმევდა (`MovieCard`-ის ძველი წესი). ნავიგაციასაც
   ერთი tick-ით გადადება არ აწყენს.

   ⚠️ **ქვემენიუ `⋯`-ში ბრტყელდება**: Popover-ზე აწყობილ მენიუს ჩადგმული
   ფენა არ აქვს, ამიტომ „სტატუსი ▸" იქ სათაურიანი ჯგუფია (სათაური + პუნქტები
   ✓-ით) — იგივე სია, სხვა ფორმა.

   ⚠️ **სტანდარტული რიგი**: გახსნა · დაკვრა/ბმული · სტატუსი ▸ ·
   რჩეული · მოდულის საკუთარი · — · რედაქტირება · წაშლა. `statusActions()`
   (ლექსიკონი) და `enumStatusActions()` (წიგნი · თამაში · კურსი · ადგილი)
   სტატუსების ქვემენიუს ერთი ფუნქციით აწყობს, რომ ყველა მოდულზე ერთნაირი იყოს.

   ⚠️ **ყოველ პუნქტს აიქონი აქვს — `icon` ტიპში სავალდებულოა**: უაიქონო პუნქტი
   აიქონიანების გვერდით ტექსტს მარცხნივ სწევს და სია ორ სვეტად იკითხება. ქვემენიუს
   პუნქტიც (სტატუსი) თავის აიქონსა და ფერს ხატავს — იმავეს, რაც ბეჯზეა.
   `scripts/menu-icons.mjs` ამოწმებს, რომ ველი ისევ სავალდებულოა.
   ============================================================ */

/** სტანდარტული პუნქტების აიქონები — ყველა მოდულზე ერთნაირი */
export const MENU_ICONS = {
  open: Info,
  play: Play,
  link: ExternalLink,
  favorite: Star,
  edit: SquarePen,
  delete: Trash2,
  /** „სტატუსი ▸" — ქვემენიუს სათაურის პუნქტი */
  status: CircleDot,
} as const

export interface MenuAction {
  key: string
  label: string
  /**
   * lucide-ის აიქონი ან ნებისმიერი კომპონენტი, რომელიც `className`/`style`-ს იღებს (სტატუსის
   * აიქონი სახელით). ⚠️ **სავალდებულოა** — მენიუს ყოველ პუნქტს თავისი აიქონი აქვს.
   */
  icon: ComponentType<{ className?: string; style?: CSSProperties }>
  /** აიქონის დამატებითი კლასი — მაგ. შევსებული ვარსკვლავი რჩეულზე */
  iconClassName?: string
  /** სტატუსის საკუთარი ფერი (`statusStyle(s, 'icon')`) */
  iconStyle?: CSSProperties
  /** წითელი პუნქტი — წაშლა, მოხსნა */
  danger?: boolean
  disabled?: boolean
  /** ✓ ქვემენიუს პუნქტზე — მიმდინარე სტატუსი */
  checked?: boolean
  /** ქვემენიუ (სტატუსები); `run` მაშინ არ იძახება */
  sub?: MenuAction[]
  /** გამყოფი ხაზი ამ პუნქტის **წინ** */
  separator?: boolean
  run?: () => void
}

/** სტატუსების ქვემენიუ — ლექსიკონიდან, მიმდინარეზე ✓ (როლით არა, გასაღებით) */
export function statusActions(
  label: string,
  statuses: Status[],
  current: Status | null | undefined,
  lang: string,
  pick: (key: string) => void,
): MenuAction {
  return {
    key: 'status',
    label,
    icon: MENU_ICONS.status,
    // თითო პუნქტს თავისი აიქონი და ფერი აქვს (ლექსიკონის `icon`/`color`, სხვაგვარად როლის ტონი)
    sub: statuses.map((s) => ({
      key: `status:${s.key}`,
      label: statusName(s, lang),
      icon: (props: { className?: string; style?: CSSProperties }) => <ModuleIcon name={s.icon ?? 'Circle'} {...props} />,
      iconClassName: STATUS_TEXT[statusTone(s)],
      iconStyle: statusStyle(s, 'icon'),
      checked: current?.id === s.id,
      run: () => pick(s.key),
    })),
  }
}

/**
 * enum-სტატუსების ქვემენიუ — წიგნი, თამაში, კურსი, ადგილი: სახელი i18n-იდან, აიქონი და
 * ფერი იგივე, რაც ბეჯზე (`EnumStatusBadge`); მიმდინარეზე ✓.
 */
export function enumStatusActions<S extends string>(
  domain: EnumStatusDomain,
  label: string,
  options: readonly S[],
  current: S,
  t: (key: string) => string,
  pick: (next: S) => void,
): MenuAction {
  return {
    key: 'status',
    label,
    icon: MENU_ICONS.status,
    sub: options.map((s) => {
      const key = enumStatusKey(domain, s)

      return {
        key: `status:${s}`,
        label: key ? t(key) : s,
        icon: enumStatusIcon(domain, s) ?? Circle,
        iconClassName: STATUS_TEXT[enumStatusTone(domain, s)],
        checked: current === s,
        run: () => pick(s),
      }
    }),
  }
}

/** რჩეულის პუნქტი — ტექსტი და შევსებული ვარსკვლავი მდგომარეობის მიხედვით */
export function favoriteAction(isFavorite: boolean, run: () => void, t: (key: string) => string): MenuAction {
  return {
    key: 'favorite',
    label: t(isFavorite ? 'actions.unfavorite' : 'actions.favorite'),
    icon: MENU_ICONS.favorite,
    iconClassName: isFavorite ? 'fill-current text-favorite' : undefined,
    run,
  }
}

/** პუნქტის გაშვება — მენიუ ჯერ ბოლომდე იხურება */
const deferred = (run?: () => void) => () => {
  if (run) setTimeout(run, 0)
}

/** კონტექსტური მენიუს პუნქტები — `PhotoStack`-ის `menu` პროპისთვისაც გამოდგება */
export function contextMenuItems(actions: MenuAction[]): ReactNode {
  return actions.map((action) => (
    <Fragment key={action.key}>
      {action.separator && <ContextMenuSeparator />}
      {action.sub ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={action.disabled}>
            <action.icon className={cn('size-3.5', action.iconClassName)} style={action.iconStyle} />
            {action.label}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {action.sub.map((item) => (
              <ContextMenuItem key={item.key} disabled={item.disabled} onSelect={deferred(item.run)}>
                <Check className={cn('fb-selected size-3.5', item.checked ? 'opacity-100' : 'opacity-0')} />
                <item.icon className={cn('size-3.5', item.iconClassName)} style={item.iconStyle} />
                {item.label}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : (
        <ContextMenuItem
          disabled={action.disabled}
          onSelect={deferred(action.run)}
          className={cn(action.danger && 'text-destructive focus:bg-destructive/10 focus:text-destructive')}
        >
          <action.icon className={cn('size-3.5', action.iconClassName)} style={action.iconStyle} />
          {action.label}
        </ContextMenuItem>
      )}
    </Fragment>
  ))
}

/** მარჯვენა ღილაკი ბარათზე/სტრიქონზე */
export function RecordContextMenu({
  actions,
  children,
  disabled,
}: {
  actions: MenuAction[]
  children: ReactNode
  /** მენიუ არ იხსნება — ბრაუზერის საკუთარი რჩება */
  disabled?: boolean
}) {
  if (disabled || actions.length === 0) return <>{children}</>

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>{contextMenuItems(actions)}</ContextMenuContent>
    </ContextMenu>
  )
}

/** `⋯` ღილაკი — იგივე სია Popover-ში; ქვემენიუ სათაურიან ჯგუფად */
export function RecordActionMenu({
  actions,
  label,
  trigger,
}: {
  actions: MenuAction[]
  label?: string
  trigger?: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <ActionMenu label={label ?? t('actions.more')} trigger={trigger}>
      {actions.map((action) => (
        <Fragment key={action.key}>
          {action.separator && <div className="my-1 h-px bg-border" />}
          {action.sub ? (
            <div>
              <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <action.icon className={cn('size-3.5', action.iconClassName)} style={action.iconStyle} />
                {action.label}
              </p>
              {action.sub.map((item) => (
                <ActionMenuClose key={item.key} asChild>
                  <button type="button" className={actionItemClass()} disabled={item.disabled} onClick={item.run}>
                    <Check className={cn('fb-selected size-3.5', item.checked ? 'opacity-100' : 'opacity-0')} />
                    <item.icon className={cn('size-3.5', item.iconClassName)} style={item.iconStyle} />
                    {item.label}
                  </button>
                </ActionMenuClose>
              ))}
            </div>
          ) : (
            <ActionMenuClose asChild>
              <button
                type="button"
                className={actionItemClass(action.danger ? 'destructive' : undefined)}
                disabled={action.disabled}
                onClick={deferred(action.run)}
              >
                <action.icon className={cn('size-3.5', action.iconClassName)} style={action.iconStyle} />
                {action.label}
              </button>
            </ActionMenuClose>
          )}
        </Fragment>
      ))}
    </ActionMenu>
  )
}
