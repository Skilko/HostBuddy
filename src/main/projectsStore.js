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
      fs.writeFileSync(this.dataFile, JSON.stringify({ projects: [] }, null, 2));
    }
  }

  readAll() {
    const raw = fs.readFileSync(this.dataFile, 'utf-8');
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.projects) ? parsed.projects : [];
    } catch (e) {
      return [];
    }
  }

  writeAll(projects) {
    fs.writeFileSync(this.dataFile, JSON.stringify({ projects }, null, 2));
  }

  getAll() {
    return this.readAll();
  }

  getById(id) {
    return this.readAll().find(p => p.id === id) || null;
  }

  create({ title, description, iconBase64, code, offline }) {
    const id = this.generateId();
    const now = new Date().toISOString();
    const project = { id, title, description, iconBase64: iconBase64 || null, code, offline: !!offline, createdAt: now, updatedAt: now };
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
}

module.exports = ProjectsStore;


