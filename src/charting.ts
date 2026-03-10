/**
 * Real-time charting utilities for fermentation data visualization.
 * Transforms session readings into Chart.js compatible formats.
 * @module charting
 */

import type { FermentSession, Reading, ChartData, ChartDataset, ChartOptions } from './types.js';

/** Metric visualization configuration */
const METRIC_CONFIG: Record<string, { label: string; color: string; axis: string; unit: string }> = {
  specificGravity: {
    label: 'Specific Gravity',
    color: 'rgb(75, 192, 192)',
    axis: 'y',
    unit: 'SG'
  },
  pH: {
    label: 'pH',
    color: 'rgb(255, 99, 132)',
    axis: 'y1',
    unit: 'pH'
  },
  temperature: {
    label: 'Temperature (°C)',
    color: 'rgb(54, 162, 235)',
    axis: 'y2',
    unit: '°C'
  },
  gasProduction: {
    label: 'Gas Production (L/hr)',
    color: 'rgb(255, 206, 86)',
    axis: 'y3',
    unit: 'L/hr'
  }
};

/**
 * Transforms fermentation session readings into Chart.js compatible data format.
 * Supports multi-metric visualization with separate Y-axes for different scales.
 * 
 * @param session - The fermentation session containing readings
 * @param options - Configuration for metric selection and date filtering
 * @returns ChartData object ready for Chart.js consumption
 * @example
 * const chartData = prepareChartData(session, { 
 *   metrics: ['specificGravity', 'temperature'],
 *   startDate: new Date('2024-01-01')
 * });
 */
export function prepareChartData(
  session: FermentSession,
  options: ChartOptions = {}
): ChartData {
  const { metrics, startDate, endDate } = options;

  // Filter readings by date range if specified
  const filteredReadings = session.readings.filter((r: Reading) => {
    if (startDate && r.recordedAt < startDate) return false;
    if (endDate && r.recordedAt > endDate) return false;
    return true;
  });

  // Generate ISO timestamp labels
  const labels = filteredReadings.map((r: Reading) => r.recordedAt.toISOString());

  // Determine which metrics to render
  const availableMetrics = (metrics ?? Object.keys(METRIC_CONFIG)) as Array<keyof Reading>;

  // Build datasets for each requested metric that has data
  const datasets: ChartDataset[] = availableMetrics
    .filter((metric): metric is keyof Reading & string => {
      // Only include metrics that exist in at least one reading
      return filteredReadings.some((r: Reading) => r[metric] !== undefined);
    })
    .map((metric) => {
      const config = METRIC_CONFIG[metric];
      return {
        label: config.label,
        data: filteredReadings.map((r: Reading) => {
          const val = r[metric];
          return typeof val === 'number' && !isNaN(val) ? val : null;
        }),
        borderColor: config.color,
        backgroundColor: config.color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
        yAxisID: config.axis,
        tension: 0.4,
        pointRadius: 4
      };
    });

  return { labels, datasets };
}

/**
 * Calculates statistics for a specific metric across the session timeline.
 * Useful for displaying min/max/average in chart overlays.
 * 
 * @param session - Fermentation session
 * @param metric - Metric key to analyze
 * @returns Statistical summary or null if no data
 */
export function calculateMetricStats(
  session: FermentSession,
  metric: 'specificGravity' | 'pH' | 'temperature' | 'gasProduction'
): { min: number; max: number; avg: number; count: number } | null {
  const values = session.readings
    .map((r: Reading) => r[metric])
    .filter((v): v is number => typeof v === 'number' && !isNaN(v));

  if (values.length === 0) return null;

  const sum = values.reduce((a, b) => a + b, 0);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: sum / values.length,
    count: values.length
  };
}

/**
 * Generates a real-time update payload for WebSocket/SSE streaming.
 * Contains only the latest reading data for efficient updates.
 * 
 * @param session - Current session state
 * @returns Latest data point or null if no readings exist
 */
export function getLatestChartPoint(
  session: FermentSession
): { timestamp: string; metrics: Record<string, number> } | null {
  const latest = session.readings[session.readings.length - 1];
  if (!latest) return null;

  const metrics: Record<string, number> = {};
  if (latest.specificGravity !== undefined) metrics.specificGravity = latest.specificGravity;
  if (latest.pH !== undefined) metrics.pH = latest.pH;
  if (latest.temperature !== undefined) metrics.temperature = latest.temperature;
  if (latest.gasProduction !== undefined) metrics.gasProduction = latest.gasProduction;

  return {
    timestamp: latest.recordedAt.toISOString(),
    metrics
  };
}
