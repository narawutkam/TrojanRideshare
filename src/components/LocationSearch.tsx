"use client";

import { useEffect, useId, useRef, useState } from "react";
import { inputClass } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import type { Location } from "@/types";

/**
 * Destination search via LocationService (README §5 GET /api/locations/search).
 * Each suggestion shows its resolved region, or that it is outside every region.
 */
export function LocationSearch({ id, value, onChange, regionNames, placeholder = "Search a place in LA" }: {
  id: string;
  value: Location | null;
  onChange: (loc: Location | null) => void;
  regionNames: Map<string, string>;
  placeholder?: string;
}) {
  const listId = useId();
  const [text, setText] = useState(value?.name ?? "");
  const [results, setResults] = useState<Location[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const seq = useRef(0);

  // Show the chosen place's name. Never clear the box when the value is reset: that happens as you start typing a new one.
  useEffect(() => { if (value) setText(value.name); }, [value]);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2 || q === value?.name) { setResults([]); return; }
    const n = ++seq.current;
    setStatus("loading");
    const t = setTimeout(() => {
      api.searchLocations(q)
        .then((r) => { if (n === seq.current) { setResults(r.items); setStatus("idle"); setActive(-1); } })
        .catch((e: unknown) => {
          if (n !== seq.current) return;
          setStatus("error");
          setErrorMsg(e instanceof ApiError ? e.message : "Place search failed.");
        });
    }, 250);
    return () => clearTimeout(t);
  }, [text, value?.name]);

  function pick(loc: Location) {
    onChange(loc);
    setText(loc.name);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
        className={inputClass} placeholder={placeholder} value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); if (value) onChange(null); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !results.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % results.length); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + results.length) % results.length); }
          if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(results[active]); }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && text.trim().length >= 2 && text !== value?.name && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-sm border border-line bg-surface shadow-lg">
          {status === "loading" && <li className="px-4 py-3 text-sm text-muted">Searching…</li>}
          {status === "error" && <li className="px-4 py-3 text-sm text-cardinal">{errorMsg} Keep typing to retry.</li>}
          {status === "idle" && !results.length && <li className="px-4 py-3 text-sm text-muted">No matching places.</li>}
          {status === "idle" && results.map((r, i) => (
            <li key={r.id} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(r); }}
              className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm ${i === active ? "bg-field" : "hover:bg-field"}`}>
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.name}</span>
                <span className="block truncate text-xs text-muted">{r.address}</span>
              </span>
              <span className={`shrink-0 text-xs font-semibold ${r.regionId ? "text-ok" : "text-muted"}`}>
                {r.regionId ? regionNames.get(r.regionId) ?? "In a region" : "Not in a ride region"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
