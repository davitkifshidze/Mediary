import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { safeGet, safeSet } from '@/lib/storage'
import { useTheme } from '@/hooks/useTheme'

/* ============================================================
   რეგრესია: **დაბლოკილი საცავი აპს თეთრ ეკრანზე აგდებდა** (Tasks BUG-24).

   ⚠️ „ყველა ქუქის/საიტის მონაცემის ბლოკირებაზე" ისვრის **თვითონ
   `window.localStorage`-ზე მიმართვა** და არა მხოლოდ ჩაწერა, ხოლო
   `i18n/index.ts` მას **მოდულის დონეზე** კითხულობდა — ე.ი. ჩავარდნა
   იმპორტისას ხდებოდა, `ErrorBoundary`-მდე ბევრად ადრე. მისი დაჭერა
   არსად შეიძლებოდა, გვერდი უბრალოდ ცარიელი რჩებოდა.

   ⚠️ ამას **ვერც `tsc` ხედავს და ვერც lint**: `localStorage.getItem()`
   სრულიად ვალიდური კოდია. ერთადერთი, რაც იჭერს, საცავის ნამდვილი
   ჩავარდნაა — სწორედ ამას აკეთებს ქვემოთ `blockStorage()`.
   ============================================================ */

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * `window.localStorage`-ს ჩამგდებ getter-ად ცვლის — ზუსტად ის ქცევა,
 * რაც ბრაუზერს დაბლოკილ საცავზე აქვს.
 *
 * ⚠️ აღდგენა **დესკრიპტორით** ხდება და არა `delete`-ით: jsdom-ში ეს
 * window-ის საკუთარი თვისებაა და მისი წაშლა საცავს სამუდამოდ წაიღებდა.
 */
function blockStorage(): () => void {
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage')

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    },
  })

  return () => {
    if (original) {
      Object.defineProperty(window, 'localStorage', original)
    } else {
      delete (window as unknown as Record<string, unknown>).localStorage
    }
  }
}

let restore: (() => void) | null = null
let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  restore?.()
  restore = null
})

describe('lib/storage', () => {
  it('დაბლოკილ საცავზე წაკითხვა `null`-ია და ჩაწერა ჩუმად გადის', () => {
    restore = blockStorage()

    expect(() => safeGet('lang')).not.toThrow()
    expect(safeGet('lang')).toBeNull()
    expect(() => safeSet('lang', 'en')).not.toThrow()
  })

  it('მუშა საცავზე ჩვეულებრივ კითხულობს და წერს', () => {
    safeSet('mediary.test.key', 'x')
    expect(safeGet('mediary.test.key')).toBe('x')
    window.localStorage.removeItem('mediary.test.key')
  })

  /**
   * ⚠️ **ესაა თვითონ ხარვეზი**: `savedLanguage` მოდულის დონეზე ითვლება,
   * ე.ი. `@/i18n`-ის იმპორტი დაბლოკილ საცავზე მთელ აპს აგდებდა.
   */
  it('`@/i18n` დაბლოკილ საცავზეც იმპორტირდება და ქართულს ირჩევს', async () => {
    vi.resetModules()
    restore = blockStorage()

    const mod = await import('@/i18n')

    expect(mod.savedLanguage).toBe('ka')
  })

  it('`useTheme()` დაბლოკილ საცავზე ღია თემას აბრუნებს და არ ვარდება', () => {
    restore = blockStorage()

    let theme: string | null = null

    function Probe() {
      theme = useTheme().theme

      return null
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    expect(() => act(() => root!.render(h(Probe)))).not.toThrow()
    expect(theme).toBe('light')
  })
})
