import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';
import type { FermentSession, FermentType, ComparisonResult, Reading } from './types.js';

const DEFAULT_DATA_DIR = path.join(os.homedir(), '.fermenter');

function validateFermentSession(session: FermentSession): void {
  if (!session.id || typeof session.id !== 'string') {
    throw new Error('Invalid session: missing or invalid id');
  }
  if (!session.name || typeof session.name !== 'string') {
    throw new Error('Invalid session: missing or invalid name');
  }
  if (!Object.values(FermentType).includes(session.type)) {
    throw new Error(`Invalid session type: ${session.type}`);
  }
  if (!(session.startDate instanceof Date)) {
    throw new Error('Invalid startDate: must be a Date object');
  }
  if (!Object.values(FermentStage).includes(session.currentStage)) {
    throw new Error(`Invalid currentStage: ${session.currentStage}`);
  }
  if (!Array.isArray(session.readings)) {
    throw new Error('Readings must be an array');
  }
  session.readings.forEach((reading, index) => {
    if (!(reading.recordedAt instanceof Date)) {
      throw new Error(`Reading ${index} has invalid recordedAt`);
    }
  });
}

function isIsoDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value);
}

function reviveDates(key: string, value: unknown): unknown {
  if (typeof value === 'string' && isIsoDateString(value)) {
    return new Date(value);
  }
  return value;
}

function deserializeSession(json: string): FermentSession {
  const parsed = JSON.parse(json, reviveDates);
  validateFermentSession(parsed);
  return parsed;
}

function isFsError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

/**
 * Saves a fermentation session to the default data directory.
 * @param session - The FermentSession to serialize and save
 * @throws {Error} If the session is invalid or saving fails
 * @example
 * await saveSession(mySession);
 */
export async function saveSession(session: FermentSession): Promise<void> {
  validateFermentSession(session);
  await fs.mkdir(DEFAULT_DATA_DIR, { recursive: true });
  const filePath = path.join(DEFAULT_DATA_DIR, `${session.id}.json`);
  const json = JSON.stringify(session, null, 2);
  await fs.writeFile(filePath, json, 'utf8');
}

/**
 * Loads a fermentation session by ID from the default data directory.
 * @param id - The session ID to load
 * @returns The loaded FermentSession, or undefined if not found
 * @throws {Error} If the session data is invalid
 * @example
 * const session = await loadSession('abc123');
 */
export async function loadSession(id: string): Promise<FermentSession | undefined> {
  const filePath = path.join(DEFAULT_DATA_DIR, `${id}.json`);
  try {
    const json = await fs.readFile(filePath, 'utf8');
    return deserializeSession(json);
  } catch (error) {
    if (isFsError(error, 'ENOENT')) return undefined;
    throw new Error(`Failed to load session: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Exports multiple fermentation sessions to JSON or CSV format.
 * @param sessions - Array of sessions to export
 * @param format - Output format ('json' or 'csv')
 * @returns Formatted string in the specified format
 * @example
 * const csv = exportSessions(allSessions, 'csv');
 */
export function exportSessions(sessions: FermentSession[], format: 'json' | 'csv'): string {
  if (format === 'json') {
    return JSON.stringify(sessions, null, 2);
  }

  const csvRows = sessions.map(session => [
    session.id,
    JSON.stringify(session.name),
    session.type,
    session.startDate.toISOString(),
    session.currentStage,
    session.readings.length,
    session.prediction?.estimatedCompletionDate.toISOString() ?? '',
    session.prediction?.confidence ?? ''
  ]);

  const header = ['ID', 'Name', 'Type', 'StartDate', 'Stage', 'ReadingCount', 'PredictionDate', 'Confidence'];
  return [header, ...csvRows]
    .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function calculateTimeSeriesAverage(values: (number | undefined)[]): number {
  const valid = values.filter((v): v is number => v !== undefined);
  return valid.length ? valid.reduce((sum, v) => sum + v, 0) / valid.length : 0;
}

/**
 * Compares two fermentation sessions of the same type.
 * @param session1 - First session to compare
 * @param session2 - Second session to compare
 * @returns ComparisonResult with computed metrics
 * @throws {Error} If sessions are of different types or have no readings
 * @example
 * const result = compareBatches(batch1, batch2);
 */
export function compareBatches(session1: FermentSession, session2: FermentSession): ComparisonResult {
  if (session1.type !== session2.type) {
    throw new Error('Cannot compare sessions of different types');
  }
  if (session1.readings.length === 0 || session2.readings.length === 0) {
    throw new Error('Sessions must contain readings for comparison');
  }

  const latest1 = session1.readings[session1.readings.length - 1].recordedAt;
  const latest2 = session2.readings[session2.readings.length - 1].recordedAt;
  const durationHours = Math.abs(latest1.getTime() - latest2.getTime()) / 3_600_000;

  const temps1 = session1.readings.map(r => r.temperature).filter((t): t is number => t !== undefined);
  const temps2 = session2.readings.map(r => r.temperature).filter((t): t is number => t !== undefined);
  const maxTempDelta = Math.max(...temps1, ...temps2) - Math.min(...temps1, ...temps2);

  const gravity1 = calculateTimeSeriesAverage(session1.readings.map(r => r.specificGravity));
  const gravity2 = calculateTimeSeriesAverage(session2.readings.map(r => r.specificGravity));

  const stageMap = { [FermentStage.ACTIVE]: 1, [FermentStage.SLOWING]: 2, [FermentStage.COMPLETE]: 3 };
  const stageCorrelation = session1.currentStage === session2.currentStage ? 1 : 0.5;

  return {
    sessionId1: session1.id,
    sessionId2: session2.id,
    durationDifferenceHours: durationHours,
    maxTemperatureDelta: maxTempDelta,
    averageGravityDifference: Math.abs(gravity1 - gravity2),
    stageCorrelation,
  };
}