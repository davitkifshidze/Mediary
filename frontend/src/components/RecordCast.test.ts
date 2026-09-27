import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { CastMember } from '@/api/types'
import '@/i18n'

/* ============================================================
   ჩანაწერის მსახიობები (Tasks §16) — **რას უგზავნის UI სერვერს**.

   ⚠️ ეს ფაილი იმიტომ არსებობს, რომ აქ მოწმდება ის, რასაც ვერც ტიპები,
   ვერც `lib/recordCast.test.ts` ვერ ხედავს: `PUT …/order` **სრულ** სიას
   ელის (დამალულებიც, ბოლოში), და გამოტოვება მხოლოდ გაშვებისას 422-ით
   გამოჩნდებოდა. ⚠️ „ერთით წინ" drag & drop-ის კლავიატურის გზაა — ზუსტად
   ის, რომლის შემოწმებაც jsdom-ში native DnD-ით ვერ ხერხდება.

   `GroupsCut.test.ts`-ის პრეცედენტი: ბიბლიოთეკა არ ემატება, ფაილი `.ts`-ია.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  reorderRecordCast: vi.fn(),
  updateRecordCast: vi.fn(),
  detachCastMember: vi.fn(),
}))

vi.mock('@/api/cast', async (original) => ({
  ...(await original<typeof import('@/api/cast')>()),
  ...mocks,
}))

const member = (id: number, name: string, hidden = false): CastMember => ({
  id,
  name,
  name_ka: null,
  photo: null,
  character: null,
  is_hidden: hidden,
})

// A · (B დამალულია) · C — ხილულები: A, C
const CAST = [member(1, 'Anna'), member(2, 'Boris', true), member(3, 'Clara')]

mocks.reorderRecordCast.mockResolvedValue(CAST)
mocks.updateRecordCast.mockResolvedValue(CAST[0])

// React 19-ის `act()` ამ დროშას ითხოვს, თორემ ეფექტებს არ ატარებს
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
})

async function mount() {
  const { RecordCast } = await import('@/components/RecordCast')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root!.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(
          MemoryRouter,
          null,
          h(
            TooltipProvider,
            null,
            h(RecordCast, { type: 'movie', recordId: 5, cast: CAST, detailKey: ['movie', 'detail', '5'] }),
          ),
        ),
      ),
    )
  })

  return container
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** ტექსტის მიხედვით ღილაკი — `@testing-library`-ის გარეშე */
function button(scope: ParentNode, text: string) {
  return [...scope.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(text))
}

/** ბარათის `⋯` მენიუ (პორტალშია, ე.ი. პუნქტები `document.body`-ში ჩნდება) */
async function openMenu(node: HTMLElement, name: string) {
  const card = [...node.querySelectorAll('.group\\/cast')].find((c) => (c.textContent ?? '').includes(name))
  expect(card, `${name}-ის ბარათი უნდა დაიხატოს`).toBeTruthy()

  const trigger = card!.querySelector('button[aria-label]') as HTMLButtonElement | null
  expect(trigger, '`⋯` ღილაკი ბარათზე უნდა იყოს').toBeTruthy()

  await act(async () => trigger!.click())
  await flush()
}

describe('RecordCast', () => {
  it('დამალული მთავარ ბადეში არ ჩანს — მხოლოდ დაკეცილ ჯგუფში', async () => {
    const node = await mount()

    const grid = node.querySelector('section > .grid')
    expect(grid?.textContent).toContain('Anna')
    expect(grid?.textContent).not.toContain('Boris')

    const toggle = button(node, 'დამალული (1)')
    expect(toggle, 'დამალულის ჯგუფი უნდა იყოს').toBeTruthy()

    await act(async () => toggle!.click())
    await flush()
    expect(node.textContent).toContain('Boris')
  })

  it('„ერთით წინ" სერვერს სრულ სიას უგზავნის — დამალულს ბოლოში', async () => {
    const node = await mount()
    await openMenu(node, 'Clara')

    const earlier = button(document.body, 'ერთით წინ')
    expect(earlier, 'მეორე ბარათს „ერთით წინ" უნდა ჰქონდეს').toBeTruthy()

    await act(async () => earlier!.click())
    await flush()

    // ⚠️ `[3, 1]` (დამალულის გარეშე) სერვერზე `cast_order_mismatch` იქნებოდა
    expect(mocks.reorderRecordCast).toHaveBeenCalledWith('movie', 5, [3, 1, 2])
  })

  it('პირველ ბარათს „ერთით წინ" არ აქვს, დამალვა კი ცხადად იგზავნება', async () => {
    const node = await mount()
    await openMenu(node, 'Anna')

    expect(button(document.body, 'ერთით წინ')).toBeUndefined()

    const hide = button(document.body, 'დამალვა')
    expect(hide).toBeTruthy()

    await act(async () => hide!.click())
    await flush()

    expect(mocks.updateRecordCast).toHaveBeenCalledWith('movie', 5, 1, { is_hidden: true })
  })
})
