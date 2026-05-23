import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import type { RingBuffer } from '../../lib/ringBuffer';
import { useAnimationTick } from '../../hooks/useAnimationTick';

export interface LiveLineChartSeries {
  label: string;
  color: string;
  /** Optional value formatter for the legend cell. */
  format?: (v: number | null) => string;
  /**
   * Optional named scale this series binds to. If omitted, all series share
   * a single autoranging Y scale. Use when different series have wildly
   * different magnitudes (e.g. RPM 0..10000 vs Torque -500..500).
   */
  scale?: string;
}

/**
 * Per-axis config for multi-Y-axis charts. Use this when you want each scale
 * to display its own labels alongside its own series color.
 */
export interface LiveLineChartAxisConfig {
  /** Named scale this axis is tied to. Must match a series.scale. */
  scale: string;
  /** Which edge of the chart to render on. */
  side: 'left' | 'right';
  /** Axis label/tick color (typically the matching series color). */
  color: string;
  /** Optional formatter for the displayed tick values. */
  format?: (v: number) => string;
}

export interface LiveLineChartProps {
  buffer: RingBuffer;
  /** Time window to display, in seconds. */
  windowSec: number;
  series: LiveLineChartSeries[];
  /** Height of the chart canvas in pixels. If 'auto', fills parent. */
  height?: number | 'auto';
  /** Optional fixed Y range. Ignored when yAxes is provided. */
  yRange?: [number, number];
  /**
   * Optional explicit Y-axis configuration. When provided, each scale gets
   * its own visible axis colored to match its series. When omitted, a single
   * shared Y axis is used.
   */
  yAxes?: LiveLineChartAxisConfig[];
  /** Optional axis label for the primary Y axis (legacy single-axis mode). */
  yLabel?: string;
  /** If true, show the legend strip beneath the chart. */
  showLegend?: boolean;
}

/**
 * High-performance streaming line chart backed by a RingBuffer.
 *
 * uPlot is rebuilt whenever the visual config (colors, range, height) changes,
 * which is rare. Inside the steady state we only call plot.setData() on each
 * animation frame - that's the cheap path uPlot is designed for.
 *
 * Multi-axis mode: pass `yAxes` to render multiple Y axes (one per named
 * scale) with each axis colored to match its associated series. This is used
 * by the engine widget where RPM/torque/power have such different magnitudes
 * that sharing one scale would flatten all but the largest series.
 */
export function LiveLineChart({
  buffer,
  windowSec,
  series,
  height = 180,
  yRange,
  yAxes,
  yLabel,
  showLegend = false,
}: LiveLineChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  const tick = useAnimationTick();

  // Build uPlot. We rebuild whenever the visual config changes, which is rare.
  // The hot path is the setData() call below, NOT this useEffect.
  const configKey =
    series.map((s) => `${s.label}|${s.color}|${s.scale ?? ''}`).join(',') +
    `|${height}|${yRange?.[0] ?? 'a'}|${yRange?.[1] ?? 'a'}|${yLabel ?? ''}|${showLegend}` +
    `|${yAxes?.map((a) => `${a.scale}:${a.side}:${a.color}`).join(';') ?? ''}`;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resolveHeight = () =>
      height === 'auto' ? Math.max(80, container.clientHeight) : height;

    // ---- Build scales ----
    // If yAxes is provided, create one scale per axis. Otherwise we use a
    // single 'y' scale shared by all series (legacy behavior).
    const scales: uPlot.Options['scales'] = { x: { time: false } };
    if (yAxes && yAxes.length > 0) {
      for (const ax of yAxes) {
        scales[ax.scale] = {};
      }
    } else {
      scales.y = yRange ? { range: yRange } : {};
    }

    // ---- Build axes ----
    // First the X axis (always one), then either the multi-axis stack or a
    // single Y axis. uPlot stacks multiple axes on the same side outward in
    // declaration order, so left axes appear closer to the chart in order.
    const axesList: uPlot.Axis[] = [
      {
        scale: 'x',
        stroke: '#5a5b62',
        grid: { stroke: '#1d1e23', width: 1 },
        ticks: { stroke: '#26272d', width: 1, size: 4 },
        font: '10px "Geist Mono", monospace',
        values: (_self, splits) =>
          splits.map((s) => {
            const latest = splits[splits.length - 1] ?? s;
            const delta = s - latest;
            return delta === 0 ? '0s' : `${delta.toFixed(0)}s`;
          }),
      },
    ];

    if (yAxes && yAxes.length > 0) {
      for (const ax of yAxes) {
        // uPlot's `side` numeric: 0=top, 1=right, 2=bottom, 3=left.
        const side = ax.side === 'left' ? 3 : 1;
        axesList.push({
          scale: ax.scale,
          side,
          stroke: ax.color,
          grid: { show: false },
          ticks: { stroke: ax.color + '40', width: 1, size: 4 },
          font: '10px "Geist Mono", monospace',
          // We deliberately don't draw a grid for secondary axes - with three
          // overlaid grids the chart becomes unreadable. The primary axis
          // (first in the array) keeps a faint grid below.
          values: ax.format
            ? (_self, splits) => splits.map((v) => ax.format!(v))
            : undefined,
        });
      }
      // Restore a faint grid on the FIRST y-axis only, for visual reference.
      // (We set grid:show:false above for uniformity; override the first.)
      if (axesList.length >= 2) {
        axesList[1] = {
          ...axesList[1],
          grid: { stroke: '#1d1e23', width: 1 },
        };
      }
    } else {
      axesList.push({
        scale: 'y',
        stroke: '#5a5b62',
        grid: { stroke: '#1d1e23', width: 1 },
        ticks: { stroke: '#26272d', width: 1, size: 4 },
        font: '10px "Geist Mono", monospace',
        label: yLabel,
        labelFont: '10px "Geist Mono", monospace',
        labelSize: yLabel ? 18 : 0,
        labelGap: 4,
      });
    }

    // ---- Build series ----
    const seriesList: uPlot.Series[] = [
      {},
      ...series.map<uPlot.Series>((s) => ({
        label: s.label,
        stroke: s.color,
        width: 1.5,
        points: { show: false },
        // Bind to the named scale if multi-axis mode is active.
        scale: yAxes && yAxes.length > 0 ? s.scale ?? 'y' : 'y',
        value: s.format ? (_self, v) => s.format!(v) : undefined,
      })),
    ];

    const opts: uPlot.Options = {
      width: container.clientWidth,
      height: resolveHeight(),
      pxAlign: 0,
      cursor: { show: false },
      legend: { show: showLegend, live: false },
      scales,
      axes: axesList,
      series: seriesList,
    };

    const emptyData = [[], ...series.map(() => [] as number[])] as unknown as uPlot.AlignedData;
    const plot = new uPlot(opts, emptyData, container);
    plotRef.current = plot;

    const ro = new ResizeObserver(() => {
      plot.setSize({ width: container.clientWidth, height: resolveHeight() });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey]);

  // Push fresh data each animation frame. This is the hot path.
  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    const snap = buffer.snapshot(windowSec);
    // setData() with default resetScales=true so uPlot autoranges as data
    // arrives. Each named scale autoranges independently in multi-axis mode.
    plot.setData(snap as unknown as uPlot.AlignedData);
  }, [tick, buffer, windowSec]);

  return (
    <div
      ref={containerRef}
      className={height === 'auto' ? 'w-full flex-1 min-h-0' : 'w-full'}
      style={height === 'auto' ? undefined : { height }}
    />
  );
}
