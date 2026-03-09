import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { nanoid } from 'nanoid';
import { FermentType, FermentStage, Reading, FermentSession, PredictionResult } from './types.js';
import { createSession, logReading, getReadings } from './ferment.js';
import { saveSession, loadSession, listSessions, deleteSession } from './storage.js';
import { validateReading, SensorValidationError } from './sensor-validation.js';

/**
 * @typedef {import('./types.js').FermentSession} FermentSession
 * @typedef {import('./types.js').Reading} Reading
 * @typedef {import('./types.js').FermentType} FermentType
 * @typedef {import('./types.js').FermentStage} FermentStage
 */

const app = new Hono();

// --- UI Routes ---
app.get('/', async (c) => {
  const sessions = await listSessions();
  return c.html(renderHomePage(sessions));
});

app.get('/session/:id', async (c) => {
  const id = c.req.param('id');
  const session = await loadSession(id);
  if (!session) {
    return c.notFound();
  }
  return c.html(renderSessionPage(session));
});

app.get('/session/new', (c) => {
  return c.html(renderNewSessionForm());
});

// --- API Endpoints ---

/**
 * @api {post} /api/sessions Create a new fermentation session
 * @apiName CreateSession
 * @apiGroup Session
 * @apiBody {string} name Name of the session
 * @apiBody {FermentType} type Type of fermentation (e.g., 'BEER', 'WINE')
 * @apiBody {string} [startDate] ISO date string for start time (defaults to now)
 * @apiSuccess {FermentSession} session Newly created session object
 * @apiError (400) {string} message Error message if input is invalid
 */
app.post('/api/sessions', async (c) => {
  try {
    const body = await c.req.json();
    const { name, type, startDate: startDateStr } = body;

    if (!name || typeof name !== 'string') {
      return c.json({ error: 'Session name is required' }, 400);
    }
    if (!Object.values(FermentType).includes(type)) {
      return c.json({ error: `Invalid fermentation type: ${type}` }, 400);
    }

    const startDate = startDateStr ? new Date(startDateStr) : undefined;
    const newSession = createSession({ name, type, startDate });
    await saveSession(newSession);
    return c.json(newSession, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500);
  }
});

/**
 * @api {get} /api/sessions Get all fermentation sessions
 * @apiName GetSessions
 * @apiGroup Session
 * @apiSuccess {FermentSession[]} sessions Array of all stored sessions
 */
app.get('/api/sessions', async (c) => {
  const sessions = await listSessions();
  return c.json(sessions);
});

/**
 * @api {get} /api/sessions/:id Get a specific fermentation session
 * @apiName GetSessionById
 * @apiGroup Session
 * @apiParam {string} id Session ID
 * @apiSuccess {FermentSession} session The requested session object
 * @apiError (404) {string} message Session not found
 */
app.get('/api/sessions/:id', async (c) => {
  const id = c.req.param('id');
  const session = await loadSession(id);
  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }
  return c.json(session);
});

/**
 * @api {post} /api/sessions/:id/readings Add a new reading to a session
 * @apiName AddReading
 * @apiGroup Session
 * @apiParam {string} id Session ID
 * @apiBody {string} recordedAt ISO date string of reading time
 * @apiBody {number} [pH]
 * @apiBody {number} [temperature]
 * @apiBody {number} [specificGravity]
 * @apiBody {number} [gasProduction]
 * @apiSuccess {FermentSession} session Updated session object
 * @apiError (400) {string} message Invalid reading data or chronological error
 * @apiError (404) {string} message Session not found
 */
app.post('/api/sessions/:id/readings', async (c) => {
  const id = c.req.param('id');
  let session = await loadSession(id);
  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  try {
    const body = await c.req.json();
    const reading: Reading = {
      recordedAt: new Date(body.recordedAt),
      pH: body.pH,
      temperature: body.temperature,
      specificGravity: body.specificGravity,
      gasProduction: body.gasProduction,
    };

    validateReading(reading);
    session = logReading(session, reading);
    await saveSession(session);
    return c.json(session);
  } catch (error) {
    if (error instanceof SensorValidationError) {
      return c.json({ error: `Sensor validation error: ${error.message}` }, 400);
    }
    return c.json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500);
  }
});

/**
 * @api {delete} /api/sessions/:id Delete a fermentation session
 * @apiName DeleteSession
 * @apiGroup Session
 * @apiParam {string} id Session ID
 * @apiSuccess {object} message Confirmation message
 * @apiError (404) {string} message Session not found
 */
app.delete('/api/sessions/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await deleteSession(id);
  if (!deleted) {
    return c.json({ error: 'Session not found' }, 404);
  }
  return c.json({ message: 'Session deleted successfully' });
});

// --- HTML Rendering Functions ---

function renderLayout(title: string, content: string) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title} - Fermenter</title>
        <script src="https://unpkg.com/htmx.org@1.9.12"></script>
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js"></script>
        <style>
            body { font-family: sans-serif; margin: 0; padding: 20px; background-color: #f4f7f6; color: #333; }
            .container { max-width: 900px; margin: 20px auto; background-color: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
            h1, h2 { color: #2c3e50; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px; margin-bottom: 20px; }
            .session-card { background-color: #f9f9f9; border: 1px solid #eee; border-radius: 6px; padding: 15px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; }
            .session-card a { text-decoration: none; color: #3498db; font-weight: bold; font-size: 1.1em; }
            .session-card a:hover { text-decoration: underline; }
            .button { background-color: #28a745; color: white; padding: 10px 15px; border: none; border-radius: 5px; cursor: pointer; text-decoration: none; display: inline-block; font-size: 0.9em; }
            .button:hover { background-color: #218838; }
            .button.secondary { background-color: #6c757d; }
            .button.secondary:hover { background-color: #5a6268; }
            .button.danger { background-color: #dc3545; }
            .button.danger:hover { background-color: #c82333; }
            .form-group { margin-bottom: 15px; }
            .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
            .form-group input[type="text"], .form-group input[type="number"], .form-group input[type="datetime-local"], .form-group select { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
            .error-message { color: #dc3545; background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 10px; border-radius: 5px; margin-bottom: 15px; }
            .reading-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            .reading-table th, .reading-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            .reading-table th { background-color: #f2f2f2; }
            .chart-container { position: relative; height: 400px; width: 100%; margin-top: 20px; }
            .flex-container { display: flex; gap: 20px; flex-wrap: wrap; }
            .flex-item { flex: 1; min-width: 300px; }
        </style>
    </head>
    <body>
        <div class="container">
            ${content}
        </div>
    </body>
    </html>
  `;
}

function renderHomePage(sessions: FermentSession[]) {
  const sessionList = sessions.length > 0
    ? sessions.map(s => `
        <div class="session-card">
            <a href="/session/${s.id}">${s.name} (${s.type})</a>
            <span>Stage: ${s.currentStage}</span>
            <span>Started: ${s.startDate.toLocaleDateString()}</span>
        </div>
      `).join('')
    : '<p>No sessions found. Start a new one!</p>';

  return renderLayout('Fermentation Sessions', `
    <h1>Your Fermentation Sessions</h1>
    <p><a href="/session/new" class="button">+ Start New Session</a></p>
    <div id="session-list">
        ${sessionList}
    </div>
  `);
}

function renderNewSessionForm() {
  const fermentTypeOptions = Object.values(FermentType).map(type => `<option value="${type}">${type}</option>`).join('');
  const now = new Date();
  const defaultStartDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, -8);

  return renderLayout('New Session', `
    <h1>Start New Fermentation Session</h1>
    <form hx-post="/api/sessions" hx-target="body" hx-swap="outerHTML" hx-on--after-request="if(event.detail.xhr.status === 201) window.location.href = '/'; else alert('Error creating session: ' + event.detail.xhr.response)">
        <div class="form-group">
            <label for="name">Session Name:</label>
            <input type="text" id="name" name="name" required>
        </div>
        <div class="form-group">
            <label for="type">Fermentation Type:</label>
            <select id="type" name="type" required>
                ${fermentTypeOptions}
            </select>
        </div>
        <div class="form-group">
            <label for="startDate">Start Date/Time:</label>
            <input type="datetime-local" id="startDate" name="startDate" value="${defaultStartDate}">
        </div>
        <button type="submit" class="button">Create Session</button>
        <a href="/" class="button secondary">Cancel</a>
    </form>
  `);
}

function renderSessionPage(session: FermentSession) {
  const readingsTable = session.readings.length > 0 ? `
    <table class="reading-table">
        <thead>
            <tr>
                <th>Time</th>
                <th>pH</th>
                <th>Temp (°C)</th>
                <th>SG</th>
                <th>Gas (L/hr)</th>
            </tr>
        </thead>
        <tbody>
            ${session.readings.map(r => `
                <tr>
                    <td>${r.recordedAt.toLocaleString()}</td>
                    <td>${r.pH?.toFixed(2) ?? '-'}</td>
                    <td>${r.temperature?.toFixed(1) ?? '-'}</td>
                    <td>${r.specificGravity?.toFixed(3) ?? '-'}</td>
                    <td>${r.gasProduction?.toFixed(2) ?? '-'}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
  ` : '<p>No readings yet. Add one below!</p>';

  const predictionInfo = session.prediction ? `
    <p><strong>Estimated Completion:</strong> ${session.prediction.estimatedCompletionDate.toLocaleDateString()} (Confidence: ${Math.round(session.prediction.confidence * 100)}%)</p>
  ` : '<p>Not enough data for a reliable prediction yet.</p>';

  const now = new Date();
  const defaultRecordedAt = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, -8);

  return renderLayout(session.name, `
    <h1>${session.name} (${session.type})</h1>
    <p><strong>Started:</strong> ${session.startDate.toLocaleString()}</p>
    <p><strong>Current Stage:</strong> ${session.currentStage}</p>
    ${predictionInfo}

    <h2>Add New Reading</h2>
    <form hx-post="/api/sessions/${session.id}/readings" hx-target="#readings-section" hx-swap="outerHTML" hx-on--after-request="if(event.detail.xhr.status === 200) this.reset(); else alert('Error adding reading: ' + event.detail.xhr.response)">
        <div class="flex-container">
            <div class="form-group flex-item">
                <label for="recordedAt">Recorded At:</label>
                <input type="datetime-local" id="recordedAt" name="recordedAt" value="${defaultRecordedAt}" required>
            </div>
            <div class="form-group flex-item">
                <label for="pH">pH:</label>
                <input type="number" step="0.01" id="pH" name="pH">
            </div>
            <div class="form-group flex-item">
                <label for="temperature">Temperature (°C):</label>
                <input type="number" step="0.1" id="temperature" name="temperature">
            </div>
            <div class="form-group flex-item">
                <label for="specificGravity">Specific Gravity:</label>
                <input type="number" step="0.001" id="specificGravity" name="specificGravity">
            </div>
            <div class="form-group flex-item">
                <label for="gasProduction">Gas Production (L/hr):</label>
                <input type="number" step="0.01" id="gasProduction" name="gasProduction">
            </div>
        </div>
        <button type="submit" class="button">Add Reading</button>
    </form>

    <h2 id="readings-section">Readings History</h2>
    <div class="chart-container">
        <canvas id="gravityChart"></canvas>
    </div>
    <div class="chart-container">
        <canvas id="phChart"></canvas>
    </div>
    <div class="chart-container">
        <canvas id="tempChart"></canvas>
    </div>
    ${readingsTable}

    <p style="margin-top: 30px;">
        <a href="/" class="button secondary">Back to Sessions</a>
        <button class="button danger" hx-delete="/api/sessions/${session.id}" hx-confirm="Are you sure you want to delete this session?" hx-target="body" hx-swap="outerHTML" hx-on--after-request="if(event.detail.xhr.status === 200) window.location.href = '/'; else alert('Error deleting session: ' + event.detail.xhr.response)">Delete Session</button>
    </p>

    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const readings = ${JSON.stringify(session.readings)};
            const labels = readings.map(r => new Date(r.recordedAt).toLocaleString());

            const createChart = (ctxId, label, dataKey, unit) => {
                const data = readings.map(r => r[dataKey]);
                new Chart(document.getElementById(ctxId), {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: label,
                            data: data,
                            borderColor: '#3498db',
                            tension: 0.1,
                            fill: false
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: { type: 'category', title: { display: true, text: 'Time' } },
                            y: { title: { display: true, text: unit } }
                        }
                    }
                });
            };

            if (readings.some(r => r.specificGravity !== undefined)) {
                createChart('gravityChart', 'Specific Gravity', 'specificGravity', 'SG');
            }
            if (readings.some(r => r.pH !== undefined)) {
                createChart('phChart', 'pH', 'pH', 'pH');
            }
            if (readings.some(r => r.temperature !== undefined)) {
                createChart('tempChart', 'Temperature', 'temperature', '°C');
            }
        });
    </script>
  `);
}

/**
 * Starts the Hono server.
 * @param port - The port to listen on. Defaults to 3000.
 */
export function createApp(port: number = 3000) {
  console.log(`Fermenter UI and API server running on http://localhost:${port}`);
  serve({ fetch: app.fetch, port });
}

// If this file is run directly, start the app
if (import.meta.main) {
  createApp();
}
