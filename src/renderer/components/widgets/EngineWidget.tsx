import { useMemo } from 'react';
import { useTelemetryStore } from '../../store/telemetryStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useAnimationTick } from '../../hooks/useAnimationTick';
import { wattsToHp } from '../../lib/units';
import { Widget } from '../Widget';
import { Readout } from '../ui';
import {
  LiveLineChart,
  type LiveLineChartAxisConfig,
  type LiveLineChartSeries,
} from '../charts/LiveLineChart';

/**
 * The engine widget: three live readouts (RPM/torque/power), a thin RPM bar
 * with idle/redline markers, and a combined line chart overlaying all three
 * series.
 *
 * MULTI-AXIS RATIONALE
 * --------------------
 * RPM (0..10,000), torque (~±500 Nm), and power (0..700,000 W) span wildly
 * different magnitudes. If they share one Y axis, autoscaling locks onto the
 * largest series (power) and the others appear as flat lines along the
 * bottom. The fix is three separate Y scales, each tied to its own colored
 * axis. uPlot stacks the right-side axes (torque and power) outward.
 *
 * Reads `latest` non-reactively via useAnimationTick + getState - see
 * EngineWidget commit notes for rationale.
 */
export function EngineWidget() {
  useAnimationTick();

  const latest = useTelemetryStore.getState().latest;
  const buffer = useTelemetryStore.getState().engineBuffer;
  const settings = useSettingsStore((s) => s.settings);

  const rpm = latest?.currentEngineRpm ?? 0;
  const maxRpm = latest?.engineMaxRpm ?? 8000;
  const idleRpm = latest?.engineIdleRpm ?? 800;
  const torque = latest?.torque ?? 0;
  const power = latest?.power ?? 0;
  const hp = wattsToHp(power);

  // Each series binds to its own named scale. The scale names match
  // entries in `yAxes` below.
  const series: LiveLineChartSeries[] = useMemo(
    () => [
      {
        label: 'RPM',
        color: settings.engineColors.rpm,
        scale: 'rpm',
        format: (v) => (v == null ? '—' : v.toFixed(0)),
      },
      {
        label: 'TORQUE',
        color: settings.engineColors.torque,
        scale: 'torque',
        format: (v) => (v == null ? '—' : v.toFixed(0) + ' Nm'),
      },
      {
        label: 'POWER',
        color: settings.engineColors.power,
        scale: 'power',
        format: (v) => (v == null ? '—' : wattsToHp(v).toFixed(0) + ' hp'),
      },
    ],
    [settings.engineColors.rpm, settings.engineColors.torque, settings.engineColors.power]
  );

  // Three colored Y axes. RPM on the left (it's the biggest mental anchor),
  // torque + power on the right. Power axis displays hp, not raw watts, so
  // the numbers stay readable.
  const yAxes: LiveLineChartAxisConfig[] = useMemo(
    () => [
      {
        scale: 'rpm',
        side: 'left',
        color: settings.engineColors.rpm,
        format: (v) => v.toFixed(0),
      },
      {
        scale: 'torque',
        side: 'right',
        color: settings.engineColors.torque,
        format: (v) => v.toFixed(0),
      },
      {
        scale: 'power',
        side: 'right',
        color: settings.engineColors.power,
        format: (v) => wattsToHp(v).toFixed(0),
      },
    ],
    [settings.engineColors.rpm, settings.engineColors.torque, settings.engineColors.power]
  );

  // RPM bar: position of needle and the redline marker.
  const rpmPct = Math.max(0, Math.min(1, rpm / Math.max(1, maxRpm)));
  const idlePct = Math.max(0, Math.min(1, idleRpm / Math.max(1, maxRpm)));
  // Cars typically redline well below the EngineMaxRpm ceiling. We mark 90% as
  // "near limit" for the visual cue - this matches what most racing HUDs do.
  const dangerStart = 0.9;
  const dangerActive = rpmPct >= dangerStart;

  return (
    <Widget
      title="Powertrain"
      tag="ENGINE"
      readout={
        <div className="grid grid-cols-3 gap-4">
          <Readout
            label="RPM"
            value={rpm.toFixed(0)}
            color={dangerActive ? settings.engineColors.rpm : undefined}
            size="xl"
          />
          <Readout
            label="Torque"
            value={torque.toFixed(0)}
            unit="Nm"
            color={settings.engineColors.torque}
            size="xl"
          />
          <Readout
            label="Power"
            value={hp.toFixed(0)}
            unit="hp"
            color={settings.engineColors.power}
            size="xl"
          />
        </div>
      }
    >
      <div className="px-2 pb-3">
        <div className="relative h-1.5 bg-bg-input rounded-sm overflow-hidden border border-border-muted">
          {/* Idle zone (subtle gray block to mark dead-pedal range) */}
          <div
            className="absolute inset-y-0 left-0 bg-border-muted/50"
            style={{ width: `${idlePct * 100}%` }}
          />
          {/* Danger zone */}
          <div
            className="absolute inset-y-0 right-0 bg-accent-red/15"
            style={{ width: `${(1 - dangerStart) * 100}%` }}
          />
          {/* Needle */}
          <div
            className="absolute inset-y-0 left-0 transition-[width] duration-75 ease-linear"
            style={{
              width: `${rpmPct * 100}%`,
              background: `linear-gradient(90deg, ${settings.engineColors.rpm}40, ${settings.engineColors.rpm})`,
            }}
          />
          {/* Redline tick */}
          <div
            className="absolute inset-y-0 w-px bg-accent-red"
            style={{ left: `${dangerStart * 100}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[9px] font-mono text-text-dim">
          <span>{idleRpm.toFixed(0)}</span>
          <span>RPM / {maxRpm.toFixed(0)}</span>
        </div>
      </div>

      <LiveLineChart
        buffer={buffer}
        windowSec={settings.globalTimeWindow}
        series={series}
        yAxes={yAxes}
        height="auto"
      />
    </Widget>
  );
}
