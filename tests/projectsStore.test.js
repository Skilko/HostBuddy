const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const ProjectsStore = require('../src/main/projectsStore');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hostbuddy-test-'));
}

describe('ProjectsStore (ZIP-based)', () => {
  let dir, store;

  beforeEach(() => {
    dir = makeTempDir();
    store = new ProjectsStore(dir);
  });

  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  });

  test('create produces a .hbproject ZIP file', () => {
    const p = store.create({ title: 'Test', description: 'A test', code: '<h1>Hello</h1>' });
    expect(p.id).toBeTruthy();
    expect(p.title).toBe('Test');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.hbproject'));
    expect(files.length).toBe(1);

    const zip = new AdmZip(path.join(dir, files[0]));
    const manifest = JSON.parse(zip.readAsText('manifest.json'));
    expect(manifest.id).toBe(p.id);
    expect(manifest.title).toBe('Test');
    expect(manifest.mainFile).toBe('index.html');
    expect(zip.readAsText('files/index.html')).toBe('<h1>Hello</h1>');
  });

  test('getAll returns metadata without code', () => {
    store.create({ title: 'A', code: '<p>A</p>' });
    store.create({ title: 'B', code: '<p>B</p>' });
    const all = store.getAll();
    expect(all.length).toBe(2);
    expect(all[0].title).toBe('A');
    expect(all[0].code).toBeUndefined();
  });

  test('getById returns full project with code and attachments', () => {
    const p = store.create({
      title: 'Full', code: '<p>Full</p>',
      attachments: [{ filename: 'pic.png', mimeType: 'image/png', data: 'data:image/png;base64,iVBORw0KGgo=' }]
    });
    const full = store.getById(p.id);
    expect(full.code).toBe('<p>Full</p>');
    expect(full.attachments.length).toBe(1);
    expect(full.attachments[0].filename).toBe('pic.png');
  });

  test('update modifies the ZIP and index', () => {
    const p = store.create({ title: 'Old', code: '<p>Old</p>' });
    const updated = store.update(p.id, { title: 'New', code: '<p>New</p>' });
    expect(updated.title).toBe('New');
    expect(updated.code).toBe('<p>New</p>');

    const fromDisk = store.getById(p.id);
    expect(fromDisk.title).toBe('New');
    expect(fromDisk.code).toBe('<p>New</p>');

    const allTitles = store.getAll().map(p => p.title);
    expect(allTitles).toContain('New');
    expect(allTitles).not.toContain('Old');
  });

  test('delete removes the ZIP file and index entry', () => {
    const p = store.create({ title: 'Gone', code: '<p>Gone</p>' });
    expect(store.getAll().length).toBe(1);
    const deleted = store.delete(p.id);
    expect(deleted).toBe(true);
    expect(store.getAll().length).toBe(0);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.hbproject'));
    expect(files.length).toBe(0);
  });

  test('delete returns false for unknown id', () => {
    expect(store.delete('nonexistent')).toBe(false);
  });

  test('getProjectFilePath returns the .hbproject file path', () => {
    const p = store.create({ title: 'Path Test', code: '<p>Path</p>' });
    const fp = store.getProjectFilePath(p.id);
    expect(fp).toBeTruthy();
    expect(fs.existsSync(fp)).toBe(true);
    expect(fp.endsWith('.hbproject')).toBe(true);
  });

  test('icon is stored as binary in ZIP and returned as base64', () => {
    const icon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAA0lEQVQI12P4z8BQDwAEgAF/QualrQAAAABJRU5ErkJggg==';
    const p = store.create({ title: 'Icon', code: '<p>Icon</p>', iconBase64: icon });
    const full = store.getById(p.id);
    expect(full.iconBase64).toBeTruthy();
    expect(full.iconBase64.startsWith('data:image/')).toBe(true);
  });

  test('rebuildIndex reconstructs from .hbproject files', () => {
    store.create({ title: 'A', code: '<p>A</p>' });
    store.create({ title: 'B', code: '<p>B</p>' });
    // Corrupt the index
    fs.writeFileSync(store.indexFile, '{}');
    expect(store.getAll().length).toBe(0);
    // Rebuild
    const rebuilt = store.rebuildIndex();
    expect(rebuilt.length).toBe(2);
    expect(store.getAll().length).toBe(2);
  });

  test('update preserves state/ entries in ZIP', () => {
    const p = store.create({ title: 'Stateful', code: '<p>S</p>' });
    const fp = store.getProjectFilePath(p.id);
    // Manually add state to ZIP
    const zip = new AdmZip(fp);
    zip.addFile('state/localstorage.json', Buffer.from('{"key":"value"}'));
    zip.writeZip(fp);
    // Update the project
    store.update(p.id, { title: 'Stateful Updated' });
    // Verify state is preserved
    const updatedZip = new AdmZip(fp);
    const stateEntry = updatedZip.getEntry('state/localstorage.json');
    expect(stateEntry).toBeTruthy();
    expect(stateEntry.getData().toString()).toBe('{"key":"value"}');
  });
});

describe('ProjectsStore Folders', () => {
  let dir, store;

  beforeEach(() => {
    dir = makeTempDir();
    store = new ProjectsStore(dir);
  });

  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  });

  test('create, list, rename, delete folders', () => {
    const f = store.createFolder({ name: 'Work' });
    expect(f.id).toBeTruthy();
    expect(f.name).toBe('Work');
    expect(store.getFolders().length).toBe(1);

    store.renameFolder(f.id, 'Personal');
    expect(store.getFolders()[0].name).toBe('Personal');

    store.deleteFolder(f.id);
    expect(store.getFolders().length).toBe(0);
  });

  test('deleting folder unassigns projects', () => {
    const f = store.createFolder({ name: 'F' });
    const p = store.create({ title: 'P', code: '<p>P</p>' });
    store.update(p.id, { folderId: f.id });
    expect(store.getAll().find(x => x.id === p.id).folderId).toBe(f.id);

    store.deleteFolder(f.id);
    expect(store.getAll().find(x => x.id === p.id).folderId).toBeNull();
  });
});

describe('ProjectsStore Migration', () => {
  test('migrateFromLegacy converts old projects.json to .hbproject files', () => {
    const legacyBase = makeTempDir();
    const legacyDir = path.join(legacyBase, 'HostBuddy');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'projects.json'), JSON.stringify({
      projects: [
        { id: 'legacy1', title: 'Legacy', description: 'Old', code: '<h1>Old</h1>', createdAt: '2024-01-01', updatedAt: '2024-01-01' }
      ],
      folders: [
        { id: 'f1', name: 'Old Folder', createdAt: '2024-01-01', updatedAt: '2024-01-01' }
      ]
    }, null, 2));

    const newDir = makeTempDir();
    const store = new ProjectsStore(newDir);
    const migrated = store.migrateFromLegacy(legacyBase);
    expect(migrated).toBe(true);

    expect(store.getAll().length).toBe(1);
    expect(store.getAll()[0].title).toBe('Legacy');
    expect(store.getFolders().length).toBe(1);
    expect(store.getFolders()[0].name).toBe('Old Folder');

    const full = store.getById('legacy1');
    expect(full.code).toBe('<h1>Old</h1>');

    // Old file should be renamed
    expect(fs.existsSync(path.join(legacyDir, 'projects.json.migrated'))).toBe(true);

    try { fs.rmSync(legacyBase, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(newDir, { recursive: true, force: true }); } catch (_) {}
  });

  test('migrateFromLegacy returns false if no legacy file', () => {
    const dir = makeTempDir();
    const store = new ProjectsStore(dir);
    expect(store.migrateFromLegacy(dir)).toBe(false);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  });
});
