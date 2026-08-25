#!/usr/bin/env node
/**
 * HostBuddy MCP stdio bridge.
 *
 * Claude Desktop only speaks stdio, while HostBuddy exposes Streamable HTTP on
 * localhost. This script bridges the two. It exists instead of `npx mcp-remote`
 * because mcp-remote treats a closed HostBuddy as a fatal error and exits, which
 * makes Claude Desktop mark the server as permanently disconnected until Claude
 * itself is restarted.
 *
 * This bridge never exits while its stdin is open:
 *   - HostBuddy down at startup  -> answers `initialize` itself, serves a cached
 *                                   tool list, and reports a friendly error for calls
 *   - HostBuddy starts later     -> notices within seconds and pushes listChanged
 *   - HostBuddy restarts         -> the next request simply succeeds again
 *
 * Zero dependencies: runnable by any Node 18+, or by Electron with
 * ELECTRON_RUN_AS_NODE=1.
 *
 * Usage: node hostbuddy-mcp-bridge.js [--port 6274] [--url http://127.0.0.1:6274/mcp]
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROTOCOL_VERSION = '2025-06-18';
const HEALTH_POLL_MS = 5000;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') out.port = parseInt(argv[++i], 10);
    else if (a === '--url') out.url = argv[++i];
    else if (a.startsWith('--port=')) out.port = parseInt(a.slice(7), 10);
    else if (a.startsWith('--url=')) out.url = a.slice(6);
    else if (/^https?:\/\//.test(a)) out.url = a;
    else if (/^\d+$/.test(a)) out.port = parseInt(a, 10);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const PORT = args.port || parseInt(process.env.HOSTBUDDY_MCP_PORT, 10) || 6274;
const ENDPOINT = args.url || `http://127.0.0.1:${PORT}/mcp`;
const TARGET = new URL(ENDPOINT);

const CACHE_FILE = path.join(
  process.env.HOSTBUDDY_MCP_CACHE_DIR || os.tmpdir(),
  `hostbuddy-mcp-bridge-${TARGET.port || '80'}.json`
);

function log(...parts) {
  process.stderr.write(`[hostbuddy-bridge] ${parts.join(' ')}\n`);
}

// ---------------------------------------------------------------- cached shape

let cache = { tools: [], resources: [] };
try {
  const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  if (raw && Array.isArray(raw.tools)) cache = raw;
} catch (_) { /* first run, or unreadable cache */ }

function saveCache() {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)); } catch (_) {}
}

// ------------------------------------------------------------------- HTTP side

let sessionId = null;
let upstreamUp = null; // null = unknown yet

function post(body, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body), 'utf8');
    const headers = {
      'content-type': 'application/json',
      'content-length': payload.length,
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': PROTOCOL_VERSION,
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;

    const req = http.request(
      { host: TARGET.hostname, port: TARGET.port, path: TARGET.pathname, method: 'POST', headers },
      (res) => {
        const sid = res.headers['mcp-session-id'];
        if (sid) sessionId = sid;
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { raw += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: raw }));
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
    req.end(payload);
  });
}

/** Responses arrive either as plain JSON or as a one-shot SSE frame. */
function extractMessage(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed); } catch (_) { return null; }
  }
  for (const line of trimmed.split('\n')) {
    if (!line.startsWith('data:')) continue;
    try {
      const msg = JSON.parse(line.slice(5).trim());
      if (msg && msg.id !== undefined) return msg;
    } catch (_) { /* keep scanning */ }
  }
  return null;
}

/** Forward one message upstream. Returns null when HostBuddy is unreachable. */
async function forward(message) {
  try {
    const res = await post(message);
    if (res.status === 404 || res.status === 400) {
      // Session went away (HostBuddy restarted). Drop it and retry once clean.
      sessionId = null;
      const retry = await post(message);
      markUp();
      return extractMessage(retry.body);
    }
    markUp();
    return extractMessage(res.body);
  } catch (err) {
    markDown(err);
    return null;
  }
}

function markUp() {
  if (upstreamUp === true) return;
  const first = upstreamUp === null;
  upstreamUp = true;
  if (!first) log('HostBuddy is back — refreshing tools');
  refreshCatalog();
}

function markDown(err) {
  if (upstreamUp === false) return;
  upstreamUp = false;
  log(`HostBuddy is not reachable on ${ENDPOINT}${err ? ` (${err.message})` : ''}; waiting for it to start`);
}

// ------------------------------------------------------------------ stdio side

function write(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function respond(id, result) {
  if (id === undefined || id === null) return;
  write({ jsonrpc: '2.0', id, result });
}

function respondError(id, code, message) {
  if (id === undefined || id === null) return;
  write({ jsonrpc: '2.0', id, error: { code, message } });
}

function offlineToolResult(id) {
  respond(id, {
    isError: true,
    content: [{
      type: 'text',
      text: `HostBuddy is not running, so this action could not be completed. Ask the user to open the HostBuddy app (its MCP server listens on ${ENDPOINT}), then try again.`,
    }],
  });
}

/** Re-read the tool/resource catalog so we can serve it while HostBuddy is down. */
let refreshing = false;
async function refreshCatalog() {
  if (refreshing) return;
  refreshing = true;
  try {
    const before = JSON.stringify(cache);
    const tools = await forward({ jsonrpc: '2.0', id: 'bridge-tools', method: 'tools/list', params: {} });
    if (tools && tools.result && Array.isArray(tools.result.tools)) cache.tools = tools.result.tools;
    const resources = await forward({ jsonrpc: '2.0', id: 'bridge-resources', method: 'resources/list', params: {} });
    if (resources && resources.result && Array.isArray(resources.result.resources)) cache.resources = resources.result.resources;
    if (JSON.stringify(cache) !== before) {
      saveCache();
      if (clientInitialized) {
        write({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
        write({ jsonrpc: '2.0', method: 'notifications/resources/list_changed' });
      }
    }
  } finally {
    refreshing = false;
  }
}

let clientInitialized = false;

async function handle(message) {
  const { id, method } = message;

  // Notifications and responses: best effort, nothing to answer.
  if (id === undefined || id === null) {
    if (method === 'notifications/initialized') clientInitialized = true;
    forward(message).catch(() => {});
    return;
  }

  const upstream = await forward(message);
  if (upstream) {
    if (method === 'tools/list' && upstream.result && Array.isArray(upstream.result.tools)) {
      cache.tools = upstream.result.tools;
      saveCache();
    }
    if (method === 'resources/list' && upstream.result && Array.isArray(upstream.result.resources)) {
      cache.resources = upstream.result.resources;
      saveCache();
    }
    write(upstream);
    return;
  }

  // ---- HostBuddy is down: answer locally so the client stays connected. ----
  switch (method) {
    case 'initialize':
      respond(id, {
        protocolVersion: (message.params && message.params.protocolVersion) || PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: true }, resources: { listChanged: true } },
        serverInfo: { name: 'hostbuddy', version: 'bridge' },
      });
      return;
    case 'tools/list':
      respond(id, { tools: cache.tools });
      return;
    case 'resources/list':
      respond(id, { resources: cache.resources });
      return;
    case 'resources/templates/list':
      respond(id, { resourceTemplates: [] });
      return;
    case 'prompts/list':
      respond(id, { prompts: [] });
      return;
    case 'ping':
      respond(id, {});
      return;
    case 'tools/call':
      offlineToolResult(id);
      return;
    default:
      respondError(id, -32603, `HostBuddy is not running (no server at ${ENDPOINT})`);
  }
}

let inflight = 0;
let stdinClosed = false;

/** Do not exit while a reply is still being produced. */
function drain() {
  if (stdinClosed && inflight === 0) process.exit(0);
}

function dispatch(message) {
  inflight++;
  handle(message)
    .catch((err) => log('handler error:', err.message))
    .then(() => { inflight--; drain(); });
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let message;
    try { message = JSON.parse(line); } catch (_) { continue; }
    const batch = Array.isArray(message) ? message : [message];
    for (const m of batch) dispatch(m);
  }
});
process.stdin.on('end', () => { stdinClosed = true; drain(); });
process.stdin.on('close', () => { stdinClosed = true; drain(); });

// Poll so a HostBuddy launch is noticed without the user having to prod Claude.
const healthTimer = setInterval(() => {
  const req = http.request(
    { host: TARGET.hostname, port: TARGET.port, path: '/health', method: 'GET', timeout: 2000 },
    (res) => { res.resume(); if (res.statusCode === 200) markUp(); else markDown(); }
  );
  req.on('error', () => markDown());
  req.on('timeout', () => req.destroy());
  req.end();
}, HEALTH_POLL_MS);
healthTimer.unref();

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
