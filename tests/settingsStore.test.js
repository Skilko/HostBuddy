const fs = require('fs');
const os = require('os');
const path = require('path');
const SettingsStore = require('../src/main/settingsStore');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hostbuddy-settings-'));
}

describe('SettingsStore', () => {
  let dir, store;

  beforeEach(() => {
    dir = makeTempDir();
    store = new SettingsStore(dir);
  });

  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  });

  test('get returns undefined for unset keys', () => {
    expect(store.get('nonexistent')).toBeUndefined();
  });

  test('set and get round-trip', () => {
    store.set('theme', 'dark');
    expect(store.get('theme')).toBe('dark');
  });

  test('persists to disk', () => {
    store.set('key', 'value');
    const store2 = new SettingsStore(dir);
    expect(store2.get('key')).toBe('value');
  });

  test('getProjectsDir returns default when not configured', () => {
    const defaultDir = store.getProjectsDir();
    expect(defaultDir).toBeTruthy();
    expect(defaultDir.includes('HostBuddyProjects')).toBe(true);
  });

  test('setProjectsDir updates and returns old path', () => {
    const oldDir = store.getProjectsDir();
    const newDir = path.join(dir, 'custom-projects');
    fs.mkdirSync(newDir, { recursive: true });
    const returned = store.setProjectsDir(newDir);
    expect(returned).toBe(oldDir);
    expect(store.getProjectsDir()).toBe(newDir);
  });

  test('handles corrupted settings file gracefully', () => {
    fs.writeFileSync(path.join(dir, 'hostbuddy-settings.json'), 'not json!!!');
    const store2 = new SettingsStore(dir);
    expect(store2.get('anything')).toBeUndefined();
    store2.set('recovered', true);
    expect(store2.get('recovered')).toBe(true);
  });
});
