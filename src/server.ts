import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { FermentType, FermentStage } from './types.js';
import { createSession, logReading, predictCompletion } from './ferment.js';
import { saveSession, loadSession, listSessions, deleteSession } from './storage.js';
import { validateReading } from './sensor-validation.js';
import { prepareChartData, getLatestChartPoint } from './charting.js';

type Bindings = {
  FERMENTER_DATA_DIR?: string;
};

export function createApp() {
  const app = new Hono<{ Bindings: Bindings }>();

  // Session API Endpoints
  app.get('/api/sessions', async (c) => {
    const sessions = await listSessions();
    return c.json(sessions);
  });

  app.get('/api/sessions/:id', async (c) => {
    const session = await loadSession(c.req.param('id'));
    return session ? c.json(session) : c.notFound();
  });

  app.post('/api/sessions', async (c) => {
    const body = await c.req.json();
    const session = createSession(body);
    await saveSession(session);
    return c.json(session, 201);
  });

  app.post('/api/sessions/:id/readings', async (c) => {
    const session = await loadSession(c.req.param('id'));
    if (!session) return c.notFound();

    try {
      const reading = await c.req.json();
      reading.recordedAt = new Date(reading.recordedAt);
      validateReading(reading);
      
      const updatedSession = logReading(session, reading);
      await saveSession(updatedSession);
      return c.json(updatedSession);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : 'Invalid reading' }, 400);
    }
  });

  // New Chart Data Endpoint
  app.get('/api/sessions/:id/chart', async (c) => {
    const session = await loadSession(c.req.param('id'));
    if (!session) return c.notFound();
    
    const chartData = prepareChartData(session);
    return c.json(chartData);
  });

  // Real-time Event Stream
  app.get('/api/sessions/:id/events', (c) => {
    return c.streamText(async (stream) => {
      const sessionId = c.req.param('id');
      let session = await loadSession(sessionId);
      
      const sendUpdate = async () => {
        session = await loadSession(sessionId);
        if (session) {
          const update = getLatestChartPoint(session);
          if (update) await stream.write(`data: ${JSON.stringify(update)}\n\n`);
        }
      };

      // Send initial data
      await sendUpdate();

      // Check for updates every second
      const interval = setInterval(sendUpdate, 1000);
      stream.onAbort(() => clearInterval(interval));
    });
  });

  // UI Routes
  app.get('/', async (c) => {
    const sessions = await listSessions();
    return c.html(
      <html>
        <head>
          <title>Fermenter Dashboard</title>
          <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
          <script src="https://unpkg.com/htmx.org@1.9.10"></script>
        </head>
        <body hx-boost="true">
          <h1>Your Fermentation Sessions</h1>
          {/* ... existing session list ... */}
        </body>
      </html>
    );
  });

  app.get('/session/:id', async (c) => {
    const session = await loadSession(c.req.param('id'));
    if (!session) return c.notFound();

    return c.html(
      <html>
        <head>
          <title>{session.name} - Fermenter</title>
          <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
          <script src="https://unpkg.com/htmx.org@1.9.10"></script>
          <script>
            document.addEventListener('DOMContentLoaded', () => {
              const ctx = document.getElementById('fermentationChart').getContext('2d');
              let chart;

              async function initChart() {
                const res = await fetch(`/api/sessions/${session.id}/chart`);
                const chartData = await res.json();

                chart = new Chart(ctx, {
                  type: 'line',
                  data: chartData,
                  options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                      y: { type: 'linear', display: true, position: 'left' },
                      y1: { type: 'linear', display: true, position: 'right' },
                      y2: { type: 'linear', display: true, position: 'right' },
                      y3: { type: 'linear', display: true, position: 'right' }
                    }
                  }
                });
              }

              const eventSource = new EventSource(`/api/sessions/${session.id}/events`);
              eventSource.onmessage = (e) => {
                const update = JSON.parse(e.data);
                chart.data.labels.push(update.timestamp);
                chart.data.datasets.forEach(dataset => {
                  const metric = dataset.label.split(' ')[0].toLowerCase();
                  dataset.data.push(update.metrics[metric] || null);
                });
                chart.update();
              };

              initChart();
            });
          </script>
        </head>
        <body>
          <h1>{session.name}</h1>
          <div style="height: 60vh; width: 80vw">
            <canvas id="fermentationChart"></canvas>
          </div>
          {/* ... existing session details ... */}
        </body>
      </html>
    );
  });

  return app;
}

export const app = createApp();
