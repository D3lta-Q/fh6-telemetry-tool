import { useMemo } from 'react';
import { useTelemetryStore } from '../../store/telemetryStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Widget } from '../Widget';
import { IconButton } from '../ui';
import { LiveLineChart, type LiveLineChartSeries } from '../charts/LiveLineChart';
import { SuspensionVisual } from '../visuals/SuspensionVisual';

export function SuspensionWidget() {
  const buffer = useTelemetryStore((s) => s.suspensionBuffer);
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  const series: LiveLineChartSeries[] = useMemo(
    () => [
      { label: 'FL', color: '#00d4ff', format: (v) => (v == null ? '—' : (v * 100).toFixed(0) + '%') },
      { label: 'FR', color: '#a3ff12', format: (v) => (v == null ? '—' : (v * 100).toFixed(0) + '%') },
      { label: 'RL', color: '#ffd60a', format: (v) => (v == null ? '—' : (v * 100).toFixed(0) + '%') },
      { label: 'RR', color: '#ff3c1c', format: (v) => (v == null ? '—' : (v * 100).toFixed(0) + '%') },
    ],
    []
  );

  return (
    <Widget
      title="Suspension"
      tag="CHASSIS"
      controls={
        <IconButton
          active={settings.showSuspensionGraph}
          onClick={() => update({ showSuspensionGraph: !settings.showSuspensionGraph })}
          title="Toggle graph"
        >
          <ChartIcon />
        </IconButton>
      }
    >
      <div className={settings.showSuspensionGraph ? 'flex-1 min-h-0 grid grid-rows-2 gap-2' : 'flex-1 min-h-0 flex flex-col'}>
        <div className={settings.showSuspensionGraph ? 'min-h-0' : 'flex-1 min-h-0'}>
          <SuspensionVisual />
        </div>
        {settings.showSuspensionGraph && (
          <div className="min-h-0 flex flex-col">
            <LiveLineChart
              buffer={buffer}
              windowSec={settings.globalTimeWindow}
              series={series}
              height="auto"
              yRange={[0, 1]}
            />
          </div>
        )}
      </div>
    </Widget>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 13 L6 8 L9 11 L14 4" />
      <path d="M2 14 L14 14" />
    </svg>
  );
}
