import type { ReactNode } from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LAYER_POPUP } from '@/lib/layers'

/* ============================================================
   ცხრილის რიგის „მოქმედება" — ჩამოსაშლელი მენიუ (Tasks 1.2).

   Radix-ის `DropdownMenu` პროექტში არ არის და ერთი ღილაკისთვის
   ახალი დამოკიდებულება არ ღირს — `Popover` იმავეს აკეთებს.
   ============================================================ */

export function ActionMenu({
  label,
  trigger,
  children,
}: {
  label: string
  /**
   * საკუთარი დასაჭერი. მითითების გარეშე — `⋯` აიქონი.
   * Tasks 1.2: მომხმარებლების ცხრილში ცხადი ღილაკია („მოქმედება"), რადგან
   * სამი წერტილი user-ისთვის გამოსაცნობი აღმოჩნდა.
   */
  trigger?: ReactNode
  children: ReactNode
}) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        aria-label={label}
        asChild={!!trigger}
        className={
          trigger
            ? undefined
            : 'grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
        }
      >
        {trigger ?? <MoreHorizontal className="size-4" />}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={4}
          className={cn(
            LAYER_POPUP,
            'fb-content w-44 rounded-xl border border-border bg-card p-1.5 shadow-xl focus:outline-none',
          )}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

/** მენიუს ერთი პუნქტი — `asChild`-ით `<Link>`-საც იტევს */
export function actionItemClass(variant?: 'destructive') {
  return cn(
    'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
    variant === 'destructive'
      ? 'text-destructive hover:bg-destructive/10'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  )
}

export const ActionMenuClose = PopoverPrimitive.Close
