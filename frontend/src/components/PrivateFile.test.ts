import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fetchPrivateObjectUrl, PrivateFileLink, PrivateImage } from '@/components/PrivateFile'

/* ============================================================
   პრივატული დისკის ფაილი: axios-ით blob-ად იკითხება (იგივე cookie/XSRF),
   `blob:` მისამართით იხატება და ეს მისამართი თავისუფლდება — როცა
   კომპონენტი ქრება ან ფაილი იცვლება. დაგვიანებული პასუხი უკვე გამქრალ
   კომპონენტზე მისამართს საერთოდ არ ქმნის.
   ============================================================ */

const mocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/lib/api', async (original) => {
  const real = await original<typeof import('@/lib/api')>()
  return { ...real, api: { ...real.api, get: mocks.get } }
})

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/* jsdom-ს object URL არ აქვს */
let counter = 0
const createObjectURL = vi.fn((blob: Blob) => `blob:test/${++counter}-${blob.size}`)
const revokeObjectURL = vi.fn()
const originalCreate = URL.createObjectURL
const originalRevoke = URL.revokeObjectURL

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  counter = 0
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = revokeObjectURL
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  URL.createObjectURL = originalCreate
  URL.revokeObjectURL = originalRevoke
  vi.clearAllMocks()
})

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

const blob = (body = 'x') => new Blob([body], { type: 'image/png' })

async function render(node: ReturnType<typeof h>) {
  if (!root) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  }
  await act(async () => root!.render(node))
  await flush()
}

describe('PrivateImage', () => {
  it('fetches the file as a blob through the api client and shows it', async () => {
    mocks.get.mockResolvedValue({ data: blob('abc') })
    await render(h(PrivateImage, { url: '/note-files/12', alt: 'scan' }))

    expect(mocks.get).toHaveBeenCalledWith('/note-files/12', { responseType: 'blob' })
    const img = container!.querySelector('img')!
    expect(img.getAttribute('src')).toBe('blob:test/1-3')
    expect(img.getAttribute('alt')).toBe('scan')
  })

  it('shows a spinner placeholder while loading', async () => {
    mocks.get.mockReturnValue(new Promise(() => {}))
    await render(h(PrivateImage, { url: '/note-files/12', alt: 'scan' }))

    expect(container!.querySelector('img')).toBeNull()
    expect(container!.querySelector('.animate-spin')).not.toBeNull()
  })

  it('shows an empty block without a spinner when the request fails', async () => {
    mocks.get.mockRejectedValue(new Error('forbidden'))
    await render(h(PrivateImage, { url: '/note-files/12', alt: 'scan' }))

    expect(container!.querySelector('img')).toBeNull()
    expect(container!.querySelector('.animate-spin')).toBeNull()
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('revokes the object URL on unmount', async () => {
    mocks.get.mockResolvedValue({ data: blob() })
    await render(h(PrivateImage, { url: '/note-files/12', alt: 'scan' }))
    expect(revokeObjectURL).not.toHaveBeenCalled()

    act(() => root!.unmount())
    root = null

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test/1-1')
  })

  it('revokes the old object URL and fetches the new file when the url changes', async () => {
    mocks.get.mockResolvedValueOnce({ data: blob('a') }).mockResolvedValueOnce({ data: blob('bb') })
    await render(h(PrivateImage, { url: '/note-files/1', alt: 'scan' }))
    expect(container!.querySelector('img')!.getAttribute('src')).toBe('blob:test/1-1')

    await render(h(PrivateImage, { url: '/note-files/2', alt: 'scan' }))

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test/1-1')
    expect(mocks.get).toHaveBeenLastCalledWith('/note-files/2', { responseType: 'blob' })
    expect(container!.querySelector('img')!.getAttribute('src')).toBe('blob:test/2-2')
  })

  it('creates no object URL when the response arrives after unmount', async () => {
    let answer: (value: { data: Blob }) => void = () => {}
    mocks.get.mockReturnValue(new Promise((resolve) => { answer = resolve }))
    await render(h(PrivateImage, { url: '/note-files/12', alt: 'scan' }))

    act(() => root!.unmount())
    root = null
    await act(async () => answer({ data: blob() }))

    expect(createObjectURL).not.toHaveBeenCalled()
    expect(revokeObjectURL).not.toHaveBeenCalled()
  })
})

describe('PrivateFileLink', () => {
  it('stays disabled until the blob arrives, then links to it with the download name', async () => {
    let answer: (value: { data: Blob }) => void = () => {}
    mocks.get.mockReturnValue(new Promise((resolve) => { answer = resolve }))
    await render(h(PrivateFileLink, { url: '/note-files/5', name: 'report.pdf', download: true, children: 'Download' }))

    expect(container!.querySelector('a')).toBeNull()
    expect(container!.querySelector('[aria-disabled]')).not.toBeNull()

    await act(async () => answer({ data: blob('pdf') }))
    await flush()

    const a = container!.querySelector('a')!
    expect(a.getAttribute('href')).toBe('blob:test/1-3')
    expect(a.getAttribute('download')).toBe('report.pdf')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    expect(a.textContent).toBe('Download')
  })

  it('shows its label disabled when the file cannot be read', async () => {
    mocks.get.mockRejectedValue(new Error('gone'))
    await render(h(PrivateFileLink, { url: '/note-files/5', children: 'Open' }))

    expect(container!.querySelector('a')).toBeNull()
    expect(container!.querySelector('[aria-disabled]')!.textContent).toBe('Open')
  })
})

describe('fetchPrivateObjectUrl', () => {
  it('returns an object URL the caller owns', async () => {
    mocks.get.mockResolvedValue({ data: blob('abcd') })

    await expect(fetchPrivateObjectUrl('/note-files/9')).resolves.toBe('blob:test/1-4')
    expect(mocks.get).toHaveBeenCalledWith('/note-files/9', { responseType: 'blob' })
    expect(revokeObjectURL).not.toHaveBeenCalled()
  })

  it('returns null when the request fails', async () => {
    mocks.get.mockRejectedValue(new Error('forbidden'))

    await expect(fetchPrivateObjectUrl('/note-files/9')).resolves.toBeNull()
  })
})
