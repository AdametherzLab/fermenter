import { describe, it, expect } from 'bun:test';
import { FermentType, FermentStage, createSession, logReading, predictCompletion, saveSession, loadSession, exportSessions, compareBatches } from '../src/index.ts';
import * as path from 'path';
import * as os from 'os';
// REMOVED external import: import { rm } from 'fs/promises';

describe('Session lifecycle', () => {
  it('should create a valid session with defaults', () => {
    const session = createSession({ name: 'Saison', type: FermentType.BEER });
    
    expect(session.id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);
    expect(session.startTime).toBeLessThanOrEqual(Date.now());
    expect(session.readings).toHaveLength(0);
    expect(session.stage).toBe(FermentStage.LAG);
  });

  it('should append readings and progress stage', () => {
    let session = createSession({ name: 'Merlot', type: FermentType.WINE });
    const reading1 = { timestamp: Date.now(), specificGravity: 1.095 };
    const reading2 = { timestamp: Date.now() + 3600000, specificGravity: 1.055 };
    
    session = logReading(session, reading1);
    expect(session.readings).toHaveLength(1);
    expect(session.readings[0].specificGravity).toBe(1.095);

    session = logReading(session, reading2);
    expect(session.readings).toHaveLength(2);
    expect(session.stage).toBe(FermentStage.ACTIVE);
  });
});

describe('Prediction logic', () => {
  it('should require minimum readings for prediction', () => {
    let session = createSession({ name: 'Kombucha', type: FermentType.KOMBUCHA });
    session = logReading(session, { timestamp: Date.now(), specificGravity: 1.020 });
    session = logReading(session, { timestamp: Date.now() + 3600000, specificGravity: 1.015 });
    
    const prediction = predictCompletion(session);
    expect(prediction?.method).toBe('insufficient_data');
  });

  it('should calculate completion estimate with sufficient data', () => {
    let session = createSession({ name: 'IPA', type: FermentType.BEER });
    const baseTime = Date.now();
    
    // Add 5 declining gravity readings
    [1.050, 1.040, 1.030, 1.020, 1.010].forEach((gravity, i) => {
      session = logReading(session, {
        timestamp: baseTime + (i * 3600000),
        specificGravity: gravity
      });
    });

    const prediction = predictCompletion(session);
    expect(prediction?.confidence).toBeGreaterThan(0.7);
    expect(prediction?.hoursRemaining).toBeGreaterThan(0);
  });
});

describe('Persistence', () => {
  const testDir = path.join(os.tmpdir(), 'fermenter-tests');

  it('should round-trip session data through storage', async () => {
    const original = createSession({ name: 'Sauerkraut', type: FermentType.SAUKERKRAUT });
    original.metadata = { vessel: 'ceramic' };
    
    await saveSession(original);
    const loaded = await loadSession(original.id);

    expect(loaded?.id).toBe(original.id);
    expect(loaded?.metadata).toEqual({ vessel: 'ceramic' });
    expect(loaded?.readings).toHaveLength(0);
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });
});

describe('Analysis tools', () => {
  it('should generate valid CSV export', () => {
    const session1 = createSession({ name: 'Batch A', type: FermentType.BEER });
    const session2 = createSession({ name: 'Batch B', type: FermentType.BEER });
    
    const csv = exportSessions([session1, session2], 'csv');
    const [header, ...rows] = csv.split('\n');

    expect(header).toBe('id,name,type,startTime,readingsCount,stage');
    expect(rows).toHaveLength(2);
    expect(csv).toContain(session1.id);
  });

  it('should compare batches of same type', () => {
    const batch1 = logReading(
      createSession({ name: 'Wine A', type: FermentType.WINE }),
      { timestamp: Date.now(), specificGravity: 1.090 }
    );
    const batch2 = logReading(
      createSession({ name: 'Wine B', type: FermentType.WINE }),
      { timestamp: Date.now(), specificGravity: 1.095 }
    );

    const comparison = compareBatches(batch1, batch2);
    expect(comparison.averageFinalGravity).toBeCloseTo(1.0925);
    expect(comparison.sessions).toHaveLength(2);
  });
});