/**
 * frontend/theme/colors.ts
 * AI-SecOS — Oracle Cloud Design Language
 *
 * Faithfully reproduces Oracle Cloud Infrastructure's visual system:
 * - Black top navbar
 * - White left sidebar (no dark rails)
 * - Light grey page background
 * - Black primary buttons, white secondary
 * - Clean sans-serif typography (no decorative elements)
 * - Minimal borders, generous whitespace
 */

export const colors = {
  brand: {
    primary:       "#C74634",   // Oracle red — used sparingly for logo/key accents
    primaryHover:  "#A83929",
    primaryLight:  "#FEF2F0",
    primaryBorder: "#FECDC7",
    navbarBg:      "#1A1A1A",   // Oracle top bar — near-black
    navbarText:    "#FFFFFF",
  },

  action: {
    primary:       "#000000",   // Oracle black buttons
    primaryHover:  "#333333",
    primaryText:   "#FFFFFF",
    secondary:     "#FFFFFF",
    secondaryBorder: "#D0D0D0",
    secondaryText: "#333333",
    secondaryHover:"#F5F5F5",
    danger:        "#C74634",
    dangerHover:   "#A83929",
    dangerText:    "#FFFFFF",
    link:          "#0572CE",   // Oracle blue for links
    linkHover:     "#0450A0",
  },

  surface: {
    page:          "#F5F5F5",   // Oracle page background — warm light grey
    card:          "#FFFFFF",
    sidebar:       "#FFFFFF",   // Oracle sidebar is white
    navbar:        "#1A1A1A",
    tableHeader:   "#F9F9F9",
    tableRowHover: "#F5F7FA",
    input:         "#FFFFFF",
    modal:         "#FFFFFF",
    overlay:       "rgba(0,0,0,0.5)",
    tooltip:       "#333333",
  },

  border: {
    default:       "#D8D8D8",
    light:         "#EBEBEB",
    focus:         "#0572CE",
    sidebar:       "#E8E8E8",
    navbar:        "#333333",
    table:         "#E0E0E0",
    input:         "#C0C0C0",
    inputFocus:    "#0572CE",
  },

  text: {
    primary:       "#161616",   // Oracle near-black text
    secondary:     "#595959",
    muted:         "#767676",
    placeholder:   "#909090",
    inverse:       "#FFFFFF",
    link:          "#0572CE",
    linkHover:     "#0450A0",
    error:         "#C74634",
    success:       "#1A7A4A",
    warning:       "#7D4E00",
  },

  status: {
    success:  { bg: "#F0FAF3", border: "#A3D9B1", text: "#1A7A4A", dot: "#2EAD5C" },
    warning:  { bg: "#FFF8EC", border: "#FFD580", text: "#7D4E00", dot: "#F5A623" },
    danger:   { bg: "#FFF0EE", border: "#FBADA0", text: "#C74634", dot: "#EF4444" },
    info:     { bg: "#F0F8FF", border: "#90CAFF", text: "#0450A0", dot: "#0572CE" },
    neutral:  { bg: "#F5F5F5", border: "#D8D8D8", text: "#595959", dot: "#909090" },
  },

  risk: {
    critical: { bg: "#FFF0EE", border: "#FBADA0", text: "#C74634", badge: "#EF4444" },
    high:     { bg: "#FFF5EE", border: "#FFD0A8", text: "#7D3800", badge: "#EA580C" },
    medium:   { bg: "#FFF8EC", border: "#FFD580", text: "#7D4E00", badge: "#D97706" },
    low:      { bg: "#F0FAF3", border: "#A3D9B1", text: "#1A7A4A", badge: "#22C55E" },
    minimal:  { bg: "#F5F5F5", border: "#D8D8D8", text: "#595959", badge: "#909090" },
  },
} as const;

// ── Tailwind helpers ──────────────────────────────────────────
export const tw = {
  // Page layout — Oracle: grey page, no blue tint
  page:      "min-h-screen bg-[#F5F5F5]",
  pageInner: "max-w-[1600px] mx-auto px-6 py-6",

  // Cards — white on grey, clean 1px border
  card:       "bg-white border border-[#D8D8D8] rounded-sm",
  cardPad:    "p-5",
  cardHeader: "flex items-center justify-between mb-4",

  // Tables — Oracle style
  table:    "w-full text-sm",
  thead:    "bg-[#F9F9F9] border-b border-[#D8D8D8]",
  th:       "px-4 py-2.5 text-left text-xs font-semibold text-[#595959] uppercase tracking-wide whitespace-nowrap",
  td:       "px-4 py-3 text-[#161616] text-sm",
  tr:       "border-b border-[#EBEBEB] hover:bg-[#F5F7FA] transition-colors",

  // Text
  pageTitle:    "text-2xl font-bold text-[#161616]",
  sectionTitle: "text-lg font-semibold text-[#161616]",
  cardTitle:    "text-sm font-semibold text-[#161616]",
  bodyText:     "text-sm text-[#595959]",
  mutedText:    "text-xs text-[#767676]",
  label:        "text-xs font-medium text-[#595959] uppercase tracking-wide",

  // Forms — Oracle clean inputs
  input:      "w-full bg-white border border-[#C0C0C0] rounded px-3 py-2 text-sm text-[#161616] placeholder-[#909090] focus:outline-none focus:ring-1 focus:ring-[#0572CE] focus:border-[#0572CE] transition",
  select:     "w-full bg-white border border-[#C0C0C0] rounded px-3 py-2 text-sm text-[#161616] focus:outline-none focus:ring-1 focus:ring-[#0572CE] focus:border-[#0572CE] transition",
  textarea:   "w-full bg-white border border-[#C0C0C0] rounded px-3 py-2 text-sm text-[#161616] placeholder-[#909090] focus:outline-none focus:ring-1 focus:ring-[#0572CE] focus:border-[#0572CE] resize-none transition",
  fieldLabel: "block text-sm font-medium text-[#161616] mb-1",
  fieldError: "text-xs text-[#C74634] mt-1",
  fieldHint:  "text-xs text-[#767676] mt-1",

  // Buttons — Oracle: black primary, white secondary
  btnPrimary:   "inline-flex items-center gap-2 bg-black hover:bg-[#333] text-white font-medium px-4 py-2 rounded text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-1",
  btnSecondary: "inline-flex items-center gap-2 bg-white hover:bg-[#F5F5F5] text-[#333] font-medium px-4 py-2 rounded text-sm border border-[#D0D0D0] transition-colors disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[#0572CE] focus:ring-offset-1",
  btnDanger:    "inline-flex items-center gap-2 bg-[#C74634] hover:bg-[#A83929] text-white font-medium px-4 py-2 rounded text-sm transition-colors disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[#C74634] focus:ring-offset-1",
  btnGhost:     "inline-flex items-center gap-2 text-[#0572CE] hover:text-[#0450A0] hover:bg-[#F0F8FF] font-medium px-3 py-2 rounded text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#0572CE] focus:ring-offset-1",
  btnIcon:      "inline-flex items-center justify-center w-8 h-8 text-[#595959] hover:text-[#161616] hover:bg-[#F5F5F5] rounded transition-colors",
  btnSm:        "px-3 py-1.5 text-xs",
  btnLg:        "px-6 py-2.5 text-base",

  // Badges — Oracle style, subtle and clean
  badgeGreen:  "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[#F0FAF3] text-[#1A7A4A] border border-[#A3D9B1]",
  badgeAmber:  "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[#FFF8EC] text-[#7D4E00] border border-[#FFD580]",
  badgeRed:    "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[#FFF0EE] text-[#C74634] border border-[#FBADA0]",
  badgeBlue:   "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[#F0F8FF] text-[#0450A0] border border-[#90CAFF]",
  badgeGray:   "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[#F5F5F5] text-[#595959] border border-[#D8D8D8]",
  badgePurple: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[#F8F0FF] text-[#5E35B1] border border-[#C5B0E8]",

  // Dividers
  divider:  "border-t border-[#EBEBEB]",
  dividerY: "border-l border-[#EBEBEB]",

  // Focus
  focusRing: "focus:outline-none focus:ring-1 focus:ring-[#0572CE]",
} as const;
