import * as React from 'react'
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LAYER_POPUP } from '@/lib/layers'

export const ContextMenu = ContextMenuPrimitive.Root
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger
export const ContextMenuSub = ContextMenuPrimitive.Sub

/**
 * ⚠️ **პოზიციის ნაგულისხმევები ერთ ადგილას** (Tasks §2). Radix-ის საკუთარი
 * ნაგულისხმევები ნულებია (`sideOffset 0`, `alignOffset 0`, `collisionPadding 0`),
 * ქვემენიუს ტრიგერი კი მშობლის `p-1` + 1px ჩარჩოს შიგნით ზის — ამიტომ სტატუსის
 * ქვემენიუ ~5px-ით მშობელზე ადიოდა (ეკრანის კიდესთან გადაბრუნებისას — მარცხნივაც),
 * პირველი პუნქტი კი ტრიგერის ხაზზე დაბლა იწყებოდა. `alignOffset -5` ზუსტად ამ
 * 5px-ს აბრუნებს, `sideOffset 6` სუფთა ღრიჭოს ტოვებს, `collisionPadding 8` კი
 * მენიუს ეკრანის კიდეზე მიკვრას უშლის. აქ რომ დგას, `MovieCard`, ბუკმარკები,
 * პირადი მოდული და მსახიობები ერთდროულად სწორდება — თითო ადგილას ჩაწერა ერთს
 * მაინც გამოტოვებდა. გამომძახებელს ყოველთვის შეუძლია საკუთარი მნიშვნელობა გადასცეს.
 *
 * ⚠️ **მაქს-სიმაღლე Radix-ის ცვლადით**: გრძელი სია (ბევრი სტატუსი) ეკრანს
 * გასცდებოდა და ვერ დასქროლდებოდა — `--radix-context-menu-content-available-height`
 * სწორედ დარჩენილი ადგილია.
 */
export const CONTEXT_MENU_POSITION = { sideOffset: 6, alignOffset: -5, collisionPadding: 8 } as const

const contentCls = cn(
  LAYER_POPUP,
  'min-w-44 max-h-[var(--radix-context-menu-content-available-height)] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md',
)
const itemCls =
  'flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50'

export const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content
      ref={ref}
      collisionPadding={CONTEXT_MENU_POSITION.collisionPadding}
      className={cn(contentCls, className)}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
))
ContextMenuContent.displayName = 'ContextMenuContent'

export const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Item ref={ref} className={cn(itemCls, className)} {...props} />
))
ContextMenuItem.displayName = 'ContextMenuItem'

export const ContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <ContextMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(itemCls, 'data-[state=open]:bg-muted', className)}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto size-4 opacity-60" />
  </ContextMenuPrimitive.SubTrigger>
))
ContextMenuSubTrigger.displayName = 'ContextMenuSubTrigger'

export const ContextMenuSubContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.SubContent
      ref={ref}
      sideOffset={CONTEXT_MENU_POSITION.sideOffset}
      alignOffset={CONTEXT_MENU_POSITION.alignOffset}
      collisionPadding={CONTEXT_MENU_POSITION.collisionPadding}
      className={cn(contentCls, className)}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
))
ContextMenuSubContent.displayName = 'ContextMenuSubContent'

export const ContextMenuSeparator = () => (
  <ContextMenuPrimitive.Separator className="my-1 h-px bg-border" />
)
