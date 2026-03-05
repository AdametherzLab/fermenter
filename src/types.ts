import type { FermentStage, FermentType } from './types.js';

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