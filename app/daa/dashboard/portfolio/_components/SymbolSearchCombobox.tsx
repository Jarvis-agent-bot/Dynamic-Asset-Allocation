"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  searchSymbolLookupItemsV1,
  type SymbolLookupItem,
  type SymbolLookupMarketFilter,
} from "@/app/daa/dashboard/_components/symbolLookupClient";

type Props = {
  /** Currently selected item (controlled mode) */
  selected?: SymbolLookupItem | null;
  /** Market filter restriction */
  market?: SymbolLookupMarketFilter;
  /** Placeholder text */
  placeholder?: string;
  /** Called when user selects an item from dropdown */
  onSelect: (item: SymbolLookupItem) => void;
  /** Called when user clears the selection */
  onClear?: () => void;
  /** Max results shown in dropdown */
  limit?: number;
  disabled?: boolean;
};

export default function SymbolSearchCombobox({
  selected,
  market = "ALL",
  placeholder = "搜索代码或名称，如 AAPL / 腾讯",
  onSelect,
  onClear,
  limit = 8,
  disabled = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SymbolLookupItem[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setItems([]);
      setOpen(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void searchSymbolLookupItemsV1({ query: q, market, limit })
        .then((results) => {
          if (cancelled) return;
          setItems(results);
          setOpen(results.length > 0);
          setActiveIndex(-1);
        })
        .catch(() => {
          if (cancelled) return;
          setItems([]);
          setOpen(false);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, market, limit]);

  function handleSelect(item: SymbolLookupItem) {
    onSelect(item);
    setQuery("");
    setItems([]);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || !items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(items[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  // If there's a selected item, show it as a chip (controlled mode)
  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2">
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <span className="font-medium text-sm">{selected.symbol}</span>
          <span className="text-xs text-muted-foreground truncate">{selected.name}</span>
          <span className="ml-auto shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {selected.market}
          </span>
          {selected.price > 0 && (
            <span className="shrink-0 text-xs font-medium tabular-nums">
              {selected.currency} {selected.price.toFixed(2)}
            </span>
          )}
        </div>
        {onClear && !disabled && (
          <button
            type="button"
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            onClick={onClear}
            aria-label="清除选择"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        {loading ? (
          <Loader2 className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        )}
        <Input
          ref={inputRef}
          className="pl-8"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => items.length > 0 && setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
        />
      </div>

      {open && items.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover shadow-lg">
          <ul role="listbox" className="py-1 max-h-[280px] overflow-y-auto">
            {items.map((item, index) => (
              <li
                key={`${item.symbol}-${item.market}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors ${
                  index === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                }`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(item);
                }}
              >
                {/* Symbol + Name */}
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{item.symbol}</span>
                  {item.name && (
                    <span className="ml-2 truncate text-xs text-muted-foreground">{item.name}</span>
                  )}
                </div>
                {/* Market badge */}
                <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {item.market}
                </span>
                {/* Price */}
                {item.price > 0 && (
                  <span className="shrink-0 tabular-nums text-xs font-medium">
                    {item.currency}&nbsp;{item.price.toFixed(2)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
