const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const ProjectsStore = require('../src/main/projectsStore');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hostbuddy-mcp-test-'));
}

async function mcpPost(port, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Accept': 'application/json, text/event-stream',
        ...headers,
      },
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: raw });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function parseJsonRpcFromResponse(responseBody) {
  // SSE format: lines may start with "event: message\ndata: {...}"
  const dataLines = responseBody.split('\n').filter(l => l.startsWith('data:'));
  if (dataLines.length > 0) {
    return dataLines.map(l => {
      try { return JSON.parse(l.slice(5).trim()); } catch (_) { return null; }
    }).filter(Boolean);
  }
  try { return [JSON.parse(responseBody)]; } catch (_) { return []; }
}

describe('MCP Server', () => {
  let dir, store, mcpServer;
  const TEST_PORT = 16274;

  beforeAll(async () => {
    dir = makeTempDir();
    store = new ProjectsStore(dir);
    mcpServer = require('../src/main/mcpServer');

    const fakeSettings = {
      getMcpEnabled: () => true,
      getMcpPort: () => TEST_PORT,
    };

    await mcpServer.start(store, fakeSettings);
    await new Promise(r => setTimeout(r, 100));
  });

  afterAll(async () => {
    mcpServer.stop();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  });

  async function initSession() {
    const initResp = await mcpPost(TEST_PORT, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0' },
      },
    });
    expect(initResp.status).toBe(200);
    const sessionId = initResp.headers['mcp-session-id'];
    expect(sessionId).toBeTruthy();

    await mcpPost(TEST_PORT, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }, { 'mcp-session-id': sessionId });

    return sessionId;
  }

  async function callTool(sessionId, name, args = {}) {
    const resp = await mcpPost(TEST_PORT, {
      jsonrpc: '2.0',
      id: Math.floor(Math.random() * 10000),
      method: 'tools/call',
      params: { name, arguments: args },
    }, { 'mcp-session-id': sessionId });
    expect(resp.status).toBe(200);
    const messages = parseJsonRpcFromResponse(resp.body);
    const result = messages.find(m => m.result);
    return result ? result.result : null;
  }

  test('getStatus returns enabled and port', () => {
    const status = mcpServer.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.port).toBe(TEST_PORT);
    expect(status.error).toBeNull();
  });

  test('GET /health returns ok', (done) => {
    http.get(`http://127.0.0.1:${TEST_PORT}/health`, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(data);
        expect(body.status).toBe('ok');
        done();
      });
    });
  });

  test('initialize handshake succeeds', async () => {
    const sessionId = await initSession();
    expect(sessionId).toBeTruthy();
  });

  test('tools/list returns expected tools', async () => {
    const sessionId = await initSession();
    const resp = await mcpPost(TEST_PORT, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    }, { 'mcp-session-id': sessionId });
    expect(resp.status).toBe(200);
    const messages = parseJsonRpcFromResponse(resp.body);
    const toolsResult = messages.find(m => m.result && m.result.tools);
    expect(toolsResult).toBeTruthy();
    const names = toolsResult.result.tools.map(t => t.name);
    expect(names).toContain('get_documentation');
    expect(names).toContain('list_projects');
    expect(names).toContain('get_project');
    expect(names).toContain('create_project');
    expect(names).toContain('update_project');
    expect(names).toContain('delete_project');
  });

  test('get_documentation returns AI context text', async () => {
    const sessionId = await initSession();
    const result = await callTool(sessionId, 'get_documentation');
    expect(result).toBeTruthy();
    expect(result.content[0].text).toContain('HostBuddy');
    expect(result.content[0].text).toContain('CLIENT-SIDE ONLY');
  });

  test('list_projects returns empty array initially', async () => {
    const sessionId = await initSession();
    const result = await callTool(sessionId, 'list_projects');
    expect(result).toBeTruthy();
    const projects = JSON.parse(result.content[0].text);
    expect(Array.isArray(projects)).toBe(true);
  });

  test('create_project creates and returns a project', async () => {
    const sessionId = await initSession();
    const result = await callTool(sessionId, 'create_project', {
      title: 'MCP Test App',
      code: '<html><body><h1>Hello from MCP</h1></body></html>',
      description: 'Created via MCP test',
    });
    expect(result).toBeTruthy();
    const created = JSON.parse(result.content[0].text);
    expect(created.id).toBeTruthy();
    expect(created.title).toBe('MCP Test App');
  });

  test('list_projects shows created project', async () => {
    const sessionId = await initSession();
    await callTool(sessionId, 'create_project', {
      title: 'Listed App',
      code: '<p>test</p>',
    });
    const listResult = await callTool(sessionId, 'list_projects');
    const projects = JSON.parse(listResult.content[0].text);
    expect(projects.some(p => p.title === 'Listed App')).toBe(true);
  });

  test('get_project returns project with code', async () => {
    const sessionId = await initSession();
    const createResult = await callTool(sessionId, 'create_project', {
      title: 'Get Me',
      code: '<b>get project code</b>',
    });
    const { id } = JSON.parse(createResult.content[0].text);

    const getResult = await callTool(sessionId, 'get_project', { id });
    const project = JSON.parse(getResult.content[0].text);
    expect(project.title).toBe('Get Me');
    expect(project.code).toBe('<b>get project code</b>');
  });

  test('update_project modifies title and code', async () => {
    const sessionId = await initSession();
    const createResult = await callTool(sessionId, 'create_project', {
      title: 'Original Title',
      code: '<p>original</p>',
    });
    const { id } = JSON.parse(createResult.content[0].text);

    const updateResult = await callTool(sessionId, 'update_project', {
      id,
      title: 'Updated Title',
      code: '<p>updated</p>',
    });
    const updated = JSON.parse(updateResult.content[0].text);
    expect(updated.title).toBe('Updated Title');

    const getResult = await callTool(sessionId, 'get_project', { id });
    const project = JSON.parse(getResult.content[0].text);
    expect(project.code).toBe('<p>updated</p>');
  });

  test('delete_project removes project', async () => {
    const sessionId = await initSession();
    const createResult = await callTool(sessionId, 'create_project', {
      title: 'Delete Me',
      code: '<p>bye</p>',
    });
    const { id } = JSON.parse(createResult.content[0].text);

    const deleteResult = await callTool(sessionId, 'delete_project', { id });
    expect(deleteResult.content[0].text).toContain('deleted successfully');

    const listResult = await callTool(sessionId, 'list_projects');
    const projects = JSON.parse(listResult.content[0].text);
    expect(projects.some(p => p.id === id)).toBe(false);
  });

  test('POST without session on non-initialize returns 400', async () => {
    const resp = await mcpPost(TEST_PORT, {
      jsonrpc: '2.0',
      id: 99,
      method: 'tools/list',
    });
    expect(resp.status).toBe(400);
  });
});
