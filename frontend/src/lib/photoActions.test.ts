import { describe, expect, it, vi } from 'vitest'
import type { TFunction } from 'i18next'
import { photoActions, type PhotoActionsInput } from './photoActions'

/* ============================================================
   `photoActions()` — ერთი სია ჰოვერის ღილაკებისთვისაც და მენიუსთვისაც
   (ეტაპი 2).

   სამი ფაქტი ჩერდება აქ: **მონიშვნის წესი** („5 მონიშნული წაიშალოს"
   თუ „ეს ერთი"), **დამალული პუნქტები** (მსახიობის ფოტო · პრივატული
   დისკი) და ის, რომ **წარწერები `t()`-დან მოდის** და არა ხელით ჩაწერილი.
   ============================================================ */

/** ყალბი `t` — გასაღები + პარამეტრები, რომ თარგმნა თვალსაჩინო იყოს */
const t = ((key: string, params?: Record<string, unknown>) =>
  params ? `${key}(${JSON.stringify(params)})` : key) as unknown as TFunction

const input = (extra: Partial<PhotoActionsInput> = {}): PhotoActionsInput => ({
  t,
  count: 1,
  onOpen: vi.fn(),
  onInfo: vi.fn(),
  onPrimary: vi.fn(),
  onDownload: vi.fn(),
  onOriginal: vi.fn(),
  onToggle: vi.fn(),
  onDelete: vi.fn(),
  ...extra,
})

const keys = (i: Partial<PhotoActionsInput> = {}) => photoActions(input(i)).map((a) => a.key)
const find = (i: Partial<PhotoActionsInput>, key: string) =>
  photoActions(input(i)).find((a) => a.key === key)

describe('photoActions', () => {
  it('სრული ნაკრები ერთ სიაშია და წაშლა ბოლოშია', () => {
    expect(keys()).toEqual(['open', 'info', 'primary', 'download', 'original', 'select', 'delete'])
    expect(photoActions(input()).at(-1)?.danger).toBe(true)
  })

  it('ერთ ფოტოზე წაშლა/ჩამოტვირთვა რაოდენობას არ ახსენებს', () => {
    expect(find({ count: 1 }, 'delete')?.label).toBe('confirm.delete')
    expect(find({ count: 1 }, 'download')?.label).toBe('photos.download')
  })

  it('მონიშნულზე მოქმედება მთელ მონიშვნაზეა და რიცხვს ამბობს', () => {
    // ⚠️ სწორედ ეს არის ის ადგილი, სადაც „წაშლა" ორნაირად წაიკითხებოდა
    expect(find({ count: 5, checked: true }, 'delete')?.label).toBe(
      'photos.deleteSelected({"count":5})',
    )
    expect(find({ count: 5, checked: true }, 'download')?.label).toBe(
      'photos.downloadSelected({"count":5})',
    )
  })

  it('მსახიობის ფოტოზე „მთავარად" საერთოდ არ იხატება', () => {
    // გამომძახებელი `onPrimary`-ს არ გადმოსცემს — backend იქ 422-ს აბრუნებს
    expect(keys({ onPrimary: undefined })).not.toContain('primary')
  })

  it('უკვე მთავარი ფოტო პუნქტს კარგავს გამორთვის ნაცვლად', () => {
    expect(keys({ isPrimary: true })).not.toContain('primary')
  })

  it('პრივატულ დისკზე ორიგინალის ბმული არ იხატება, ჩამოტვირთვა კი რჩება', () => {
    const list = keys({ privateDisk: true })
    expect(list).not.toContain('original')
    expect(list).toContain('download')
  })

  it('არარსებული მოქმედება პუნქტსაც არ ტოვებს', () => {
    expect(keys({ onInfo: undefined, onDelete: undefined, onToggle: undefined })).toEqual([
      'open',
      'primary',
      'download',
      'original',
    ])
  })

  it('მონიშვნის წარწერა მდგომარეობას მიჰყვება', () => {
    expect(find({}, 'select')?.label).toBe('photos.pickOn')
    expect(find({ picking: true }, 'select')?.label).toBe('photos.select')
    expect(find({ picking: true, checked: true }, 'select')?.label).toBe('photos.deselect')
  })

  it('`run` სწორედ გადმოცემულ ფუნქციას ეძახის', () => {
    const onDelete = vi.fn()
    photoActions(input({ onDelete })).find((a) => a.key === 'delete')?.run()
    expect(onDelete).toHaveBeenCalledOnce()
  })
})
