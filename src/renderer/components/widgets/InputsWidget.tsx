import { useMemo } from 'react';
import { useTelemetryStore } from '../../store/telemetryStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useEffectiveTimeWindow } from '../../hooks/useEffectiveTimeWindow';
import { Widget } from '../Widget';
import { IconButton } from '../ui';
import { LiveLineChart, type LiveLineChartSeries } from '../charts/LiveLineChart';
import { InputsVisual } from '../visuals/InputsVisual';

/**
 * Inputs widget: live bars for the driver's throttle / brake / handbrake /
 * steering plus an optional 4-series graph of the same data.
 *
 * The store normalizes all four to roughly the same range (0..1 for pedals,
 * -1..1 for steering) so a single Y axis works well. Graph Y range is fixed
 * to [-1, 1] to keep the axis stable as inputs come and go.
 */
export function InputsWidget() {
  const buffer = useTelemetryStore((s) => s.inputsBuffer);
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const windowSec = useEffectiveTimeWindow();

  const series: LiveLineChartSeries[] = useMemo(
    () => [
      {
        label: 'THROTTLE',
        color: '#a3ff12',
        format: (v) => (v == null ? '—' : (v * 100).toFixed(0) + '%'),
      },
      {
        label: 'BRAKE',
        color: '#ff3c1c',
        format: (v) => (v == null ? '—' : (v * 100).toFixed(0) + '%'),
      },
      {
        label: 'H-BRAKE',
        color: '#ffd60a',
        format: (v) => (v == null ? '—' : (v * 100).toFixed(0) + '%'),
      },
      {
        label: 'STEERING',
        color: '#00d4ff',
        format: (v) => (v == null ? '—' : (v * 100).toFixed(0) + '%'),
      },
    ],
    []
  );

  return (
    <Widget
      title="Controls"
      tag="INPUT"
      controls={
        <>
          <IconButton
            active={settings.showInputsVisual}
            onClick={() => update({ showInputsVisual: !settings.showInputsVisual })}
            title="Toggle visual"
          >
            <EyeIcon />
          </IconButton>
          <IconButton
            active={settings.showInputsGraph}
            onClick={() => update({ showInputsGraph: !settings.showInputsGraph })}
            title="Toggle graph"
          >
            <ChartIcon />
          </IconButton>
        </>
      }
    >
      {(() => {
        const showV = settings.showInputsVisual;
        const showG = settings.showInputsGraph;
        const both = showV && showG;
        return (
          <div className={`flex-1 min-h-0 ${both ? 'grid grid-rows-2 gap-2' : 'flex flex-col'}`}>
            {showV && <div className={both ? 'min-h-0 flex' : 'flex-1 min-h-0 flex'}><InputsVisual /></div>}
            {showG && (
              <div className={both ? 'min-h-0 flex flex-col' : 'flex-1 min-h-0 flex flex-col'}>
                <LiveLineChart buffer={buffer} windowSec={windowSec} series={series} height="auto" yRange={[-1, 1]} />
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
