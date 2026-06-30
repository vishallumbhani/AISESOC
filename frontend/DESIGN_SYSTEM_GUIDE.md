# AI-SecOS Enterprise Design System
## Page Conversion Guide — Version 1.0

---

## Quick Start: Converting a Page

Every page must follow this structure:

```tsx
import { tw }                              from "../theme/colors";
import { PageHeader, MetricCard, ... }    from "../components/ds";

const MyPage = () => (
  <div className={tw.page}>
    <div className={tw.pageInner}>
      <PageHeader title="..." breadcrumbs={[...]} actions={<Btn>...</Btn>} />
      {/* Summary MetricCards */}
      {/* TableContainer with toolbar + footer */}
    </div>
  </div>
);
```

---

## Component Reference

### PageHeader
```tsx
<PageHeader
  title="Agents"
  description="Manage AI agents in your organization."
  icon={<FiCpu className="w-5 h-5" />}
  breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Agents" }]}
  actions={<Btn variant="primary" icon={<FiPlus />}>Add</Btn>}
/>
```

### MetricCard
```tsx
<MetricCard
  title="Total Agents"
  value={42}
  icon={<FiCpu className="w-4 h-4" />}
  accent="blue"          // blue | green | amber | red | purple | gray
  trend={-3}             // optional: positive=up(bad), negative=down(good)
  trendLabel="-3 today"
  href="/agents"         // makes card clickable
  loading={isLoading}    // shows skeleton
/>
```

### StatusBadge
```tsx
<StatusBadge status="active" />    // green
<StatusBadge status="deny" />      // red with X icon
<StatusBadge status="allow" />     // green with check icon
<StatusBadge status="draft" />     // blue
<StatusBadge status="critical" />  // red
```

### RiskBadge
```tsx
<RiskBadge level="high" />
<RiskBadge level="critical" score={92} />  // shows score
```

### Btn (replaces all Button usages)
```tsx
<Btn variant="primary"   icon={<FiPlus />}>Add</Btn>
<Btn variant="secondary" icon={<FiRefreshCw />}>Refresh</Btn>
<Btn variant="danger"    loading={deleting}>Delete</Btn>
<Btn variant="ghost">Cancel</Btn>
<Btn size="sm">Small</Btn>
<Btn size="lg">Large</Btn>
```

### TableContainer
```tsx
<TableContainer
  toolbar={
    <>
      <SearchBar value={search} onChange={setSearch} />
      <FilterChip label="Active" active={filter==="active"} onClick={...} />
    </>
  }
  footer={<Pagination total={100} limit={20} offset={0} onPage={setOffset} />}
>
  <THead>
    <TH>Name</TH><TH>Status</TH><TH>Actions</TH>
  </THead>
  <tbody>
    {loading
      ? <tr><td colSpan={3}><LoadingSkeleton rows={5} cols={3} /></td></tr>
      : items.length === 0
        ? <tr><td colSpan={3}><EmptyState title="No items" /></td></tr>
        : items.map(item => (
            <TR key={item.id}>
              <TD>{item.name}</TD>
              <TD><StatusBadge status={item.status} /></TD>
              <TD><button className={tw.btnIcon}><FiEdit2 /></button></TD>
            </TR>
          ))
    }
  </tbody>
</TableContainer>
```

### EmptyState
```tsx
<EmptyState
  icon={<FiShield className="w-7 h-7" />}
  title="No policies found"
  description="Create your first policy or connect an AI platform to begin monitoring."
  action={<Btn variant="primary" icon={<FiPlus />}>Create Policy</Btn>}
/>
```

### InlineAlert
```tsx
{error && (
  <InlineAlert type="error" message={error} onClose={() => setError(null)} />
)}
{success && (
  <InlineAlert type="success" message={success} />
)}
```

### ConfirmDialog
```tsx
<ConfirmDialog
  open={!!itemToDelete}
  title="Delete Policy"
  message={`Delete "${itemToDelete?.name}"? This cannot be undone.`}
  confirmLabel="Delete"
  danger
  loading={deleting}
  onConfirm={handleDelete}
  onCancel={() => setDelete(null)}
/>
```

---

## Form Fields

Always use `tw.*` classes for forms:

```tsx
<label className={tw.fieldLabel}>Agent Name *</label>
<input className={tw.input} placeholder="..." />

<label className={tw.fieldLabel}>Type</label>
<select className={tw.select}>...</select>

<label className={tw.fieldLabel}>Notes</label>
<textarea className={tw.textarea} rows={3} />

{error && <p className={tw.fieldError}>{error}</p>}
<p className={tw.fieldHint}>Max 100 characters</p>
```

---

## Page Layout

```tsx
// Standard page:
<div className={tw.page}>           // min-h-screen bg-[#f8fafc]
  <div className={tw.pageInner}>   // max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6
    ...
  </div>
</div>

// Card:
<Card>...</Card>                     // white bg, border, rounded-xl
<Card padding={false}>...</Card>     // no inner padding
```

---

## Color Rules

| DO ✅ | DON'T ❌ |
|-------|---------|
| `tw.btnPrimary` | `className="bg-blue-600 text-white ..."` |
| `<StatusBadge status={...} />` | `className="bg-green-100 text-green-800 ..."` |
| `<RiskBadge level="high" />` | `className="text-orange-500"` |
| `tw.input` | `className="bg-gray-800 border border-gray-700 text-white ..."` |
| `tw.page` | `className="min-h-screen bg-gray-950"` |

No dark classes (`bg-gray-900`, `bg-gray-950`, `text-white`, `border-gray-700`) in org portal pages.
Dark classes are only acceptable in `/platform/*` pages.

---

## Page Status (convert in this order)

| Page | Priority | Status |
|------|----------|--------|
| `agents.tsx` | P1 | ✅ REFERENCE IMPLEMENTATION |
| `assets/index.tsx` | P1 | 🔄 Convert |
| `policies.tsx` | P1 | 🔄 Convert |
| `incidents.tsx` | P1 | 🔄 Convert |
| `runtime.tsx` | P1 | 🔄 Convert |
| `audit-logs.tsx` | P1 | 🔄 Convert |
| `reports.tsx` | P2 | 🔄 Convert |
| `users.tsx` | P2 | 🔄 Convert |
| `dashboard.tsx` | P2 | 🔄 Convert (use light theme) |
| `enterprise.tsx` | P2 | 🔄 Convert |
| `graph.tsx` | P3 | 🔄 Convert |
| `risk-timeline.tsx` | P3 | 🔄 Convert |
| `policy-simulator.tsx` | P3 | 🔄 Convert |
| `settings.tsx` | P3 | 🔄 Convert |
| `system.tsx` | P3 | 🔄 Convert |
