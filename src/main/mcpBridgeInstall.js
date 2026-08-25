const fs = require('fs');
const path = require('path');

const BRIDGE_SOURCE = path.join(__dirname, '..', 'mcp', 'hostbuddy-mcp-bridge.js');

/**
 * Copy the stdio bridge out of the app bundle into userData.
 *
 * It has to live outside the asar archive (a plain `node` process cannot read
 * files inside one) and at a path that stays stable across app updates, since
 * users paste that path into claude_desktop_config.json.
 *
 * Returns the installed path, or null if it could not be written.
 */
function installBridge(userDataDir) {
  try {
    const targetDir = path.join(userDataDir, 'mcp');
    const target = path.join(targetDir, 'hostbuddy-mcp-bridge.js');
    const source = fs.readFileSync(BRIDGE_SOURCE, 'utf8');
    let current = null;
    try { current = fs.readFileSync(target, 'utf8'); } catch (_) {}
    if (current !== source) {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(target, source, { mode: 0o755 });
    }
    return target;
  } catch (err) {
    console.error('Failed to install MCP bridge:', err);
    return null;
  }
}

/** The claude_desktop_config.json entry for the installed bridge. */
function buildClaudeDesktopConfig(bridgePath, execPath, port) {
  return JSON.stringify({
    mcpServers: {
      hostbuddy: {
        command: execPath,
        args: [bridgePath, '--port', String(port)],
        env: { ELECTRON_RUN_AS_NODE: '1' },
      },
    },
  }, null, 2);
}

module.exports = { installBridge, buildClaudeDesktopConfig };
