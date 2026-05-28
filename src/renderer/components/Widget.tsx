import type { ReactNode } from 'react';

export interface WidgetProps {
  title: string;
  /** Small uppercase tag in the corner (e.g. "ENGINE", "SUSPENSION"). */
  tag?: string;
  /** Right-aligned controls (unit toggles, time selectors). */
  controls?: ReactNode;
  /** A row of large numeric readouts below the title. */
  readout?: ReactNode;
  /** Color legend shown at the bottom of the panel. */
  legend?: Array<{ color: string; label: string }>;
  className?: string;
  children: ReactNode;
}

/**
 * The shared "panel" chrome that every telemetry widget sits inside.
 *
 * Visual style: deep dark surface, a single hairline accent on the top edge,
 * generous internal padding, and a small monospace tag for that "instrument"
 * feel. The accent hairline gives each panel a sliver of color identity
 * without dominating.
 */
export function Widget({ title, tag, controls, readout, legend, className = '', children }: WidgetProps) {
  return (
    <div
      className={`relative flex flex-col h-full rounded-md border border-border bg-bg-surface panel-grain ${className}`}
    >
      {/* The hairline accent at the top. We use a real div (not border) so we
          can color it independently per-widget if we ever want to. */}
      <div className="absolute top-0 left-3 right-3 h-px bg-gradient-to-r from-transparent via-border-accent to-transparent" />

      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-baseline gap-3 min-w-0">
          {tag && (
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-dim shrink-0">
              {tag}
            </span>
          )}
          <h2 className="text-sm font-medium tracking-wide truncate">{title}</h2>
        </div>
        {controls && <div className="flex items-center gap-2 shrink-0">{controls}</div>}
      </div>

      {readout && <div className="px-4 pb-2">{readout}</div>}

      <div className={`flex-1 min-h-0 flex flex-col px-2 ${legend ? 'pb-1' : 'pb-3'}`}>{children}</div>

      {legend && legend.length > 0 && (
        <div className="flex items-center justify-center gap-x-4 gap-y-1 px-3 pb-2 pt-0.5 flex-wrap">
          {legend.map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[9px] font-mono uppercase tracking-wider text-text-dim">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
