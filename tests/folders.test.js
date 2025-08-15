const fs = require('fs');
const os = require('os');
const path = require('path');
const ProjectsStore = require('../src/main/projectsStore');

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hostbuddy-folders-'));
  return dir;
}

describe('Folders in ProjectsStore', () => {
  test('create/rename/delete folder and assign/unassign projects', () => {
    const dir = makeTempDir();
    const store = new ProjectsStore(dir);
    // Seed projects
    const p1 = store.create({ title: 'A', description: '', iconBase64: null, code: '<h1>A</h1>' });
    const p2 = store.create({ title: 'B', description: '', iconBase64: null, code: '<h1>B</h1>' });
    // Create folder
    const f = store.createFolder({ name: 'Work' });
    expect(f.id).toBeTruthy();
    let folders = store.getFolders();
    expect(folders.length).toBe(1);
    expect(folders[0].name).toBe('Work');
    // Assign projects
    const updated1 = store.update(p1.id, { folderId: f.id });
    expect(updated1.folderId).toBe(f.id);
    const updated2 = store.update(p2.id, { folderId: f.id });
    expect(updated2.folderId).toBe(f.id);
    // Rename folder
    const f2 = store.renameFolder(f.id, 'Personal');
    expect(f2.name).toBe('Personal');
    // Delete folder → projects should be unassigned
    const removed = store.deleteFolder(f.id);
    expect(removed).toBe(true);
    const all = store.getAll();
    expect(all.find(p => p.id === p1.id).folderId || null).toBe(null);
    expect(all.find(p => p.id === p2.id).folderId || null).toBe(null);
  });
});


