/**
 * components/ds/index.tsx
 * AI-SecOS Enterprise Design System — Shared Components
 *
 * Import from here: import { MetricCard, StatusBadge, PageHeader, ... } from "../components/ds"
 *
 * Every page uses these. Never duplicate UI logic in individual pages.
 */
import React from "react";
import Link from "next/link";
import { tw } from "../../theme/colors";
import {
  FiTrendingUp, FiTrendingDown, FiMinus, FiArrowRight,
  FiAlertTriangle, FiInfo, FiCheckCircle, FiXCircle,
  FiLoader, FiSearch, FiX, FiDownload, FiRefreshCw,
  FiChevronLeft, FiChevronRight, FiFilter,
} from "react-icons/fi";

// ── 1. MetricCard ──────────────────────────────────────────────
interface MetricCardProps {
  title:       string;
  value:       string | number;
  icon?:       React.ReactNode;
  trend?:      number;          // positive = up, negative = down
  trendLabel?: string;
  description?: string;
  href?:       string;
  accent?:     "blue" | "green" | "amber" | "red" | "purple" | "gray";
  loading?:    boolean;
}

const ACCENT_MAP = {
  blue:   { icon: "text-blue-600",   bg: "bg-blue-50",   value: "text-blue-700",  border: "border-blue-100" },
  green:  { icon: "text-green-600",  bg: "bg-green-50",  value: "text-green-700", border: "border-green-100" },
  amber:  { icon: "text-amber-600",  bg: "bg-amber-50",  value: "text-amber-700", border: "border-amber-100" },
  red:    { icon: "text-red-600",    bg: "bg-red-50",    value: "text-red-700",   border: "border-red-100" },
  purple: { icon: "text-purple-600", bg: "bg-purple-50", value: "text-purple-700",border: "border-purple-100" },
  gray:   { icon: "text-slate-500",  bg: "bg-slate-50",  value: "text-slate-700", border: "border-slate-100" },
};

export function MetricCard({ title, value, icon, trend, trendLabel, description, href, accent = "blue", loading }: MetricCardProps) {
  const a = ACCENT_MAP[accent];
  const card = (
    <div className={`${tw.card} ${tw.cardPad} ${href ? "cursor-pointer hover:shadow-md transition-shadow" : ""} h-full`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg ${a.bg} flex items-center justify-center ${a.icon} flex-shrink-0`}>
          {loading ? <FiLoader className="w-4 h-4 animate-spin" /> : icon}
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-0.5 text-xs font-medium ${trend > 0 ? "text-red-600" : trend < 0 ? "text-green-600" : "text-slate-400"}`}>
            {trend > 0 ? <FiTrendingUp className="w-3 h-3" /> : trend < 0 ? <FiTrendingDown className="w-3 h-3" /> : <FiMinus className="w-3 h-3" />}
            {trendLabel || `${Math.abs(trend)}`}
          </div>
        )}
      </div>
      {loading ? (
        <div className="space-y-2">
          <div className="h-7 w-20 bg-slate-200 rounded animate-pulse" />
          <div className="h-3 w-28 bg-slate-100 rounded animate-pulse" />
        </div>
      ) : (
        <>
          <p className={`text-2xl font-bold ${a.value} leading-none`}>{value}</p>
          <p className="text-xs text-slate-500 mt-1.5 font-medium">{title}</p>
          {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
        </>
      )}
      {href && !loading && (
        <div className="flex items-center gap-1 text-xs text-blue-600 mt-2 opacity-0 group-hover:opacity-100">
          <FiArrowRight className="w-3 h-3" />
        </div>
      )}
    </div>
  );
  if (href) return <Link href={href} className="group block h-full">{card}</Link>;
  return card;
}

// ── 2. StatusBadge ─────────────────────────────────────────────
type StatusType = "healthy" | "warning" | "critical" | "disabled" | "draft" | "active" | "inactive" | "open" | "resolved" | "allow" | "deny" | string;

export function StatusBadge({ status }: { status: StatusType }) {
  const map: Record<string, string> = {
    healthy:    tw.badgeGreen,
    active:     tw.badgeGreen,
    allow:      tw.badgeGreen,
    resolved:   tw.badgeGreen,
    operational:tw.badgeGreen,
    warning:    tw.badgeAmber,
    degraded:   tw.badgeAmber,
    draft:      tw.badgeBlue,
    pending:    tw.badgeBlue,
    review:     tw.badgeBlue,
    critical:   tw.badgeRed,
    deny:       tw.badgeRed,
    open:       tw.badgeRed,
    error:      tw.badgeRed,
    inactive:   tw.badgeGray,
    disabled:   tw.badgeGray,
    closed:     tw.badgeGray,
    investigating: tw.badgeAmber,
    approved:   tw.badgePurple,
    false_positive: tw.badgeGray,
  };
  const icon: Record<string, React.ReactNode> = {
    healthy: <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />,
    active:  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />,
    allow:   <FiCheckCircle className="w-3 h-3" />,
    deny:    <FiXCircle className="w-3 h-3" />,
    critical:<span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />,
    open:    <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />,
    warning: <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />,
  };
  const cls = map[status?.toLowerCase()] || tw.badgeGray;
  const ic  = icon[status?.toLowerCase()];
  const label = (status || "").replace(/_/g, " ");
  return (
    <span className={`${cls} inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold h-5`}>
      {ic}{label}
    </span>
  );
}

// ── 3. RiskBadge ───────────────────────────────────────────────
type RiskLevel = "critical" | "high" | "medium" | "low" | "minimal" | string;

export function RiskBadge({ level, score }: { level: RiskLevel; score?: number }) {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-800 border border-red-200",
    high:     "bg-orange-100 text-orange-800 border border-orange-200",
    medium:   "bg-amber-100 text-amber-800 border border-amber-200",
    low:      "bg-green-100 text-green-800 border border-green-200",
    minimal:  "bg-slate-100 text-slate-600 border border-slate-200",
  };
  const dot: Record<string, string> = {
    critical: "bg-red-500", high: "bg-orange-500",
    medium: "bg-amber-500", low: "bg-green-500", minimal: "bg-slate-400",
  };
  const cls = map[level?.toLowerCase()] || map.minimal;
  const d   = dot[level?.toLowerCase()] || dot.minimal;
  const levelLabel = level ? level.charAt(0).toUpperCase() + level.slice(1).toLowerCase() : "—";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold h-5 ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${d}`} />
      {levelLabel}
      {score !== undefined && <span className="opacity-70 font-medium">({score})</span>}
    </span>
  );
}

// ── 4. PageHeader ──────────────────────────────────────────────
interface PageHeaderProps {
  title:        string;
  description?: string;
  icon?:        React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  actions?:     React.ReactNode;
}

export function PageHeader({ title, description, icon, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <div className="mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span>/</span>}
              {b.href ? (
                <Link href={b.href} className="hover:text-slate-600 transition-colors">{b.label}</Link>
              ) : (
                <span className="text-slate-600">{b.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {icon && (
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white flex-shrink-0">
              {icon}
            </div>
          )}
          <div>
            <h1 className={tw.pageTitle}>{title}</h1>
            {description && <p className="text-sm text-slate-500 mt-1 max-w-3xl leading-relaxed">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

// ── 5. SectionHeader ──────────────────────────────────────────
export function SectionHeader({ title, action, icon }: { title: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
        {icon && <span className="text-blue-600">{icon}</span>}
        {title}
      </h2>
      {action && <div>{action}</div>}
    </div>
  );
}

// ── 6. EmptyState ──────────────────────────────────────────────
interface EmptyStateProps {
  icon?:       React.ReactNode;
  title:       string;
  description?: string;
  action?:     React.ReactNode;
}
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="py-14 flex flex-col items-center justify-center text-center px-6">
      {icon && (
        <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-4">
          {icon}
        </div>
      )}
      <p className="text-slate-700 font-semibold text-base mb-1">{title}</p>
      {description && <p className="text-slate-400 text-sm max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── 7. LoadingSkeleton ─────────────────────────────────────────
export function LoadingSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-slate-100 px-4 py-3">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-4 bg-slate-200 rounded flex-1" style={{ opacity: 1 - j * 0.15 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── 8. PageSkeleton (card version) ────────────────────────────
export function CardSkeleton({ height = "h-32" }: { height?: string }) {
  return (
    <div className={`${tw.card} ${height} animate-pulse bg-slate-100`} />
  );
}

// ── 9. Alert / InlineAlert ─────────────────────────────────────
type AlertType = "error" | "warning" | "success" | "info";
interface AlertProps { type: AlertType; title?: string; message: string; onClose?: () => void; }
const ALERT_CLS: Record<AlertType, string> = {
  error:   "bg-red-50 border-red-200 text-red-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  success: "bg-green-50 border-green-200 text-green-800",
  info:    "bg-blue-50 border-blue-200 text-blue-800",
};
const ALERT_ICON: Record<AlertType, React.ReactNode> = {
  error:   <FiXCircle className="w-4 h-4 text-red-500 flex-shrink-0" />,
  warning: <FiAlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />,
  success: <FiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />,
  info:    <FiInfo className="w-4 h-4 text-blue-500 flex-shrink-0" />,
};
export function InlineAlert({ type, title, message, onClose }: AlertProps) {
  return (
    <div className={`flex items-start gap-3 border rounded-xl px-4 py-3 text-sm mb-4 ${ALERT_CLS[type]}`}>
      {ALERT_ICON[type]}
      <div className="flex-1">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <p>{message}</p>
      </div>
      {onClose && (
        <button onClick={onClose} className="opacity-50 hover:opacity-100 transition-opacity">
          <FiX className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ── 10. SearchBar ──────────────────────────────────────────────
interface SearchBarProps {
  value:       string;
  onChange:    (v: string) => void;
  placeholder?: string;
  onSearch?:   () => void;
  className?:  string;
}
export function SearchBar({ value, onChange, placeholder = "Search…", onSearch, className = "" }: SearchBarProps) {
  return (
    <form onSubmit={e => { e.preventDefault(); onSearch?.(); }} className={`relative ${className}`}>
      <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${tw.input} pl-9 pr-8`}
      />
      {value && (
        <button type="button" onClick={() => onChange("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
          <FiX className="w-3.5 h-3.5" />
        </button>
      )}
    </form>
  );
}

// ── 11. FilterChip ─────────────────────────────────────────────
export function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        active
          ? "bg-blue-600 text-white border-blue-600"
          : "bg-white text-slate-600 border-slate-300 hover:border-blue-400 hover:text-blue-600"
      }`}>
      {label}
    </button>
  );
}

// ── 12. TableContainer ─────────────────────────────────────────
interface TableContainerProps {
  children:   React.ReactNode;
  toolbar?:   React.ReactNode;
  footer?:    React.ReactNode;
  className?: string;
}
export function TableContainer({ children, toolbar, footer, className = "" }: TableContainerProps) {
  return (
    <div className={`${tw.card} overflow-hidden ${className}`}>
      {toolbar && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-white flex-wrap">
          {toolbar}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className={tw.table}>
          {children}
        </table>
      </div>
      {footer && (
        <div className="border-t border-slate-200 px-4 py-3 bg-slate-50">
          {footer}
        </div>
      )}
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className={tw.thead}><tr>{children}</tr></thead>;
}
export function TH({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`${tw.th} ${className}`}>{children}</th>;
}
export function TD({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`${tw.td} ${className}`}>{children}</td>;
}
export function TR({ children, onClick, className = "" }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <tr onClick={onClick} className={`${tw.tr} ${onClick ? "cursor-pointer" : ""} ${className}`}>
      {children}
    </tr>
  );
}

// ── 13. Pagination ─────────────────────────────────────────────
interface PaginationProps {
  total:    number;
  limit:    number;
  offset:   number;
  onPage:   (offset: number) => void;
}
export function Pagination({ total, limit, offset, onPage }: PaginationProps) {
  const pages = Math.ceil(total / limit);
  const current = Math.floor(offset / limit) + 1;
  return (
    <div className="flex items-center justify-between text-xs text-slate-500">
      <span>
        Showing {Math.min(offset + 1, total)}–{Math.min(offset + limit, total)} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(Math.max(0, offset - limit))} disabled={offset === 0}
          className="p-1.5 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40">
          <FiChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="px-3 py-1 border border-slate-200 rounded bg-white text-slate-700 font-medium">
          {current} / {pages}
        </span>
        <button onClick={() => onPage(offset + limit)} disabled={offset + limit >= total}
          className="p-1.5 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40">
          <FiChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── 14. ConfirmDialog ──────────────────────────────────────────
interface ConfirmDialogProps {
  open:      boolean;
  title:     string;
  message:   string;
  confirmLabel?: string;
  danger?:   boolean;
  onConfirm: () => void;
  onCancel:  () => void;
  loading?:  boolean;
}
export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", danger, onConfirm, onCancel, loading }: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 z-10">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-4 ${danger ? "bg-red-100" : "bg-blue-100"}`}>
          {danger
            ? <FiAlertTriangle className="w-5 h-5 text-red-600" />
            : <FiInfo className="w-5 h-5 text-blue-600" />}
        </div>
        <h3 className="text-base font-semibold text-slate-900 mb-2">{title}</h3>
        <p className="text-sm text-slate-500 mb-5">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className={tw.btnSecondary}>Cancel</button>
          <button onClick={onConfirm} disabled={loading}
            className={danger ? tw.btnDanger : tw.btnPrimary}>
            {loading ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 15. RiskBar ────────────────────────────────────────────────
export function RiskBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-red-500" : score >= 60 ? "bg-orange-500" : score >= 40 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-200 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-600 w-6 text-right">{score}</span>
    </div>
  );
}

// ── 16. StatRow (inline stat) ──────────────────────────────────
export function StatRow({ label, value, valueClass = "text-slate-800" }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}

// ── 17. Spinner ────────────────────────────────────────────────
export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "w-4 h-4 border" : size === "lg" ? "w-10 h-10 border-2" : "w-6 h-6 border-2";
  return <div className={`${sz} border-blue-600 border-t-transparent rounded-full animate-spin`} />;
}

// ── 18. PageLoader ─────────────────────────────────────────────
export function PageLoader({ text = "Loading…" }: { text?: string }) {
  return (
    <div className={`${tw.page} flex items-center justify-center`}>
      <div className="text-center">
        <Spinner size="lg" />
        <p className="text-slate-400 text-sm mt-3">{text}</p>
      </div>
    </div>
  );
}

// ── 19. ErrorPage ──────────────────────────────────────────────
export function ErrorPage({ title = "Something went wrong", message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div className={`${tw.page} flex items-center justify-center`}>
      <div className="text-center">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <FiAlertTriangle className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">{title}</h2>
        {message && <p className="text-slate-400 text-sm mb-4 max-w-sm">{message}</p>}
        {onRetry && (
          <button onClick={onRetry} className={tw.btnPrimary}>
            <FiRefreshCw className="w-4 h-4" /> Try Again
          </button>
        )}
      </div>
    </div>
  );
}

// ── 20. Button (unified) ───────────────────────────────────────
interface BtnProps {
  children:  React.ReactNode;
  onClick?:  () => void;
  variant?:  "primary" | "secondary" | "danger" | "ghost";
  size?:     "sm" | "md" | "lg";
  disabled?: boolean;
  loading?:  boolean;
  icon?:     React.ReactNode;
  type?:     "button" | "submit" | "reset";
  className?: string;
}

// ── RowMenu — ⋮ action menu for table rows ─────────────────────
interface RowAction { label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean; }

export function RowMenu({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={e => { e.stopPropagation(); setOpen(!open); }}
        className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        title="More actions"
      >
        <span className="text-base font-bold leading-none">⋮</span>
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[160px]">
          {actions.map((a, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); setOpen(false); a.onClick(); }}
              className={`w-full text-left flex items-center gap-2.5 px-3.5 py-2 text-sm transition-colors ${
                a.danger
                  ? "text-red-600 hover:bg-red-50"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {a.icon && <span className="w-4 h-4 flex-shrink-0">{a.icon}</span>}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Btn({ children, onClick, variant = "primary", size = "md", disabled, loading, icon, type = "button", className = "" }: BtnProps) {
  const base = variant === "primary" ? tw.btnPrimary : variant === "secondary" ? tw.btnSecondary : variant === "danger" ? tw.btnDanger : tw.btnGhost;
  const sz   = size === "sm" ? tw.btnSm : size === "lg" ? tw.btnLg : "";
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading}
      className={`${base} ${sz} ${className}`}>
      {loading ? <Spinner size="sm" /> : icon}
      {children}
    </button>
  );
}

// ── 21. Card ───────────────────────────────────────────────────
export function Card({ children, className = "", padding = true }: { children: React.ReactNode; className?: string; padding?: boolean }) {
  return (
    <div className={`${tw.card} ${padding ? tw.cardPad : ""} ${className}`}>
      {children}
    </div>
  );
}

// ── 22. Divider ────────────────────────────────────────────────
export function Divider({ className = "" }: { className?: string }) {
  return <div className={`border-t border-slate-200 ${className}`} />;
}

// ── 23. Tooltip wrapper (simple title attr) ────────────────────
export function WithTooltip({ title, children }: { title: string; children: React.ReactNode }) {
  return <span title={title}>{children}</span>;
}
