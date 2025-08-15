const fs = require('fs');
const os = require('os');
const path = require('path');
const ProjectsStore = require('../src/main/projectsStore');

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hostbuddy-'));
  return dir;
}

describe('ProjectsStore', () => {
  test('create, list, get, delete', () => {
    const dir = makeTempDir();
    const store = new ProjectsStore(dir);
    const created = store.create({ title: 'Test', description: 'Desc', iconBase64: null, code: '<h1>Hello</h1>' });
    expect(created.id).toBeTruthy();
    const all = store.getAll();
    expect(all.length).toBe(1);
    const fetched = store.getById(created.id);
    expect(fetched.title).toBe('Test');
    const removed = store.delete(created.id);
    expect(removed).toBe(true);
    expect(store.getAll().length).toBe(0);
  });

  test('folders: create, list, prevent delete when non-empty, allow when empty', () => {
    const dir = makeTempDir();
    const store = new ProjectsStore(dir);
    const f = store.createFolder('Work');
    expect(f.id).toBeTruthy();
    const folders = store.getFolders();
    expect(folders.find(x => x.id === f.id)).toBeTruthy();
    const p = store.create({ title: 'InFolder', description: '', iconBase64: null, code: '<h1/>', folderId: f.id });
    expect(p.folderId).toBe(f.id);
    // cannot delete folder while project assigned
    expect(store.deleteFolder(f.id)).toBe(false);
    // move project out and delete
    store.update(p.id, { folderId: null });
    expect(store.deleteFolder(f.id)).toBe(true);
  });
});


