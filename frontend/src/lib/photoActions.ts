import type { ComponentType } from 'react'
import type { TFunction } from 'i18next'
import {
  CheckSquare,
  Download,
  ExternalLink,
  Info,
  Maximize2,
  MoveRight,
  Square,
  Star,
  Trash2,
} from 'lucide-react'

/* ============================================================
   ერთი ფოტოს მოქმედებები — **ერთი სია ორივე გამოსახულებისთვის**
   (ეტაპი 2, 2026-09-13).

   ⚠️ **ჰოვერის ღილაკებიც და მენიუც აქედან იხატება.** ორი ასლი აუცილებლად
   გაშორდებოდა — ერთში „ორიგინალი" იქნებოდა, მეორეში არა, და მომხმარებელი
   სწორედ იმ ერთადერთს ეძებდა, სადაც ეს პუნქტია.

   ⚠️ **პუნქტი, რომელიც ვერ იმუშავებს, საერთოდ არ იხატება** და არა
   გამორთული: მსახიობის ფოტოზე „მთავარად" backend-ზე **422-ია**
   (`cast_members.photo_path` გლობალური სვეტია), ხოლო პრივატ დისკის ფაილს
   **მუდმივი მისამართი არ აქვს** — ის blob-ია ამ გვერდის სიცოცხლეში, ე.ი.
   „ორიგინალი ახალ ტაბში" მკვდარ ბმულს გახსნიდა.
   ⚠️ **ჩამოტვირთვა პრივატულზე მაინც რჩება** — ის სწორედ ამ blob-ით
   მუშაობს (ხელსაწყოთა ზოლი დიდი ხანია ასე იქცევა); `StorageLibrary`-ს
   ღილაკი იმიტომ აქვს დამალული, რომ ის პირდაპირ `/storage/*`-ზე მიდის.

   ⚠️ **მონიშნულზე მოქმედება მთელ მონიშვნაზეა.** მონიშნულ ფოტოზე მარჯვენა
   კლიკი ნიშნავს „**5 მონიშნული** წაიშალოს", არამონიშნულზე — მხოლოდ ამ
   ერთს. სხვაგვარად „წაშლა" ორნაირად იკითხება, რაც შეუქცევად მოქმედებაზე
   დაუშვებელია. ამიტომაა `count` ცხადი არგუმენტი.
   ============================================================ */

export interface PhotoAction {
  key: string
  label: string
  icon: ComponentType<{ className?: string }>
  run: () => void
  /** წითლად, გამყოფის ქვემოთ */
  danger?: boolean
  /** უჯრის ქვედა ზოლშიც ჩანს ხატულად (დანარჩენი მხოლოდ მენიუშია) */
  quick?: boolean
}

export interface PhotoActionsInput {
  t: TFunction
  /** რამდენ ფოტოზე იმოქმედებს ჩამოტვირთვა/წაშლა (მონიშვნის წესი) */
  count: number
  /** ფაილი პრივატულ დისკზეა (`notes/`, `chat/`) */
  privateDisk?: boolean
  /** ეს ფოტო უკვე ჩანაწერის მთავარია */
  isPrimary?: boolean
  /** მონიშვნის რეჟიმია ჩართული */
  picking?: boolean
  /** ეს ფოტო მონიშნულია */
  checked?: boolean
  onOpen: () => void
  /** „ფოტოს შესახებ" — მითითების გარეშე ჩანაწერს ინფო არ აქვს */
  onInfo?: () => void
  /** მითითების გარეშე (ან მსახიობის ფოტოზე) პუნქტი არ იხატება */
  onPrimary?: () => void
  onDownload?: () => void
  /** ორიგინალის გახსნა ახალ ტაბში */
  onOriginal?: () => void
  onToggle?: () => void
  /** §26.3 — გადატანა სხვა მშობელზე/ალბომში/უკატეგორიოში */
  onMove?: () => void
  onDelete?: () => void
}

export function photoActions({
  t,
  count,
  privateDisk,
  isPrimary,
  picking,
  checked,
  onOpen,
  onInfo,
  onPrimary,
  onDownload,
  onOriginal,
  onToggle,
  onMove,
  onDelete,
}: PhotoActionsInput): PhotoAction[] {
  const many = count > 1
  const list: PhotoAction[] = [
    { key: 'open', label: t('photos.open'), icon: Maximize2, run: onOpen },
  ]

  if (onInfo) list.push({ key: 'info', label: t('photos.info'), icon: Info, run: onInfo, quick: true })

  // ⚠️ უკვე მთავარი ფოტო პუნქტს კარგავს — გამორთული ღილაკის ნაცვლად
  // მდგომარეობას ვარსკვლავის ნიშანი ამბობს უჯრაზე
  if (onPrimary && !isPrimary) {
    list.push({ key: 'primary', label: t('gallery.setPrimary'), icon: Star, run: onPrimary, quick: true })
  }

  if (onDownload) {
    list.push({
      key: 'download',
      label: many ? t('photos.downloadSelected', { count }) : t('photos.download'),
      icon: Download,
      run: onDownload,
    })
  }

  if (onOriginal && !privateDisk) {
    list.push({ key: 'original', label: t('photos.openOriginal'), icon: ExternalLink, run: onOriginal })
  }

  if (onToggle) {
    list.push({
      key: 'select',
      label: checked ? t('photos.deselect') : picking ? t('photos.select') : t('photos.pickOn'),
      icon: checked ? CheckSquare : Square,
      run: onToggle,
    })
  }

  /* ⚠️ **გადატანა წაშლის ზემოთ დგას და `danger` არ არის** (§26.3): ფოტო
     არსად ქრება — მხოლოდ მშობელი და ალბომი იცვლება. წითლად რომ დაგვეხატა,
     ის შეუქცევად მოქმედებად წაიკითხებოდა. */
  if (onMove) {
    list.push({
      key: 'move',
      label: many ? t('gallery.moveSelected', { count }) : t('gallery.move'),
      icon: MoveRight,
      run: onMove,
    })
  }

  if (onDelete) {
    list.push({
      key: 'delete',
      label: many ? t('photos.deleteSelected', { count }) : t('confirm.delete'),
      icon: Trash2,
      run: onDelete,
      danger: true,
      quick: true,
    })
  }

  return list
}
