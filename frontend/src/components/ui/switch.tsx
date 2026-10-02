import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

/**
 * Tasks §12 — **`lg`**: ხილვადობის გადამრთველები („მენიუში", საჯარო პროფილი,
 * პირადი ველები) უფრო დიდი და თვალსაჩინოა, ვიდრე ფორმის შიდა ჩამრთველი.
 * შენი სიტყვები: „თვალის მაგივრად რამე რადიოს სტილი ან უფრო კარგი, შედარებით
 * დიდი ზომების".
 */
export type SwitchSize = 'default' | 'lg'

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & { size?: SwitchSize }
>(({ className, size = 'default', ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted',
      size === 'lg' ? 'h-7 w-12' : 'h-6 w-11',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0',
        size === 'lg' ? 'size-6' : 'size-5',
      )}
    />
  </SwitchPrimitive.Root>
))
Switch.displayName = SwitchPrimitive.Root.displayName

export { Switch }
