import { useSettingsStore } from '../store/settingsStore';
import { EngineWidget } from './widgets/EngineWidget';
import { SpeedWidget } from './widgets/SpeedWidget';
import { SuspensionWidget } from './widgets/SuspensionWidget';
import { WheelWidget } from './widgets/WheelWidget';
import { TireTempWidget } from './widgets/TireTempWidget';
import { TireGripWidget } from './widgets/TireGripWidget';
import { InputsWidget } from './widgets/InputsWidget';

/**
 * The main dashboard. Three logical rows that adapt to which panels the user
 * has visible (via the Panels drawer):
 *
 *   Row 1: ENGINE | INPUTS              (7fr / 3fr if both visible)
 *   Row 2: SPEED | SUSPENSION | WHEEL   (equal columns)
 *   Row 3: TIRE TEMP | TIRE GRIP        (equal columns)
 *
 * Rows with no visible widgets are skipped entirely so remaining rows expand
 * vertically. Within a partially-visible row, widgets share the space equally
 * (except Engine/Inputs which keep a fixed weight when both are visible since
 * engine deserves the wider cell).
 *
 * Row flex weights (flex-[N]) determine height ratios when multiple rows are
 * visible. Tire row gets the smallest weight because its 4-corner visuals
 * read fine compact, while the engine chart benefits from extra height.
 */
export function Dashboard() {
  const panels = useSettingsStore((s) => s.settings.visiblePanels);

  // Row 1: engine + inputs. Special-case the proportions so engine stays wide.
  const row1 = [
    panels.engine && { id: 'engine', node: <EngineWidget />, weight: 7 },
    panels.inputs && { id: 'inputs', node: <InputsWidget />, weight: 3 },
  ].filter(Boolean) as { id: string; node: React.ReactNode; weight: number }[];

  // Row 2 and 3 use equal-width columns.
  const row2 = [
    panels.speed && { id: 'speed', node: <SpeedWidget /> },
    panels.suspension && { id: 'suspension', node: <SuspensionWidget /> },
    panels.wheel && { id: 'wheel', node: <WheelWidget /> },
  ].filter(Boolean) as { id: string; node: React.ReactNode }[];

  const row3 = [
    panels.tireTemp && { id: 'tireTemp', node: <TireTempWidget /> },
    panels.tireGrip && { id: 'tireGrip', node: <TireGripWidget /> },
  ].filter(Boolean) as { id: string; node: React.ReactNode }[];

  // If nothing is visible, show a hint.
  if (row1.length === 0 && row2.length === 0 && row3.length === 0) {
    return (
      <main className="flex-1 min-h-0 overflow-hidden p-3 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-sm text-text-muted">No panels visible.</p>
          <p className="text-[11px] font-mono text-text-dim mt-2">
            Open the panel menu (top-left) and enable some panels.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 min-h-0 overflow-hidden p-3 flex flex-col gap-3">
      {row1.length > 0 && (
        <div
          className="min-h-0 grid gap-3"
          style={{
            // Two-widget row preserves the 7/3 engine/inputs ratio; otherwise
            // the lone widget fills the row.
            gridTemplateColumns:
              row1.length === 2
                ? `minmax(0, ${row1[0]!.weight}fr) minmax(0, ${row1[1]!.weight}fr)`
                : 'minmax(0, 1fr)',
            flex: '10',
          }}
        >
          {row1.map((w) => (
            <div key={w.id} className="min-h-0">
              {w.node}
            </div>
          ))}
        </div>
      )}

      {row2.length > 0 && (
        <div
          className="min-h-0 grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${row2.length}, minmax(0, 1fr))`,
            flex: '8',
          }}
        >
          {row2.map((w) => (
            <div key={w.id} className="min-h-0">
              {w.node}
            </div>
          ))}
        </div>
      )}

      {row3.length > 0 && (
        <div
          className="min-h-0 grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${row3.length}, minmax(0, 1fr))`,
            flex: '6',
          }}
        >
          {row3.map((w) => (
            <div key={w.id} className="min-h-0">
              {w.node}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
