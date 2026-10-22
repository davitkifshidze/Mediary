import { beforeEach, describe, expect, it } from 'vitest'
import {
  clampBubble,
  clampFrame,
  clipInset,
  defaultFrame,
  frameHeight,
  handleOnLeft,
  isPlayerTarget,
  pickLift,
  readBubble,
  readFrame,
  resizeFrame,
  saveBubble,
  saveFrame,
  snapBubble,
} from '@/lib/playerFrame'

/* ============================================================
   **დამკვრელის ჩარჩოები** — ადგილის შენახვა და ეკრანის კიდე.

   მოწმდება: ნაგულისხმევი ადგილი (მარჯვნივ, შუაში), ეკრანიდან ვერ გასვლა
   (პატარა ეკრანზეც), ზომის ზღვრები და „მოპირდაპირე კიდე ადგილზე", დაზიანებული
   შენახული ჩანაწერი, ბუშტის კიდეზე მიკვრა და კამათლის კუთხე, ფანჯრის
   გადახვევისას ჭრა, მოდალის „გარე დაჭერის" გამონაკლისი.
   ============================================================ */

const VP = { w: 1280, h: 800 }

beforeEach(() => localStorage.clear())

describe('მოტივტივე ჩარჩო', () => {
  it('ნაგულისხმევად მარჯვნივ და ვერტიკალურად შუაშია', () => {
    const box = defaultFrame(VP)
    expect(box.w).toBe(480)
    expect(box.x + box.w).toBe(VP.w - 24)
    expect(box.y).toBe(Math.round((VP.h - frameHeight(480)) / 2))
    // ზოლი ორი `h-9` რიგია: 16:9 + 92
    expect(frameHeight(480)).toBe(270 + 92)
  })

  it('ეკრანიდან ვერ გადის — პატარა ეკრანზე სიგანეც იკუმშება', () => {
    expect(clampFrame({ x: -50, y: 5000, w: 360 }, VP)).toEqual({ x: 12, y: VP.h - frameHeight(360) - 12, w: 360 })
    expect(clampFrame({ x: 0, y: 0, w: 2000 }, VP).w).toBe(720)
    // ძველი 240-იანი ჩარჩო 320-მდე იზრდება — ღილაკები ვიწროში ვეღარ ეტევა
    expect(clampFrame({ x: 0, y: 0, w: 10 }, VP).w).toBe(320)
    expect(clampFrame({ x: 0, y: 0, w: 240 }, VP).w).toBe(320)
    // ⚠️ 640px-ზე ვიწროზე მოტივტივე ჩარჩოს ნაცვლად ქვედა ზოლია — ჩარჩო 320-ზე არ ვიწროვდება
    expect(clampFrame({ x: 0, y: 0, w: 500 }, { w: 320, h: 600 }).w).toBe(320)
  })

  it('ზომა იცვლება და მოპირდაპირე კიდე ადგილზე რჩება', () => {
    const box = { x: 800, y: 100, w: 360 }
    expect(handleOnLeft(box, VP)).toBe(true)
    // მარცხენა სახელური მარცხნივ 100 px → უფრო ფართო, მარჯვენა კიდე უცვლელი
    const wider = resizeFrame(box, -100, true, VP)
    expect(wider).toEqual({ x: 700, y: 100, w: 460 })
    expect(wider.x + wider.w).toBe(box.x + box.w)

    const left = { x: 40, y: 100, w: 360 }
    expect(handleOnLeft(left, VP)).toBe(false)
    expect(resizeFrame(left, 100, false, VP)).toEqual({ x: 40, y: 100, w: 460 })
  })

  it('ადგილი ინახება; დაზიანებული ან ძველი ჩანაწერი ნაგულისხმევზე ბრუნდება', () => {
    saveFrame({ x: 100, y: 120, w: 400 })
    expect(readFrame(VP)).toEqual({ x: 100, y: 120, w: 400 })
    // სხვა (პატარა) ეკრანზე შენახული ადგილი ეკრანში ჩაეტევა
    expect(readFrame({ w: 500, h: 300 })).toEqual({ x: 88, y: 12, w: 400 })

    localStorage.setItem('player.frame', '{oops')
    expect(readFrame(VP)).toEqual(defaultFrame(VP))
    localStorage.setItem('player.frame', JSON.stringify({ x: 'a', y: 1, w: 1 }))
    expect(readFrame(VP)).toEqual(defaultFrame(VP))
  })

  it('კამათლის კუთხეს თუ ფარავს, კამათელი მის ზემოთ ადის', () => {
    expect(pickLift(defaultFrame(VP), VP)).toBe(0)
    const corner = clampFrame({ x: 5000, y: 5000, w: 360 }, VP)
    expect(pickLift(corner, VP)).toBe(VP.h - corner.y + 8 - 24)
  })
})

describe('სიმღერის ბუშტი', () => {
  it('გაშვებისას უახლოეს კიდეს ეკვრის', () => {
    expect(snapBubble(100, 300, VP)).toEqual({ side: 'left', y: 300 })
    expect(snapBubble(1000, 300, VP)).toEqual({ side: 'right', y: 300 })
  })

  it('ჰედერის ქვეშ და ეკრანში რჩება; მარჯვნივ კამათლის კუთხეს არ ფარავს', () => {
    expect(clampBubble({ side: 'left', y: 0 }, VP).y).toBe(68)
    expect(clampBubble({ side: 'left', y: 5000 }, VP).y).toBe(VP.h - 56 - 12)
    expect(clampBubble({ side: 'right', y: 5000 }, VP).y).toBe(VP.h - 56 - 12 - 96)
  })

  it('ადგილი ინახება; ნაგულისხმევი — მარჯვნივ', () => {
    expect(readBubble(VP).side).toBe('right')
    saveBubble({ side: 'left', y: 200 })
    expect(readBubble(VP)).toEqual({ side: 'left', y: 200 })
    localStorage.setItem('player.bubble', JSON.stringify({ side: 'up', y: 1 }))
    expect(readBubble(VP).side).toBe('right')
  })
})

describe('ფანჯარაში', () => {
  it('გადახვეული ფანჯრის მიღმა ნაწილი იჭრება; მთლიანად ხილული — არა', () => {
    const view = { top: 100, left: 0, right: 800, bottom: 600 }
    expect(clipInset({ top: 150, left: 50, right: 750, bottom: 500 }, view)).toBeNull()
    expect(clipInset({ top: 40, left: 50, right: 750, bottom: 440 }, view)).toBe('inset(60px 0px 0px 0px)')
    expect(clipInset({ top: 400, left: 50, right: 750, bottom: 800 }, view)).toBe('inset(0px 0px 200px 0px)')
  })

  it('დამკვრელზე დაჭერა მოდალისთვის „გარეთ" არ ითვლება', () => {
    const aside = document.createElement('aside')
    aside.setAttribute('data-player', '')
    const button = document.createElement('button')
    aside.appendChild(button)
    document.body.appendChild(aside)

    expect(isPlayerTarget(button)).toBe(true)
    expect(isPlayerTarget(document.body)).toBe(false)
    expect(isPlayerTarget(null)).toBe(false)
    aside.remove()
  })
})
