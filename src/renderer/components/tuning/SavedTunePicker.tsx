import { useEffect, useRef, useState } from 'react';
import type { SavedTune } from '@shared/tuning/savedTune';

interface SavedTunePickerProps {
  tunes: SavedTune[];
  onLoad: (tune: SavedTune) => void;
  onDelete: (id: string) => void;
}

export function SavedTunePicker({ tunes, onLoad, onDelete }: SavedTunePickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = query.toLowerCase();
  const matches = tunes.filter(
    (t) =>
      !q ||
      t.vehicleName.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q)
  );

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={open ? query : ''}
        placeholder="Search saved tunes…"
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        className="w-full h-9 px-3 rounded border border-border-muted bg-bg-input text-sm text-text focus:outline-none focus:border-border-accent"
      />

      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded border border-border bg-bg-elevated shadow-xl">
          {matches.length === 0 && (
            <div className="px-3 py-3 text-xs text-text-dim">
              {tunes.length === 0 ? 'No saved tunes yet.' : 'No matches.'}
            </div>
          )}
          {matches.map((tune) => (
            <div
              key={tune.id}
              className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-bg-surface group"
            >
              <button
                className="flex-1 text-left min-w-0"
                onClick={() => {
                  onLoad(tune);
                  setOpen(false);
                  setQuery('');
                }}
              >
                <div className="text-sm text-text truncate">{tune.vehicleName}</div>
                <div className="text-[10px] font-mono text-text-dim truncate">{tune.name}</div>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(tune.id);
                }}
                title="Delete tune"
                className="shrink-0 h-5 w-5 inline-flex items-center justify-center rounded text-text-dim hover:text-accent-red opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
