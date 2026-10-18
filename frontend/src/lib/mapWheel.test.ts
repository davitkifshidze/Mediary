import { describe, expect, it, vi } from 'vitest'
import { WHEEL_STEP, createWheelZoom } from '@/lib/mapWheel'

/* ============================================================
   **Ctrl + ბორბალი → რუკის ზუმი**.

   ⚠️ მოწმდება: Ctrl-ით მოვლენა იჭრება (`preventDefault` — ბრაუზერი გვერდს აღარ
   ადიდებს) და რუკა კურსორის წერტილზე იზრდება/პატარავდება; pinch-ის პატარა
   ნაბიჯები გროვდება; უბრალო ბორბალი გვერდს ტოვებს და მხოლოდ მინიშნებას აჩენს.
   ============================================================ */

function wheel(deltaY: number, ctrlKey: boolean, deltaMode = 0): WheelEvent {
  return new WheelEvent('wheel', { deltaY, ctrlKey, deltaMode, cancelable: true })
}

describe('createWheelZoom', () => {
  it('Ctrl + wheel zooms the map and keeps the page from zooming', () => {
    const zoom = vi.fn()
    const hint = vi.fn()
    const onWheel = createWheelZoom(zoom, hint)

    const up = wheel(-100, true)
    onWheel(up)
    expect(up.defaultPrevented).toBe(true)
    expect(zoom).toHaveBeenLastCalledWith(1, up)

    const down = wheel(100, true)
    onWheel(down)
    expect(zoom).toHaveBeenLastCalledWith(-1, down)
    expect(hint).not.toHaveBeenCalled()
  })

  it('a pinch sends many small steps — they add up to one zoom step', () => {
    const zoom = vi.fn()
    const onWheel = createWheelZoom(zoom, () => {})

    const small = Math.ceil(WHEEL_STEP / 5)
    for (let i = 0; i < 4; i++) onWheel(wheel(-small + 1, true))
    expect(zoom).not.toHaveBeenCalled()
    onWheel(wheel(-small, true))
    onWheel(wheel(-small, true))
    expect(zoom).toHaveBeenCalledTimes(1)
    expect(zoom.mock.calls[0][0]).toBe(1)
  })

  it('a line-based wheel (Firefox) counts in lines', () => {
    const zoom = vi.fn()
    createWheelZoom(zoom, () => {})(wheel(3, true, 1))
    expect(zoom).toHaveBeenCalledWith(-1, expect.any(WheelEvent))
  })

  it('a plain wheel scrolls the page and only shows the hint', () => {
    const zoom = vi.fn()
    const hint = vi.fn()
    const plain = wheel(-100, false)

    createWheelZoom(zoom, hint)(plain)

    expect(plain.defaultPrevented).toBe(false)
    expect(zoom).not.toHaveBeenCalled()
    expect(hint).toHaveBeenCalledTimes(1)
  })
})
