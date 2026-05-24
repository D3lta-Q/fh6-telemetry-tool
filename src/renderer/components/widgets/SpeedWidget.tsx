import { useMemo } from 'react';
import { useTelemetryStore } from '../../store/telemetryStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useAnimationTick } from '../../hooks/useAnimationTick';
import { useEffectiveTimeWindow } from '../../hooks/useEffectiveTimeWindow';
import { convertSpeed, formatGear, speedUnitLabel } from '../../lib/units';
import { Widget } from '../Widget';
import { Readout, SegmentedControl } from '../ui';
import { LiveLineChart, type LiveLineChartSeries } from '../charts/LiveLineChart';

/**
 * Speed widget: speedometer numeral, current gear, and a single-line graph
 * showing speed-over-time in the user's chosen unit.
 *
 * The graph buffer stores raw m/s. Unit conversion happens at display time
 * via the series formatter, so toggling units never invalidates history.
 *
 * The time window is global (set in TopBar). This widget only owns its unit
 * preference.
 */
export function SpeedWidget() {
  useAnimationTick();

  const latest = useTelemetryStore.getState().latest;
  const buffer = useTelemetryStore.getState().speedBuffer;
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const windowSec = useEffectiveTimeWindow();

  const unit = settings.speedUnit;
  const rawSpeed = latest?.speed ?? 0;
  const displaySpeed = convertSpeed(rawSpeed, unit);

  // The series value formatter converts m/s -> chosen unit for the legend.
  const series: LiveLineChartSeries[] = useMemo(
    () => [
      {
        label: `SPEED (${speedUnitLabel(unit)})`,
        color: '#00d4ff',
        format: (v) => (v == null ? '—' : convertSpeed(v, unit).toFixed(0)),
      },
    ],
    [unit]
  );

  return (
    <Widget
      title="Speed"
      tag="VEHICLE"
      controls={
        <SegmentedControl
          value={unit}
          options={[
            { value: 'ms', label: 'm/s' },
            { value: 'kmh', label: 'km/h' },
            { value: 'mph', label: 'mph' },
          ]}
          onChange={(v) => update({ speedUnit: v })}
        />
      }
      readout={
        <div className="flex items-end justify-between gap-6">
          <Readout
            label={`Speed (${speedUnitLabel(unit)})`}
            value={displaySpeed.toFixed(displaySpeed < 10 ? 1 : 0)}
            size="xl"
          />
          <Readout label="Gear" value={formatGear(latest?.gear ?? 1)} size="xl" />
        </div>
      }
    >
      <LiveLineChart
        buffer={buffer}
        windowSec={windowSec}
        series={series}
        height="auto"
      />
    </Widget>
  );
}
