import { useMemo, useRef, useState, useEffect } from 'react';
import { bundledCars, carName, searchCars, type Car } from '@shared/tuning';
import { useTuningStore } from '../../store/tuningStore';

/**
 * Searchable vehicle selector backed by the bundled database plus any
 * user-added cars. Selecting "Custom vehicle" clears the selection so the
 * caller can switch to manual dimension entry.
 */
export function CarPicker({
  selected,
  onSelect,
  onCustom,
}: {
  selected: Car | null;
  onSelect: (car: Car) => void;
  onCustom: () => void;
}) {
  const userCars = useTuningStore((s) => s.userCars);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => [...userCars, ...bundledCars()], [userCars]);
  const matches = useMemo(() => searchCars(all, query, 60), [all, query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={open ? query : selected ? carName(selected) : ''}
        placeholder="Search vehicles…"
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
          <button
            onClick={() => {
              onCustom();
              setOpen(false);
            }}
            className="w-full text-left px-3 py-2 text-xs font-mono uppercase tracking-wider text-accent-cyan hover:bg-bg-surface border-b border-border-muted"
          >
            + Custom vehicle (manual dimensions)
          </button>
          {matches.length === 0 && (
            <div className="px-3 py-3 text-xs text-text-dim">No matches.</div>
          )}
          {matches.map((car) => (
            <button
              key={`${car.userAdded ? 'u' : 'b'}-${car.id}`}
              onClick={() => {
                onSelect(car);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-bg-surface flex items-center justify-between gap-2"
            >
              <span className="text-sm text-text truncate">{carName(car)}</span>
              <span className="text-[10px] font-mono text-text-dim shrink-0">
                {car.userAdded ? 'CUSTOM' : car.division}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
