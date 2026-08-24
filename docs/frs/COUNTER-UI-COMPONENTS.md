> **Superseded in part (2026-08-24).** This document was written before the existing counter
> shell was found in the tree. The `Counter*` component library it specifies was NOT built as a
> separate library — the real implementation extends what already existed and lives in
> `web/components/pos/office/`. Read `COUNTER-UI-PLAN.md` for what exists. The design analysis
> below (tokens, layout zones, grid and form patterns) is still the reference and is what the
> office components were built from.

# Counter UI Component Implementation Guide

**Companion to**: COUNTER-UI-FRS.md  
**Target**: Desktop (Electron) + Web (Next.js)  
**Date**: 2026-08-24  

---

## 1. Component Architecture

### 1.1 Shared Design Tokens

Create `web/styles/counter-ui-tokens.css` (imported by both web and desktop):

```css
:root {
  /* Header */
  --cui-header-bg: #F5A623;
  --cui-header-text: #000000;
  
  /* Menu */
  --cui-menu-bg: #D4E4A6;
  --cui-menu-item-bg: #9DB668;
  --cui-menu-item-hover: #8AA858;
  --cui-menu-item-selected: #7A9B4E;
  --cui-menu-shortcut-bg: #9DB668;
  --cui-menu-shortcut-border: #7A9B4E;
  
  /* Content */
  --cui-content-bg: #D4E4A6;
  --cui-panel-bg: #F5F5DC;
  
  /* Grid */
  --cui-grid-header-bg: #808080;
  --cui-grid-header-text: #FFFFFF;
  --cui-grid-row-even: #FFFFFF;
  --cui-grid-row-odd: #FFFACD;
  --cui-grid-selected-bg: #8B7355;
  --cui-grid-selected-text: #FFFFFF;
  --cui-grid-border: #C0C0C0;
  --cui-grid-totals-bg: #D4E4A6;
  
  /* Form */
  --cui-input-bg: #FFFFFF;
  --cui-input-border: #808080;
  --cui-input-focus-bg: #000000;
  --cui-input-focus-text: #FFFFFF;
  --cui-dropdown-bg: #FFFACD;
  --cui-dropdown-selected-bg: #0066CC;
  --cui-dropdown-selected-text: #FFFFFF;
  
  /* Function Bar */
  --cui-fn-bg: #808080;
  --cui-fn-text: #000000;
  --cui-fn-border: #606060;
  
  /* Chrome */
  --cui-chrome-bg: #C0C0C0;
  --cui-chrome-border: #808080;
  
  /* Spacing */
  --cui-spacing-xs: 4px;
  --cui-spacing-sm: 8px;
  --cui-spacing-md: 12px;
  --cui-spacing-lg: 16px;
  --cui-spacing-xl: 24px;
  
  /* Typography */
  --cui-font-family: system-ui, -apple-system, sans-serif;
  --cui-font-size-sm: 11px;
  --cui-font-size-md: 12px;
  --cui-font-size-lg: 13px;
  --cui-font-size-xl: 14px;
}
```

### 1.2 Component File Structure

```
web/components/counter-ui/
├── layout/
│   ├── CounterShell.jsx          # Main app shell with all zones
│   ├── CounterHeader.jsx         # Top header bar
│   ├── CounterTitleBar.jsx       # Orange title bar
│   ├── CounterFunctionBar.jsx    # Bottom function key bar
│   └── CounterStatusBar.jsx      # Bottom status bar
├── navigation/
│   ├── CounterMenu.jsx           # Main menu component
│   ├── CounterMenuItem.jsx       # Single menu item with shortcut
│   └── CounterBreadcrumb.jsx     # Navigation breadcrumb
├── data/
│   ├── CounterGrid.jsx           # Data grid component
│   ├── CounterGridHeader.jsx     # Column headers
│   ├── CounterGridRow.jsx        # Data row
│   └── CounterGridTotals.jsx     # Totals row
├── form/
│   ├── CounterForm.jsx           # Two-column form layout
│   ├── CounterFormSection.jsx    # Section header
│   ├── CounterInput.jsx          # Text input with focus style
│   ├── CounterDropdown.jsx       # Yellow dropdown
│   └── CounterLookup.jsx         # Field with ? help
├── billing/
│   ├── CounterVoucher.jsx        # Voucher-style layout
│   ├── CounterLineItem.jsx       # Cart line
│   └── CounterTotalsPanel.jsx    # Bill totals
└── index.js                 # Barrel exports
```

---

## 2. Core Layout Components

### 2.1 CounterShell (Main Application Shell)

```jsx
// web/components/counter-ui/layout/CounterShell.jsx

export function CounterShell({ 
  companyName = "Innovates",
  year = "2026",
  user,
  location,
  date,
  title,
  children,
  functionKeys = [],
  statusItems = []
}) {
  return (
    <div className="cui-shell">
      <CounterHeader 
        companyName={companyName}
        year={year}
        user={user}
        location={location}
      />
      <CounterTitleBar title={title} date={date} />
      <main className="cui-content">
        {children}
      </main>
      <CounterFunctionBar keys={functionKeys} />
      <CounterStatusBar items={statusItems} />
    </div>
  );
}
```

**CSS**:
```css
.cui-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--cui-content-bg);
  font-family: var(--cui-font-family);
}

.cui-content {
  flex: 1;
  overflow: auto;
  padding: var(--cui-spacing-md);
}
```

### 2.2 CounterHeader

```jsx
// web/components/counter-ui/layout/CounterHeader.jsx

export function CounterHeader({ companyName, year, user, location }) {
  return (
    <header className="cui-header">
      <div className="cui-header-left">
        <span className="cui-company">{companyName}</span>
        <span className="cui-year">{year}</span>
      </div>
      <div className="cui-header-center">
        <span className="cui-user-icon">👤</span>
        <span className="cui-user">{user}</span>
        <span className="cui-location-icon">📍</span>
        <span className="cui-location">{location}</span>
      </div>
      <div className="cui-header-right">
        <span className="cui-logo">the reference ERP</span>
      </div>
    </header>
  );
}
```

**CSS**:
```css
.cui-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 32px;
  padding: 0 var(--cui-spacing-md);
  background: var(--cui-chrome-bg);
  border-bottom: 1px solid var(--cui-chrome-border);
}

.cui-header-left {
  display: flex;
  gap: var(--cui-spacing-sm);
}

.cui-company {
  font-weight: bold;
}

.cui-logo {
  font-weight: bold;
  font-size: var(--cui-font-size-xl);
}
```

### 2.3 CounterTitleBar (Orange Screen Title)

```jsx
// web/components/counter-ui/layout/CounterTitleBar.jsx

export function CounterTitleBar({ title, date }) {
  return (
    <div className="cui-title-bar">
      <span className="cui-title">{title}</span>
      <span className="cui-date">{date}</span>
    </div>
  );
}
```

**CSS**:
```css
.cui-title-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 24px;
  padding: 0 var(--cui-spacing-md);
  background: var(--cui-header-bg);
  color: var(--cui-header-text);
  font-size: var(--cui-font-size-lg);
}

.cui-title {
  font-weight: bold;
}
```

### 2.4 CounterFunctionBar

```jsx
// web/components/counter-ui/layout/CounterFunctionBar.jsx

export function CounterFunctionBar({ keys = [] }) {
  return (
    <div className="cui-function-bar">
      {keys.map(({ key, label, onClick }) => (
        <button 
          key={key} 
          className="cui-fn-btn"
          onClick={onClick}
        >
          <span className="cui-fn-key">{key}</span>
          <span className="cui-fn-label">{label}</span>
        </button>
      ))}
    </div>
  );
}
```

**CSS**:
```css
.cui-function-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: var(--cui-spacing-xs);
  background: var(--cui-chrome-bg);
  border-top: 1px solid var(--cui-chrome-border);
}

.cui-fn-btn {
  display: flex;
  gap: var(--cui-spacing-xs);
  padding: var(--cui-spacing-xs) var(--cui-spacing-sm);
  background: var(--cui-fn-bg);
  border: 1px solid var(--cui-fn-border);
  cursor: pointer;
  font-family: inherit;
}

.cui-fn-btn:hover {
  filter: brightness(1.1);
}

.cui-fn-key {
  font-weight: bold;
}
```

---

## 3. Navigation Components

### 3.1 CounterMenu

```jsx
// web/components/counter-ui/navigation/CounterMenu.jsx

import { useEffect } from 'react';

export function CounterMenu({ 
  title,
  items = [],
  selectedIndex = 0,
  onSelect,
  onBack
}) {
  // Keyboard handler
  useEffect(() => {
    const handleKey = (e) => {
      const key = e.key.toUpperCase();
      
      // Check for shortcut keys
      const item = items.find(i => i.shortcut?.toUpperCase() === key);
      if (item) {
        onSelect(item);
        return;
      }
      
      // Navigation
      if (e.key === 'ArrowDown') {
        // Move selection down
      } else if (e.key === 'ArrowUp') {
        // Move selection up
      } else if (e.key === 'Escape' && onBack) {
        onBack();
      } else if (e.key === 'Enter') {
        onSelect(items[selectedIndex]);
      }
    };
    
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [items, selectedIndex, onSelect, onBack]);

  return (
    <div className="cui-menu">
      <div className="cui-menu-header">
        {title}
      </div>
      <div className="cui-menu-items">
        {items.map((item, idx) => (
          <CounterMenuItem
            key={item.id}
            shortcut={item.shortcut}
            label={item.label}
            selected={idx === selectedIndex}
            onClick={() => onSelect(item)}
          />
        ))}
      </div>
    </div>
  );
}
```

### 3.2 CounterMenuItem

```jsx
// web/components/counter-ui/navigation/CounterMenuItem.jsx

export function CounterMenuItem({ shortcut, label, selected, onClick }) {
  return (
    <div 
      className={`cui-menu-item ${selected ? 'cui-menu-item--selected' : ''}`}
      onClick={onClick}
    >
      <span className="cui-menu-shortcut">{shortcut}</span>
      <span className="cui-menu-label">{label}</span>
    </div>
  );
}
```

**CSS**:
```css
.cui-menu {
  width: 400px;
  background: var(--cui-menu-bg);
  border: 1px solid var(--cui-chrome-border);
}

.cui-menu-header {
  padding: var(--cui-spacing-sm) var(--cui-spacing-md);
  background: var(--cui-menu-item-bg);
  font-weight: bold;
}

.cui-menu-items {
  padding: var(--cui-spacing-sm);
}

.cui-menu-item {
  display: flex;
  align-items: center;
  gap: var(--cui-spacing-md);
  padding: var(--cui-spacing-xs) var(--cui-spacing-sm);
  cursor: pointer;
}

.cui-menu-item:hover {
  background: var(--cui-menu-item-hover);
}

.cui-menu-item--selected {
  background: var(--cui-menu-item-selected);
}

.cui-menu-shortcut {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: var(--cui-menu-shortcut-bg);
  border: 1px solid var(--cui-menu-shortcut-border);
  border-radius: 2px;
  font-weight: bold;
  font-size: var(--cui-font-size-sm);
}
```

---

## 4. Data Grid Components

### 4.1 CounterGrid

```jsx
// web/components/counter-ui/data/CounterGrid.jsx

export function CounterGrid({ 
  columns = [],
  rows = [],
  selectedIndex = -1,
  onSelectRow,
  totals,
  groupable = false
}) {
  return (
    <div className="cui-grid">
      {groupable && (
        <div className="cui-grid-grouping">
          Drag a column header here to group by that column
        </div>
      )}
      <table className="cui-grid-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th 
                key={col.key}
                className={`cui-grid-th ${col.align === 'right' ? 'cui-grid-th--right' : ''}`}
                style={{ width: col.width }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr 
              key={row.id || idx}
              className={`cui-grid-row ${idx === selectedIndex ? 'cui-grid-row--selected' : ''} ${idx % 2 ? 'cui-grid-row--odd' : ''}`}
              onClick={() => onSelectRow?.(idx, row)}
            >
              {columns.map(col => (
                <td 
                  key={col.key}
                  className={col.align === 'right' ? 'cui-grid-td--right' : ''}
                >
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr className="cui-grid-totals">
              {columns.map(col => (
                <td 
                  key={col.key}
                  className={col.align === 'right' ? 'cui-grid-td--right' : ''}
                >
                  {totals[col.key] ?? ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
```

**CSS**:
```css
.cui-grid {
  background: var(--cui-panel-bg);
  border: 1px solid var(--cui-grid-border);
}

.cui-grid-grouping {
  padding: var(--cui-spacing-sm);
  background: var(--cui-chrome-bg);
  font-size: var(--cui-font-size-sm);
  font-style: italic;
}

.cui-grid-table {
  width: 100%;
  border-collapse: collapse;
}

.cui-grid-th {
  padding: var(--cui-spacing-xs) var(--cui-spacing-sm);
  background: var(--cui-grid-header-bg);
  color: var(--cui-grid-header-text);
  font-weight: bold;
  text-align: left;
  border: 1px solid var(--cui-grid-border);
}

.cui-grid-th--right {
  text-align: right;
}

.cui-grid-row {
  background: var(--cui-grid-row-even);
  cursor: pointer;
}

.cui-grid-row--odd {
  background: var(--cui-grid-row-odd);
}

.cui-grid-row:hover {
  filter: brightness(0.95);
}

.cui-grid-row--selected {
  background: var(--cui-grid-selected-bg) !important;
  color: var(--cui-grid-selected-text);
}

.cui-grid-row td {
  padding: var(--cui-spacing-xs) var(--cui-spacing-sm);
  border: 1px solid var(--cui-grid-border);
}

.cui-grid-td--right {
  text-align: right;
}

.cui-grid-totals {
  background: var(--cui-grid-totals-bg);
  font-weight: bold;
}

.cui-grid-totals td {
  padding: var(--cui-spacing-xs) var(--cui-spacing-sm);
  border: 1px solid var(--cui-grid-border);
}
```

---

## 5. Form Components

### 5.1 CounterInput

```jsx
// web/components/counter-ui/form/CounterInput.jsx

import { useState } from 'react';

export function CounterInput({ 
  label, 
  value, 
  onChange, 
  hasLookup = false,
  onLookup,
  ...props 
}) {
  const [focused, setFocused] = useState(false);
  
  return (
    <div className={`cui-input-wrapper ${focused ? 'cui-input-wrapper--focused' : ''}`}>
      {label && (
        <label className="cui-input-label">
          {label}
          {hasLookup && <span className="cui-input-help">?</span>}
        </label>
      )}
      <input
        className="cui-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
      {hasLookup && (
        <button className="cui-lookup-btn" onClick={onLookup}>
          ...
        </button>
      )}
    </div>
  );
}
```

**CSS**:
```css
.cui-input-wrapper {
  display: flex;
  align-items: center;
  gap: var(--cui-spacing-sm);
}

.cui-input-label {
  min-width: 120px;
  font-size: var(--cui-font-size-md);
}

.cui-input-help {
  color: #666;
  margin-left: var(--cui-spacing-xs);
}

.cui-input {
  flex: 1;
  padding: var(--cui-spacing-xs) var(--cui-spacing-sm);
  border: 1px solid var(--cui-input-border);
  background: var(--cui-input-bg);
  font-family: inherit;
  font-size: var(--cui-font-size-md);
}

.cui-input:focus {
  outline: none;
  background: var(--cui-input-focus-bg);
  color: var(--cui-input-focus-text);
}

.cui-lookup-btn {
  padding: var(--cui-spacing-xs) var(--cui-spacing-sm);
  background: var(--cui-fn-bg);
  border: 1px solid var(--cui-fn-border);
  cursor: pointer;
}
```

### 5.2 CounterDropdown

```jsx
// web/components/counter-ui/form/CounterDropdown.jsx

export function CounterDropdown({
  label,
  value,
  options = [],
  onChange,
  open,
  onToggle
}) {
  return (
    <div className="cui-dropdown-wrapper">
      {label && <label className="cui-dropdown-label">{label}</label>}
      <div className="cui-dropdown">
        <button className="cui-dropdown-trigger" onClick={onToggle}>
          {value || 'Select...'}
        </button>
        {open && (
          <div className="cui-dropdown-list">
            <div className="cui-dropdown-header">Name</div>
            <div className="cui-dropdown-options">
              {options.map((opt, idx) => (
                <div
                  key={opt.value}
                  className={`cui-dropdown-option ${opt.value === value ? 'cui-dropdown-option--selected' : ''}`}
                  onClick={() => onChange(opt.value)}
                >
                  {opt.label}
                </div>
              ))}
            </div>
            <div className="cui-dropdown-footer">
              <button onClick={onToggle}>Ok</button>
              <button>KB</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**CSS**:
```css
.cui-dropdown-list {
  position: absolute;
  right: 0;
  top: 100%;
  width: 250px;
  background: var(--cui-dropdown-bg);
  border: 1px solid var(--cui-chrome-border);
  z-index: 100;
}

.cui-dropdown-header {
  padding: var(--cui-spacing-xs) var(--cui-spacing-sm);
  background: var(--cui-menu-item-bg);
  font-weight: bold;
}

.cui-dropdown-options {
  max-height: 300px;
  overflow-y: auto;
}

.cui-dropdown-option {
  padding: var(--cui-spacing-xs) var(--cui-spacing-sm);
  cursor: pointer;
}

.cui-dropdown-option:hover {
  filter: brightness(0.95);
}

.cui-dropdown-option--selected {
  background: var(--cui-dropdown-selected-bg);
  color: var(--cui-dropdown-selected-text);
}

.cui-dropdown-footer {
  display: flex;
  gap: var(--cui-spacing-sm);
  padding: var(--cui-spacing-xs);
  background: var(--cui-chrome-bg);
}
```

---

## 6. Billing Components

### 6.1 CounterVoucher (POS Billing Layout)

```jsx
// web/components/counter-ui/billing/CounterVoucher.jsx

export function CounterVoucher({
  customer,
  salesman,
  lines = [],
  totals,
  onCustomerLookup,
  onProductAdd,
  onLineEdit,
  onSettle
}) {
  return (
    <div className="cui-voucher">
      <div className="cui-voucher-header">
        <CounterInput 
          label="Customer" 
          value={customer?.name || ''} 
          hasLookup 
          onLookup={onCustomerLookup}
        />
        <CounterInput 
          label="Salesman" 
          value={salesman?.name || ''} 
          hasLookup 
        />
      </div>
      
      <CounterGrid
        columns={[
          { key: 'sr', label: 'Sr', width: 40 },
          { key: 'name', label: 'Product Name', width: 'auto' },
          { key: 'code', label: 'Code', width: 80 },
          { key: 'qty', label: 'Qty', width: 60, align: 'right' },
          { key: 'rate', label: 'Rate', width: 80, align: 'right' },
          { key: 'disc', label: 'Disc%', width: 60, align: 'right' },
          { key: 'tax', label: 'Tax', width: 60, align: 'right' },
          { key: 'amount', label: 'Amount', width: 100, align: 'right' },
        ]}
        rows={lines}
        onSelectRow={onLineEdit}
      />
      
      <CounterTotalsPanel totals={totals} />
    </div>
  );
}
```

### 6.2 CounterTotalsPanel

```jsx
// web/components/counter-ui/billing/CounterTotalsPanel.jsx

export function CounterTotalsPanel({ totals }) {
  return (
    <div className="cui-totals-panel">
      <div className="cui-totals-row">
        <span>Gross:</span>
        <span>{totals.gross?.toFixed(2) || '0.00'}</span>
      </div>
      <div className="cui-totals-row">
        <span>Discount:</span>
        <span>{totals.discount?.toFixed(2) || '0.00'}</span>
      </div>
      <div className="cui-totals-row">
        <span>Tax:</span>
        <span>{totals.tax?.toFixed(2) || '0.00'}</span>
      </div>
      <div className="cui-totals-row cui-totals-row--grand">
        <span>Net Payable:</span>
        <span>{totals.net?.toFixed(2) || '0.00'}</span>
      </div>
    </div>
  );
}
```

**CSS**:
```css
.cui-voucher {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--cui-panel-bg);
}

.cui-voucher-header {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--cui-spacing-lg);
  padding: var(--cui-spacing-md);
  border-bottom: 1px solid var(--cui-grid-border);
}

.cui-totals-panel {
  display: flex;
  gap: var(--cui-spacing-xl);
  padding: var(--cui-spacing-md);
  background: var(--cui-grid-totals-bg);
  border-top: 2px solid var(--cui-chrome-border);
}

.cui-totals-row {
  display: flex;
  gap: var(--cui-spacing-sm);
}

.cui-totals-row--grand {
  font-weight: bold;
  font-size: var(--cui-font-size-lg);
}
```

---

## 7. Keyboard Handler Hook

```jsx
// web/hooks/useCounterKeyboard.js

import { useEffect, useCallback } from 'react';

export function useCounterKeyboard(shortcuts = {}) {
  const handleKeyDown = useCallback((e) => {
    // Build key string (e.g., "Ctrl+S", "F2", "Escape")
    let key = '';
    if (e.ctrlKey) key += 'Ctrl+';
    if (e.altKey) key += 'Alt+';
    if (e.shiftKey && e.key.length > 1) key += 'Shift+';
    key += e.key.length === 1 ? e.key.toUpperCase() : e.key;
    
    const handler = shortcuts[key];
    if (handler) {
      e.preventDefault();
      handler(e);
    }
  }, [shortcuts]);
  
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// Usage:
// useCounterKeyboard({
//   'P': () => openProductSearch(),
//   'C': () => openCustomerLookup(),
//   'F2': () => openDatePicker(),
//   'Escape': () => goBack(),
// });
```

---

## 8. Desktop-Specific Considerations

### 8.1 Electron Main Process

```js
// desktop/main.js additions

// Remove default menu for cleaner look
Menu.setApplicationMenu(null);

// Custom window chrome
const win = new BrowserWindow({
  frame: false,  // Remove OS chrome
  // ...
});
```

### 8.2 Custom Title Bar (Desktop)

```jsx
// desktop/components/CounterWindowChrome.jsx

export function CounterWindowChrome({ title }) {
  const { ipcRenderer } = window.require('electron');
  
  return (
    <div className="cui-window-chrome">
      <span className="cui-window-title">{title}</span>
      <div className="cui-window-controls">
        <button onClick={() => ipcRenderer.send('minimize')}>−</button>
        <button onClick={() => ipcRenderer.send('maximize')}>□</button>
        <button onClick={() => ipcRenderer.send('close')}>×</button>
      </div>
    </div>
  );
}
```

---

## 9. Migration Checklist

### Desktop Priority (P0)

- [ ] CounterShell layout
- [ ] CounterMenu system
- [ ] CounterGrid component
- [ ] CounterVoucher (POS screen)
- [ ] Keyboard shortcuts
- [ ] Function bar
- [ ] Window chrome

### Web Adaptation (P1)

- [ ] Responsive breakpoints
- [ ] Touch targets (44px min)
- [ ] Keyboard overlay (Shift+?)
- [ ] Mobile menu (hamburger fallback)

### Reports (P2)

- [ ] Stock Ledger
- [ ] Khata Report
- [ ] Day Book
- [ ] GST Report

---

**Next Step**: Start with Phase R1 (Design System Foundation) on desktop, then expand to web.
