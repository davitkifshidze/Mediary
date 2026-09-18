import { afterEach, describe, expect, it } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useInViewOnce } from '@/lib/inView'

/* ============================================================
   **პრივატული ბადე ეკრანს გარეთ ფაილს არ ითხოვს (Tasks PERF-09).**

   ⚠️ სწორედ ამ დროშაზეა დამოკიდებული, წაიკითხავს თუ არა `PhotoCell`
   blob-ს — ე.ი. ტესტი ერთადერთ იმ ლოგიკას იცავს, რომელიც ტასკმა მოიტანა:
   „გამოჩნდა" **ერთხელ** ინთება და უკან აღარ ბრუნდება, ხოლო
   `IntersectionObserver`-ის გარეშე (jsdom, ძველი ბრაუზერი) პასუხი
   დღევანდელივეა — „ჩანს".

   ⚠️ jsdom-ს `IntersectionObserver` **არ აქვს**, ამიტომ ის აქ ხელით
   იდგმება; ესეც ნიშნავს, რომ ფოლბექის შტოს შემოწმება უფასოა.
   ============================================================ */

// React 19-ის `act()` ამ დროშას ითხოვს, თორემ ეფექტებს არ ატარებს
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Watcher = {
  callback: IntersectionObserverCallback
  observed: Element[]
  disconnected: boolean
}

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver
})

/** ცრუ დამკვირვებელი — აბრუნებს „ვის უყურებს" და მის callback-ს */
function stubObserver(): Watcher[] {
  const watchers: Watcher[] = []

  class Stub {
    private watcher: Watcher

    constructor(callback: IntersectionObserverCallback) {
      this.watcher = { callback, observed: [], disconnected: false }
      watchers.push(this.watcher)
    }

    observe(node: Element) {
      this.watcher.observed.push(node)
    }

    disconnect() {
      this.watcher.disconnected = true
    }

    unobserve() {}
  }

  ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = Stub

  return watchers
}

/** ერთი უჯრა — `data-seen` პასუხის ჩვენების ერთადერთი გზაა */
function Tile() {
  const [ref, inView] = useInViewOnce<HTMLDivElement>()

  return h('div', { ref, 'data-seen': inView ? 'yes' : 'no' })
}

function mount() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(h(Tile)))

  return container.querySelector('div')!
}

function seen(node: Element): string | null {
  return node.getAttribute('data-seen')
}

function fire(watcher: Watcher, node: Element, isIntersecting: boolean) {
  act(() => {
    watcher.callback(
      [{ isIntersecting, target: node } as unknown as IntersectionObserverEntry],
      null as unknown as IntersectionObserver,
    )
  })
}

describe('useInViewOnce', () => {
  it('ეკრანს გარეთ უჯრა ჯერ არ „ჩანს"', () => {
    const watchers = stubObserver()
    const node = mount()

    expect(seen(node)).toBe('no')
    // ⚠️ დამკვირვებელი კვანძზე მაშინვე უნდა დაებას — თორემ უჯრა სამუდამოდ
    // დარჩება „არ ჩანს" და ფოტო არასდროს ჩამოვიდება
    expect(watchers[0].observed).toEqual([node])
  })

  it('გამოჩენა ერთხელ ინთება და უკან აღარ ბრუნდება', () => {
    const watchers = stubObserver()
    const node = mount()

    fire(watchers[0], node, true)
    expect(seen(node)).toBe('yes')
    // გამოჩენის შემდეგ დაკვირვება უსაქმოა
    expect(watchers[0].disconnected).toBe(true)

    // ⚠️ უკან გასრიალება ფოტოს **არ** უნდა ჩააქროს: `usePrivateFileUrl`
    // მისამართის ცვლილებაზე object URL-ს ათავისუფლებს, ე.ი. ორმხრივი
    // დროშა სურათის გაქრობას და ხელახალ ჩამოტვირთვას ნიშნავდა
    fire(watchers[0], node, false)
    expect(seen(node)).toBe('yes')
  })

  it('დამკვირვებლის გარეშე ყველაფერი „ჩანს"', () => {
    expect((globalThis as { IntersectionObserver?: unknown }).IntersectionObserver).toBeUndefined()

    expect(seen(mount())).toBe('yes')
  })
})
