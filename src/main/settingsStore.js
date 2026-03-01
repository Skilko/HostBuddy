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
    const dir = this.get('projectsDir');
    if (dir && typeof dir === 'string') {
      try {
        fs.mkdirSync(dir, { recursive: true });
        return dir;
      } catch (_) {}
    }
    const defaultDir = path.join(os.homedir(), 'Documents', 'HostBuddyProjects');
    fs.mkdirSync(defaultDir, { recursive: true });
    return defaultDir;
  }

  setProjectsDir(newPath) {
    const old = this.getProjectsDir();
    this.set('projectsDir', newPath);
    return old;
  }
}

module.exports = SettingsStore;
