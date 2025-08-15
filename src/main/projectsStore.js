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
      // Migrate older files that may not have folders
      try {
        const raw = fs.readFileSync(this.dataFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
          fs.writeFileSync(this.dataFile, JSON.stringify({ projects: [], folders: [] }, null, 2));
        } else if (!Array.isArray(parsed.folders)) {
          parsed.folders = [];
          if (!Array.isArray(parsed.projects)) parsed.projects = [];
          fs.writeFileSync(this.dataFile, JSON.stringify(parsed, null, 2));
        }
      } catch (_) {
        fs.writeFileSync(this.dataFile, JSON.stringify({ projects: [], folders: [] }, null, 2));
      }
    }
  }

  readData() {
    const raw = fs.readFileSync(this.dataFile, 'utf-8');
    try {
      const parsed = JSON.parse(raw);
      const projects = Array.isArray(parsed.projects) ? parsed.projects : [];
      const folders = Array.isArray(parsed.folders) ? parsed.folders : [];
      return { projects, folders };
    } catch (e) {
      return { projects: [], folders: [] };
    }
  }

  writeData(data) {
    const safe = {
      projects: Array.isArray(data.projects) ? data.projects : [],
      folders: Array.isArray(data.folders) ? data.folders : []
    };
    fs.writeFileSync(this.dataFile, JSON.stringify(safe, null, 2));
  }

  readAll() {
    return this.readData().projects;
  }

  writeAll(projects) {
    const data = this.readData();
    data.projects = projects;
    this.writeData(data);
  }

  getAll() {
    return this.readAll();
  }

  getById(id) {
    return this.readAll().find(p => p.id === id) || null;
  }

  create({ title, description, iconBase64, code, offline, folderId }) {
    const id = this.generateId();
    const now = new Date().toISOString();
    const project = { id, title, description, iconBase64: iconBase64 || null, code, offline: !!offline, folderId: folderId || null, createdAt: now, updatedAt: now };
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

  generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // ---- Folders API ----
  getFolders() {
    return this.readData().folders;
  }

  createFolder(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Folder name is required');
    const data = this.readData();
    // Prevent exact duplicate names (case-insensitive)
    const exists = data.folders.some(f => f.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) throw new Error('Folder name already exists');
    const folder = { id: this.generateFolderId(), name: trimmed, createdAt: new Date().toISOString() };
    data.folders.push(folder);
    this.writeData(data);
    return folder;
  }

  deleteFolder(id) {
    const data = this.readData();
    // Disallow deletion if any project is assigned to this folder
    const inUse = data.projects.some(p => p.folderId === id);
    if (inUse) return false;
    const nextFolders = data.folders.filter(f => f.id !== id);
    const changed = nextFolders.length !== data.folders.length;
    if (changed) {
      data.folders = nextFolders;
      this.writeData(data);
    }
    return changed;
  }

  generateFolderId() {
    return 'f_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

module.exports = ProjectsStore;


