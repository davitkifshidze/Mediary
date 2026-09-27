import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { UploadKindLimit } from '@/api/account'
import { acceptFor, uploadProblem, usePendingUploads, type PendingUploads } from './pendingUploads'

/* ============================================================
   `lib/pendingUploads.ts` — შენახვამდე არჩეული ფაილები (Tasks §23.4).

   ⚠️ მთავარი წესი, რასაც ეს ფაილი იცავს: **ერთი ფაილის ჩავარდნა დანარჩენს
   არ აჩერებს და ჩანაწერს არ აუქმებს** — წარმატებული სიიდან ქრება,
   ჩავარდნილი მიზეზით რჩება, რომ ხელახლა სცადო.
   ============================================================ */

const DOC: UploadKindLimit = {
  kind: 'doc',
  max_kb: 20480,
  max_bytes: 1000,
  capped_by_server: false,
  mimes: ['pdf', 'docx'],
}
const IMAGE: UploadKindLimit = { ...DOC, kind: 'image', mimes: [] }

const file = (name: string, size = 10, type = '') => new File(['x'.repeat(size)], name, { type })

describe('uploadProblem', () => {
  it('ზომა და ფორმატი — სერვერის იგივე ლიმიტით', () => {
    expect(uploadProblem(file('a.pdf', 2000), 'doc', DOC)).toBe('too_large')
    expect(uploadProblem(file('a.exe'), 'doc', DOC)).toBe('wrong_type')
    expect(uploadProblem(file('A.PDF'), 'doc', DOC)).toBeNull()
  })

  /** ⚠️ `image`-ს გაფართოებების სია არ აქვს — ტიპი ამოწმებს */
  it('სურათს ტიპი ამოწმებს და არა გაფართოება', () => {
    expect(uploadProblem(file('a.txt', 10, 'text/plain'), 'image', IMAGE)).toBe('wrong_type')
    expect(uploadProblem(file('a.jpg', 10, 'image/jpeg'), 'image', IMAGE)).toBeNull()
  })

  it('ლიმიტის გარეშე — სერვერი გადაწყვეტს', () => {
    expect(uploadProblem(file('a.exe', 99999), 'doc', undefined)).toBeNull()
  })
})

describe('acceptFor', () => {
  it('დოკუმენტსაც აქვს `accept` (§23.4)', () => {
    expect(acceptFor('doc', DOC)).toBe('.pdf,.docx')
    expect(acceptFor('image', IMAGE)).toBe('image/*')
    expect(acceptFor('video', undefined)).toBe('video/*')
    expect(acceptFor('doc', undefined)).toBeUndefined()
  })
})

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('usePendingUploads', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  beforeAll(() => {
    // jsdom-ს `createObjectURL` არ აქვს
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
  })

  async function harness() {
    const ref: { current: PendingUploads<'image' | 'doc'> | null } = { current: null }

    function Probe() {
      ref.current = usePendingUploads<'image' | 'doc'>()
      return null
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root!.render(h(Probe)))

    return ref
  }

  it('ჩავარდნილი რჩება მიზეზით, წარმატებული ქრება — და რიგი არ ჩერდება', async () => {
    const ref = await harness()

    await act(async () => {
      ref.current!.add('doc', [file('good.pdf'), file('bad.pdf'), file('late.pdf')])
    })
    expect(ref.current!.items).toHaveLength(3)

    const uploaded: string[] = []
    let failed: Awaited<ReturnType<PendingUploads<'image' | 'doc'>['run']>> = []

    await act(async () => {
      failed = await ref.current!.run(async (_kind, f) => {
        if (f.name === 'bad.pdf') throw new Error('quota')
        uploaded.push(f.name)
      })
    })

    // ⚠️ ჩავარდნამ მომდევნო ფაილი არ გააჩერა
    expect(uploaded).toEqual(['good.pdf', 'late.pdf'])
    expect(failed.map((f) => f.file.name)).toEqual(['bad.pdf'])
    expect(ref.current!.items.map((i) => [i.file.name, i.status])).toEqual([['bad.pdf', 'error']])
  })

  it('სურათს წინასწარი ხედი აქვს და წაშლისას თავისუფლდება', async () => {
    const ref = await harness()

    await act(async () => {
      ref.current!.add('image', [file('a.jpg', 10, 'image/jpeg')])
    })
    const [item] = ref.current!.items
    expect(item.preview).toBe('blob:preview')

    await act(async () => ref.current!.remove(item.key))
    expect(ref.current!.items).toHaveLength(0)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  })
})
