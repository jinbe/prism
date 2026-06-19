// Single icon surface for the whole app. Import icons from here, never inline
// <svg> at call sites and never use unicode/emoji glyphs as icons. Icons render
// at 1em / currentColor, so size and tint follow the control they sit in.
// Default weight ("light") is set once via IconContext in App.svelte.
export {
  Plus, // add pane
  CaretLeft, // nav back
  CaretRight, // nav forward
  ArrowClockwise, // reload
  X, // close / remove
  Code, // pane devtools
  GearSix, // proxy settings
  Pulse, // network inspector
  CursorClick, // mirror interactions
  Path, // mirror routes
  PlugsConnected, // dev proxy
  Link, // pane is synced
  LinkBreak, // pane is detached from sync
  Equals, // bodies identical
  ArrowLineRight, // open in all panes
  SpinnerGap, // in-progress / connecting
  SidebarSimple, // toggle the workspace rail
  Intersect, // visual diff (merge two panes)
  Stack, // a workspace / project
  Trash // remove workspace
} from 'phosphor-svelte'
