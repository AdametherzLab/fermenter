# fermenter 🍶🔥

[![CI](https://github.com/AdametherzLab/fermenter/actions/workflows/ci.yml/badge.svg)](https://github.com/AdametherzLab/fermenter/actions) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Precision fermentation tracking for brewers, vintners, and fermentophiles.** Track pH, gravity, temperature, and gas production across any fermentation process while predicting completion times with statistical modeling.

## Features ✅

- 📊 Multi-metric tracking (specific gravity, pH, temperature, pressure)
- 🔮 Completion prediction using linear regression
- 🗃️ Session storage with batch comparison tools
- 🌍 Supports beer, wine, kombucha, kimchi, sauerkraut, and custom ferments
- 🛡️ Robust sensor validation with configurable ranges and descriptive errors
- 🧪 Built with TypeScript strict mode and Bun/Node.js 20+

## Installation

bash
npm install @adametherzlab/fermenter
# or
bun add @adametherzlab/fermenter


## Quick Start


import { createSession, logReading, FermentType } from '@adametherzlab/fermenter';

const session = createSession({ name: 'My IPA', type: FermentType.BEER });
const updated = logReading(session, {
  recordedAt: new Date(),
  specificGravity: 1.045,
  temperature: 20,
});


## Sensor Validation

All readings are validated before being accepted. Invalid or out-of-range values throw a `SensorValidationError` with the metric name, invalid value, and valid range.

### Default Ranges

| Metric | Min | Max | Unit |
|--------|-----|-----|------|
| pH | 0 | 14 | pH |
| temperature | -20 | 100 | °C |
| specificGravity | 0.800 | 1.200 | SG |
| gasProduction | 0 | 1000 | L/hr |

### Custom Ranges


import { validateReading, SENSOR_RANGES } from '@adametherzlab/fermenter';

const strictRanges = {
  ...SENSOR_RANGES,
  pH: { min: 3, max: 5, unit: 'pH' },
};

validateReading(reading, strictRanges);


### Error Handling


import { logReading, SensorValidationError } from '@adametherzlab/fermenter';

try {
  logReading(session, { recordedAt: new Date(), pH: 15 });
} catch (err) {
  if (err instanceof SensorValidationError) {
    console.error(err.metric);     // 'pH'
    console.error(err.value);      // 15
    console.error(err.validRange); // { min: 0, max: 14, unit: 'pH' }
  }
}


## API

### `createSession(params)` → `FermentSession`
Create a new fermentation tracking session.

### `logReading(session, reading)` → `FermentSession`
Append a validated sensor reading. Throws `SensorValidationError` for invalid data.

### `validateReading(reading, ranges?)` → `void`
Standalone validation. Throws `SensorValidationError` if any metric is out of range, non-finite, or missing.

### `predictCompletion(session)` → `PredictionResult | null`
Estimate fermentation completion using linear regression on available metrics.

### `saveSession(session)` / `loadSession(id)` → persistence
Store and retrieve sessions from disk.

### `exportSessions(sessions, format)` → `string`
Export sessions as JSON or CSV.

### `compareBatches(session1, session2)` → `ComparisonResult`
Compare two sessions of the same fermentation type.

## License

MIT
