import { describe, it, expect } from 'bun:test';
import { validateReading, SensorValidationError, SENSOR_RANGES } from '../src/sensor-validation.js';
import type { Reading } from '../src/types.js';

describe('validateReading', () => {
  it('should accept a valid reading with all metrics', () => {
    const reading: Reading = {
      recordedAt: new Date(),
      pH: 4.5,
      temperature: 20,
      specificGravity: 1.045,
      gasProduction: 0.5,
    };
    expect(() => validateReading(reading)).not.toThrow();
  });

  it('should accept a reading with only one metric', () => {
    const reading: Reading = {
      recordedAt: new Date(),
      specificGravity: 1.010,
    };
    expect(() => validateReading(reading)).not.toThrow();
  });

  it('should reject a reading with no measurement fields', () => {
    const reading: Reading = { recordedAt: new Date() };
    expect(() => validateReading(reading)).toThrow(SensorValidationError);
    expect(() => validateReading(reading)).toThrow(/empty/);
  });

  it('should reject pH out of range (0–14)', () => {
    const tooHigh: Reading = { recordedAt: new Date(), pH: 15 };
    expect(() => validateReading(tooHigh)).toThrow(SensorValidationError);
    expect(() => validateReading(tooHigh)).toThrow(/pH/);

    const tooLow: Reading = { recordedAt: new Date(), pH: -1 };
    expect(() => validateReading(tooLow)).toThrow(SensorValidationError);
  });

  it('should reject temperature out of range (-20–100°C)', () => {
    const tooHot: Reading = { recordedAt: new Date(), temperature: 150 };
    expect(() => validateReading(tooHot)).toThrow(SensorValidationError);
    expect(() => validateReading(tooHot)).toThrow(/temperature/);

    const tooCold: Reading = { recordedAt: new Date(), temperature: -30 };
    expect(() => validateReading(tooCold)).toThrow(SensorValidationError);
  });

  it('should reject specificGravity out of range (0.800–1.200)', () => {
    const tooHigh: Reading = { recordedAt: new Date(), specificGravity: 1.5 };
    expect(() => validateReading(tooHigh)).toThrow(SensorValidationError);

    const tooLow: Reading = { recordedAt: new Date(), specificGravity: 0.5 };
    expect(() => validateReading(tooLow)).toThrow(SensorValidationError);
  });

  it('should reject negative gasProduction', () => {
    const negative: Reading = { recordedAt: new Date(), gasProduction: -5 };
    expect(() => validateReading(negative)).toThrow(SensorValidationError);
  });

  it('should reject NaN and Infinity values', () => {
    const nanReading: Reading = { recordedAt: new Date(), pH: NaN };
    expect(() => validateReading(nanReading)).toThrow(SensorValidationError);

    const infReading: Reading = { recordedAt: new Date(), temperature: Infinity };
    expect(() => validateReading(infReading)).toThrow(SensorValidationError);
  });

  it('should reject invalid recordedAt', () => {
    const badDate: Reading = { recordedAt: new Date('invalid'), pH: 4.0 };
    expect(() => validateReading(badDate)).toThrow(SensorValidationError);
    expect(() => validateReading(badDate)).toThrow(/recordedAt/);
  });

  it('should accept boundary values', () => {
    const atMin: Reading = {
      recordedAt: new Date(),
      pH: 0,
      temperature: -20,
      specificGravity: 0.800,
      gasProduction: 0,
    };
    expect(() => validateReading(atMin)).not.toThrow();

    const atMax: Reading = {
      recordedAt: new Date(),
      pH: 14,
      temperature: 100,
      specificGravity: 1.200,
      gasProduction: 1000,
    };
    expect(() => validateReading(atMax)).not.toThrow();
  });

  it('should support custom ranges', () => {
    const customRanges = {
      ...SENSOR_RANGES,
      pH: { min: 3, max: 5, unit: 'pH' },
    };
    const reading: Reading = { recordedAt: new Date(), pH: 2.5 };
    expect(() => validateReading(reading, customRanges)).toThrow(SensorValidationError);
    expect(() => validateReading(reading)).not.toThrow(); // valid with default ranges
  });

  it('should expose error properties', () => {
    const reading: Reading = { recordedAt: new Date(), pH: 15 };
    try {
      validateReading(reading);
      expect(true).toBe(false); // should not reach
    } catch (e) {
      expect(e).toBeInstanceOf(SensorValidationError);
      const err = e as SensorValidationError;
      expect(err.metric).toBe('pH');
      expect(err.value).toBe(15);
      expect(err.validRange).toEqual({ min: 0, max: 14, unit: 'pH' });
      expect(err.name).toBe('SensorValidationError');
    }
  });
});
