import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { FermentType } from '../src/types.js';
import { createApp } from '../src/server.js';
import { listSessions, deleteSession } from '../src/storage.js';

describe('Charting Endpoints', () => {
  let testSessionId: string;
  
  beforeAll(async () => {
    // Create a test session
    const session = createSession({ name: 'Chart Test', type: FermentType.BEER });
    testSessionId = session.id;
    await saveSession(session);
  });

  afterAll(async () => {
    await deleteSession(testSessionId);
  });

  it('should return chart data for valid session', async () => {
    const res = await request('GET', `/api/sessions/${testSessionId}/chart`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('labels');
    expect(data).toHaveProperty('datasets');
    expect(data.datasets).toBeInstanceOf(Array);
  });

  it('should return 404 for invalid session chart', async () => {
    const res = await request('GET', '/api/sessions/invalid-id/chart');
    expect(res.status).toBe(404);
  });

  it('should connect to real-time event stream', async () => {
    const res = await request('GET', `/api/sessions/${testSessionId}/events`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
  });
});
