import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { KeyRound, Save, Trash2, Upload, User as UserIcon, ArrowLeft } from 'lucide-react'
import { updatePassword, updateProfile } from '@/api/account'
import { useAuth } from '@/lib/auth'
import { storageUrl } from '@/lib/api'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/secret-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DataExportCard } from '@/components/DataExportCard'
import { InstallApp } from '@/components/InstallApp'
import { PublicProfileCard } from '@/components/PublicProfileCard'
import { StorageCard } from '@/components/StorageCard'
import { WebQuotaCard } from '@/components/WebQuotaCard'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/feedback'

/** პროფილი (F4): სახელი/გვარი/username/მეილი/ავატარი + პაროლის ცვლილება */
export function ProfilePage() {
  const { t } = useTranslation()
  const { user, setUser } = useAuth()
  const { toast } = useToast()

  const [form, setForm] = useState({
    first_name: user?.first_name ?? '',
    last_name: user?.last_name ?? '',
    username: user?.username ?? '',
    email: user?.email ?? '',
    // Tasks 16.1 — ბიო საჯარო პროფილის თავშია; ინახება იმავე ფორმით
    bio: user?.bio ?? '',
  })
  const [avatar, setAvatar] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const [pw, setPw] = useState({ current_password: '', password: '', password_confirmation: '' })
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({})
  const [pwBusy, setPwBusy] = useState(false)

  if (!user) return null

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  })

  const pickAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setAvatar(file)
    setPreview(file ? URL.createObjectURL(file) : null)
  }

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      const fd = new FormData()
      fd.append('name', [form.first_name, form.last_name].filter(Boolean).join(' ') || form.username)
      Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''))
      if (avatar) fd.append('avatar', avatar)
      const updated = await updateProfile(fd)
      setUser(updated)
      setAvatar(null)
      setPreview(null)
      toast({ title: t('profile.saved'), variant: 'success' })
    } catch (err) {
      setErrors(fieldErrors(err))
      toast({ title: errorMessage(err), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const removeAvatar = async () => {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('remove_avatar', '1')
      setUser(await updateProfile(fd))
      setPreview(null)
      setAvatar(null)
    } catch (err) {
      toast({ title: errorMessage(err), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwBusy(true)
    setPwErrors({})
    try {
      await updatePassword(pw)
      setPw({ current_password: '', password: '', password_confirmation: '' })
      toast({ title: t('profile.passwordChanged'), variant: 'success' })
    } catch (err) {
      setPwErrors(fieldErrors(err))
      toast({ title: errorMessage(err), variant: 'error' })
    } finally {
      setPwBusy(false)
    }
  }

  const avatarUrl = preview ?? storageUrl(user.avatar_path)

  return (
    <PageContainer>
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('actions.back')}
      </Link>

      <PageHeader
        title={t('profile.title')}
        subtitle={
          <>
            {user.email} · {t(`roles.${user.role}`)}
          </>
        }
      />

      {/* ---------- ძირითადი ინფორმაცია ---------- */}
      <form onSubmit={saveProfile} className="mb-6 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 font-display text-lg font-semibold tracking-tight">{t('profile.info')}</h2>

        <div className="mb-5 flex items-center gap-4">
          <div className="grid size-16 place-items-center overflow-hidden rounded-full bg-muted">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              <UserIcon className="size-7 text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted">
              <Upload className="size-4" />
              {t('profile.uploadAvatar')}
              <input type="file" accept="image/*" className="hidden" onChange={pickAvatar} />
            </label>
            {user.avatar_path && (
              <Button type="button" variant="ghost" size="sm" onClick={removeAvatar} disabled={busy}>
                <Trash2 className="size-4" />
                {t('profile.removeAvatar')}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="first_name">{t('auth.firstName')}</Label>
            <Input id="first_name" {...field('first_name')} />
            {errors.first_name && <p className="mt-1 text-xs text-destructive">{errors.first_name}</p>}
          </div>
          <div>
            <Label htmlFor="last_name">{t('auth.lastName')}</Label>
            <Input id="last_name" {...field('last_name')} />
          </div>
          <div>
            <Label htmlFor="username">{t('auth.username')}</Label>
            <Input id="username" {...field('username')} />
            {errors.username && <p className="mt-1 text-xs text-destructive">{errors.username}</p>}
          </div>
          <div>
            <Label htmlFor="email">{t('auth.email')}</Label>
            <Input id="email" type="email" {...field('email')} />
            {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="bio">{t('profile.bio')}</Label>
            <Textarea id="bio" rows={3} maxLength={1000} {...field('bio')} />
            <p className="mt-1 text-xs text-muted-foreground">{t('profile.bioHint')}</p>
            {errors.bio && <p className="mt-1 text-xs text-destructive">{errors.bio}</p>}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={busy}>
            <Save className="size-4" />
            {t('actions.save')}
          </Button>
        </div>
      </form>

      {/* ---------- პაროლი (Tasks §7.1) ----------
          ⚠️ **საჯარო პროფილის ზემოთ დგას შენი მითითებით.** ადრე გვერდის
          ბოლო იყო და `mb-6` არ ჰქონდა — გადმოტანისას დაემატა, თორემ
          ქვემოთ მდგომ ბარათს მიეკვრებოდა. */}
      <form onSubmit={savePassword} className="mb-6 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 font-display text-lg font-semibold tracking-tight">
          {t('profile.password')}
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="current_password">{t('profile.currentPassword')}</Label>
            <PasswordInput
              id="current_password"
              autoComplete="current-password"
             
              value={pw.current_password}
              onChange={(value) => setPw((p) => ({ ...p, current_password: value }))}
            />
            {pwErrors.current_password && (
              <p className="mt-1 text-xs text-destructive">{pwErrors.current_password}</p>
            )}
          </div>
          <div>
            <Label htmlFor="new_password">{t('profile.newPassword')}</Label>
            <PasswordInput
              id="new_password"
              autoComplete="new-password"
             
              value={pw.password}
              onChange={(value) => setPw((p) => ({ ...p, password: value }))}
            />
            {pwErrors.password && <p className="mt-1 text-xs text-destructive">{pwErrors.password}</p>}
          </div>
          <div>
            <Label htmlFor="new_password_confirm">{t('auth.passwordConfirm')}</Label>
            <PasswordInput
              id="new_password_confirm"
              autoComplete="new-password"
             
              value={pw.password_confirmation}
              onChange={(value) => setPw((p) => ({ ...p, password_confirmation: value }))}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="submit" variant="outline" disabled={pwBusy}>
            <KeyRound className="size-4" />
            {t('profile.changePassword')}
          </Button>
        </div>
      </form>
      {/* ---------- საჯარო პროფილი (Tasks 16.1 + §6.1) ---------- */}
      {/* FEAT-15 — „მთავარ ეკრანზე დამატება".
          ⚠️ ბლოკი **მხოლოდ მაშინ ჩანდება, როცა ბრაუზერი თვითონ ამბობს**,
          რომ დაყენება შესაძლებელია — დაყენებულზე, Safari-ზე და Firefox-ზე
          მუდმივი ღილაკი იტყუებოდა. */}
      <InstallApp />

      <PublicProfileCard />

      {/* ---------- ჩემი საცავი (ეტაპი 5) ----------
          ჯამი და ზოლი · მოდულებად დაშლა · თავიდან დათვლა · **ატვირთული
          ფაილების ბიბლიოთეკა გაშლილი** · ლიმიტის გაზრდის მოთხოვნა · ობოლი
          ფაილები (მხოლოდ `super_admin`-ს). `/settings`-ს მხოლოდ მოდულებზე
          ლიმიტების გაწერა დარჩა — ის მართლა პარამეტრია. */}
      <StorageCard />

      {/* ---------- ჩემი მონაცემები (FEAT-06) ----------
          ⚠️ **საცავის ქვემოთ განზრახ**: ზემოთ ატვირთული **ფაილების**
          არქივია, აქ კი **ჩანაწერების** სია — ორი ნახევარი ერთი კითხვისა
          („როგორ წავიღო ჩემი ბიბლიოთეკა"), და მეორეს პირველის გარეშე
          აზრი აკლია (CSV-ის `poster_path` სწორედ არქივის ფაილს უთითებს). */}
      <DataExportCard />

      {/* §7.6.6 — ვებძებნის კვოტა. ⚠️ **ცალკე ბარათია და არა საცავის შიგნით**:
          ეს SerpApi-ის თვიური **ძებნების** ბიუჯეტია და არა დისკი; ერთ ბლოკში
          ორი სხვადასხვა რესურსი ერთ რიცხვად წაიკითხებოდა. გასაღების გარეშე
          ბარათი საერთოდ არ ჩანს. */}
      <WebQuotaCard />

    </PageContainer>
  )
}
