# fermenter 🍶🔥

[![CI](https://github.com/AdametherzLab/fermenter/actions/workflows/ci.yml/badge.svg)](https://github.com/AdametherzLab/fermenter/actions) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Precision fermentation tracking for brewers, vintners, and fermentophiles.** Track pH, gravity, temperature, and gas production across any fermentation process while predicting completion times with statistical modeling.

## Features ✅

- 📊 Multi-metric tracking (specific gravity, pH, temperature, pressure)
- 🔮 Completion prediction using linear regression
- 🗃️ Session storage with batch comparison tools
- 🌍 Supports beer, wine, kombucha, kimchi, sauerkraut, and custom ferments
- 🧪 Built with TypeScript strict mode and Bun/Node.js 20+

## Installation

```bash
npm install @adametherzlab/fermenter
# or
bun add @adametherzlab/fermenter
```

## Quick Start 🚀

```typescript
import { 
  createSession, 
  logReading,
  predictCompletion,
  saveSession,
  FermentType
} from '@adametherzlab/fermenter';

// Create new fermentation session
const session = createSession({
  name: 'Wildflower Mead',
  type: FermentType.WINE
});

// Log initial measurements
const updated = logReading(session, {
  recordedAt: new Date(),
  temperature: 23.5,
  specificGravity: 1.102
});

// Get completion prediction
const prediction = predictCompletion(updated);
console.log(`Fermentation complete in ${prediction?.estimatedHours}h`);

// Save session to ~/.fermenter
await saveSession(updated);
```

## API Reference 📖

| Function | Parameters | Returns | Example |
|----------|------------|---------|---------|
| **createSession**<br>`(params: { name: string; type: FermentType })` | `name`: Session name<br>`type`: FermentType enum | `FermentSession` | `createSession({ name: 'Sauerkraut', type: FermentType.VEGETABLE })` |
| **logReading**<br>`(session: FermentSession, reading: Reading)` | `session`: Active session<br>`reading`: Measurement data | `FermentSession` | `logReading(session, { temperature: 22, specificGravity: 1.045 })` |
| **fitCurve**<br>`(points: ReadonlyArray<{ x: number; y: number }>)` | `points`: Time-series data points | `RegressionResult` | `fitCurve([{x: 0, y: 1.065}, {x: 48, y: 1.040}])` |
| **predictCompletion**<br>`(session: FermentSession)` | `session`: Session with readings | `PredictionResult \| null` | `predictCompletion(activeSession)` |
| **saveSession**<br>`(session: FermentSession)` | `session`: Session to save | `Promise<void>` | `await saveSession(completedSession)` |
| **compareBatches**<br>`(session1: FermentSession, session2: FermentSession)` | `session1`: First batch<br>`session2`: Second batch | `ComparisonResult` | `compareBatches(batchA, batchB)` |

## Advanced Usage 🧪

```typescript
import { 
  createSession, logReading, predictCompletion,
  saveSession, loadSession, compareBatches,
  exportSessions, FermentType
} from '@adametherzlab/fermenter';

// Create and track beer fermentation
const brewDay = createSession({
  name: 'Barleywine',
  type: FermentType.BEER
});

// Simulate daily gravity readings
let currentSession = brewDay;
for (let day = 1; day <= 14; day++) {
  currentSession = logReading(currentSession, {
    recordedAt: new Date(Date.now() + day * 86400000),
    specificGravity: 1.090 - (day * 0.005)
  });
}

// Predict and save
const finalPrediction = predictCompletion(currentSession);
await saveSession(currentSession);

// Compare with previous batch
const lastBatch = await loadSession('previous-barleywine-id');
if (lastBatch) {
  const analysis = compareBatches(currentSession, lastBatch);
  console.log(`Current batch ferments ${analysis.rateComparison}% faster`);
}

// Export session data
const csvData = exportSessions([currentSession], 'csv');
console.log(csvData);
```

## Supported Ferment Types 🥫

- `FermentType.BEER` (ale, lager, wild)
- `FermentType.WINE` (grape, fruit, mead)
- `FermentType.KOMBUCHA` (standard, jun)
- `FermentType.VEGETABLE` (kimchi, sauerkraut, hot sauce)
- Custom types via string union: `'custom:yogurt'`

## Contributing 🤝

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and contribution guidelines.

## License

MIT © [AdametherzLab](https://github.com/AdametherzLab)