import type { ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'

/**
 * კომპაქტური მოდალი (ჟანრები, ვიდეოს ფორმა …).
 * z-60/61 — `useConfirm` (z-90) მასზე მაღლა დგება.
 */
export function ModalShell({
  title,
  onClose,
  destructive,
  wide,
  children,
}: {
  title: string
  onClose: () => void
  destructive?: boolean
  /**
   * ფორმებსა და ჩანაწერების მართვას (C1) ვიწრო დიალოგი არ ჰყოფნის.
   * Tasks 2.3 — `wide` აშკარად განიერია, რომ ველები ორ სვეტად დაეწყოს
   * და მოდალი მაღალი „მილივით" აღარ გამოიყურებოდეს.
   */
  wide?: boolean
  children: ReactNode
}) {
  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fb-overlay fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className={cn(
            'fb-content fixed left-1/2 top-1/2 z-[61] max-h-[90vh] w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-xl focus:outline-none',
            wide ? 'max-w-3xl' : 'max-w-lg',
          )}
        >
          <DialogPrimitive.Title
            className={cn(
              'font-display text-lg font-semibold tracking-tight',
              destructive && 'text-destructive',
            )}
          >
            {title}
          </DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
