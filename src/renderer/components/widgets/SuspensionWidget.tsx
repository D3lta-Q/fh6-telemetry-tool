import { useMemo } from 'react';
import { useTelemetryStore } from '../../store/telemetryStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useEffectiveTimeWindow } from '../../hooks/useEffectiveTimeWindow';
import { Widget } from '../Widget';
import { IconButton } from '../ui';
import { LiveLineChart, type LiveLineChartSeries } from '../charts/LiveLineChart';
import { SuspensionVisual } from '../visuals/SuspensionVisual';

export function SuspensionWidget() {
  const buffer = useTelemetryStore((s) => s.suspensionBuffer);
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const windowSec = useEffectiveTimeWindow();

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
      legend={series.map((s) => ({ color: s.color, label: s.label }))}
      controls={
        <>
          <IconButton
            active={settings.showSuspensionVisual}
            onClick={() => update({ showSuspensionVisual: !settings.showSuspensionVisual })}
            title="Toggle visual"
          >
            <EyeIcon />
          </IconButton>
          <IconButton
            active={settings.showSuspensionGraph}
            onClick={() => update({ showSuspensionGraph: !settings.showSuspensionGraph })}
            title="Toggle graph"
          >
            <ChartIcon />
          </IconButton>
        </>
      }
    >
      {(() => {
        const showV = settings.showSuspensionVisual;
        const showG = settings.showSuspensionGraph;
        const both = showV && showG;
        return (
          <div className={`flex-1 min-h-0 ${both ? 'grid grid-rows-2 gap-2' : 'flex flex-col'}`}>
            {showV && <div className={both ? 'min-h-0' : 'flex-1 min-h-0'}><SuspensionVisual /></div>}
            {showG && (
              <div className={both ? 'min-h-0 flex flex-col' : 'flex-1 min-h-0 flex flex-col'}>
                <LiveLineChart buffer={buffer} windowSec={windowSec} series={series} height="auto" yRange={[0, 1]} />
              </div>
            )}
          </div>
        );
      })()}
    </Widget>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
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
