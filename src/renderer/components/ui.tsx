import type { ReactNode } from 'react';

export function Readout({
  label,
  value,
  unit,
  color,
  size = 'md',
}: {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
    xl: 'text-5xl',
  }[size];
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-dim">
        {label}
      </span>
      <span
        className={`data-readout font-medium leading-none truncate ${sizeClasses}`}
        style={color ? { color } : undefined}
      >
        {value}
        {unit && <span className="text-text-muted text-[0.5em] ml-1.5">{unit}</span>}
      </span>
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center bg-bg-input rounded border border-border-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider rounded-sm transition-colors ${
            value === o.value
              ? 'bg-bg-elevated text-text shadow-sm'
              : 'text-text-dim hover:text-text-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function IconButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`h-7 w-7 inline-flex items-center justify-center rounded border text-text-muted transition-colors ${
        active
          ? 'bg-bg-elevated border-border-accent text-text'
          : 'bg-bg-input border-border-muted hover:text-text hover:border-border'
      }`}
    >
      {children}
    </button>
  );
}

export function StatPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div
      className="inline-flex items-center gap-2 px-2 py-1 rounded border border-border-muted bg-bg-input"
      style={accent ? { borderColor: accent + '40' } : undefined}
    >
      <span className="text-[9px] font-mono uppercase tracking-wider text-text-dim">{label}</span>
      <span className="text-xs font-mono" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
    </div>
  );
}
