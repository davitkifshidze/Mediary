import { describe, expect, it } from 'vitest'
import { CUT_STYLE_KEYS, cutStyle, hasCutStyle } from './cutStyle'

/* ============================================================
   ჭრილის რეესტრი (Tasks §2).

   ⚠️ ორივე წესი, რაც აქ მოწმდება, **ჩუმად** ირღვევა: hex მუქ თემაზე
   უბრალოდ არასწორ ფერს აჩვენებს (შეცდომას არავინ დააგდებს), უცნობი
   გასაღები კი ნაცრისფერ ბარათს დახატავს იმის ნაცვლად, რომ გაქრეს.
   ============================================================ */

describe('cutStyle', () => {
  it('only uses theme tokens, never a hex', () => {
    /* ⚠️ `modAccent()` მნიშვნელობას `color-mix()`-ში სვამს, ე.ი. hex-იც
       „იმუშავებდა" — და ზუსტად ამიტომ ვერავინ შეამჩნევდა, რომ მუქ თემას
       მეორე პალიტრა აღარ აქვს. */
    const hex = CUT_STYLE_KEYS.filter((key) => !cutStyle(key).color.startsWith('var(--'))

    expect(hex).toEqual([])
  })

  it('falls back instead of disappearing', () => {
    expect(hasCutStyle('no-such-cut')).toBe(false)
    expect(cutStyle('no-such-cut').color).toBe('var(--muted-foreground)')
    expect(cutStyle('no-such-cut').icon).toBeTruthy()
  })

  it('answers the keys the converted cuts actually pass', () => {
    /* ⚠️ სია ხელით წერია განზრახ: ეს ის გასაღებებია, რომლებსაც ცხრა
       გადაყვანილი ჭრილი აგზავნის — ერთის წაშლა რეესტრიდან ბარათს
       ნაცრისფერს გახდიდა და ტესტის გარეშე ეს ვერსად გამოჩნდებოდა. */
    const used = [
      'all',
      'backdrop', 'poster', 'logo', 'actor',
      'pending', 'approved', 'rejected',
      'active', 'paused', 'done',
      'public', 'private',
      'cast', 'playlist', 'gallery', 'account', 'chat', 'backup',
      'image', 'video', 'doc', 'book',
      'record', 'records', 'actors',
    ]

    expect(used.filter((key) => !hasCutStyle(key))).toEqual([])
  })
})
