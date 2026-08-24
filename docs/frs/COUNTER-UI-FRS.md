> **Note (2026-08-24).** The screen-by-screen requirements and the design-system analysis here
> hold. The phased build plan near the end is superseded by `COUNTER-UI-PLAN.md`, which reflects
> the counter shell that already existed. The competitor is not named anywhere in code, UI or
> docs — see the naming rule in the plan.

# Counter UI Reskin — Functional Requirements Specification

**Version**: 1.0  
**Date**: 2026-08-24  
**Status**: DRAFT — Pending Shawn Review  
**Priority**: Desktop-first; web parity where feasible  

---

## 1. Executive Summary

The client (Innovates) requires the Pelbu POS to adopt the counter visual language and UX patterns.
Staff are already trained on the incumbent ERP and cannot be retrained on a new interface. The requirement
is to **reskin** Pelbu POS to look and feel like the reference ERP while keeping the Pelbu engine underneath.

**Key constraint**: Desktop is the primary platform. Web can omit features that are impractical in
a browser context, as long as desktop has full parity.

This document specifies the visual design system, screen mappings, keyboard shortcuts, and
component specifications derived from the reference demo recording (2026-08-22).

---

## 2. Reference Design System Analysis

### 2.1 Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--cui-header` | `#F5A623` | Orange header bar, screen title background |
| `--cui-menu-item` | `#9DB668` | Menu item background (olive green) |
| `--cui-menu-selected` | `#7A9B4E` | Selected menu item (darker green) |
| `--cui-content-bg` | `#D4E4A6` | Main content area (light green) |
| `--cui-form-bg` | `#F5F5DC` | Form backgrounds (cream/beige) |
| `--cui-grid-header` | `#808080` | Data grid column headers (gray) |
| `--cui-grid-row-alt` | `#FFFACD` | Alternating grid rows (light yellow) |
| `--cui-grid-selected` | `#8B7355` | Selected row (brown/olive) |
| `--cui-dropdown-bg` | `#FFFACD` | Dropdown list background (yellow) |
| `--cui-dropdown-selected` | `#0066CC` | Dropdown selected item (blue) |
| `--cui-input-focus` | `#000000` | Focused input field background (black) |
| `--cui-input-text` | `#FFFFFF` | Focused input text (white) |
| `--cui-function-btn` | `#808080` | Function key buttons (gray) |
| `--cui-chrome` | `#C0C0C0` | Window chrome (silver) |

### 2.2 Typography

| Element | Font | Size | Weight | Color |
|---------|------|------|--------|-------|
| Screen title | System | 14px | Bold | Black |
| Menu items | System | 13px | Normal | Black |
| Shortcut badges | System | 11px | Bold | Black on green |
| Form labels | System | 12px | Normal | Black |
| Form values | System | 12px | Normal | Black |
| Grid headers | System | 12px | Bold | White on gray |
| Grid data | System | 11px | Normal | Black |
| Function keys | System | 11px | Bold | Black |
| Totals row | System | 12px | Bold | Black |

### 2.3 Layout Zones

```
┌─────────────────────────────────────────────────────────────────┐
│ CHROME: Window controls (minimize/maximize/close)               │ 28px
├─────────────────────────────────────────────────────────────────┤
│ HEADER: Company "2026" │ User │ Location │ [Logo] │ Date       │ 32px
├─────────────────────────────────────────────────────────────────┤
│ TITLE BAR: Screen name (orange background)              │ Date │ 24px
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                                                                 │
│                     CONTENT AREA                                │ flex
│              (menus, forms, grids, modals)                      │
│                                                                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ FUNCTION BAR: F2 Date │ S Statistics │ ... │ Esc Exit          │ 48px
├─────────────────────────────────────────────────────────────────┤
│ STATUS BAR: Support │ Search Menu │ Other DB │ Chng Station... │ 24px
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 Keyboard-First Interaction Model

the reference ERP is designed for keyboard-only operation. Every action has a keyboard shortcut.

**Menu Navigation**:
- Single letter shortcuts (P, S, W, F, C, R, E, M, T, X) select menu items directly
- Letters shown in olive green badges beside menu text
- ESC returns to parent menu or exits current screen

**Function Keys**:
- F2: Date/Date Range picker
- F10: Save View / Print
- F12: Location selector
- ESC: Exit / Cancel
- D: Display
- E: Expand
- L: List
- M: Matrix
- P: Print
- S: Statistics / Save

**Form Navigation**:
- Tab / Shift+Tab: Move between fields
- Enter: Confirm selection / Move to next field
- ?: Help/lookup on current field
- Arrow keys: Navigate dropdown lists

---

## 3. Screen Mapping: Reference → Pelbu

### 3.1 Main Menu

| the reference ERP | Shortcut | Pelbu Equivalent | Notes |
|----------|----------|------------------|-------|
| Purchase Management | P | Stock/Purchase | Desktop: full parity |
| Sale Management | S | POS Till | Core billing screen |
| Warehouse Management | W | Stock Management | Desktop: full parity |
| Financial Management | F | Reports (partial) | Ledger/Cash Book subset |
| Customer Relationship | C | Khata/Customers | Credit management |
| Customer Service | R | — | Not in scope |
| Payroll | E | — | Not in scope |
| Master Data Management | M | Settings/Catalog | Product/Category management |
| Settings | T | Settings | Configuration |
| Exit | X | Logout/Exit | Session end |

### 3.2 POS Billing Screen (Critical)

**Note**: The demo recording did not include the actual the reference ERP POS billing screen. This
specification is extrapolated from the consistent patterns observed across other screens
and standard the reference ERP documentation references.

Expected layout:
```
┌─────────────────────────────────────────────────────────────────┐
│ Sale Voucher (New)                              │ 24-Aug-2026   │
├───────────────────────────────┬─────────────────────────────────┤
│ Customer: [____________] ?    │ Salesman: [__________] ?        │
├───────────────────────────────┴─────────────────────────────────┤
│ Sr│ Product Name     │ Code │ Qty │ Rate │ Disc% │ Tax │ Amount│
├───┼──────────────────┼──────┼─────┼──────┼───────┼─────┼───────┤
│ 1 │                  │      │     │      │       │     │       │
│ 2 │                  │      │     │      │       │     │       │
│ ...                                                             │
├─────────────────────────────────────────────────────────────────┤
│ Gross: 0.00 │ Disc: 0.00 │ Tax: 0.00 │ Net Payable: 0.00       │
├─────────────────────────────────────────────────────────────────┤
│ F2 Date│C Cust│P Prod│Q Qty│R Rate│D Disc│T Tax│S Save│Esc Exit│
└─────────────────────────────────────────────────────────────────┘
```

**Billing screen shortcuts** (to be implemented):
| Key | Action |
|-----|--------|
| F2 | Change date |
| C | Customer lookup |
| P | Product search |
| Q | Edit quantity |
| R | Edit rate |
| D | Apply discount |
| T | Toggle tax |
| S / F10 | Save/Settle |
| Esc | Exit/Cancel |
| + | Add item |
| - | Remove item |
| Up/Down | Navigate lines |

### 3.3 Product Management

| the reference ERP Field | Pelbu Field | Notes |
|----------------|-------------|-------|
| Product Name | name | Direct map |
| Print Name | name | Use same value |
| UPC/EAN | barcode | Single barcode field |
| Brand | brand | From brands table |
| Sub Group | subcategory | If using subcategories |
| Group Name | category | Category name |
| Department | — | Not used |
| Tax at Purchase | purchase_gst_rate | GST rate |
| Tax at Sale | sale_gst_rate | GST rate |
| Stock Unit | unit | pcs/kg/case/etc |
| Standard Sales Price | sell_price | Retail price |
| Standard Cost Price | cost_price | Purchase cost |
| HSN/SAC Code | hsn_code | Tax classification |
| POS: Ask Quantity | — | Always ask in Pelbu |
| POS: Ask Rate | price_editable | Allow rate override |

### 3.4 Reports

| the reference ERP Report | Pelbu Equivalent | Implementation |
|-----------------|------------------|----------------|
| Stock Ledger | Stock Ledger | Full parity |
| Stock Statement | Stock Report | Inventory snapshot |
| Stock Discrepancy | — | Phase 2 |
| Bills Receivable | Khata Report | Credit tracking |
| Bills Payable | — | Phase 2 |
| Day Book | Daily Summary | Sales summary |
| Cash Book | Cash Drawer Report | Shift-based |
| Trial Balance | — | Out of scope |
| P&L Account | GST Report | Tax-focused only |

---

## 4. Component Specifications

### 4.1 Menu Component

**Reference Pattern**:
```
┌──────────────────────────────────────┐
│ Main Menu > Submenu Title            │  ← Breadcrumb header (green)
├──────────────────────────────────────┤
│ [P] Purchase Management              │  ← [Letter] in olive badge
│ [S] Sale Management                  │
│ [W] Warehouse Management        ←────│  ← Selected: darker green bg
│ [F] Financial Management             │
│ [X] Exit                             │
└──────────────────────────────────────┘
```

**Pelbu Implementation**:
- Desktop: Custom menu component matching exact the reference ERP styling
- Web: Sidebar navigation with keyboard hints (optional visual parity)

### 4.2 Data Grid Component

**Reference Pattern**:
- Gray column headers
- "Drag a column header here to group by that column" (optional)
- Alternating row colors (white/cream)
- Selected row: brown/olive highlight
- Totals row at bottom with green background
- Right-align numeric columns

**Pelbu Implementation**:
- Desktop: Full visual parity with the reference grid styling
- Web: Existing table components restyled to match colors

### 4.3 Form Component

**Reference Pattern**:
- Two-column layout for master data
- Section headers (underlined): "Product", "Tax", "Others"
- Label : Value format with "?" for lookup fields
- Focused field: black background, white text
- Dropdown: yellow background, blue selection

**Pelbu Implementation**:
- Desktop: Full visual parity
- Web: Responsive forms with the reference colors; mobile may stack to single column

### 4.4 Function Key Bar

**Reference Pattern**:
```
┌────────┬──────────┬──────────┬────────┬────────┬─────────┐
│F2 Date │D Display │E Expand  │P Print │F10 Save│Esc Exit │
└────────┴──────────┴──────────┴────────┴────────┴─────────┘
```

- Gray button background
- Letter prefix (F2, D, E, etc.) in bold
- Action label after prefix
- Two rows if many actions

**Pelbu Implementation**:
- Desktop: Fixed bottom bar with all function key hints
- Web: Floating action bar or keyboard shortcut overlay (Shift+? to show)

### 4.5 Dropdown/Lookup Component

**Reference Pattern**:
- Yellow background (#FFFACD)
- Blue highlight on selected item (#0066CC)
- "Ok" and "KB" buttons at bottom
- Scrollable list
- Type-ahead filtering

**Pelbu Implementation**:
- Desktop: Full visual parity
- Web: Combobox with same colors; native scroll

---

## 5. Keyboard Shortcut Mapping

### 5.1 Global Shortcuts

| Shortcut | the reference ERP | Pelbu Mapping | Desktop | Web |
|----------|----------|---------------|---------|-----|
| Esc | Exit/Back | Same | Yes | Yes |
| F2 | Date picker | Same | Yes | Yes |
| F10 | Save | Same | Yes | Ctrl+S fallback |
| F12 | Location | Shift selector | Yes | Modal |
| ? | Help/Lookup | Same | Yes | Click icon |

### 5.2 POS Screen Shortcuts

| Shortcut | Action | Current Pelbu | Target |
|----------|--------|---------------|--------|
| P | Product search | F3 | P |
| C | Customer lookup | F5 | C |
| Q | Edit quantity | F4 | Q |
| R | Edit rate | F7 | R |
| D | Apply discount | F6 | D |
| S | Settle/Pay | F10 | S |
| H | Hold bill | F9 | H |
| + | Add item | Enter | + |
| - | Remove item | Delete | - |
| F8 | Salesperson | F8 | F8 (keep) |
| F11 | Fullscreen | F11 | F11 (keep) |

### 5.3 Navigation Shortcuts

| Shortcut | Action |
|----------|--------|
| Tab | Next field |
| Shift+Tab | Previous field |
| Enter | Confirm / Submit |
| Up/Down | List navigation |
| Page Up/Down | Grid pagination |
| Home/End | First/Last in list |

---

## 6. Implementation Phases

### Phase R1: Design System Foundation (3 days)

- [ ] Create the reference ERP CSS variables / Tailwind theme
- [ ] Document all color tokens, spacing, typography
- [ ] Build base components: Button, Input, Badge, Panel
- [ ] Build layout components: Header, TitleBar, FunctionBar, StatusBar
- [ ] Screenshot comparison tests vs. the reference frames

### Phase R2: Menu System (2 days)

- [ ] Main Menu component with keyboard shortcuts
- [ ] Submenu navigation with breadcrumb header
- [ ] Menu item component with letter badge
- [ ] Keyboard navigation (letter keys, Esc, Enter)
- [ ] Desktop: full menu tree; Web: sidebar variant

### Phase R3: Data Grid (3 days)

- [ ] Grid component with the reference styling
- [ ] Column headers (gray, sortable)
- [ ] Row selection (brown/olive highlight)
- [ ] Alternating row colors
- [ ] Totals row (green background)
- [ ] Column grouping header (optional)
- [ ] Keyboard navigation (arrows, Page Up/Down)

### Phase R4: Form System (3 days)

- [ ] Two-column form layout
- [ ] Section headers
- [ ] Input with focus style (black bg, white text)
- [ ] Dropdown/lookup component (yellow bg, blue selection)
- [ ] "?" help icon for lookup fields
- [ ] Form keyboard navigation

### Phase R5: POS Billing Screen (5 days) — CRITICAL

- [ ] Voucher-style layout matching the reference ERP pattern
- [ ] Line item grid with inline editing
- [ ] Customer lookup (C)
- [ ] Product search (P)
- [ ] Quantity edit (Q)
- [ ] Rate edit (R)
- [ ] Discount (D)
- [ ] Tax toggle (T)
- [ ] Totals panel (Gross/Disc/Tax/Net)
- [ ] Function bar with all shortcuts
- [ ] Settle flow (S)
- [ ] Hold/Recall (H)

### Phase R6: Reports Reskin (3 days)

- [ ] Stock Ledger with the reference grid
- [ ] Stock Statement/Report
- [ ] Khata/Bills Receivable
- [ ] Day Book / Cash Book
- [ ] GST Report

### Phase R7: Desktop Polish (2 days)

- [ ] Full keyboard navigation audit
- [ ] Function key bar all screens
- [ ] Window chrome styling
- [ ] Splash screen / Loading
- [ ] Print preview styling

### Phase R8: Web Adaptation (2 days)

- [ ] Responsive breakpoints
- [ ] Touch-friendly button sizes
- [ ] Keyboard shortcut help overlay
- [ ] Mobile fallbacks where desktop patterns don't work

---

## 7. Out of Scope (Web Exceptions)

Features that work on Desktop but may be limited on Web:

| Feature | Desktop | Web | Reason |
|---------|---------|-----|--------|
| Function keys (F2-F12) | Full | Limited | Browser intercepts some Fn keys |
| Window chrome | Custom | Browser native | Electron vs browser |
| Print (silent) | Yes | Dialog | Browser security |
| System tray | Yes | No | Electron only |
| Offline operation | Yes | No | Desktop uses PocketBase |
| Auto-update | Yes | N/A | Browser always latest |

---

## 8. Success Criteria

1. **Visual Parity**: Side-by-side comparison with the reference screenshots shows ≥90% match
2. **Keyboard Parity**: All the reference ERP shortcuts work identically on desktop
3. **Staff Validation**: Innovates staff can operate without retraining
4. **Performance**: No regression in load times or responsiveness
5. **Feature Parity**: All existing Pelbu features remain functional

---

## 9. Appendix

### A. Frame Reference (from demo recording)

| Frame | Content | Key Patterns |
|-------|---------|--------------|
| 0001 | Main Menu | Menu styling, function bar |
| 0010 | Product Form | Two-column layout, section headers |
| 0020 | Product Form + Brand dropdown | Yellow dropdown, blue selection |
| 0050 | Purchase Voucher | Voucher layout, grid |
| 0090 | Stock Ledger | Full data grid, transaction history |
| 0110 | Stock Discrepancy Report | Report grid, grouping |
| 0140 | Bills Receivable | Financial report, aging |

### B. Color Tokens CSS

```css
:root {
  --cui-header: #F5A623;
  --cui-header-text: #000000;
  --cui-menu-item: #9DB668;
  --cui-menu-selected: #7A9B4E;
  --cui-menu-text: #000000;
  --cui-content-bg: #D4E4A6;
  --cui-form-bg: #F5F5DC;
  --cui-grid-header-bg: #808080;
  --cui-grid-header-text: #FFFFFF;
  --cui-grid-row-even: #FFFFFF;
  --cui-grid-row-odd: #FFFACD;
  --cui-grid-selected: #8B7355;
  --cui-grid-selected-text: #FFFFFF;
  --cui-grid-totals-bg: #D4E4A6;
  --cui-dropdown-bg: #FFFACD;
  --cui-dropdown-selected: #0066CC;
  --cui-dropdown-selected-text: #FFFFFF;
  --cui-input-focus-bg: #000000;
  --cui-input-focus-text: #FFFFFF;
  --cui-function-btn-bg: #808080;
  --cui-function-btn-text: #000000;
  --cui-chrome: #C0C0C0;
  --cui-border: #808080;
}
```

### C. Reference Screenshots

Screenshots extracted from demo: `/home/ubuntu/edgePOS/docs/ui-reference-frames/`
- 180 frames at 2-second intervals from 6-minute demo
- Resolution: 2862x1614 (iPad recording)

---

**Document History**:
- 2026-08-24: Initial draft from video analysis (Claude)

**Pending Review**:
- [ ] Shawn: Approve overall approach
- [ ] Client: Validate priority screens
- [ ] Dev: Estimate effort per phase
