/**
 * Sensor reading validation with configurable ranges and descriptive errors.
 * @module sensor-validation
 */

import type { Reading } from './types.js';

/** Valid range definition for a sensor metric */
export interface SensorRange {
  readonly min: number;
  readonly max: number;
  readonly unit: string;
}

/** Error thrown when sensor reading validation fails */
export class SensorValidationError extends Error {
  /** The metric that failed validation */
  readonly metric: string;
  /** The invalid value that was provided */
  readonly value: unknown;
  /** The valid range for this metric, if applicable */
  readonly validRange?: SensorRange;

  constructor(metric: string, value: unknown, validRange?: SensorRange) {
    const rangeStr = validRange
      ? ` (valid range: ${validRange.min}–${validRange.max} ${validRange.unit})`
      : '';
    super(`Invalid ${metric}: ${value}${rangeStr}`);
    this.name = 'SensorValidationError';
    this.metric = metric;
    this.value = value;
    this.validRange = validRange;
  }
}

/** Default valid ranges for fermentation sensor metrics */
export const SENSOR_RANGES: Readonly<Record<string, SensorRange>> = {
  pH: { min: 0, max: 14, unit: 'pH' },
  temperature: { min: -20, max: 100, unit: '°C' },
  specificGravity: { min: 0.800, max: 1.200, unit: 'SG' },
  gasProduction: { min: 0, max: 1000, unit: 'L/hr' },
} as const;

/**
 * Validates a sensor reading for correct types and plausible ranges.
 * @param reading - The Reading object to validate
 * @param ranges - Optional custom ranges (defaults to SENSOR_RANGES)
 * @throws {SensorValidationError} If any metric is invalid
 * @example
 * validateReading({ recordedAt: new Date(), pH: 15 });
 * // throws SensorValidationError: Invalid pH: 15 (valid range: 0–14 pH)
 */
export function validateReading(
  reading: Reading,
  ranges: Readonly<Record<string, SensorRange>> = SENSOR_RANGES
): void {
  // Validate timestamp
  if (!(reading.recordedAt instanceof Date) || isNaN(reading.recordedAt.getTime())) {
    throw new SensorValidationError('recordedAt', reading.recordedAt);
  }

  // Must have at least one measurement
  const metrics: (keyof Reading)[] = ['pH', 'temperature', 'specificGravity', 'gasProduction'];
  const hasAtLeastOne = metrics.some(m => reading[m] !== undefined);
  if (!hasAtLeastOne) {
    throw new SensorValidationError(
      'reading',
      'empty',
      undefined
    );
  }

  // Validate each provided metric
  for (const metric of metrics) {
    const value = reading[metric];
    if (value === undefined) continue;

    if (typeof value !== 'number' || !isFinite(value)) {
      throw new SensorValidationError(metric, value, ranges[metric]);
    }

    const range = ranges[metric];
    if (range && (value < range.min || value > range.max)) {
      throw new SensorValidationError(metric, value, range);
    }
  }
}
