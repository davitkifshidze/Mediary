import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { UploadedFile } from '@/api/account'
import '@/i18n'

/* ============================================================
   რეგრესია: **ფაილების ბიბლიოთეკაში ჩეკბოქსზე დაჭერა არაფერს აკეთებდა**
   (Tasks §3).

   მონიშვნის რეჟიმში `toggle`-ს ორი ადგილი იძახებდა — მწკრივის `onClick`
   და ჩეკბოქსის `onCheckedChange` — და Radix დაწკაპუნებას ზემოთ უშვებს.
   ე.ი. ჩეკბოქსზე დაჭერა მდგომარეობას ორჯერ ცვლიდა და ბოლოს არაფერი
   იცვლებოდა. ⚠️ ამას ვერც `tsc` ხედავს და ვერც lint — მხოლოდ დამაუნთება.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.setConfig({ testTimeout: 20_000 })

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

const file = (path: string): UploadedFile =>
  ({
    kind: 'doc',
    module: 'note',
    owner_type: 'note_entry_file',
    owner_id: 1,
    path,
    name: path,
    size: 1024,
    private: true,
    created_at: null,
  }) as unknown as UploadedFile

async function mount() {
  const { StorageLibrary } = await import('@/components/StorageLibrary')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root!.render(
      h(
        TooltipProvider,
        null,
        h(StorageLibrary, {
          files: [file('notes/a.pdf'), file('notes/b.pdf')],
          onBulkDelete: () => {},
        }),
      ),
    )
  })

  return container
}

const box = (node: HTMLElement, name: string) =>
  node.querySelector<HTMLButtonElement>(`button[role="checkbox"][aria-label="${name}"]`)!

const checked = (el: HTMLElement) => el.getAttribute('aria-checked') === 'true'

describe('StorageLibrary — მონიშვნა', () => {
  for (const view of ['list', 'grid'] as const) {
    it(`${view}: ჩეკბოქსზე დაჭერა ერთხელ რთავს და ერთხელ თიშავს`, async () => {
      const node = await mount()

      if (view === 'grid') {
        await act(async () => node.querySelector<HTMLButtonElement>('button[aria-label="grid"]')!.click())
      }

      const a = box(node, 'notes/a.pdf')
      expect(a, 'ჩეკბოქსი ვერ მოიძებნა').toBeTruthy()

      await act(async () => a.click())
      expect(checked(box(node, 'notes/a.pdf'))).toBe(true)

      await act(async () => box(node, 'notes/a.pdf').click())
      expect(checked(box(node, 'notes/a.pdf'))).toBe(false)
    })
  }

  /** მწკრივზე დაჭერა კვლავ ნიშნავს — ფიქსმა ეს ქცევა არ უნდა წაიღოს */
  it('მწკრივზე დაჭერა კვლავ ნიშნავს', async () => {
    const node = await mount()

    const row = box(node, 'notes/b.pdf').closest('li')!
    await act(async () => row.click())

    expect(checked(box(node, 'notes/b.pdf'))).toBe(true)
  })
})
