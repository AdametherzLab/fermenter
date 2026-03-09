export { FermentType, FermentStage } from './types.js';
export type {
  Reading,
  FermentSession,
  PredictionResult,
  StorageAdapter,
  ComparisonResult,
} from './types.js';

export { createSession, logReading, getReadings } from './ferment.js';

export { validateReading, SensorValidationError, SENSOR_RANGES } from './sensor-validation.js';
export type { SensorRange } from './sensor-validation.js';

export { fitCurve, predictCompletion } from './predictor.js';
export type { RegressionResult } from './predictor.js';

export {
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
  exportSessions,
  compareBatches,
} from './storage.js';

export { createApp } from './server.js';
