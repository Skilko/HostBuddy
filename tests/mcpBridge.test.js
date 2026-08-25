const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ProjectsStore = require('../src/main/projectsStore');

const BRIDGE = path.join(__dirname, '..', 'src', 'mcp', 'hostbuddy-mcp-bridge.js');
const PORT = 16344;

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Minimal stdio client for the bridge. */
function startBridge(cacheDir) {
  const proc = spawn(process.execPath, [BRIDGE, '--port', String(PORT)], {
    env: { ...process.env, HOSTBUDDY_MCP_CACHE_DIR: cacheDir },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map();
  const notifications = [];
  let buffer = '';
  proc.stderr.resume();
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (_) { continue; }
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      } else if (msg.method) {
        notifications.push(msg.method);
      }
    }
  });
  return {
    proc,
    notifications,
    send(message) {
      proc.stdin.write(JSON.stringify(message) + '\n');
      if (message.id === undefined) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (pending.delete(message.id)) reject(new Error(`timed out waiting for id ${message.id}`));
        }, 20000);
        pending.set(message.id, (msg) => { clearTimeout(timer); resolve(msg); });
      });
    },
    kill() { proc.kill(); },
  };
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

describe('MCP stdio bridge', () => {
  let cacheDir, storeDir, mcpServer, bridge, id = 0;
  const nextId = () => ++id;

  beforeAll(() => {
    cacheDir = makeTempDir('hostbuddy-bridge-cache-');
    storeDir = makeTempDir('hostbuddy-bridge-store-');
    mcpServer = require('../src/main/mcpServer');
    bridge = startBridge(cacheDir);
  });

  afterAll(async () => {
    bridge.kill();
    await mcpServer.stop();
    for (const d of [cacheDir, storeDir]) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
    }
  });

  test('initialize succeeds while HostBuddy is not running', async () => {
    const res = await bridge.send({
      jsonrpc: '2.0', id: nextId(), method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'jest', version: '1' } },
    });
    expect(res.result).toBeTruthy();
    expect(res.result.serverInfo.name).toBe('hostbuddy');
    await bridge.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  });

  test('tools/call while HostBuddy is down returns a tool error, not a transport failure', async () => {
    const res = await bridge.send({
      jsonrpc: '2.0', id: nextId(), method: 'tools/call',
      params: { name: 'list_projects', arguments: {} },
    });
    expect(res.error).toBeUndefined();
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toMatch(/HostBuddy is not running/);
  });

  test('bridge picks HostBuddy up on its own once it starts', async () => {
    await mcpServer.start(new ProjectsStore(storeDir), {
      getMcpEnabled: () => true,
      getMcpPort: () => PORT,
    });
    expect(mcpServer.getStatus().error).toBeNull();

    // The bridge polls /health every 5s.
    for (let i = 0; i < 20 && !bridge.notifications.includes('notifications/tools/list_changed'); i++) {
      await wait(500);
    }
    expect(bridge.notifications).toContain('notifications/tools/list_changed');

    const res = await bridge.send({ jsonrpc: '2.0', id: nextId(), method: 'tools/list', params: {} });
    expect(res.result.tools.map(t => t.name)).toContain('create_project');
  }, 30000);

  test('tool calls keep working after HostBuddy restarts', async () => {
    const created = await bridge.send({
      jsonrpc: '2.0', id: nextId(), method: 'tools/call',
      params: { name: 'create_project', arguments: { title: 'Bridge Survivor', code: '<p>hi</p>' } },
    });
    expect(created.result.isError).toBeFalsy();

    // Restart the HTTP server: every session it knew about is gone.
    await mcpServer.stop();
    await mcpServer.start(new ProjectsStore(storeDir), {
      getMcpEnabled: () => true,
      getMcpPort: () => PORT,
    });

    const listed = await bridge.send({
      jsonrpc: '2.0', id: nextId(), method: 'tools/call',
      params: { name: 'list_projects', arguments: {} },
    });
    expect(listed.result.isError).toBeFalsy();
    expect(listed.result.content[0].text).toContain('Bridge Survivor');
  }, 30000);

  test('a fresh bridge serves the cached tool list while HostBuddy is down', async () => {
    await mcpServer.stop();
    const cold = startBridge(cacheDir);
    try {
      await cold.send({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'jest', version: '1' } },
      });
      const res = await cold.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
      expect(res.result.tools.length).toBeGreaterThan(0);
    } finally {
      cold.kill();
    }
  }, 30000);
});
