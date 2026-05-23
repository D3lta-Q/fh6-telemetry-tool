import { useSettingsStore } from '../store/settingsStore';
import type { AppSettings } from '@shared/telemetry';

interface PanelsDrawerProps {
  open: boolean;
  onClose: () => void;
}

type PanelId = keyof AppSettings['visiblePanels'];

interface PanelEntry {
  id: PanelId;
  label: string;
  tag: string;
  hint?: string;
}

/**
 * Catalog of dashboard panels the user can show/hide. The order here is the
 * order they appear in the drawer; it doesn't drive the dashboard layout (the
 * Dashboard component owns its own row/column structure).
 */
const PANELS: PanelEntry[] = [
  { id: 'engine', label: 'Engine', tag: 'POWERTRAIN', hint: 'RPM, torque, power' },
  { id: 'inputs', label: 'Controls', tag: 'INPUT', hint: 'Throttle, brake, steering' },
  { id: 'speed', label: 'Speed', tag: 'VEHICLE' },
  { id: 'suspension', label: 'Suspension', tag: 'CHASSIS' },
  { id: 'wheel', label: 'Wheel rotation', tag: 'DRIVETRAIN' },
  { id: 'tireTemp', label: 'Tire temperature', tag: 'THERMAL' },
  { id: 'tireGrip', label: 'Tire grip', tag: 'TRACTION' },
];

/**
 * Slide-in drawer (from the LEFT) with a toggle per dashboard panel. Slides
 * from the left specifically to differentiate from the Settings drawer that
 * slides from the right - "where you came from is where it lives."
 */
export function PanelsDrawer({ open, onClose }: PanelsDrawerProps) {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  const togglePanel = (id: PanelId) => {
    update({
      visiblePanels: {
        ...settings.visiblePanels,
        [id]: !settings.visiblePanels[id],
      },
    });
  };

  const allOn = () =>
    update({
      visiblePanels: PANELS.reduce(
        (acc, p) => ({ ...acc, [p.id]: true }),
        {} as AppSettings['visiblePanels']
      ),
    });

  const visibleCount = PANELS.filter((p) => settings.visiblePanels[p.id]).length;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/40 transition-opacity z-40 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer - slides from left */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-[340px] max-w-[90vw] bg-bg-surface border-r border-border z-50 transition-transform overflow-y-auto ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="sticky top-0 bg-bg-surface border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <div className="flex items-baseline gap-3">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-dim">
              VIEW
            </span>
            <h2 className="text-sm font-medium">Panels</h2>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 inline-flex items-center justify-center rounded border border-border-muted bg-bg-input text-text-muted hover:text-text hover:border-border transition-colors"
            title="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          <p className="text-[10px] font-mono text-text-dim leading-relaxed">
            Toggle dashboard panels. Hidden panels are removed from the grid and the
            remaining panels expand to fill the freed space. {visibleCount} of {PANELS.length} visible.
          </p>

          <div className="flex flex-col gap-2">
            {PANELS.map((panel) => {
              const visible = settings.visiblePanels[panel.id];
              return (
                <button
                  key={panel.id}
                  onClick={() => togglePanel(panel.id)}
                  className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded border transition-colors text-left ${
                    visible
                      ? 'bg-bg-elevated border-border text-text'
                      : 'bg-bg-input border-border-muted text-text-dim hover:text-text-muted hover:border-border'
                  }`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-dim">
                        {panel.tag}
                      </span>
                      <span className="text-sm font-medium">{panel.label}</span>
                    </div>
                    {panel.hint && (
                      <span className="text-[10px] font-mono text-text-dim">{panel.hint}</span>
                    )}
                  </div>
                  {/* Visibility indicator (eye-shaped) */}
                  <span
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors ${
                      visible
                        ? 'bg-accent-lime/20 border-accent-lime/40'
                        : 'bg-bg-input border-border-muted'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${
                        visible ? 'left-[18px] bg-accent-lime' : 'left-0.5 bg-text-dim'
                      }`}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          <button
            onClick={allOn}
            disabled={visibleCount === PANELS.length}
            className="self-start h-8 px-3 rounded border border-border-muted bg-bg-input text-[11px] font-mono uppercase tracking-wider text-text-muted hover:text-text hover:border-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-text-muted"
          >
            Show all
          </button>
        </div>
      </aside>
    </>
  );
}
