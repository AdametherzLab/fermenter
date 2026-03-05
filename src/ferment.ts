import * as crypto from 'crypto';
import type { FermentSession, FermentStage, FermentType, Reading, PredictionResult } from './types.js';

/** Minimum number of readings required for stage transition analysis */
const MIN_READINGS_FOR_ANALYSIS = 6;
/** Threshold for considering stabilization (absolute difference between min/max in window) */
const STABILIZATION_THRESHOLD = 0.001;
/** Confidence percentage for dummy prediction */
const DUMMY_CONFIDENCE = 0.7;

/**
 * Create a new fermentation session with generated ID and initial stage.
 * @param params - Configuration for the new session
 * @returns New FermentSession object
 * @throws {RangeError} If startDate is in the future
 * @example
 * const session = createSession({ name: 'Saison', type: FermentType.BEER });
 */
export function createSession(params: {
  readonly name: string;
  readonly type: FermentType;
  readonly startDate?: Date;
}): FermentSession {
  const startDate = params.startDate ?? new Date();
  if (startDate > new Date()) {
    throw new RangeError('Session start date cannot be in the future');
  }

  return {
    id: crypto.randomUUID(),
    name: params.name,
    type: params.type,
    startDate,
    currentStage: FermentStage.ACTIVE,
    readings: [],
  };
}

/**
 * Append a new reading to the session and recalculate stage/prediction.
 * @param session - Session to update
 * @param reading - New measurement data
 * @returns New FermentSession with updated readings and stage
 * @throws {Error} If reading timestamp is out of order
 * @example
 * const newSession = logReading(session, {
 *   recordedAt: new Date(),
 *   specificGravity: 1.045
 * });
 */
export function logReading(session: FermentSession, reading: Reading): FermentSession {
  validateReadingChronology(session, reading);
  const newReadings = [...session.readings, reading];
  
  const updatedSession: FermentSession = {
    ...session,
    readings: newReadings,
    currentStage: calculateNewStage(session, newReadings),
    prediction: calculatePrediction({ ...session, readings: newReadings }),
  };

  return updatedSession;
}

/**
 * Retrieve filtered readings from a session.
 * @param session - Session to query
 * @param filters - Optional constraints for returned readings
 * @returns Filtered readonly array of readings
 * @example
 * const gravityReadings = getReadings(session, { minGravity: 1.010 });
 */
export function getReadings(
  session: FermentSession,
  filters?: {
    readonly minPH?: number;
    readonly maxPH?: number;
    readonly minTemperature?: number;
    readonly maxTemperature?: number;
    readonly minGravity?: number;
    readonly maxGravity?: number;
    readonly minGas?: number;
    readonly maxGas?: number;
    readonly startDate?: Date;
    readonly endDate?: Date;
  }
): readonly Reading[] {
  return session.readings.filter(reading => {
    if (filters?.minPH !== undefined && (reading.pH ?? Infinity) < filters.minPH) return false;
    if (filters?.maxPH !== undefined && (reading.pH ?? -Infinity) > filters.maxPH) return false;
    if (filters?.minTemperature !== undefined && (reading.temperature ?? Infinity) < filters.minTemperature) return false;
    if (filters?.maxTemperature !== undefined && (reading.temperature ?? -Infinity) > filters.maxTemperature) return false;
    if (filters?.minGravity !== undefined && (reading.specificGravity ?? Infinity) < filters.minGravity) return false;
    if (filters?.maxGravity !== undefined && (reading.specificGravity ?? -Infinity) > filters.maxGravity) return false;
    if (filters?.minGas !== undefined && (reading.gasProduction ?? Infinity) < filters.minGas) return false;
    if (filters?.maxGas !== undefined && (reading.gasProduction ?? -Infinity) > filters.maxGas) return false;
    if (filters?.startDate !== undefined && reading.recordedAt < filters.startDate) return false;
    if (filters?.endDate !== undefined && reading.recordedAt > filters.endDate) return false;
    return true;
  });
}

function validateReadingChronology(session: FermentSession, newReading: Reading): void {
  const lastReading = session.readings.at(-1);
  if (lastReading && newReading.recordedAt <= lastReading.recordedAt) {
    throw new Error('New reading must be chronologically after existing readings');
  }
}

function calculateNewStage(session: FermentSession, newReadings: readonly Reading[]): FermentStage {
  if (newReadings.length < MIN_READINGS_FOR_ANALYSIS) {
    return session.currentStage;
  }

  const metric = selectPrimaryMetric(session.type, newReadings);
  const metricReadings = extractMetricData(metric, newReadings);

  switch (session.currentStage) {
    case FermentStage.ACTIVE:
      return shouldTransitionToSlowing(metricReadings) ? FermentStage.SLOWING : FermentStage.ACTIVE;
    case FermentStage.SLOWING:
      return hasStabilized(metricReadings) ? FermentStage.COMPLETE : FermentStage.SLOWING;
    default:
      return session.currentStage;
  }
}

function selectPrimaryMetric(type: FermentType, readings: readonly Reading[]): keyof Reading {
  const typePriorities: Record<FermentType, (keyof Reading)[]> = {
    [FermentType.BEER]: ['specificGravity', 'temperature', 'gasProduction'],
    [FermentType.WINE]: ['specificGravity', 'temperature', 'pH'],
    [FermentType.KOMBUCHA]: ['pH', 'temperature', 'gasProduction'],
    [FermentType.KIMCHI]: ['pH', 'temperature'],
    [FermentType.SAUERKRAUT]: ['pH', 'temperature'],
  };

  for (const metric of typePriorities[type]) {
    if (readings.some(r => r[metric] !== undefined)) return metric;
  }
  return 'temperature'; // Fallback metric
}

function extractMetricData(
  metric: keyof Reading,
  readings: readonly Reading[]
): Array<{ value: number; time: Date }> {
  return readings
    .filter(r => r[metric] !== undefined)
    .map(r => ({ value: r[metric] as number, time: r.recordedAt }));
}

function shouldTransitionToSlowing(metricData: Array<{ value: number; time: Date }>): boolean {
  if (metricData.length < MIN_READINGS_FOR_ANALYSIS) return false;

  const recentWindow = metricData.slice(-3);
  const previousWindow = metricData.slice(-6, -3);
  
  const recentRate = calculateRatePerHour(recentWindow);
  const previousRate = calculateRatePerHour(previousWindow);

  return recentRate < previousRate * 0.5;
}

function hasStabilized(metricData: Array<{ value: number; time: Date }>): boolean {
  if (metricData.length < 3) return false;
  const windowValues = metricData.slice(-3).map(d => d.value);
  const max = Math.max(...windowValues);
  const min = Math.min(...windowValues);
  return (max - min) <= STABILIZATION_THRESHOLD;
}

function calculateRatePerHour(dataPoints: Array<{ value: number; time: Date }>): number {
  if (dataPoints.length < 2) return 0;
  
  const first = dataPoints[0];
  const last = dataPoints[dataPoints.length - 1];
  const timeDiffHours = (last.time.getTime() - first.time.getTime()) / 3_600_000;
  
  return (last.value - first.value) / timeDiffHours;
}

function calculatePrediction(session: FermentSession): PredictionResult | undefined {
  if (session.readings.length < 2) return undefined;
  
  const lastReading = session.readings[session.readings.length - 1];
  const avgRate = calculateRatePerHour(extractMetricData(
    selectPrimaryMetric(session.type, session.readings),
    session.readings
  ));

  const daysRemaining = avgRate !== 0 ? Math.abs(1 / avgRate) : 14; // Dummy calculation
  const completionDate = new Date(lastReading.recordedAt);
  completionDate.setDate(completionDate.getDate() + daysRemaining);

  return {
    estimatedCompletionDate: completionDate,
    confidence: DUMMY_CONFIDENCE,
  };
}