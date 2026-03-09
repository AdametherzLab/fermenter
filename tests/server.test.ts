import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { FermentType, FermentStage } from '../src/types.js';
import { createApp } from '../src/server.js';
import { listSessions, deleteSession } from '../src/storage.js';
import * as path from 'path';
import * as os from 'os';
import { promises as fs } from 'fs';

const TEST_DATA_DIR = path.join(os.tmpdir(), `fermenter-test-data-${Date.now()}`);

// Mock the storage path for tests
process.env.FERMENTER_DATA_DIR = TEST_DATA_DIR;

// Dynamically import storage.ts after setting the env var
const { saveSession: testSaveSession } = await import('../src/storage.js');
const { createSession: testCreateSession } = await import('../src/ferment.js');

// Create a dummy Hono app instance for testing API routes
// We don't need to actually serve it, just call its fetch method
const app = new Hono();
// Re-import the server logic to ensure it uses the mocked storage path
const { default: serverApp } = await import('../src/server.js').then(m => ({ default: m.app }));

// Use the serverApp's fetch method for requests
const request = async (method: string, path: string, body?: any) => {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return serverApp.request(req);
};

describe('Web UI and API Endpoints', () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  it('should render the home page with no sessions initially', async () => {
    const res = await request('GET', '/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Your Fermentation Sessions');
    expect(html).toContain('No sessions found. Start a new one!');
  });

  it('should render the new session form', async () => {
    const res = await request('GET', '/session/new');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Start New Fermentation Session');
    expect(html).toContain('<form hx-post="/api/sessions"');
  });

  it('should create a new session via API', async () => {
    const res = await request('POST', '/api/sessions', {
      name: 'Test Beer',
      type: FermentType.BEER,
      startDate: new Date().toISOString(),
    });
    expect(res.status).toBe(201);
    const session = await res.json();
    expect(session.name).toBe('Test Beer');
    expect(session.type).toBe(FermentType.BEER);
    expect(session.id).toBeDefined();

    const sessions = await listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(session.id);
  });

  it('should list sessions via API', async () => {
    const res = await request('GET', '/api/sessions');
    expect(res.status).toBe(200);
    const sessions = await res.json();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe('Test Beer');
  });

  it('should get a specific session by ID via API', async () => {
    const existingSession = (await listSessions())[0];
    const res = await request('GET', `/api/sessions/${existingSession.id}`);
    expect(res.status).toBe(200);
    const session = await res.json();
    expect(session.id).toBe(existingSession.id);
    expect(session.name).toBe('Test Beer');
  });

  it('should add a reading to a session via API', async () => {
    const existingSession = (await listSessions())[0];
    const readingTime = new Date();
    readingTime.setMinutes(readingTime.getMinutes() + 1);

    const res = await request('POST', `/api/sessions/${existingSession.id}/readings`, {
      recordedAt: readingTime.toISOString(),
      specificGravity: 1.045,
      temperature: 20.5,
    });
    expect(res.status).toBe(200);
    const updatedSession = await res.json();
    expect(updatedSession.readings).toHaveLength(1);
    expect(updatedSession.readings[0].specificGravity).toBe(1.045);
    expect(updatedSession.currentStage).toBe(FermentStage.ACTIVE);
  });

  it('should return 400 for invalid reading data', async () => {
    const existingSession = (await listSessions())[0];
    const res = await request('POST', `/api/sessions/${existingSession.id}/readings`, {
      recordedAt: new Date().toISOString(),
      pH: 15, // Invalid pH
    });
    expect(res.status).toBe(400);
    const error = await res.json();
    expect(error.error).toContain('Sensor validation error: Invalid pH: 15');
  });

  it('should render a session page with details and readings', async () => {
    const existingSession = (await listSessions())[0];
    const res = await request('GET', `/session/${existingSession.id}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(existingSession.name);
    expect(html).toContain('Specific Gravity: 1.045');
    expect(html).toContain('Add New Reading');
    expect(html).toContain('<canvas id="gravityChart"></canvas>');
  });

  it('should delete a session via API', async () => {
    const existingSession = (await listSessions())[0];
    const res = await request('DELETE', `/api/sessions/${existingSession.id}`);
    expect(res.status).toBe(200);
    const message = await res.json();
    expect(message.message).toBe('Session deleted successfully');

    const sessions = await listSessions();
    expect(sessions).toHaveLength(0);
  });

  it('should return 404 for non-existent session ID', async () => {
    const res = await request('GET', '/api/sessions/non-existent-id');
    expect(res.status).toBe(404);
    const error = await res.json();
    expect(error.error).toBe('Session not found');
  });

  it('should return 400 for invalid session creation input', async () => {
    const res = await request('POST', '/api/sessions', {
      name: 'Invalid Type Session',
      type: 'NOT_A_TYPE', // Invalid type
    });
    expect(res.status).toBe(400);
    const error = await res.json();
    expect(error.error).toContain('Invalid fermentation type');
  });
});
