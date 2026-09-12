import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LAYER_POPUP } from '@/lib/layers'

export interface MultiSelectOption {
  value: string
  label: string
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: MultiSelectOption[]
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.filter((o) => value.includes(o.value))
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="flex min-h-10 w-full cursor-pointer flex-wrap items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {selected.length === 0 && (
            <span className="px-1 text-muted-foreground">{placeholder ?? '—'}</span>
          )}
          {selected.map((o) => (
            <span
              key={o.value}
              className="inline-flex items-center gap-1 rounded-md bg-secondary py-0.5 pl-2 pr-1 text-xs font-medium text-secondary-foreground"
            >
              {o.label}
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(value.filter((x) => x !== o.value))
                }}
                className="grid size-4 cursor-pointer place-items-center rounded-sm hover:bg-foreground/10 hover:text-destructive"
              >
                <X className="size-3" />
              </span>
            </span>
          ))}
          <ChevronDown className="ml-auto size-4 shrink-0 opacity-60" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className={cn(
            LAYER_POPUP,
            'max-h-72 w-[var(--radix-popover-trigger-width)] overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md',
          )}
        >
          {options.map((o) => {
            const checked = value.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
              >
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded border',
                    checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                  )}
                >
                  {checked && <Check className="size-3" />}
                </span>
                {o.label}
              </button>
            )
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
