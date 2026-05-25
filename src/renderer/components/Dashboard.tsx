import { useRef, useState } from 'react';
import React from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { EngineWidget } from './widgets/EngineWidget';
import { SpeedWidget } from './widgets/SpeedWidget';
import { SuspensionWidget } from './widgets/SuspensionWidget';
import { WheelWidget } from './widgets/WheelWidget';
import { TireTempWidget } from './widgets/TireTempWidget';
import { TireGripWidget } from './widgets/TireGripWidget';
import { InputsWidget } from './widgets/InputsWidget';

export function Dashboard() {
  const panels = useSettingsStore((s) => s.settings.visiblePanels);
  const uiScale = useSettingsStore((s) => s.settings.uiScale);
  const mainRef = useRef<HTMLDivElement>(null);
  const [rowWeights, setRowWeights] = useState<[number, number, number]>([10, 8, 6]);

  const row1 = [
    panels.engine && { id: 'engine', node: <EngineWidget />, weight: 7 },
    panels.inputs && { id: 'inputs', node: <InputsWidget />, weight: 3 },
  ].filter(Boolean) as { id: string; node: React.ReactNode; weight: number }[];

  const row2 = [
    panels.speed && { id: 'speed', node: <SpeedWidget /> },
    panels.suspension && { id: 'suspension', node: <SuspensionWidget /> },
    panels.wheel && { id: 'wheel', node: <WheelWidget /> },
  ].filter(Boolean) as { id: string; node: React.ReactNode }[];

  const row3 = [
    panels.tireTemp && { id: 'tireTemp', node: <TireTempWidget /> },
    panels.tireGrip && { id: 'tireGrip', node: <TireGripWidget /> },
  ].filter(Boolean) as { id: string; node: React.ReactNode }[];

  if (row1.length === 0 && row2.length === 0 && row3.length === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-sm text-text-muted">No panels visible.</p>
          <p className="text-[11px] font-mono text-text-dim mt-2">
            Open the panel menu (top-left) and enable some panels.
          </p>
        </div>
      </div>
    );
  }

  type VRow = { key: string; wIdx: 0 | 1 | 2; content: React.ReactNode };
  const visibleRows: VRow[] = [];

  if (row1.length > 0) visibleRows.push({
    key: 'r1', wIdx: 0,
    content: (
      <div
        className="h-full grid gap-3"
        style={{
          gridTemplateColumns:
            row1.length === 2
              ? `minmax(0, ${row1[0]!.weight}fr) minmax(0, ${row1[1]!.weight}fr)`
              : 'minmax(0, 1fr)',
        }}
      >
        {row1.map((w) => <div key={w.id} className="min-h-0">{w.node}</div>)}
      </div>
    ),
  });

  if (row2.length > 0) visibleRows.push({
    key: 'r2', wIdx: 1,
    content: (
      <div
        className="h-full grid gap-3"
        style={{ gridTemplateColumns: `repeat(${row2.length}, minmax(0, 1fr))` }}
      >
        {row2.map((w) => <div key={w.id} className="min-h-0">{w.node}</div>)}
      </div>
    ),
  });

  if (row3.length > 0) visibleRows.push({
    key: 'r3', wIdx: 2,
    content: (
      <div
        className="h-full grid gap-3"
        style={{ gridTemplateColumns: `repeat(${row3.length}, minmax(0, 1fr))` }}
      >
        {row3.map((w) => <div key={w.id} className="min-h-0">{w.node}</div>)}
      </div>
    ),
  });

  function startDrag(topWIdx: 0 | 1 | 2, botWIdx: 0 | 1 | 2, startY: number) {
    const h = mainRef.current?.getBoundingClientRect().height ?? 600;
    const totalW = rowWeights[0] + rowWeights[1] + rowWeights[2];
    let lastY = startY;

    const onMove = (e: MouseEvent) => {
      const dy = e.clientY - lastY;
      lastY = e.clientY;
      const dw = (dy / h) * totalW;
      setRowWeights((prev) => {
        const next: [number, number, number] = [prev[0], prev[1], prev[2]];
        next[topWIdx] = Math.max(2, prev[topWIdx] + dw);
        next[botWIdx] = Math.max(2, prev[botWIdx] - dw);
        return next;
      });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      <div
        style={{
          transform: `scale(${uiScale})`,
          transformOrigin: 'top left',
          width: `${(1 / uiScale) * 100}%`,
          height: `${(1 / uiScale) * 100}%`,
        }}
      >
        <main ref={mainRef} className="h-full overflow-hidden p-3 flex flex-col">
          {visibleRows.map((row, i) => (
            <React.Fragment key={row.key}>
              {i > 0 && (
                <div
                  className="h-3 shrink-0 flex items-center justify-center cursor-row-resize group select-none"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    startDrag(visibleRows[i - 1]!.wIdx, row.wIdx, e.clientY);
                  }}
                >
                  <div className="w-16 h-px bg-border-muted group-hover:bg-border group-active:bg-[#00d4ff]/60 transition-colors" />
                </div>
              )}
              <div className="min-h-0" style={{ flex: rowWeights[row.wIdx] }}>
                {row.content}
              </div>
            </React.Fragment>
          ))}
        </main>
      </div>
    </div>
  );
}
