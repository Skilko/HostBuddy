const { randomUUID } = require('node:crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { isInitializeRequest } = require('@modelcontextprotocol/sdk/types.js');
const express = require('express');
const z = require('zod');
const { HOSTBUDDY_AI_CONTEXT, buildAiContextMarkdown } = require('./aiContext');

const DEFAULT_PORT = 6274;

let _httpServer = null;
let _connectedClients = 0;
let _port = DEFAULT_PORT;
let _enabled = false;
let _error = null;
let _statusCallback = null;
let _projectChangedCallback = null;
let _projectsStore = null;
let _sessions = {};

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

async function start(projectsStore, settingsStore) {
  _projectsStore = projectsStore;
  _enabled = settingsStore.getMcpEnabled();
  _port = settingsStore.getMcpPort();

  if (!_enabled) {
    _notifyStatus();
    return;
  }

  if (_httpServer) {
    return;
  }

  try {
    const app = express();
    app.use(express.json());

    app.post('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'];
      let transport;

      if (sessionId && _sessions[sessionId]) {
        transport = _sessions[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            _sessions[sid] = transport;
            _connectedClients++;
            _notifyStatus();
          },
        });
        transport.onclose = () => {
          if (transport.sessionId && _sessions[transport.sessionId]) {
            delete _sessions[transport.sessionId];
          }
          _connectedClients = Math.max(0, _connectedClients - 1);
          _notifyStatus();
        };
        const server = _createMcpServer();
        await server.connect(transport);
      } else {
        res.status(400).json({ error: 'Bad Request: missing or invalid session' });
        return;
      }

      try {
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        if (!res.headersSent) res.status(500).json({ error: String(err) });
      }
    });

    app.get('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'];
      if (!sessionId || !_sessions[sessionId]) {
        res.status(400).json({ error: 'Invalid or missing session ID' });
        return;
      }
      try {
        await _sessions[sessionId].handleRequest(req, res);
      } catch (err) {
        if (!res.headersSent) res.status(500).json({ error: String(err) });
      }
    });

    app.delete('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'];
      if (sessionId && _sessions[sessionId]) {
        await _sessions[sessionId].close();
        delete _sessions[sessionId];
        _connectedClients = Math.max(0, _connectedClients - 1);
        _notifyStatus();
      }
      res.status(200).send();
    });

    app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'hostbuddy-mcp', port: _port }));

    await new Promise((resolve, reject) => {
      _httpServer = app.listen(_port, '127.0.0.1', (err) => {
        if (err) { reject(err); return; }
        resolve();
      });
      _httpServer.on('error', reject);
    });

    _error = null;
    _notifyStatus();
  } catch (err) {
    _error = String(err.message || err);
    _httpServer = null;
    _notifyStatus();
  }
}

function stop() {
  if (_httpServer) {
    _httpServer.close();
    _httpServer = null;
  }
  for (const sid of Object.keys(_sessions)) {
    try { _sessions[sid].close(); } catch (_) {}
  }
  _sessions = {};
  _connectedClients = 0;
  _enabled = false;
  _error = null;
  _notifyStatus();
}

module.exports = { start, stop, getStatus, onStatusChange, onProjectChanged };
