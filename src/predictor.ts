import type { FermentSession, PredictionResult, FermentType } from './types.js';

/** Parameters for linear regression result */
export interface RegressionResult {
  /** Slope of the best fit line (y per hour) */
  readonly slope: number;
  /** Y-intercept of the best fit line */
  readonly intercept: number;
  /** Coefficient of determination (0-1) */
  readonly rSquared: number;
}

/** Target values for each metric by ferment type */
type MetricTargets = Record<FermentType, {
  specificGravity: number | null;
  pH: number | null;
  gasProduction: number | null;
}>;

const TARGETS: MetricTargets = {
  [FermentType.BEER]: {
    specificGravity: 1.010,
    pH: 4.2,
    gasProduction: 0.05
  },
  [FermentType.WINE]: {
    specificGravity: 0.995,
    pH: 3.5,
    gasProduction: 0.05
  },
  [FermentType.KOMBUCHA]: {
    specificGravity: 1.000,
    pH: 3.0,
    gasProduction: null
  },
  [FermentType.KIMCHI]: {
    specificGravity: null,
    pH: 4.0,
    gasProduction: 0.1
  },
  [FermentType.SAUERKRAUT]: {
    specificGravity: null,
    pH: 3.5,
    gasProduction: null
  }
} as const;

/**
 * Performs linear regression on time-series data using least squares
 * @param points - Array of {x: hours, y: value} data points
 * @returns Regression parameters and goodness of fit
 * @throws {RangeError} If fewer than 2 points provided
 * @example
 * const data = [{x: 0, y: 1.045}, {x: 48, y: 1.020}];
 * const { slope } = fitCurve(data);
 */
export function fitCurve(points: ReadonlyArray<{x: number; y: number}>): RegressionResult {
  if (points.length < 2) {
    throw new RangeError('Minimum 2 data points required for regression');
  }

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (const {x, y} of points) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x ** 2;
    sumY2 += y ** 2;
  }

  const n = points.length;
  const numerator = n * sumXY - sumX * sumY;
  const denominator = n * sumX2 - sumX ** 2;
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R-squared
  const yMean = sumY / n;
  let ssTotal = 0, ssResidual = 0;
  for (const {x, y} of points) {
    const predicted = slope * x + intercept;
    ssTotal += (y - yMean) ** 2;
    ssResidual += (y - predicted) ** 2;
  }

  return {
    slope,
    intercept,
    rSquared: ssTotal === 0 ? 1 : 1 - (ssResidual / ssTotal)
  };
}

/**
 * Estimates hours until metric reaches target value based on regression
 * @param params - Regression parameters from fitCurve()
 * @param target - Target metric value to predict
 * @returns Hours until target reached or null if trend won't reach target
 * @example
 * const hours = estimateEndpoint({ slope: -0.002, intercept: 1.05 }, 1.010);
 */
export function estimateEndpoint(
  params: RegressionResult,
  target: number
): number | null {
  if (params.slope === 0) return params.intercept === target ? 0 : null;

  const hours = (target - params.intercept) / params.slope;
  const isPlausible = (target < params.intercept && params.slope < 0) ||
    (target > params.intercept && params.slope > 0);

  return hours >= 0 && isPlausible ? hours : null;
}

/**
 * Predicts fermentation completion date using best available metric trend
 * @param session - Fermentation session with historical readings
 * @returns Prediction with confidence score or null if insufficient data
 * @example
 * const prediction = predictCompletion(kombuchaSession);
 */
export function predictCompletion(session: FermentSession): PredictionResult | null {
  const metrics: ('specificGravity' | 'pH' | 'gasProduction')[] = [
    'specificGravity', 'pH', 'gasProduction'
  ];

  for (const metric of metrics) {
    const validReadings = session.readings
      .filter(r => r[metric] !== undefined)
      .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

    if (validReadings.length < 3) continue;

    const target = TARGETS[session.type][metric];
    if (target === null) continue;

    const startTime = validReadings[0].recordedAt.getTime();
    const points = validReadings.map(r => ({
      x: (r.recordedAt.getTime() - startTime) / 3_600_000,
      y: r[metric]!
    }));

    try {
      const regression = fitCurve(points);
      const hours = estimateEndpoint(regression, target);
      if (hours === null) continue;

      const confidence = Math.min(
        regression.rSquared * Math.log1p(points.length) / 3,
        1
      );

      return {
        estimatedCompletionDate: new Date(startTime + hours * 3_600_000),
        confidence: Math.round(confidence * 100) / 100
      };
    } catch {
      continue; // Invalid regression, try next metric
    }
  }

  return null;
}