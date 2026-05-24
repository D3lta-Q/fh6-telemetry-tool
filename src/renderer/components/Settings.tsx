import { useEffect, useRef, useState, useCallback } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import type { AppSettings } from '@shared/telemetry';
import { DEFAULT_SETTINGS } from '@shared/telemetry';

interface SettingsProps {
  open: boolean;
  onClose: () => void;
}

/**
 * A right-side slide-in drawer for app settings.
 *
 * Why a drawer and not a modal? The user explicitly wants to glance at this
 * app while the game runs, so we never want to fully occlude the telemetry.
 * The drawer leaves a slice of the dashboard visible at the left edge.
 *
 * The port field is special: changing it triggers a restart of the UDP
 * listener via window.forza.restartListener(), which Settings.tsx handles
 * explicitly on commit (Enter or blur) rather than every keystroke.
 */
export function Settings({ open, onClose }: SettingsProps) {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  // Local draft of the port so typing doesn't restart the listener every keystroke.
  const [portDraft, setPortDraft] = useState(String(settings.port));
  const portCommittedRef = useRef(settings.port);

  useEffect(() => {
    // When external settings change (e.g. loaded from disk), resync.
    setPortDraft(String(settings.port));
    portCommittedRef.current = settings.port;
  }, [settings.port]);

  const commitPort = async () => {
    const parsed = parseInt(portDraft, 10);
    if (
      Number.isFinite(parsed)
      && parsed >= 1
      && parsed <= 65535
      && parsed !== portCommittedRef.current
    ) {
      // The main process's SET_SETTINGS handler auto-restarts the listener
      // when the port field changes, so a separate restart call isn't needed.
      await update({ port: parsed });
      portCommittedRef.current = parsed;
    } else {
      // Revert on invalid input.
      setPortDraft(String(portCommittedRef.current));
    }
  };

  const setColor = (key: keyof AppSettings['engineColors'], value: string) => {
    update({ engineColors: { ...settings.engineColors, [key]: value } });
  };

  const resetDefaults = () => {
    if (confirm('Reset all settings to defaults?')) {
      update(DEFAULT_SETTINGS);
    }
  };

  return (
    <>
      {/* Backdrop - only visible when open; click closes. Subtle dim, not opaque. */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/40 transition-opacity z-40 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 bottom-0 w-[400px] max-w-[90vw] bg-bg-surface border-l border-border z-50 transition-transform overflow-y-auto ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="sticky top-0 bg-bg-surface border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <div className="flex items-baseline gap-3">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-dim">
              CONFIG
            </span>
            <h2 className="text-sm font-medium">Settings</h2>
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

        <div className="px-5 py-4 flex flex-col gap-6">
          {/* Network section */}
          <Section title="Network" tag="UDP">
            <Field label="Listener port" hint="Forza Data Out target. Default 20066. Avoid 5200–5300.">
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={portDraft}
                  onChange={(e) => setPortDraft(e.target.value)}
                  onBlur={commitPort}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  className="flex-1 h-8 px-2 rounded border border-border-muted bg-bg-input font-mono text-sm text-text focus:outline-none focus:border-border-accent"
                />
                <button
                  onClick={async () => {
                    await window.forza.restartListener(settings.port);
                  }}
                  className="h-8 px-3 rounded border border-border-muted bg-bg-input text-[11px] font-mono uppercase tracking-wider text-text-muted hover:text-text hover:border-border transition-colors"
                  title="Restart UDP listener"
                >
                  Restart
                </button>
              </div>
            </Field>
          </Section>

          {/* Speed section */}
          <Section title="Speed" tag="UNITS">
            <Field label="Display unit">
              <Picker
                value={settings.speedUnit}
                options={[
                  { value: 'ms', label: 'm/s' },
                  { value: 'kmh', label: 'km/h' },
                  { value: 'mph', label: 'mph' },
                ]}
                onChange={(v) => update({ speedUnit: v })}
              />
            </Field>
          </Section>

          {/* Display section */}
          <Section title="Display" tag="APPEARANCE">
            <Field label="Panel scale" hint="Zoom all dashboard panels in or out.">
              <ScaleSlider
                value={settings.uiScale}
                onChange={(v) => update({ uiScale: v })}
              />
            </Field>
          </Section>

          {/* Recording section */}
          <Section title="Recording" tag="CAPTURE">
            <Field
              label="Record hotkey"
              hint="Global hotkey to start/stop recording from anywhere, including in-game. Examples: F9, F10, Ctrl+Shift+R."
            >
              <HotkeyInput
                value={settings.recordHotkey}
                onChange={(v) => update({ recordHotkey: v })}
              />
            </Field>
          </Section>

          {/* Engine section */}
          <Section title="Engine graph" tag="POWERTRAIN">
            <Field label="Series colors">
              <div className="flex flex-col gap-2">
                <ColorRow
                  label="RPM"
                  value={settings.engineColors.rpm}
                  onChange={(v) => setColor('rpm', v)}
                />
                <ColorRow
                  label="Torque"
                  value={settings.engineColors.torque}
                  onChange={(v) => setColor('torque', v)}
                />
                <ColorRow
                  label="Power"
                  value={settings.engineColors.power}
                  onChange={(v) => setColor('power', v)}
                />
              </div>
            </Field>
          </Section>

          {/* Optional graphs section */}
          <Section title="Optional graphs" tag="VISUALS">
            <p className="text-[10px] font-mono text-text-dim -mt-1">
              These widgets have a visual by default. Toggle their graph view here or via
              the chart icon on each widget. All graphs share the global time window in
              the top bar.
            </p>
            <Toggle
              label="Show suspension graph"
              value={settings.showSuspensionGraph}
              onChange={(v) => update({ showSuspensionGraph: v })}
            />
            <Toggle
              label="Show wheel rotation graph"
              value={settings.showWheelGraph}
              onChange={(v) => update({ showWheelGraph: v })}
            />
            <Toggle
              label="Show tire temp graph"
              value={settings.showTireTempGraph}
              onChange={(v) => update({ showTireTempGraph: v })}
            />
            <Toggle
              label="Show tire grip graph"
              value={settings.showTireGripGraph}
              onChange={(v) => update({ showTireGripGraph: v })}
            />
            <Toggle
              label="Show inputs graph"
              value={settings.showInputsGraph}
              onChange={(v) => update({ showInputsGraph: v })}
            />
          </Section>

          {/* Reset button */}
          <button
            onClick={resetDefaults}
            className="self-start h-8 px-3 rounded border border-border-muted bg-bg-input text-[11px] font-mono uppercase tracking-wider text-text-muted hover:text-accent-red hover:border-accent-red/40 transition-colors"
          >
            Reset to defaults
          </button>

          <div className="text-[10px] font-mono text-text-dim leading-relaxed pt-4 border-t border-border-muted">
            <p>
              In Forza Horizon 6: <span className="text-text-muted">Settings → HUD &amp; Gameplay → Data Out → ON</span>.
              Set IP to <span className="text-text-muted">127.0.0.1</span> (same PC) or this machine's LAN IP, port {settings.port}.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}

// ---- Internal layout primitives -------------------------------------------

function Section({ title, tag, children }: { title: string; tag: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-dim">
          {tag}
        </span>
        <h3 className="text-xs font-medium tracking-wide text-text-muted">{title}</h3>
      </div>
      <div className="flex flex-col gap-3 pl-2 border-l border-border-muted">
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] text-text-muted">{label}</label>
      {children}
      {hint && <span className="text-[10px] font-mono text-text-dim">{hint}</span>}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => {
        const v = parseInt(e.target.value, 10);
        if (Number.isFinite(v)) onChange(v);
      }}
      className="w-24 h-8 px-2 rounded border border-border-muted bg-bg-input font-mono text-sm text-text focus:outline-none focus:border-border-accent"
    />
  );
}

function Picker<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex bg-bg-input rounded border border-border-muted p-0.5 self-start">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider rounded-sm transition-colors ${
            value === o.value
              ? 'bg-bg-elevated text-text'
              : 'text-text-dim hover:text-text-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-mono uppercase tracking-wider text-text-muted w-16">
        {label}
      </span>
      {/* Native color picker for hue selection; pair with a text input so users
          can paste a hex value verbatim. */}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-10 rounded border border-border-muted bg-bg-input cursor-pointer"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 h-7 px-2 rounded border border-border-muted bg-bg-input font-mono text-xs text-text focus:outline-none focus:border-border-accent"
      />
    </div>
  );
}

function ScaleSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0.6}
        max={1.4}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer bg-bg-input accent-[#00d4ff]"
      />
      <span className="text-xs font-mono text-text-muted w-9 text-right tabular-nums">
        {pct}%
      </span>
      {value !== 1 && (
        <button
          onClick={() => onChange(1)}
          className="h-6 px-2 rounded border border-border-muted bg-bg-input text-[10px] font-mono text-text-dim hover:text-text hover:border-border transition-colors"
          title="Reset to 100%"
        >
          reset
        </button>
      )}
    </div>
  );
}

/**
 * Key-capture input for Electron accelerator strings.
 *
 * Click/focus to enter capture mode, then press any key combo. Escape cancels.
 * Modifier-only presses are ignored — the user must press a non-modifier key.
 */
function HotkeyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [capturing, setCapturing] = useState(false);

  const toAccelerator = useCallback((e: React.KeyboardEvent<HTMLButtonElement>): string | null => {
    const modless = ['Control', 'Shift', 'Alt', 'Meta', 'Super', 'Escape'];
    if (modless.includes(e.key)) return null;

    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');

    // Map key names to Electron accelerator names.
    const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    parts.push(key);
    return parts.join('+');
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (!capturing) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturing(false);
        return;
      }
      const acc = toAccelerator(e);
      if (acc) {
        onChange(acc);
        setCapturing(false);
      }
    },
    [capturing, onChange, toAccelerator]
  );

  return (
    <button
      onMouseDown={() => setCapturing(true)}
      onFocus={() => setCapturing(true)}
      onBlur={() => setCapturing(false)}
      onKeyDown={handleKeyDown}
      className={`h-8 px-3 rounded border font-mono text-sm text-left transition-colors w-full focus:outline-none ${
        capturing
          ? 'border-border-accent bg-bg-elevated text-text'
          : 'border-border-muted bg-bg-input text-text-muted hover:border-border hover:text-text'
      }`}
    >
      {capturing ? 'Press a key…' : value}
    </button>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex items-center justify-between gap-3 text-left group"
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[11px] text-text-muted group-hover:text-text transition-colors">
          {label}
        </span>
        {hint && <span className="text-[10px] font-mono text-text-dim">{hint}</span>}
      </div>
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors ${
          value
            ? 'bg-accent-lime/20 border-accent-lime/40'
            : 'bg-bg-input border-border-muted'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${
            value ? 'left-[18px] bg-accent-lime' : 'left-0.5 bg-text-dim'
          }`}
        />
      </span>
    </button>
  );
}
