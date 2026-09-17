import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement as h, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FeedbackProvider, useConfirm } from '@/components/ui/feedback'
import { errorMessage } from '@/lib/errors'
import i18n from '@/i18n'
import en from '@/i18n/en.json'
import ka from '@/i18n/ka.json'

/* ============================================================
   რეგრესია: **confirm-ის ღილაკები UI-ს ენას მიჰყვება** (Tasks BUG-01).

   ⚠️ ნაგულისხმევი ტექსტები `'გაუქმება'`/`'დადასტურება'` literal-ები
   იყო, და 49 `confirm({`-იდან უმეტესობა `cancelText`-ს არ აწვდის — ე.ი.
   ინგლისურ ინტერფეისში თითქმის ყველა წაშლის დიალოგი ქართულ ღილაკს
   ხატავდა. `tsc`-ც და lint-იც literal-ს ვალიდურად თვლის, ე.ი. ამას მხოლოდ
   **დახატვა** ამჟღავნებს.

   ⚠️ ბიბლიოთეკა არ დამატებულა (`react-dom/client` + `act()`), ფაილი `.ts`-ია.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(async () => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  await act(async () => {
    await i18n.changeLanguage('ka')
  })
})

/** ღილაკის ტექსტის გარეშე confirm — ზუსტად ის, რასაც უმეტესი გამომძახებელი აკეთებს */
function Ask() {
  const confirm = useConfirm()
  useEffect(() => {
    void confirm({ title: 'Delete?' })
  }, [confirm])
  return null
}

async function openConfirmIn(lang: 'ka' | 'en') {
  await act(async () => {
    await i18n.changeLanguage(lang)
  })

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(h(FeedbackProvider, null, h(Ask))))
}

const buttonLabels = () => [...document.querySelectorAll('button')].map((b) => b.textContent?.trim())

describe('FeedbackProvider — confirm', () => {
  it('speaks English in an English UI', async () => {
    await openConfirmIn('en')

    expect(buttonLabels()).toEqual(expect.arrayContaining([en.confirm.cancel, en.confirm.confirm]))
    expect(document.body.textContent).not.toContain('გაუქმება')
    expect(document.body.textContent).not.toContain('დადასტურება')
  })

  it('reads the Georgian labels from the locale, not from a literal', async () => {
    await openConfirmIn('ka')

    expect(buttonLabels()).toEqual(expect.arrayContaining([ka.confirm.cancel, ka.confirm.confirm]))
  })
})

describe('errorMessage — fallback', () => {
  it('follows the UI language at call time', async () => {
    await act(async () => {
      await i18n.changeLanguage('en')
    })
    expect(errorMessage({})).toBe(en.toast.error)

    await act(async () => {
      await i18n.changeLanguage('ka')
    })
    expect(errorMessage({})).toBe(ka.toast.error)
  })
})
