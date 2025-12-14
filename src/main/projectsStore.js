const fs = require('fs');
const path = require('path');

class ProjectsStore {
  constructor(baseDir) {
    this.baseDir = path.join(baseDir, 'HostBuddy');
    this.dataFile = path.join(this.baseDir, 'projects.json');
    this.ensureStorage();
  }

  ensureStorage() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    if (!fs.existsSync(this.dataFile)) {
      fs.writeFileSync(this.dataFile, JSON.stringify({ projects: [], folders: [] }, null, 2));
    } else {
      // Migrate: ensure file has folders key
      try {
        const raw = JSON.parse(fs.readFileSync(this.dataFile, 'utf-8'));
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('bad');
        if (!Array.isArray(raw.projects)) raw.projects = [];
        if (!Array.isArray(raw.folders)) raw.folders = [];
        fs.writeFileSync(this.dataFile, JSON.stringify(raw, null, 2));
      } catch (_) {
        fs.writeFileSync(this.dataFile, JSON.stringify({ projects: [], folders: [] }, null, 2));
      }
    }
  }

  readRaw() {
    const rawText = fs.readFileSync(this.dataFile, 'utf-8');
    try {
      const parsed = JSON.parse(rawText);
      const projects = Array.isArray(parsed.projects) ? parsed.projects : [];
      const folders = Array.isArray(parsed.folders) ? parsed.folders : [];
      return { projects, folders };
    } catch (e) {
      return { projects: [], folders: [] };
    }
  }

  readAll() {
    const raw = this.readRaw();
    return raw.projects;
  }

  writeAll(projects) {
    const raw = this.readRaw();
    raw.projects = projects;
    fs.writeFileSync(this.dataFile, JSON.stringify(raw, null, 2));
  }

  getAll() {
    return this.readAll();
  }

  getById(id) {
    return this.readAll().find(p => p.id === id) || null;
  }

  create({ title, description, iconBase64, code, offline, attachments }) {
    const id = this.generateId();
    const now = new Date().toISOString();
    const project = { 
      id, 
      title, 
      description, 
      iconBase64: iconBase64 || null, 
      code, 
      offline: !!offline, 
      attachments: Array.isArray(attachments) ? attachments : [],
      createdAt: now, 
      updatedAt: now 
    };
    const projects = this.readAll();
    projects.push(project);
    this.writeAll(projects);
    return project;
  }

  update(id, updates) {
    const projects = this.readAll();
    const idx = projects.findIndex(p => p.id === id);
    if (idx === -1) return null;
    const now = new Date().toISOString();
    projects[idx] = { ...projects[idx], ...updates, updatedAt: now };
    this.writeAll(projects);
    return projects[idx];
  }

  delete(id) {
    const projects = this.readAll();
    const next = projects.filter(p => p.id !== id);
    const changed = next.length !== projects.length;
    if (changed) this.writeAll(next);
    return changed;
  }

  // ---- Folders API ----
  getFolders() {
    return this.readRaw().folders;
  }

  createFolder({ name }) {
    const now = new Date().toISOString();
    const folder = { id: this.generateFolderId(), name: String(name || 'New Folder'), createdAt: now, updatedAt: now };
    const raw = this.readRaw();
    raw.folders.push(folder);
    fs.writeFileSync(this.dataFile, JSON.stringify(raw, null, 2));
    return folder;
  }

  renameFolder(id, name) {
    const raw = this.readRaw();
    const idx = raw.folders.findIndex(f => f.id === id);
    if (idx === -1) return null;
    const now = new Date().toISOString();
    raw.folders[idx] = { ...raw.folders[idx], name: String(name || raw.folders[idx].name), updatedAt: now };
    fs.writeFileSync(this.dataFile, JSON.stringify(raw, null, 2));
    return raw.folders[idx];
  }

  deleteFolder(id) {
    const raw = this.readRaw();
    const nextFolders = raw.folders.filter(f => f.id !== id);
    const changed = nextFolders.length !== raw.folders.length;
    if (!changed) return false;
    // Unassign projects from this folder
    const nextProjects = raw.projects.map(p => (p.folderId === id ? { ...p, folderId: null, updatedAt: new Date().toISOString() } : p));
    const next = { projects: nextProjects, folders: nextFolders };
    fs.writeFileSync(this.dataFile, JSON.stringify(next, null, 2));
    return true;
  }

  generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  generateFolderId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'f_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

module.exports = ProjectsStore;


