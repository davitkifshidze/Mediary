import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/i18n'
import { MyRating } from '@/components/MyRating'

/* ============================================================
   **ჩემი ქულა პირდაპირ სიიდან**.

   ⚠️ მოწმდება: ნიშანი სამივე იერით დასაჭერია და უქულოზე იმავე ადგილას
   „შეფასება" წერია (ადგილი ყოველთვის დაკავებულია); არჩევა მაშინვე მიდის
   `onChange`-ში და ეკრანზეც მაშინვე ჩანს; ჩავარდნაზე ძველი ქულა ბრუნდება;
   იგივე ქულის ხელახლა არჩევა არაფერს აგზავნის.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

function render(props: Parameters<typeof MyRating>[0]) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(h(MyRating, props)))
}

const trigger = () => document.querySelector<HTMLButtonElement>('[data-testid="my-rating"]')!
const option = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[data-rating-option]')].find((o) => o.textContent?.startsWith(label))!

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('MyRating', () => {
  it('უქულო ჩანაწერზე იმავე ადგილას „შეფასება" წერია — სამივე იერით', () => {
    for (const variant of ['row', 'inline', 'stars'] as const) {
      render({ value: null, onChange: async () => {}, variant })

      expect(trigger().textContent).toBe(i18n.t('rating.rate'))
      expect(trigger().getAttribute('title')).toBe(i18n.t('rating.rateHint'))

      act(() => root?.unmount())
      container?.remove()
    }
  })

  it('სტრიქონის ნიშანს ფიქსირებული სიგანე და რიგის სიმაღლე აქვს', () => {
    render({ value: 7.5, onChange: async () => {}, variant: 'row' })

    expect(trigger().textContent).toBe('7.5')
    expect(trigger().className).toContain('w-28')
    expect(trigger().className).toContain('h-9')
    expect(trigger().getAttribute('title')).toBe(i18n.t('rating.change', { score: '7.5 / 10' }))
  })

  it('არჩევა მაშინვე ინახება და ეკრანზეც მაშინვე ჩანს', async () => {
    const onChange = vi.fn(async () => {})
    render({ value: null, onChange, variant: 'row' })

    await act(async () => trigger().click())
    await act(async () => option('8').click())

    expect(onChange).toHaveBeenCalledWith(8)
    // სიის განახლებამდეც ახალი ქულა ჩანს
    expect(trigger().textContent).toBe('8')
  })

  it('ჩავარდნაზე ძველი ქულა ბრუნდება', async () => {
    const onChange = vi.fn(async () => {
      throw new Error('offline')
    })
    render({ value: 6, onChange, variant: 'row' })

    await act(async () => trigger().click())
    await act(async () => option('9').click())
    await flush()

    expect(onChange).toHaveBeenCalledWith(9)
    expect(trigger().textContent).toBe('6')
  })

  it('„შეფასების გარეშე" ქულას შლის, იგივე ქულა კი არაფერს აგზავნის', async () => {
    const onChange = vi.fn(async () => {})
    render({ value: 6, onChange, variant: 'stars' })

    await act(async () => trigger().click())
    await act(async () => option('6').click())
    expect(onChange).not.toHaveBeenCalled()

    await act(async () => trigger().click())
    await act(async () => option(i18n.t('form.ratingNone')).click())
    expect(onChange).toHaveBeenCalledWith(null)
    expect(trigger().textContent).toBe(i18n.t('rating.rate'))
  })
})
