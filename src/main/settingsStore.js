const fs = require('fs');
const path = require('path');
const os = require('os');

class SettingsStore {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, 'hostbuddy-settings.json');
    this._cache = null;
  }

  _read() {
    if (this._cache) return this._cache;
    try {
      this._cache = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    } catch (_) {
      this._cache = { version: 1 };
    }
    return this._cache;
  }

  _write(data) {
    this._cache = data;
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  get(key) {
    return this._read()[key];
  }

  set(key, value) {
    const data = { ...this._read(), [key]: value };
    this._write(data);
  }

  getProjectsDir() {
    if (this._resolvedDir) return this._resolvedDir;
    const dir = this.get('projectsDir');
    if (dir && typeof dir === 'string') {
      try {
        fs.mkdirSync(dir, { recursive: true });
        this._resolvedDir = dir;
        return dir;
      } catch (_) {}
    }
    const defaultDir = path.join(os.homedir(), 'Documents', 'HostBuddyProjects');
    fs.mkdirSync(defaultDir, { recursive: true });
    this._resolvedDir = defaultDir;
    return defaultDir;
  }

  setProjectsDir(newPath) {
    const old = this.getProjectsDir();
    this._resolvedDir = null;
    this.set('projectsDir', newPath);
    return old;
  }

  getMcpEnabled() {
    const val = this.get('mcpEnabled');
    return val === undefined ? true : !!val;
  }

  setMcpEnabled(enabled) {
    this.set('mcpEnabled', !!enabled);
  }

  getMcpPort() {
    const val = this.get('mcpPort');
    const port = parseInt(val, 10);
    return port && port >= 1024 && port <= 65535 ? port : 6274;
  }

  setMcpPort(port) {
    this.set('mcpPort', port);
  }

  getTheme() {
    const val = this.get('theme');
    return val === 'light' || val === 'dark' ? val : null;
  }

  setTheme(theme) {
    this.set('theme', theme === 'light' ? 'light' : 'dark');
  }
}

module.exports = SettingsStore;
