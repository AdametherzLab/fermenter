import { describe, it, expect } from 'bun:test';
import { prepareChartData, calculateMetricStats, getLatestChartPoint } from '../src/charting.js';
import { FermentType, FermentStage } from '../src/types.js';
import type { FermentSession, Reading } from '../src/types.js';

/** Helper to create a mock session for testing */
function createMockSession(readings: Reading[] = [], overrides: Partial<FermentSession> = {}): FermentSession {
  return {
    id: 'test-session-123',
    name: 'Test Batch',
    type: FermentType.BEER,
    startDate: new Date('2024-01-15'),
    currentStage: FermentStage.ACTIVE,
    readings,
    ...overrides
  };
}

describe('prepareChartData', () => {
  it('should transform readings into Chart.js format with multiple metrics', () => {
    const readings: Reading[] = [
      { recordedAt: new Date('2024-01-15T10:00:00Z'), specificGravity: 1.050, pH: 5.2, temperature: 20.0 },
      { recordedAt: new Date('2024-01-15T11:00:00Z'), specificGravity: 1.048, pH: 4.9, temperature: 21.5 },
      { recordedAt: new Date('2024-01-15T12:00:00Z'), specificGravity: 1.045, pH: 4.6, temperature: 22.0 }
    ];
    
    const session = createMockSession(readings);
    const chartData = prepareChartData(session);
    
    expect(chartData.labels).toHaveLength(3);
    expect(chartData.labels[0]).toBe('2024-01-15T10:00:00.000Z');
    expect(chartData.datasets).toHaveLength(3);
    
    // Verify specific gravity dataset
    const sgDataset = chartData.datasets.find(d => d.label === 'Specific Gravity');
    expect(sgDataset).toBeDefined();
    expect(sgDataset?.data).toEqual([1.050, 1.048, 1.045]);
    expect(sgDataset?.yAxisID).toBe('y');
    expect(sgDataset?.borderColor).toBe('rgb(75, 192, 192)');
    
    // Verify pH dataset
    const phDataset = chartData.datasets.find(d => d.label === 'pH');
    expect(phDataset).toBeDefined();
    expect(phDataset?.data).toEqual([5.2, 4.9, 4.6]);
    expect(phDataset?.yAxisID).toBe('y1');
  });

  it('should filter readings by date range', () => {
    const readings: Reading[] = [
      { recordedAt: new Date('2024-01-15T08:00:00Z'), specificGravity: 1.060 },
      { recordedAt: new Date('2024-01-16T08:00:00Z'), specificGravity: 1.050 },
      { recordedAt: new Date('2024-01-17T08:00:00Z'), specificGravity: 1.040 }
    ];
    
    const session = createMockSession(readings);
    const chartData = prepareChartData(session, {
      startDate: new Date('2024-01-16T00:00:00Z'),
      endDate: new Date('2024-01-16T23:59:59Z')
    });
    
    expect(chartData.labels).toHaveLength(1);
    expect(chartData.labels[0]).toBe('2024-01-16T08:00:00.000Z');
    expect(chartData.datasets[0].data).toEqual([1.050]);
  });

  it('should handle empty readings gracefully', () => {
    const session = createMockSession([]);
    const chartData = prepareChartData(session);
    
    expect(chartData.labels).toHaveLength(0);
    expect(chartData.datasets).toHaveLength(0);
  });

  it('should respect metric selection options', () => {
    const readings: Reading[] = [
      { recordedAt: new Date('2024-01-15T10:00:00Z'), specificGravity: 1.050, pH: 5.2, temperature: 20.0 }
    ];
    
    const session = createMockSession(readings);
    const chartData = prepareChartData(session, { metrics: ['specificGravity'] });
    
    expect(chartData.datasets).toHaveLength(1);
    expect(chartData.datasets[0].label).toBe('Specific Gravity');
  });

  it('should handle missing metric values as null', () => {
    const readings: Reading[] = [
      { recordedAt: new Date('2024-01-15T10:00:00Z'), specificGravity: 1.050 },
      { recordedAt: new Date('2024-01-15T11:00:00Z'), specificGravity: 1.045, pH: 4.8 },
      { recordedAt: new Date('2024-01-15T12:00:00Z'), specificGravity: 1.040 }
    ];
    
    const session = createMockSession(readings);
    const chartData = prepareChartData(session, { metrics: ['specificGravity', 'pH'] });
    
    const phDataset = chartData.datasets.find(d => d.label === 'pH');
    expect(phDataset?.data).toEqual([null, 4.8, null]);
  });

  it('should exclude metrics with no data points', () => {
    const readings: Reading[] = [
      { recordedAt: new Date('2024-01-15T10:00:00Z'), specificGravity: 1.050 }
    ];
    
    const session = createMockSession(readings);
    const chartData = prepareChartData(session);
    
    // Should only include specific gravity, not pH or temperature
    expect(chartData.datasets).toHaveLength(1);
    expect(chartData.datasets[0].label).toBe('Specific Gravity');
  });
});

describe('calculateMetricStats', () => {
  it('should calculate correct statistics for a metric', () => {
    const readings: Reading[] = [
      { recordedAt: new Date('2024-01-15T10:00:00Z'), specificGravity: 1.050 },
      { recordedAt: new Date('2024-01-15T11:00:00Z'), specificGravity: 1.040 },
      { recordedAt: new Date('2024-01-15T12:00:00Z'), specificGravity: 1.030 }
    ];
    
    const session = createMockSession(readings);
    const stats = calculateMetricStats(session, 'specificGravity');
    
    expect(stats).not.toBeNull();
    expect(stats?.min).toBe(1.030);
    expect(stats?.max).toBe(1.050);
    expect(stats?.avg).toBeCloseTo(1.040, 3);
    expect(stats?.count).toBe(3);
  });

  it('should return null for metrics with no data', () => {
    const readings: Reading[] = [
      { recordedAt: new Date('2024-01-15T10:00:00Z'), specificGravity: 1.050 }
    ];
    
    const session = createMockSession(readings);
    const stats = calculateMetricStats(session, 'pH');
    
    expect(stats).toBeNull();
  });

  it('should handle single reading correctly', () => {
    const readings: Reading[] = [
      { recordedAt: new Date('2024-01-15T10:00:00Z'), temperature: 20.0 }
    ];
    
    const session = createMockSession(readings);
    const stats = calculateMetricStats(session, 'temperature');
    
    expect(stats?.min).toBe(20.0);
    expect(stats?.max).toBe(20.0);
    expect(stats?.avg).toBe(20.0);
    expect(stats?.count).toBe(1);
  });
});

describe('getLatestChartPoint', () => {
  it('should return the latest reading data', () => {
    const readings: Reading[] = [
      { recordedAt: new Date('2024-01-15T10:00:00Z'), specificGravity: 1.050, pH: 5.2 },
      { recordedAt: new Date('2024-01-15T11:00:00Z'), specificGravity: 1.045, temperature: 22.0 }
    ];
    
    const session = createMockSession(readings);
    const latest = getLatestChartPoint(session);
    
    expect(latest).not.toBeNull();
    expect(latest?.timestamp).toBe('2024-01-15T11:00:00.000Z');
    expect(latest?.metrics.specificGravity).toBe(1.045);
    expect(latest?.metrics.temperature).toBe(22.0);
    expect(latest?.metrics.pH).toBeUndefined();
  });

  it('should return null for empty sessions', () => {
    const session = createMockSession([]);
    const latest = getLatestChartPoint(session);
    
    expect(latest).toBeNull();
  });

  it('should handle readings with all metrics', () => {
    const readings: Reading[] = [
      { 
        recordedAt: new Date('2024-01-15T12:00:00Z'), 
        specificGravity: 1.040, 
        pH: 4.5, 
        temperature: 21.0, 
        gasProduction: 0.5 
      }
    ];
    
    const session = createMockSession(readings);
    const latest = getLatestChartPoint(session);
    
    expect(latest?.metrics).toEqual({
      specificGravity: 1.040,
      pH: 4.5,
      temperature: 21.0,
      gasProduction: 0.5
    });
  });
});