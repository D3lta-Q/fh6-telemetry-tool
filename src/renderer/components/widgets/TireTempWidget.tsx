import { useMemo } from 'react';
import { useTelemetryStore } from '../../store/telemetryStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useEffectiveTimeWindow } from '../../hooks/useEffectiveTimeWindow';
import { Widget } from '../Widget';
import { IconButton } from '../ui';
import { LiveLineChart, type LiveLineChartSeries } from '../charts/LiveLineChart';
import { TireTempVisual } from '../visuals/TireTempVisual';

export function TireTempWidget() {
  const buffer = useTelemetryStore((s) => s.tireTempBuffer);
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const windowSec = useEffectiveTimeWindow();

  const series: LiveLineChartSeries[] = useMemo(
    () => [
      { label: 'FL', color: '#00d4ff', format: (v) => (v == null ? '—' : v.toFixed(0) + '°F') },
      { label: 'FR', color: '#a3ff12', format: (v) => (v == null ? '—' : v.toFixed(0) + '°F') },
      { label: 'RL', color: '#ffd60a', format: (v) => (v == null ? '—' : v.toFixed(0) + '°F') },
      { label: 'RR', color: '#ff3c1c', format: (v) => (v == null ? '—' : v.toFixed(0) + '°F') },
    ],
    []
  );

  return (
    <Widget
      title="Tire Temperature"
      tag="THERMAL"
      controls={
        <IconButton
          active={settings.showTireTempGraph}
          onClick={() => update({ showTireTempGraph: !settings.showTireTempGraph })}
          title="Toggle graph"
        >
          <ChartIcon />
        </IconButton>
      }
    >
      <div className={settings.showTireTempGraph ? 'flex-1 min-h-0 grid grid-rows-2 gap-2' : 'flex-1 min-h-0 flex flex-col'}>
        <div className={settings.showTireTempGraph ? 'min-h-0' : 'flex-1 min-h-0'}>
          <TireTempVisual />
        </div>
        {settings.showTireTempGraph && (
          <div className="min-h-0 flex flex-col">
            <LiveLineChart
              buffer={buffer}
              windowSec={windowSec}
              series={series}
              height="auto"
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
