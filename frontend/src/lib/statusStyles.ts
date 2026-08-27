/** სტატუსების ერთიანი ფერადი სტილი (აქტიური = შევსებული, არააქტიური = ღია + წყვეტილი) */
export const STATUS_ACTIVE: Record<string, string> = {
  all: 'border-primary bg-primary text-primary-foreground',
  undecided: 'border-status-undecided bg-status-undecided text-white',
  to_watch: 'border-status-towatch bg-status-towatch text-white',
  watching: 'border-status-watching bg-status-watching text-white',
  watched: 'border-status-watched bg-status-watched text-white',
  favorite: 'border-favorite bg-favorite text-white',
}

export const STATUS_INACTIVE: Record<string, string> = {
  all: 'border-dashed border-border bg-secondary/50 text-muted-foreground hover:bg-secondary',
  undecided:
    'border-dashed border-status-undecided/50 bg-status-undecided/10 text-status-undecided hover:bg-status-undecided/20',
  to_watch:
    'border-dashed border-status-towatch/50 bg-status-towatch/10 text-status-towatch hover:bg-status-towatch/20',
  watching:
    'border-dashed border-status-watching/50 bg-status-watching/10 text-status-watching hover:bg-status-watching/20',
  watched:
    'border-dashed border-status-watched/50 bg-status-watched/10 text-status-watched hover:bg-status-watched/20',
  favorite: 'border-dashed border-favorite/50 bg-favorite/10 text-favorite hover:bg-favorite/20',
}
