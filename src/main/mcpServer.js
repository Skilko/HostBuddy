const { randomUUID } = require('node:crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { isInitializeRequest } = require('@modelcontextprotocol/sdk/types.js');
const express = require('express');
const z = require('zod');
const { HOSTBUDDY_AI_CONTEXT, buildAiContextMarkdown } = require('./aiContext');

const DEFAULT_PORT = 6274;
// Project code (and the AI-context markdown built from it) can be large; the express
// default of 100kb would reject bigger tools/call payloads with an HTML 413.
const MAX_BODY_SIZE = '64mb';
// Bound how many idle sessions we hold on to. Stale ones are recoverable (see the
// stateless fallback in the POST handler), so evicting the oldest is always safe.
const MAX_SESSIONS = 32;

let _httpServer = null;
let _connectedClients = 0;
let _port = DEFAULT_PORT;
let _enabled = false;
let _error = null;
let _statusCallback = null;
let _projectChangedCallback = null;
let _projectsStore = null;
let _settingsStore = null;
let _sessions = {};
let _sessionLastSeen = {};
let _sockets = new Set();

function getStatus() {
  return {
    enabled: _enabled,
    port: _port,
    connectedClients: _connectedClients,
    error: _error,
  };
}

function _notifyStatus() {
  if (_statusCallback) _statusCallback(getStatus());
}

function onStatusChange(cb) {
  _statusCallback = cb;
}

function onProjectChanged(cb) {
  _projectChangedCallback = cb;
}

function _notifyProjectChanged() {
  if (_projectChangedCallback) _projectChangedCallback();
}

function _createMcpServer() {
  const server = new McpServer({ name: 'hostbuddy', version: '1.0.0' });

  server.registerTool('get_documentation', {
    description: 'Get the full HostBuddy documentation: what a HostBuddy project is, code format constraints, architecture requirements, and how to create compatible apps.',
  }, async () => {
    return {
      content: [{ type: 'text', text: HOSTBUDDY_AI_CONTEXT }],
    };
  });

  server.registerTool('list_projects', {
    description: 'List all HostBuddy projects. Returns id, title, description, and creation date for each project.',
  }, async () => {
    if (!_projectsStore) throw new Error('ProjectsStore not available');
    const projects = _projectsStore.getAll();
    const summary = projects.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description || '',
      createdAt: p.createdAt,
    }));
    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
    };
  });

  server.registerTool('get_project', {
    description: 'Get the full details of a HostBuddy project including its code and attachment filenames.',
    inputSchema: z.object({
      id: z.string().describe('The project ID'),
    }),
  }, async ({ id }) => {
    if (!_projectsStore) throw new Error('ProjectsStore not available');
    const project = _projectsStore.getById(id);
    if (!project) throw new Error(`Project not found: ${id}`);
    const result = {
      id: project.id,
      title: project.title,
      description: project.description || '',
      code: project.code || '',
      offline: !!project.offline,
      mainFile: project.mainFile || 'index.html',
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      attachments: (project.attachments || []).map(a => ({ filename: a.filename, mimeType: a.mimeType })),
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool('get_project_for_ai', {
    description: 'Get a HostBuddy project formatted as a full AI context markdown document, ready to paste into an AI chat for updating or extending the project.',
    inputSchema: z.object({
      id: z.string().describe('The project ID'),
    }),
  }, async ({ id }) => {
    if (!_projectsStore) throw new Error('ProjectsStore not available');
    const project = _projectsStore.getById(id);
    if (!project) throw new Error(`Project not found: ${id}`);
    return {
      content: [{ type: 'text', text: buildAiContextMarkdown(project) }],
    };
  });

  server.registerTool('create_project', {
    description: 'Create a new HostBuddy project. The code must be either a complete self-contained HTML document or a single React file with a default export. Returns the created project.',
    inputSchema: z.object({
      title: z.string().describe('The project title (required)'),
      code: z.string().describe('The project code: a complete HTML document or a single React .tsx/.jsx file with a default export (required)'),
      description: z.string().optional().describe('A short description of what the project does'),
      offline: z.boolean().optional().describe('If true, dependencies are downloaded once and cached for offline use'),
    }),
  }, async ({ title, code, description, offline }) => {
    if (!_projectsStore) throw new Error('ProjectsStore not available');
    if (!title || !code) throw new Error('title and code are required');
    const project = _projectsStore.create({
      title: String(title),
      code: String(code),
      description: description ? String(description) : '',
      offline: !!offline,
      attachments: [],
    });
    _notifyProjectChanged();
    return {
      content: [{ type: 'text', text: JSON.stringify({ id: project.id, title: project.title, createdAt: project.createdAt }, null, 2) }],
    };
  });

  server.registerTool('update_project', {
    description: 'Update an existing HostBuddy project. Only provided fields are updated.',
    inputSchema: z.object({
      id: z.string().describe('The project ID to update'),
      title: z.string().optional().describe('New title'),
      code: z.string().optional().describe('New code (complete HTML document or single React file)'),
      description: z.string().optional().describe('New description'),
      offline: z.boolean().optional().describe('New offline mode setting'),
    }),
  }, async ({ id, title, code, description, offline }) => {
    if (!_projectsStore) throw new Error('ProjectsStore not available');
    const updates = {};
    if (title !== undefined) updates.title = String(title);
    if (code !== undefined) updates.code = String(code);
    if (description !== undefined) updates.description = String(description);
    if (offline !== undefined) updates.offline = !!offline;
    if (Object.keys(updates).length === 0) throw new Error('No fields provided to update');
    const updated = _projectsStore.update(id, updates);
    if (!updated) throw new Error(`Project not found: ${id}`);
    _notifyProjectChanged();
    return {
      content: [{ type: 'text', text: JSON.stringify({ id: updated.id, title: updated.title, updatedAt: updated.updatedAt }, null, 2) }],
    };
  });

  server.registerTool('delete_project', {
    description: 'Delete a HostBuddy project permanently.',
    inputSchema: z.object({
      id: z.string().describe('The project ID to delete'),
    }),
  }, async ({ id }) => {
    if (!_projectsStore) throw new Error('ProjectsStore not available');
    const deleted = _projectsStore.delete(id);
    if (!deleted) throw new Error(`Project not found: ${id}`);
    _notifyProjectChanged();
    return {
      content: [{ type: 'text', text: `Project ${id} deleted successfully.` }],
    };
  });

  server.registerResource('hostbuddy://docs/context', 'HostBuddy AI Context', async () => {
    return {
      contents: [{ uri: 'hostbuddy://docs/context', mimeType: 'text/plain', text: HOSTBUDDY_AI_CONTEXT }],
    };
  });

  return server;
}

function _touchSession(sid) {
  _sessionLastSeen[sid] = Date.now();
  const ids = Object.keys(_sessions);
  if (ids.length <= MAX_SESSIONS) return;
  ids
    .sort((a, b) => (_sessionLastSeen[a] || 0) - (_sessionLastSeen[b] || 0))
    .slice(0, ids.length - MAX_SESSIONS)
    .forEach(_dropSession);
}

function _dropSession(sid) {
  const transport = _sessions[sid];
  delete _sessions[sid];
  delete _sessionLastSeen[sid];
  _connectedClients = Object.keys(_sessions).length;
  if (transport) {
    Promise.resolve(transport.close()).catch(() => {});
  }
  _notifyStatus();
}

/**
 * Handle one request without any session state: a throwaway server + transport that
 * lives for the duration of the request.
 *
 * This is the recovery path for a client holding a session ID we no longer know about
 * — most often because HostBuddy restarted while the client (e.g. Claude Desktop via
 * mcp-remote) kept running. Those clients never re-issue `initialize` on their own, so
 * answering with 400 used to wedge them permanently until the client itself restarted.
 */
async function _handleStateless(req, res) {
  const server = _createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const cleanup = () => {
    Promise.resolve(transport.close()).catch(() => {});
    Promise.resolve(server.close()).catch(() => {});
  };
  res.on('close', cleanup);
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

function _buildApp() {
  const app = express();
  app.use(express.json({ limit: MAX_BODY_SIZE }));

  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    let transport;

    if (isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          _sessions[sid] = transport;
          _touchSession(sid);
          _connectedClients = Object.keys(_sessions).length;
          _notifyStatus();
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) _dropSession(transport.sessionId);
      };
      const server = _createMcpServer();
      await server.connect(transport);
    } else if (sessionId && _sessions[sessionId]) {
      transport = _sessions[sessionId];
      _touchSession(sessionId);
    } else {
      // Unknown or missing session: serve the request statelessly rather than
      // failing it, so a client that outlived the previous server keeps working.
      try {
        await _handleStateless(req, res);
      } catch (err) {
        if (!res.headersSent) res.status(500).json({ error: String(err) });
      }
      return;
    }

    try {
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: String(err) });
    }
  });

  // HostBuddy never initiates messages to the client, so we do not offer the optional
  // standalone SSE stream. 405 is the spec'd "no SSE here" answer and clients treat it
  // as expected. Holding that stream open was the source of the 5-minute
  // "SSE stream disconnected: terminated" reconnect loops.
  app.get('/mcp', (_req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method Not Allowed: this server does not offer a standalone SSE stream' },
      id: null,
    });
  });

  app.delete('/mcp', (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    if (sessionId && _sessions[sessionId]) _dropSession(sessionId);
    res.status(200).send();
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'hostbuddy-mcp', port: _port }));

  return app;
}

async function start(projectsStore, settingsStore) {
  _projectsStore = projectsStore;
  _settingsStore = settingsStore;
  _enabled = settingsStore.getMcpEnabled();
  const wantedPort = settingsStore.getMcpPort();

  if (!_enabled) {
    _notifyStatus();
    return;
  }

  if (_httpServer) {
    if (wantedPort === _port) return;
    await _closeHttpServer();
  }

  _port = wantedPort;

  try {
    const app = _buildApp();

    await new Promise((resolve, reject) => {
      const server = app.listen(_port, '127.0.0.1');
      const onListenError = (err) => { server.close(); reject(err); };
      server.once('error', onListenError);
      server.once('listening', () => {
        server.off('error', onListenError);
        // Node kills any request still open after requestTimeout (5 min by default),
        // which would tear down long-running tool calls mid-flight.
        server.requestTimeout = 0;
        server.headersTimeout = 0;
        server.timeout = 0;
        server.keepAliveTimeout = 72000;
        server.on('connection', (socket) => {
          _sockets.add(socket);
          socket.on('close', () => _sockets.delete(socket));
        });
        server.on('error', (err) => {
          _error = String(err.message || err);
          _notifyStatus();
        });
        _httpServer = server;
        resolve();
      });
    });

    _error = null;
    _notifyStatus();
  } catch (err) {
    _httpServer = null;
    _error = err && err.code === 'EADDRINUSE'
      ? `Port ${_port} is already in use — change the MCP port in Settings.`
      : String((err && err.message) || err);
    _notifyStatus();
  }
}

function _closeHttpServer() {
  return new Promise((resolve) => {
    const server = _httpServer;
    _httpServer = null;
    for (const sid of Object.keys(_sessions)) {
      try { _sessions[sid].close(); } catch (_) {}
    }
    _sessions = {};
    _sessionLastSeen = {};
    _connectedClients = 0;
    if (!server) { resolve(); return; }
    let settled = false;
    const finish = () => { if (settled) return; settled = true; clearTimeout(fallback); resolve(); };
    // close() only stops new connections; drop the idle keep-alive ones too so the
    // port is free immediately for a restart on a different port.
    server.close(finish);
    for (const socket of _sockets) {
      try { socket.destroy(); } catch (_) {}
    }
    _sockets.clear();
    const fallback = setTimeout(finish, 500);
    if (fallback.unref) fallback.unref();
  });
}

/** Restart on the port currently stored in settings. */
async function restart() {
  await _closeHttpServer();
  if (_projectsStore && _settingsStore) await start(_projectsStore, _settingsStore);
}

function stop() {
  const closing = _closeHttpServer();
  _enabled = false;
  _error = null;
  _notifyStatus();
  return closing;
}

module.exports = { start, stop, restart, getStatus, onStatusChange, onProjectChanged };
