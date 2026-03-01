const fs = require('fs');
const os = require('os');
const path = require('path');
const SettingsStore = require('../src/main/settingsStore');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hostbuddy-settings-test-'));
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

  test('set and get persist a value', () => {
    store.set('theme', 'dark');
    expect(store.get('theme')).toBe('dark');

    const store2 = new SettingsStore(dir);
    expect(store2.get('theme')).toBe('dark');
  });

  test('set overwrites existing values', () => {
    store.set('theme', 'dark');
    store.set('theme', 'light');
    expect(store.get('theme')).toBe('light');
  });

  test('getProjectsDir returns default when no directory is configured', () => {
    const result = store.getProjectsDir();
    const expected = path.join(os.homedir(), 'Documents', 'HostBuddyProjects');
    expect(result).toBe(expected);
  });

  test('setProjectsDir updates the stored directory and returns the old one', () => {
    const oldDir = store.getProjectsDir();
    const newDir = makeTempDir();
    const returned = store.setProjectsDir(newDir);
    expect(returned).toBe(oldDir);
    expect(store.getProjectsDir()).toBe(newDir);

    try { fs.rmSync(newDir, { recursive: true, force: true }); } catch (_) {}
  });

  test('settings file is written as valid JSON', () => {
    store.set('projectsDir', '/tmp/test');
    store.set('formatVersion', 2);
    const filePath = path.join(dir, 'hostbuddy-settings.json');
    expect(fs.existsSync(filePath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(data.projectsDir).toBe('/tmp/test');
    expect(data.formatVersion).toBe(2);
    expect(data.version).toBe(1);
  });
});
