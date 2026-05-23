import { useMemo } from 'react';
import { useTelemetryStore } from '../../store/telemetryStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Widget } from '../Widget';
import { IconButton } from '../ui';
import { LiveLineChart, type LiveLineChartSeries } from '../charts/LiveLineChart';
import { TireGripVisual } from '../visuals/TireGripVisual';

/**
 * Tire grip widget: 4-corner slip indicators plus an optional graph of the
 * combined-slip magnitudes over time.
 *
 * The graph plots raw combined-slip values (0 = full grip, ≥1 = sliding) so
 * spikes during a slide are immediately visible. Y axis is locked to [0, 2]
 * which covers normal cornering plus generous headroom for slides.
 */
export function TireGripWidget() {
  const buffer = useTelemetryStore((s) => s.tireGripBuffer);
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);

  const series: LiveLineChartSeries[] = useMemo(
    () => [
      { label: 'FL', color: '#00d4ff', format: (v) => (v == null ? '—' : v.toFixed(2)) },
      { label: 'FR', color: '#a3ff12', format: (v) => (v == null ? '—' : v.toFixed(2)) },
      { label: 'RL', color: '#ffd60a', format: (v) => (v == null ? '—' : v.toFixed(2)) },
      { label: 'RR', color: '#ff3c1c', format: (v) => (v == null ? '—' : v.toFixed(2)) },
    ],
    []
  );

  return (
    <Widget
      title="Tire Grip"
      tag="TRACTION"
      controls={
        <IconButton
          active={settings.showTireGripGraph}
          onClick={() => update({ showTireGripGraph: !settings.showTireGripGraph })}
          title="Toggle graph"
        >
          <ChartIcon />
        </IconButton>
      }
    >
      <div className={settings.showTireGripGraph ? 'flex-1 min-h-0 grid grid-rows-2 gap-2' : 'flex-1 min-h-0'}>
        <div className="min-h-0 flex">
          <TireGripVisual />
        </div>
        {settings.showTireGripGraph && (
          <div className="min-h-0 flex flex-col">
            <LiveLineChart
              buffer={buffer}
              windowSec={settings.globalTimeWindow}
              series={series}
              height="auto"
              yRange={[0, 2]}
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
