# fermenter \ud83c\udf76\ud83d\udd25

[![CI](https://github.com/AdametherzLab/fermenter/actions/workflows/ci.yml/badge.svg)](https://github.com/AdametherzLab/fermenter/actions) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Precision fermentation tracking for brewers, vintners, and fermentophiles.** Track pH, gravity, temperature, and gas production across any fermentation process while predicting completion times with statistical modeling.

## Features

- Multi-metric tracking (specific gravity, pH, temperature, pressure)
- Completion prediction using linear regression
- Session storage with batch comparison tools
- Supports beer, wine, kombucha, kimchi, sauerkraut, and custom ferments
- Robust sensor validation with configurable ranges and descriptive errors
- **Web dashboard** for visual session management (create, view, log readings, export)
- Built with TypeScript strict mode and Bun/Node.js 20+

## Installation

bash
npm install @adametherzlab/fermenter


## Quick Start (Library)


import { createSession, logReading, FermentType } from '@adametherzlab/fermenter';

const session = createSession({ name: 'My IPA', type: FermentType.BEER });
const updated = logReading(session, {
  recordedAt: new Date(),
  specificGravity: 1.045,
  temperature: 20,
});


## Web Dashboard

Start the built-in web UI to manage sessions from your browser:

bash
# Using bun
bun run serve

# Or with environment variable for port
PORT=8080 bun run serve


Open `http://localhost:3000` to access the dashboard.

### Dashboard Features

- **Create sessions** — pick a name and ferment type (Beer, Wine, Kombucha, Kimchi, Sauerkraut)
- **Log readings** — enter pH, temperature, specific gravity, and gas production
- **View session details** — see all readings, current stage, and completion predictions
- **Export data** — download session data as CSV
- **Delete sessions** — remove completed or unwanted sessions

### REST API

The dashboard exposes a JSON API:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sessions` | List all sessions |
| `POST` | `/api/sessions` | Create a session (`{name, type}`) |
| `GET` | `/api/sessions/:id` | Get session details |
| `DELETE` | `/api/sessions/:id` | Delete a session |
| `POST` | `/api/sessions/:id/readings` | Log a reading (`{pH?, temperature?, specificGravity?, gasProduction?}`) |
| `GET` | `/api/sessions/:id/prediction` | Get completion prediction |
| `GET` | `/api/sessions/:id/export?format=csv` | Export session as CSV |

### Programmatic Usage


import { createApp } from '@adametherzlab/fermenter/server';

const app = createApp();
// Use with any Hono-compatible server
export default { port: 3000, fetch: app.fetch };


## API Reference

### `createSession(params)`
Create a new fermentation session.

### `logReading(session, reading)`
Append a validated reading and recalculate stage/prediction.

### `predictCompletion(session)`
Estimate fermentation completion using linear regression.

### `saveSession(session)` / `loadSession(id)` / `listSessions()` / `deleteSession(id)`
Persist and retrieve sessions from `~/.fermenter/`.

### `exportSessions(sessions, format)`
Export sessions as JSON or CSV.

### `compareBatches(session1, session2)`
Compare two sessions of the same type.

### `validateReading(reading, ranges?)`
Validate sensor data against configurable ranges.

## License

MIT
