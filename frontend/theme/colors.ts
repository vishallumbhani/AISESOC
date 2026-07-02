/**
 * frontend/theme/colors.ts
 * AI-SecOS Enterprise Design System — Color Tokens
 *
 * NEVER hardcode colors in pages.
 * Import from here instead.
 *
 * Light theme is default.
 * CSS variables enable dark mode toggle without component rewrites.
 */

export const colors = {
  // ── Brand ──────────────────────────────────────────────────
  brand: {
    primary:      "#2563eb",   // blue-600
    primaryHover: "#1d4ed8",   // blue-700
    primaryLight: "#eff6ff",   // blue-50
    primaryBorder:"#bfdbfe",   // blue-200
    logo:         "#1e40af",   // blue-800
  },

  // ── Semantic Status ─────────────────────────────────────────
  success:  { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d", icon: "#22c55e" },
  warning:  { bg: "#fffbeb", border: "#fde68a", text: "#b45309", icon: "#f59e0b" },
  danger:   { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c", icon: "#ef4444" },
  info:     { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8", icon: "#3b82f6" },

  // ── Risk Levels ─────────────────────────────────────────────
  risk: {
    critical: { bg: "#fef2f2", border: "#fecaca", text: "#991b1b", badge: "#dc2626" },
    high:     { bg: "#fff7ed", border: "#fed7aa", text: "#9a3412", badge: "#ea580c" },
    medium:   { bg: "#fffbeb", border: "#fde68a", text: "#92400e", badge: "#d97706" },
    low:      { bg: "#f0fdf4", border: "#bbf7d0", text: "#14532d", badge: "#16a34a" },
    minimal:  { bg: "#f9fafb", border: "#e5e7eb", text: "#374151", badge: "#6b7280" },
  },

  // ── Neutrals ────────────────────────────────────────────────
  gray: {
    50:  "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
    950: "#030712",
  },

  // ── Light Theme (default) ────────────────────────────────────
  light: {
    // Surfaces
    pageBackground:   "#f8fafc",  // near-white with slight blue tint
    cardBackground:   "#ffffff",
    cardBorder:       "#e2e8f0",
    sidebarBg:        "#ffffff",
    sidebarBorder:    "#e2e8f0",
    navbarBg:         "#ffffff",
    navbarBorder:     "#e2e8f0",
    tableBg:          "#ffffff",
    tableHeaderBg:    "#f8fafc",
    tableRowHover:    "#f1f5f9",
    tableRowBorder:   "#e2e8f0",
    inputBg:          "#ffffff",
    inputBorder:      "#d1d5db",
    inputFocus:       "#2563eb",
    modalBg:          "#ffffff",
    modalOverlay:     "rgba(15,23,42,0.5)",
    // Text
    textPrimary:      "#0f172a",
    textSecondary:    "#475569",
    textMuted:        "#94a3b8",
    textPlaceholder:  "#94a3b8",
    // Sidebar active
    navActive:        "#eff6ff",
    navActiveBorder:  "#2563eb",
    navActiveText:    "#1d4ed8",
    navHover:         "#f1f5f9",
    navText:          "#475569",
  },

  // ── Dark Theme (optional) ────────────────────────────────────
  dark: {
    pageBackground:   "#0f172a",
    cardBackground:   "#1e293b",
    cardBorder:       "#334155",
    sidebarBg:        "#0f172a",
    sidebarBorder:    "#1e293b",
    navbarBg:         "#0f172a",
    navbarBorder:     "#1e293b",
    tableBg:          "#1e293b",
    tableHeaderBg:    "#0f172a",
    tableRowHover:    "#334155",
    tableRowBorder:   "#334155",
    inputBg:          "#1e293b",
    inputBorder:      "#334155",
    inputFocus:       "#3b82f6",
    modalBg:          "#1e293b",
    modalOverlay:     "rgba(0,0,0,0.7)",
    textPrimary:      "#f1f5f9",
    textSecondary:    "#94a3b8",
    textMuted:        "#475569",
    textPlaceholder:  "#475569",
    navActive:        "#1e3a5f",
    navActiveBorder:  "#3b82f6",
    navActiveText:    "#93c5fd",
    navHover:         "#1e293b",
    navText:          "#94a3b8",
  },
} as const;

// ── Tailwind class helpers (use these in components) ──────────

export const tw = {
  // Page
  page:       "min-h-screen bg-slate-50",
  pageInner:  "max-w-[1600px] mx-auto px-6 sm:px-8 py-6",

  // Cards
  card:       "bg-white border border-slate-200 rounded-xl shadow-sm",
  cardPad:    "p-5",
  cardHeader: "flex items-center justify-between mb-4",

  // Tables
  table:      "w-full text-sm",
  thead:      "bg-slate-50 border-b border-slate-200",
  th:         "px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide",
  td:         "px-4 py-3 text-slate-700",
  tr:         "border-b border-slate-100 hover:bg-slate-50 transition-colors",

  // Text
  pageTitle:    "text-2xl font-bold text-slate-900",
  sectionTitle: "text-lg font-semibold text-slate-800",
  cardTitle:    "text-base font-semibold text-slate-800",
  bodyText:     "text-sm text-slate-600",
  mutedText:    "text-xs text-slate-400",
  label:        "text-xs font-medium text-slate-500 uppercase tracking-wide",

  // Forms
  input:        "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition",
  select:       "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition",
  textarea:     "w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition",
  fieldLabel:   "block text-sm font-medium text-slate-700 mb-1.5",
  fieldError:   "text-xs text-red-600 mt-1",
  fieldHint:    "text-xs text-slate-400 mt-1",

  // Buttons
  btnPrimary:   "inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
  btnSecondary: "inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-medium px-4 py-2 rounded-lg text-sm border border-slate-300 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
  btnDanger:    "inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1",
  btnGhost:     "inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium px-3 py-2 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
  btnIcon:      "inline-flex items-center justify-center w-8 h-8 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors",
  btnSm:        "px-3 py-1.5 text-xs",
  btnLg:        "px-6 py-2.5 text-base",

  // Badges
  badgeGreen:  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200",
  badgeAmber:  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200",
  badgeRed:    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200",
  badgeBlue:   "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200",
  badgeGray:   "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200",
  badgePurple: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200",

  // Dividers
  divider:    "border-t border-slate-200",
  dividerY:   "border-l border-slate-200",

  // Focus ring
  focusRing:  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
} as const;
