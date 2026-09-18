import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { FeedbackProvider } from '@/components/ui/feedback'
import { SettingsProvider, useSettings } from '@/lib/settings'
import '@/i18n'

/* ============================================================
   რეგრესია: **პარამეტრების შენახვის ჩავარდნა უხმაუროდ იკარგებოდა**
   (Tasks GAP-03).

   ⚠️ `save()`-ის `catch`-ი ცარიელი იყო (`.catch(() => {})`), ე.ი. 500/419
   ან გაწყვეტილი ქსელი ეკრანზე **არაფერს** ცვლიდა: ზოლი ისევ „შეუნახავი
   ცვლილებებს" აჩვენებდა ახსნის გარეშე და მომხმარებელი Save-ს
   უსასრულოდ აჭერდა. ეს `/settings`-ისა და `/sync`-ის ერთადერთი შენახვის
   გზაა.

   ⚠️ **პროვაიდერის რიგიც ამ ტასკის ნაწილია**: `ToastContext`-ს უმოქმედო
   ნაგულისხმევი აქვს (`toast: () => 0`), ე.ი. `FeedbackProvider`-ის გარეთ
   `useToast()` არ ცდება — **ჩუმად არაფერს აკეთებს**. ამიტომ `main.tsx`-ში
   `FeedbackProvider` `SettingsProvider`-ზე გარეთ გადავიდა; ტესტი იმავე
   რიგს იმეორებს.

   ⚠️ ამას მხოლოდ ნამდვილი მიმაგრება იჭერს — `tsc`-ც და lint-იც მწვანე იყო.
   ============================================================ */

// React 19-ის `act()` ამ დროშას ითხოვს, თორემ ეფექტებს არ ატარებს
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { saveSettings } = vi.hoisted(() => ({ saveSettings: vi.fn() }))

vi.mock('@/api/account', () => ({ saveSettings }))

/* ⚠️ user **სავალდებულოა**: `save()` მის გარეშე მხოლოდ localStorage-ში წერს
   და backend-ს საერთოდ არ ეკითხება. `settings`-ი განზრახ არაცარიელია —
   ცარიელზე პროვაიდერი ერთჯერად მიგრაციას უშვებს (`saveSettings` მაუნთზევე),
   რაც ამ ტესტს ხმაურს შემატებდა. */
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 1, settings: { libraryPageSize: 0 } } }),
}))

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  saveSettings.mockReset()
  localStorage.clear()
})

/** react-query-ის/promise-ების შემდეგი tick — `act`-ის შიგნით */
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

function mount() {
  let change: () => void = () => {}
  let submit: () => void = () => {}
  let dirty = false

  function Harness() {
    const settings = useSettings()
    dirty = settings.dirty

    useEffect(() => {
      change = () => settings.set('libraryPageSize', 42)
      submit = settings.save
    }, [settings])

    return null
  }

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  act(() => {
    root!.render(h(FeedbackProvider, null, h(SettingsProvider, null, h(Harness))))
  })

  return {
    change: () => act(() => change()),
    submit: () => act(() => submit()),
    dirty: () => dirty,
  }
}

/** ეკრანზე მდგარი toast-ების სათაურები */
const toasts = () =>
  [...document.body.querySelectorAll('.fb-toast p.font-medium')].map((n) => n.textContent)

/** 500 — სერვერის პასუხით, ზუსტად როგორც axios-ისგან მოვიდოდა */
function serverError(): AxiosError {
  const response = {
    status: 500,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { message: 'Server Error' },
  } as AxiosResponse

  return new AxiosError('Request failed with status code 500', 'ERR_BAD_RESPONSE', undefined, undefined, response)
}

describe('SettingsProvider', () => {
  it('შენახვის ჩავარდნაზე toast ჩანს და ცვლილება შეუნახავი რჩება', async () => {
    saveSettings.mockRejectedValue(serverError())
    const ui = mount()

    ui.change()
    expect(ui.dirty()).toBe(true)

    ui.submit()
    await flush()

    expect(saveSettings).toHaveBeenCalledTimes(1)
    expect(toasts()).toEqual(['Server Error'])

    // ⚠️ `persisted` არ უნდა განახლდეს — ცვლილება ჯერ არ შენახულა
    expect(ui.dirty(), 'ჩავარდნის შემდეგ ცვლილება შეუნახავი უნდა დარჩეს').toBe(true)
  })

  it('წარმატებულ შენახვაზე toast არ ჩნდება და dirty ცხრება', async () => {
    saveSettings.mockResolvedValue(undefined)
    const ui = mount()

    ui.change()
    ui.submit()
    await flush()

    expect(toasts()).toEqual([])
    expect(ui.dirty()).toBe(false)
  })
})
