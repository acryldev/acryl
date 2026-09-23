/**
 * ACRYL UI library for the Web and Desktop client (spec 038-ui-component-library). A LIBRARY: it fills no slot itself; other client bundles `require('@acryl/ui')` after
 * listing it in `dsh.client.inject`. The parts come from DSH's own source (see registry/manifest.yml for each one's origin) and read the app's `--dsw-alias-*` tokens; the two
 * colors DSH has no token for (accent, reasoning) are registered through the theme service with a light and a dark value, never through a stylesheet.
 * The client loader treats every module as a plugin, so a library exports an `apply` too.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-theme'
import { ValueField, SecretField, type FieldProps } from './registry/fields/fields.tsx'
import { AppearanceCubes, type CubeOption } from './registry/AppearanceCubes/AppearanceCubes.tsx'
import type { SettingsRowProps } from './registry/SettingsRow/SettingsRow.tsx'
import { SelectPill, type SelectOption } from './registry/SelectPill/SelectPill.tsx'
import { Tabs, type TabItem } from './registry/Tabs/Tabs.tsx'
import { Card } from './registry/Card/Card.tsx'
import { EmptyState } from './registry/EmptyState/EmptyState.tsx'
import { SwitchField } from './registry/SwitchField/SwitchField.tsx'
import { Dialog } from './registry/Dialog/Dialog.tsx'
import { ToolCallCard, type ToolCallCardProps, type ToolCallLabels, type ToolCallState } from './registry/ToolCallCard/ToolCallCard.tsx'
import { SidebarRow, type SidebarRowProps } from './registry/SidebarRow/SidebarRow.tsx'
import { Stack } from './registry/Stack.tsx'
import { Kbd, type KbdProps } from './registry/Kbd/Kbd.tsx'
import { Badge, type BadgeProps, type BadgeVariant } from './registry/Badge/Badge.tsx'
import { Skeleton, type SkeletonProps } from './registry/Skeleton/Skeleton.tsx'
import { Spinner, type SpinnerProps } from './registry/Spinner/Spinner.tsx'
import { Alert, type AlertProps, type AlertVariant } from './registry/Alert/Alert.tsx'
import { Separator, type SeparatorProps } from './registry/Separator/Separator.tsx'
import { Progress, type ProgressProps } from './registry/Progress/Progress.tsx'
import { Avatar, type AvatarProps, type AvatarSize } from './registry/Avatar/Avatar.tsx'
import { Label, type LabelProps } from './registry/Label/Label.tsx'
import { Textarea, type TextareaProps } from './registry/Textarea/Textarea.tsx'
import { Checkbox, type CheckboxProps } from './registry/Checkbox/Checkbox.tsx'
import { AspectRatio, type AspectRatioProps } from './registry/AspectRatio/AspectRatio.tsx'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator, BreadcrumbEllipsis } from './registry/Breadcrumb/Breadcrumb.tsx'
import { Toggle, type ToggleProps, type ToggleVariant, type ToggleSize } from './registry/Toggle/Toggle.tsx'
import { ButtonGroup, ButtonGroupText, ButtonGroupSeparator, type ButtonGroupProps } from './registry/ButtonGroup/ButtonGroup.tsx'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent, type AccordionProps } from './registry/Accordion/Accordion.tsx'
import { RadioGroup, type RadioGroupProps, type RadioOption } from './registry/RadioGroup/RadioGroup.tsx'
import { Collapsible, CollapsibleTrigger, CollapsibleContent, type CollapsibleProps } from './registry/Collapsible/Collapsible.tsx'
import { ToggleGroup, ToggleGroupItem, type ToggleGroupProps } from './registry/ToggleGroup/ToggleGroup.tsx'
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption } from './registry/Table/Table.tsx'
import { DirectionProvider, useDirection, type Direction, type DirectionProviderProps } from './registry/DirectionProvider/DirectionProvider.tsx'
import { Marker, MarkerIcon, MarkerContent, type MarkerProps, type MarkerVariant } from './registry/Marker/Marker.tsx'
import { Message, MessageGroup, MessageAvatar, MessageContent, MessageHeader, MessageFooter, type MessageProps, type MessageAlign } from './registry/Message/Message.tsx'
import { Bubble, BubbleGroup, BubbleContent, BubbleReactions, type BubbleProps, type BubbleVariant, type BubbleAlign, type BubbleReactionsProps } from './registry/Bubble/Bubble.tsx'
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis, type PaginationLinkProps } from './registry/Pagination/Pagination.tsx'
import { NativeSelect, NativeSelectOption, NativeSelectOptGroup, type NativeSelectProps } from './registry/NativeSelect/NativeSelect.tsx'
import { ScrollArea, type ScrollAreaProps } from './registry/ScrollArea/ScrollArea.tsx'
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator, type InputOTPProps } from './registry/InputOTP/InputOTP.tsx'
import { Item, ItemGroup, ItemSeparator, ItemMedia, ItemContent, ItemTitle, ItemDescription, ItemActions, ItemHeader, ItemFooter, type ItemProps, type ItemVariant, type ItemSize, type ItemMediaVariant } from './registry/Item/Item.tsx'
import { Attachment, AttachmentGroup, AttachmentMedia, AttachmentContent, AttachmentTitle, AttachmentDescription, AttachmentActions, AttachmentAction, AttachmentTrigger, type AttachmentProps, type AttachmentState, type AttachmentSize, type AttachmentOrientation, type AttachmentMediaVariant } from './registry/Attachment/Attachment.tsx'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupInput, InputGroupTextarea, type InputGroupProps, type InputGroupAddonProps, type InputGroupAlign, type InputGroupButtonSize } from './registry/InputGroup/InputGroup.tsx'
import { FormField, FieldSet, FieldLegend, FieldGroup, FieldContent, FieldLabel, FieldTitle, FieldDescription, FieldSeparator, FieldError, type FormFieldProps, type FormFieldOrientation, type FieldLegendVariant, type FieldErrorProps } from './registry/FormField/FormField.tsx'
import { Popover, PopoverTrigger, PopoverAnchor, PopoverContent, PopoverHeader, PopoverTitle, PopoverDescription, type PopoverProps, type PopoverContentProps, type PopoverAlign } from './registry/Popover/Popover.tsx'
import { Slider, type SliderProps, type SliderOrientation } from './registry/Slider/Slider.tsx'
import { Sheet, SheetTrigger, SheetClose, SheetOverlay, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription, type SheetProps, type SheetContentProps, type SheetSide } from './registry/Sheet/Sheet.tsx'
import { Drawer, DrawerTrigger, DrawerClose, DrawerOverlay, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle, DrawerDescription, type DrawerProps, type DrawerContentProps, type DrawerDirection } from './registry/Drawer/Drawer.tsx'
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut, CommandSeparator, type CommandProps, type CommandInputProps, type CommandItemProps } from './registry/Command/Command.tsx'
import { Combobox, useComboboxAnchor, ComboboxInput, ComboboxTrigger, ComboboxClear, ComboboxValue, ComboboxContent, ComboboxList, ComboboxGroup, ComboboxLabel, ComboboxEmpty, ComboboxSeparator, ComboboxItem, type ComboboxProps, type ComboboxInputProps, type ComboboxContentProps, type ComboboxItemProps } from './registry/Combobox/Combobox.tsx'
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuCheckboxItem, ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut, ContextMenuGroup, type ContextMenuProps, type ContextMenuContentProps, type ContextMenuItemProps, type ContextMenuCheckboxItemProps } from './registry/ContextMenu/ContextMenu.tsx'
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext, type CarouselProps, type CarouselArrowProps, type CarouselApi, type CarouselOrientation } from './registry/Carousel/Carousel.tsx'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle, type ResizablePanelGroupProps, type ResizablePanelProps, type ResizableHandleProps, type ResizableOrientation, type ResizableLayout, type ResizableBounds } from './registry/ResizablePanelGroup/ResizablePanelGroup.tsx'
import { Menubar, MenubarMenu, MenubarTrigger, MenubarContent, MenubarGroup, MenubarLabel, MenubarItem, MenubarShortcut, MenubarCheckboxItem, MenubarRadioGroup, MenubarRadioItem, MenubarSeparator, type MenubarProps, type MenubarContentProps, type MenubarItemProps, type MenubarCheckboxItemProps } from './registry/Menubar/Menubar.tsx'
import { NavigationMenu, NavigationMenuList, NavigationMenuItem, NavigationMenuTrigger, NavigationMenuContent, NavigationMenuLink, NavigationMenuViewport, navigationMenuTriggerStyle, type NavigationMenuProps, type NavigationMenuContentProps } from './registry/NavigationMenu/NavigationMenu.tsx'
import { Calendar, type CalendarProps, type CalendarMode, type CalendarRange, type CalendarSelection } from './registry/Calendar/Calendar.tsx'
import { SidebarProvider, Sidebar, SidebarTrigger, SidebarRail, SidebarInset, SidebarHeader, SidebarFooter, SidebarContent, SidebarSeparator, SidebarGroup, SidebarGroupLabel, SidebarGroupAction, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuAction, SidebarMenuBadge, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton, useSidebar, type SidebarProviderProps, type SidebarProps, type SidebarMenuButtonProps, type SidebarSide, type SidebarVariant, type SidebarCollapsible, type SidebarState } from './registry/Sidebar/Sidebar.tsx'
import { Field, Segmented, SelectField, SettingsRow } from './contract-adapters.tsx'
import { roles } from './roles.ts'
import { footerAction, headerAction, settingsSection, sidebarTab } from './slot-helpers.ts'

export { Kbd, Badge, Skeleton, Spinner, Alert, Separator, Progress, Avatar, Label, Textarea, Checkbox, AspectRatio, Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator, BreadcrumbEllipsis, Toggle, ButtonGroup, ButtonGroupText, ButtonGroupSeparator, Accordion, AccordionItem, AccordionTrigger, AccordionContent, RadioGroup, Collapsible, CollapsibleTrigger, CollapsibleContent, ToggleGroup, ToggleGroupItem, Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption, DirectionProvider, useDirection, Marker, MarkerIcon, MarkerContent, Message, MessageGroup, MessageAvatar, MessageContent, MessageHeader, MessageFooter, Bubble, BubbleGroup, BubbleContent, BubbleReactions, Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis, NativeSelect, NativeSelectOption, NativeSelectOptGroup, ScrollArea, InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator, Item, ItemGroup, ItemSeparator, ItemMedia, ItemContent, ItemTitle, ItemDescription, ItemActions, ItemHeader, ItemFooter, Attachment, AttachmentGroup, AttachmentMedia, AttachmentContent, AttachmentTitle, AttachmentDescription, AttachmentActions, AttachmentAction, AttachmentTrigger, InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupInput, InputGroupTextarea, FormField, FieldSet, FieldLegend, FieldGroup, FieldContent, FieldLabel, FieldTitle, FieldDescription, FieldSeparator, FieldError, Popover, PopoverTrigger, PopoverAnchor, PopoverContent, PopoverHeader, PopoverTitle, PopoverDescription, Slider, Sheet, SheetTrigger, SheetClose, SheetOverlay, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription, Drawer, DrawerTrigger, DrawerClose, DrawerOverlay, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle, DrawerDescription, Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut, CommandSeparator, Combobox, useComboboxAnchor, ComboboxInput, ComboboxTrigger, ComboboxClear, ComboboxValue, ComboboxContent, ComboboxList, ComboboxGroup, ComboboxLabel, ComboboxEmpty, ComboboxSeparator, ComboboxItem, ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuCheckboxItem, ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut, ContextMenuGroup, Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext, ResizablePanelGroup, ResizablePanel, ResizableHandle, Menubar, MenubarMenu, MenubarTrigger, MenubarContent, MenubarGroup, MenubarLabel, MenubarItem, MenubarShortcut, MenubarCheckboxItem, MenubarRadioGroup, MenubarRadioItem, MenubarSeparator, NavigationMenu, NavigationMenuList, NavigationMenuItem, NavigationMenuTrigger, NavigationMenuContent, NavigationMenuLink, NavigationMenuViewport, navigationMenuTriggerStyle, Calendar, SidebarProvider, Sidebar, SidebarTrigger, SidebarRail, SidebarInset, SidebarHeader, SidebarFooter, SidebarContent, SidebarSeparator, SidebarGroup, SidebarGroupLabel, SidebarGroupAction, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuAction, SidebarMenuBadge, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton, useSidebar, ToolCallCard, SidebarRow, ValueField, SecretField, AppearanceCubes, SettingsRow, SelectPill, Tabs, Card, EmptyState, SwitchField, Dialog, Stack, Field, Segmented, SelectField, roles, footerAction, headerAction, settingsSection, sidebarTab }
export type { KbdProps, BadgeProps, BadgeVariant, SkeletonProps, SpinnerProps, AlertProps, AlertVariant, SeparatorProps, ProgressProps, AvatarProps, AvatarSize, LabelProps, TextareaProps, CheckboxProps, AspectRatioProps, ToggleProps, ToggleVariant, ToggleSize, ButtonGroupProps, AccordionProps, RadioGroupProps, RadioOption, CollapsibleProps, ToggleGroupProps, Direction, DirectionProviderProps, MarkerProps, MarkerVariant, MessageProps, MessageAlign, BubbleProps, BubbleVariant, BubbleAlign, BubbleReactionsProps, PaginationLinkProps, NativeSelectProps, ScrollAreaProps, InputOTPProps, ItemProps, ItemVariant, ItemSize, ItemMediaVariant, AttachmentProps, AttachmentState, AttachmentSize, AttachmentOrientation, AttachmentMediaVariant, InputGroupProps, InputGroupAddonProps, InputGroupAlign, InputGroupButtonSize, FormFieldProps, FormFieldOrientation, FieldLegendVariant, FieldErrorProps, PopoverProps, PopoverContentProps, PopoverAlign, SliderProps, SliderOrientation, SheetProps, SheetContentProps, SheetSide, DrawerProps, DrawerContentProps, DrawerDirection, CommandProps, CommandInputProps, CommandItemProps, ComboboxProps, ComboboxInputProps, ComboboxContentProps, ComboboxItemProps, ContextMenuProps, ContextMenuContentProps, ContextMenuItemProps, ContextMenuCheckboxItemProps, CarouselProps, CarouselArrowProps, CarouselApi, CarouselOrientation, ResizablePanelGroupProps, ResizablePanelProps, ResizableHandleProps, ResizableOrientation, ResizableLayout, ResizableBounds, MenubarProps, MenubarContentProps, MenubarItemProps, MenubarCheckboxItemProps, NavigationMenuProps, NavigationMenuContentProps, CalendarProps, CalendarMode, CalendarRange, CalendarSelection, SidebarProviderProps, SidebarProps, SidebarMenuButtonProps, SidebarSide, SidebarVariant, SidebarCollapsible, SidebarState, ToolCallCardProps, ToolCallLabels, ToolCallState, SidebarRowProps, FieldProps, CubeOption, SettingsRowProps, SelectOption, TabItem }
// Straight re-exports of the app's primitives, so a consumer needs one import.
export {
  Button, Tag, Pill, Toast, Modal, Tooltip,
  StateDot, DisclosureRow, Menu, Switch, Input, HoverCard, RiskConfirmation, ConnectionIndicator,
  JsonTree, TerminalBlock, ReadBlock, DiffBlock, SearchBlock, WebBlock, CodeBlock, JsonBlock, MarkdownText,
  ReferenceIcon, LinkIcon, classifyLinkPath, DocumentFileIcon,
} from '@deepseek-ai/dsh-client-ui-primitives'
export type {
  StateDotState, DisclosureRowProps, MenuEntry, RiskConfirmationProps, ConnectionIndicatorState,
  JsonTreeProps, JsonTreeLabels, TerminalBlockProps, TerminalBlockLabels, ReadBlockProps, ReadBlockLabels,
  DiffBlockProps, DiffBlockLabels, SearchBlockLabels, WebBlockProps, CodeBlockProps, MarkdownLabels,
  ReferenceIconKind, ReferenceIconProps, LinkIconKind, LinkIconProps,
} from '@deepseek-ai/dsh-client-ui-primitives'

export const version = '0.3.0'

/** The two colors DSH has no token for, registered with the theme service (a light and a dark value each, as the service requires). */
const EXTRA_TOKENS = {
  '--acryl-accent': { light: '#4F46E5', dark: '#818CF8' },
  '--acryl-reasoning': { light: '#7C3AED', dark: '#A855F7' },
} as const

export const inject = ['theme']

/**
 * Register the extra tokens; removed with the plugin.
 * @param ctx - client plugin context.
 */
export function apply(ctx: Context): void {
  const theme = (ctx as Context & { theme?: { overrideTokens(source: string, tokens: typeof EXTRA_TOKENS): () => void } }).theme
  if (theme === undefined) return
  ctx.effect(() => theme.overrideTokens('@acryl/ui', EXTRA_TOKENS), '@acryl/ui: extra theme tokens')
}
