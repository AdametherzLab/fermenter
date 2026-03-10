/**
 * Type of fermentation being tracked.
 */
export enum FermentType {
  BEER = 'BEER',
  WINE = 'WINE',
  KOMBUCHA = 'KOMBUCHA',
  KIMCHI = 'KIMCHI',
  SAUERKRAUT = 'SAUERKRAUT',
}

/**
 * Current phase of the fermentation process.
 */
export enum FermentStage {
  LAG = 'LAG',
  ACTIVE = 'ACTIVE',
  SLOWING = 'SLOWING',
  COMPLETE = 'COMPLETE',
}

/**
 * Measurement data point collected during fermentation monitoring.
 * Must contain at least one measurement field besides timestamp.
 */
export interface Reading {
  readonly recordedAt: Date;
  readonly pH?: number;
  readonly temperature?: number;
  readonly specificGravity?: number;
  readonly gasProduction?: number;
}

/**
 * Complete fermentation tracking session with historical data.
 */
export interface FermentSession {
  readonly id: string;
  readonly name: string;
  readonly type: FermentType;
  readonly startDate: Date;
  readonly currentStage: FermentStage;
  readonly readings: readonly Reading[];
  readonly prediction?: PredictionResult;
}

/**
 * Modeled prediction of fermentation completion timeframe.
 */
export interface PredictionResult {
  readonly estimatedCompletionDate: Date;
  readonly confidence: number;
}

/**
 * Storage system contract for fermentation session persistence.
 */
export interface StorageAdapter {
  saveSession(session: FermentSession): Promise<void>;
  loadSession(id: string): Promise<FermentSession | undefined>;
  listSessions(): Promise<FermentSession[]>;
  deleteSession(id: string): Promise<boolean>;
}

/**
 * Comparative analysis between two fermentation batches.
 */
export interface ComparisonResult {
  readonly sessionId1: string;
  readonly sessionId2: string;
  readonly durationDifferenceHours: number;
  readonly maxTemperatureDelta: number;
  readonly averageGravityDifference: number;
  readonly stageCorrelation: number;
}

/** Dataset configuration for Chart.js */
export interface ChartDataset {
  /** Display label for the metric */
  readonly label: string;
  /** Data points (null for missing values) */
  readonly data: (number | null)[];
  /** RGB color string for the line */
  readonly borderColor: string;
  /** RGBA color string for the fill */
  readonly backgroundColor: string;
  /** Y-axis identifier for multi-axis charts */
  readonly yAxisID: string;
  /** Bezier curve tension (0 = straight lines) */
  readonly tension: number;
  /** Point radius */
  readonly pointRadius: number;
}

/** Complete chart data structure for Chart.js */
export interface ChartData {
  /** ISO timestamp labels */
  readonly labels: string[];
  /** Dataset configurations */
  readonly datasets: ChartDataset[];
}

/** Options for chart data preparation */
export interface ChartOptions {
  /** Metrics to include (defaults to all available) */
  readonly metrics?: readonly ('specificGravity' | 'pH' | 'temperature' | 'gasProduction')[];
  /** Start date filter (inclusive) */
  readonly startDate?: Date;
  /** End date filter (inclusive) */
  readonly endDate?: Date;
}
