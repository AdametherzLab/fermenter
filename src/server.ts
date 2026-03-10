/**
 * Hono web server with real-time charting capabilities.
 * Provides REST API and HTML views for fermentation monitoring.
 * @module server
 */

import { Hono } from 'hono';
import { serveStatic } from 'hono/serve-static';
import { FermentType, FermentStage, type FermentSession, type Reading } from './types.js';
import { createSession, logReading } from './ferment.js';
import { saveSession, loadSession, listSessions, deleteSession } from './storage.js';
import { prepareChartData, calculateMetricStats, getLatestChartPoint } from './charting.js';
import { validateReading, SensorValidationError } from './sensor-validation.js';

/** 
 * Creates the Hono application with all routes configured.
 * @returns Configured Hono app instance
 */
export function createApp(): Hono {
  const app = new Hono();

  // Health check endpoint
  app.get('/health', (c) => c.json({ status: 'ok', version: '0.2.0' }));

  // Home page - Session list
  app.get('/', async (c) => {
    const sessions = await listSessions();
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fermenter - Fermentation Tracker</title>
  <script src="https://unpkg.com/htmx.org@1.9.10"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
    .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .session-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
    .session-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: transform 0.2s; }
    .session-card:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.15); }
    .btn { background: #0066cc; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; }
    .btn:hover { background: #0052a3; }
    .btn-secondary { background: #6c757d; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.85em; font-weight: 600; }
    .badge-active { background: #d4edda; color: #155724; }
    .badge-complete { background: #d1ecf1; color: #0c5460; }
    .metric-preview { margin-top: 10px; font-size: 0.9em; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🍺 Fermenter</h1>
    <p>Precision fermentation tracking</p>
    <a href="/session/new" class="btn">Start New Session</a>
  </div>
  
  <div id="sessions">
    ${sessions.length === 0 
      ? '<p>No sessions found. Start a new one!</p>' 
      : `<div class="session-grid">${sessions.map(s => {
        const latest = s.readings[s.readings.length - 1];
        const stageClass = s.currentStage === FermentStage.COMPLETE ? 'badge-complete' : 'badge-active';
        return `
        <div class="session-card">
          <h3><a href="/session/${s.id}">${s.name}</a></h3>
          <span class="badge ${stageClass}">${s.currentStage}</span>
          <p>Type: ${s.type}</p>
          <p>Started: ${s.startDate.toLocaleDateString()}</p>
          <p>Readings: ${s.readings.length}</p>
          ${latest ? `
          <div class="metric-preview">
            Latest: SG ${latest.specificGravity ?? 'N/A'} | 
            pH ${latest.pH ?? 'N/A'} | 
            ${latest.temperature ?? 'N/A'}°C
          </div>` : ''}
        </div>
        `;
      }).join('')}</div>`
    }
  </div>
</body>
</html>`;
    return c.html(html);
  });

  // New session form
  app.get('/session/new', (c) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Session - Fermenter</title>
  <script src="https://unpkg.com/htmx.org@1.9.10"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 5px; font-weight: 600; }
    input, select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px; }
    .btn { background: #0066cc; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
    .error { color: #dc3545; margin-top: 10px; }
  </style>
</head>
<body>
  <h1>Start New Fermentation Session</h1>
  <form hx-post="/api/sessions" hx-target="#result" hx-swap="innerHTML" hx-ext="json-enc">
    <div class="form-group">
      <label>Session Name:</label>
      <input type="text" name="name" required placeholder="e.g., Summer Saison">
    </div>
    <div class="form-group">
      <label>Fermentation Type:</label>
      <select name="type" required>
        ${Object.values(FermentType).map(t => `<option value="${t}">${t}</option>`).join('')}
      </select>
    </div>
    <button type="submit" class="btn">Create Session</button>
    <div id="result"></div>
  </form>
  <p style="margin-top: 20px;"><a href="/">← Back to Home</a></p>
  <script>
    // Simple JSON encoding extension for HTMX
    htmx.defineExtension('json-enc', {
      onEvent: function(name, evt) {
        if (name === "htmx:configRequest") {
          evt.detail.headers['Content-Type'] = "application/json";
        }
      },
      encodeParameters: function(xhr, parameters, elt) {
        xhr.overrideMimeType('text/json');
        return JSON.stringify(parameters);
      }
    });
  </script>
</body>
</html>`;
    return c.html(html);
  });

  // API: Create session
  app.post('/api/sessions', async (c) => {
    try {
      let body: any;
      const contentType = c.req.header('Content-Type') || '';
      
      if (contentType.includes('application/json')) {
        body = await c.req.json();
      } else {
        body = await c.req.parseBody();
      }

      if (!body.name || typeof body.name !== 'string') {
        return c.json({ error: 'Name is required' }, 400);
      }
      if (!Object.values(FermentType).includes(body.type)) {
        return c.json({ error: 'Invalid fermentation type' }, 400);
      }
      
      const session = createSession({
        name: body.name,
        type: body.type as FermentType,
        startDate: body.startDate ? new Date(body.startDate) : undefined
      });
      
      await saveSession(session);
      
      // If HTMX request, redirect to session page
      if (c.req.header('HX-Request')) {
        c.header('HX-Redirect', `/session/${session.id}`);
        return c.body('');
      }
      
      return c.json(session, 201);
    } catch (error) {
      return c.json({ error: String(error) }, 400);
    }
  });

  // API: List sessions
  app.get('/api/sessions', async (c) => {
    const sessions = await listSessions();
    return c.json(sessions);
  });

  // API: Get session
  app.get('/api/sessions/:id', async (c) => {
    const id = c.req.param('id');
    const session = await loadSession(id);
    if (!session) return c.json({ error: 'Session not found' }, 404);
    return c.json(session);
  });

  // API: Get chart data (Real-time Charting Feature)
  app.get('/api/sessions/:id/chart-data', async (c) => {
    const id = c.req.param('id');
    const session = await loadSession(id);
    if (!session) return c.json({ error: 'Session not found' }, 404);
    
    const metricsParam = c.req.query('metrics');
    const metrics = metricsParam ? metricsParam.split(',') as ('specificGravity' | 'pH' | 'temperature' | 'gasProduction')[] : undefined;
    
    const startDate = c.req.query('startDate') ? new Date(c.req.query('startDate')!) : undefined;
    const endDate = c.req.query('endDate') ? new Date(c.req.query('endDate')!) : undefined;
    
    const chartData = prepareChartData(session, { metrics, startDate, endDate });
    
    // Include statistics in response headers or meta
    const stats = {
      specificGravity: calculateMetricStats(session, 'specificGravity'),
      temperature: calculateMetricStats(session, 'temperature'),
      pH: calculateMetricStats(session, 'pH')
    };
    
    return c.json({
      ...chartData,
      meta: {
        sessionId: session.id,
        sessionName: session.name,
        readingCount: session.readings.length,
        stats
      }
    });
  });

  // API: Get latest reading (for real-time updates)
  app.get('/api/sessions/:id/latest', async (c) => {
    const id = c.req.param('id');
    const session = await loadSession(id);
    if (!session) return c.json({ error: 'Session not found' }, 404);
    
    const latest = getLatestChartPoint(session);
    if (!latest) return c.json({ error: 'No readings available' }, 404);
    
    return c.json(latest);
  });

  // API: Add reading
  app.post('/api/sessions/:id/readings', async (c) => {
    const id = c.req.param('id');
    const session = await loadSession(id);
    if (!session) return c.json({ error: 'Session not found' }, 404);
    
    try {
      let body: any;
      const contentType = c.req.header('Content-Type') || '';
      
      if (contentType.includes('application/json')) {
        body = await c.req.json();
      } else {
        body = await c.req.parseBody();
      }

      const reading: Reading = {
        recordedAt: body.recordedAt ? new Date(body.recordedAt) : new Date(),
        specificGravity: body.specificGravity !== undefined ? Number(body.specificGravity) : undefined,
        pH: body.pH !== undefined ? Number(body.pH) : undefined,
        temperature: body.temperature !== undefined ? Number(body.temperature) : undefined,
        gasProduction: body.gasProduction !== undefined ? Number(body.gasProduction) : undefined
      };
      
      const updated = logReading(session, reading);
      await saveSession(updated);
      
      if (c.req.header('HX-Request')) {
        return c.html(`<div class="success">Reading added successfully! <a href="/session/${id}">View updated chart</a></div>`);
      }
      
      return c.json(updated);
    } catch (error) {
      const message = error instanceof SensorValidationError 
        ? `Sensor validation error: ${error.message}`
        : String(error);
      
      if (c.req.header('HX-Request')) {
        return c.html(`<div class="error">Error: ${message}</div>`, 400);
      }
      return c.json({ error: message }, 400);
    }
  });

  // View session page with interactive charts
  app.get('/session/:id', async (c) => {
    const id = c.req.param('id');
    const session = await loadSession(id);
    if (!session) return c.html('<h1>Session not found</h1><a href="/">← Home</a>', 404);
    
    const latestReading = session.readings[session.readings.length - 1];
    const stats = {
      sg: calculateMetricStats(session, 'specificGravity'),
      temp: calculateMetricStats(session, 'temperature'),
      ph: calculateMetricStats(session, 'pH')
    };
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${session.name} - Fermenter</title>
  <script src="https://unpkg.com/htmx.org@1.9.10"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
    .container { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .chart-container { position: relative; height: 500px; margin: 20px 0; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
    .stat-card { background: #f8f9fa; padding: 15px; border-radius: 4px; border-left: 4px solid #0066cc; }
    .stat-label { font-size: 0.85em; color: #666; text-transform: uppercase; }
    .stat-value { font-size: 1.5em; font-weight: bold; color: #333; }
    .reading-form { background: #f8f9fa; padding: 20px; border-radius: 8px; }
    .form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 15px; }
    .form-group { display: flex; flex-direction: column; }
    label { font-weight: 600; margin-bottom: 5px; font-size: 0.9em; }
    input { padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
    .btn { background: #0066cc; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
    .btn:hover { background: #0052a3; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 0.85em; font-weight: 600; margin-left: 10px; }
    .status-active { background: #fff3cd; color: #856404; }
    .status-complete { background: #d4edda; color: #155724; }
    .live-indicator { display: inline-flex; align-items: center; gap: 5px; font-size: 0.85em; color: #28a745; }
    .pulse { width: 8px; height: 8px; background: #28a745; border-radius: 50%; animation: pulse 2s infinite; }
    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
  </style>
</head>
<body>
  <div class="container">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h1>${session.name}</h1>
        <p>Type: ${session.type} | Started: ${session.startDate.toLocaleString()}</p>
      </div>
      <span class="status-badge ${session.currentStage === FermentStage.COMPLETE ? 'status-complete' : 'status-active'}">${session.currentStage}</span>
    </div>
    
    ${latestReading ? `
    <div class="stats-grid">
      ${stats.sg ? `
      <div class="stat-card">
        <div class="stat-label">Specific Gravity (avg)</div>
        <div class="stat-value">${stats.sg.avg.toFixed(3)}</div>
        <small>Range: ${stats.sg.min.toFixed(3)} - ${stats.sg.max.toFixed(3)}</small>
      </div>` : ''}
      ${stats.temp ? `
      <div class="stat-card">
        <div class="stat-label">Temperature (avg)</div>
        <div class="stat-value">${stats.temp.avg.toFixed(1)}°C</div>
        <small>Range: ${stats.temp.min.toFixed(1)} - ${stats.temp.max.toFixed(1)}°C</small>
      </div>` : ''}
      ${stats.ph ? `
      <div class="stat-card">
        <div class="stat-label">pH (avg)</div>
        <div class="stat-value">${stats.ph.avg.toFixed(2)}</div>
        <small>Range: ${stats.ph.min.toFixed(2)} - ${stats.ph.max.toFixed(2)}</small>
      </div>` : ''}
      <div class="stat-card">
        <div class="stat-label">Total Readings</div>
        <div class="stat-value">${session.readings.length}</div>
        <small>Last: ${latestReading.recordedAt.toLocaleString()}</small>
      </div>
    </div>
    ` : '<p>No readings recorded yet.</p>'}
  </div>

  <div class="container">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <h2>Fermentation Progress</h2>
      <div class="live-indicator">
        <span class="pulse"></span>
        <span>Live Updates</span>
      </div>
    </div>
    <div class="chart-container">
      <canvas id="gravityChart"></canvas>
    </div>
  </div>

  <div class="container reading-form">
    <h3>Add New Reading</h3>
    <form hx-post="/api/sessions/${session.id}/readings" hx-target="#form-result" hx-swap="innerHTML" hx-ext="json-enc" hx-on::after-request="if(event.detail.successful) setTimeout(() => window.location.reload(), 500)">
      <div class="form-row">
        <div class="form-group">
          <label>Specific Gravity</label>
          <input type="number" step="0.001" name="specificGravity" placeholder="1.045">
        </div>
        <div class="form-group">
          <label>pH</label>
          <input type="number" step="0.01" name="pH" placeholder="4.5" min="0" max="14">
        </div>
        <div class="form-group">
          <label>Temperature (°C)</label>
          <input type="number" step="0.1" name="temperature" placeholder="20.0">
        </div>
        <div class="form-group">
          <label>Gas Production (L/hr)</label>
          <input type="number" step="0.01" name="gasProduction" placeholder="0.5">
        </div>
      </div>
      <button type="submit" class="btn">Add Reading</button>
      <div id="form-result"></div>
    </form>
  </div>

  <div style="margin-top: 20px;">
    <a href="/" class="btn btn-secondary">← Back to All Sessions</a>
    <button class="btn btn-secondary" style="background: #dc3545; margin-left: 10px;" hx-delete="/api/sessions/${session.id}" hx-confirm="Delete this session?" hx-target="body" hx-swap="innerHTML">Delete Session</button>
  </div>

  <script>
    // HTMX JSON extension
    htmx.defineExtension('json-enc', {
      onEvent: function(name, evt) {
        if (name === "htmx:configRequest") {
          evt.detail.headers['Content-Type'] = "application/json";
        }
      },
      encodeParameters: function(xhr, parameters, elt) {
        xhr.overrideMimeType('text/json');
        return JSON.stringify(parameters);
      }
    });

    let chart;
    
    async function initChart() {
      const ctx = document.getElementById('gravityChart').getContext('2d');
      
      // Fetch initial data
      const response = await fetch('/api/sessions/${session.id}/chart-data');
      const data = await response.json();
      
      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.labels.map(l => new Date(l).toLocaleString()),
          datasets: data.datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            title: {
              display: true,
              text: 'Fermentation Metrics Over Time'
            },
            legend: {
              position: 'top',
            },
            tooltip: {
              callbacks: {
                title: function(context) {
                  return new Date(context[0].label).toLocaleString();
                }
              }
            }
          },
          scales: {
            x: {
              display: true,
              title: { display: true, text: 'Time' },
              ticks: {
                maxTicksLimit: 8,
                callback: function(value, index, values) {
                  return new Date(this.getLabelForValue(value)).toLocaleDateString();
                }
              }
            },
            y: {
              type: 'linear',
              display: true,
              position: 'left',
              title: { display: true, text: 'Specific Gravity' }
            },
            y1: {
              type: 'linear',
              display: true,
              position: 'right',
              grid: { drawOnChartArea: false },
              title: { display: true, text: 'pH' },
              min: 0,
              max: 14
            },
            y2: {
              type: 'linear',
              display: true,
              position: 'right',
              grid: { drawOnChartArea: false },
              title: { display: true, text: 'Temperature (°C)' }
            }
          }
        }
      });
    }
    
    // Real-time update every 30 seconds
    async function updateChart() {
      try {
        const response = await fetch('/api/sessions/${session.id}/chart-data');
        const data = await response.json();
        
        chart.data.labels = data.labels.map(l => new Date(l).toLocaleString());
        chart.data.datasets = data.datasets;
        chart.update('none'); // Update without animation for smoothness
      } catch (e) {
        console.error('Failed to update chart:', e);
      }
    }
    
    initChart();
    setInterval(updateChart, 30000);
    
    // Update when tab becomes visible again
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) updateChart();
    });
  </script>
</body>
</html>`;
    return c.html(html);
  });

  // API: Delete session
  app.delete('/api/sessions/:id', async (c) => {
    const id = c.req.param('id');
    const success = await deleteSession(id);
    if (!success) return c.json({ error: 'Session not found' }, 404);
    
    if (c.req.header('HX-Request')) {
      c.header('HX-Redirect', '/');
      return c.body('');
    }
    
    return c.json({ message: 'Session deleted successfully' });
  });

  return app;
}