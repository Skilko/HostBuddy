const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

class ProjectsStore {
  constructor(projectsDir) {
    this.projectsDir = projectsDir;
    this.indexFile = path.join(projectsDir, 'index.json');
    this._ensureStorage();
  }

  _ensureStorage() {
    fs.mkdirSync(this.projectsDir, { recursive: true });
    if (!fs.existsSync(this.indexFile)) {
      this._writeIndex({ version: 1, projects: [], folders: [] });
    }
  }

  // ---- Index read/write ----

  _readIndex() {
    try {
      const data = JSON.parse(fs.readFileSync(this.indexFile, 'utf-8'));
      return {
        version: data.version || 1,
        projects: Array.isArray(data.projects) ? data.projects : [],
        folders: Array.isArray(data.folders) ? data.folders : []
      };
    } catch (_) {
      return { version: 1, projects: [], folders: [] };
    }
  }

  _writeIndex(data) {
    fs.writeFileSync(this.indexFile, JSON.stringify(data, null, 2));
  }

  _projectPath(filename) {
    return path.join(this.projectsDir, filename);
  }

  // ---- Slug / ID helpers ----

  _slugify(name) {
    return String(name || 'project')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '').slice(0, 50) || 'project';
  }

  _shortId() { return Math.random().toString(36).slice(2, 8); }

  generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  generateFolderId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'f_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // ---- ZIP helpers ----

  _buildZip({ manifest, code, iconBase64, attachments }) {
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
    const mainFile = manifest.mainFile || 'index.html';
    zip.addFile(`files/${mainFile}`, Buffer.from(code || '', 'utf8'));

    if (iconBase64 && typeof iconBase64 === 'string') {
      const buf = this._dataUriToBuffer(iconBase64);
      if (buf) zip.addFile(`icon.${this._dataUriExt(iconBase64)}`, buf);
    }

    if (Array.isArray(attachments)) {
      for (const att of attachments) {
        if (!att.filename || !att.data) continue;
        const buf = this._dataUriToBuffer(att.data);
        if (buf) zip.addFile(`assets/${att.filename}`, buf);
      }
    }
    return zip;
  }

  _readZip(filepath) {
    const zip = new AdmZip(filepath);
    const manifest = JSON.parse(zip.readAsText('manifest.json'));
    const mainFile = manifest.mainFile || 'index.html';
    let code = '';
    try { code = zip.readAsText(`files/${mainFile}`); } catch (_) {}

    let iconBase64 = null;
    for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']) {
      const entry = zip.getEntry(`icon.${ext}`);
      if (entry) {
        const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        iconBase64 = `data:${mime};base64,${entry.getData().toString('base64')}`;
        break;
      }
    }

    const attachments = [];
    for (const entry of zip.getEntries()) {
      if (entry.entryName.startsWith('assets/') && !entry.isDirectory) {
        const filename = path.basename(entry.entryName);
        const mimeType = this._guessMime(filename);
        attachments.push({
          filename, mimeType,
          data: `data:${mimeType};base64,${entry.getData().toString('base64')}`
        });
      }
    }
    return { manifest, code, iconBase64, attachments };
  }

  _dataUriToBuffer(dataUri) {
    if (!dataUri || typeof dataUri !== 'string') return null;
    const m = dataUri.match(/^data:[^;]*;base64,(.*)$/);
    return m ? Buffer.from(m[1], 'base64') : null;
  }

  _dataUriExt(dataUri) {
    const m = dataUri.match(/^data:image\/(\w+)/);
    return m ? (m[1] === 'jpeg' ? 'jpg' : m[1]) : 'png';
  }

  _guessMime(filename) {
    const ext = path.extname(filename).toLowerCase().slice(1);
    const map = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
      css: 'text/css', js: 'application/javascript',
      html: 'text/html', json: 'application/json'
    };
    return map[ext] || 'application/octet-stream';
  }

  // ---- CRUD ----

  getAll() {
    return this._readIndex().projects.map(p => ({
      id: p.id, title: p.title, description: p.description,
      iconBase64: p.iconBase64 || null, offline: !!p.offline,
      folderId: p.folderId || null, createdAt: p.createdAt, updatedAt: p.updatedAt,
      thumbnailBase64: p.thumbnailBase64 || null
    }));
  }

  getById(id) {
    const index = this._readIndex();
    const entry = index.projects.find(p => p.id === id);
    if (!entry || !entry.filename) return null;
    const fp = this._projectPath(entry.filename);
    if (!fs.existsSync(fp)) return null;
    try {
      const { manifest, code, iconBase64, attachments } = this._readZip(fp);
      return {
        id: manifest.id, title: manifest.title, description: manifest.description,
        iconBase64: iconBase64 || entry.iconBase64 || null, code,
        offline: !!manifest.offline, attachments,
        folderId: manifest.folderId || null,
        createdAt: manifest.createdAt, updatedAt: manifest.updatedAt,
        mainFile: manifest.mainFile || 'index.html'
      };
    } catch (_) { return null; }
  }

  create({ title, description, iconBase64, code, offline, attachments }) {
    const id = this.generateId();
    const now = new Date().toISOString();
    const manifest = {
      id, title, description: description || '', version: 1,
      mainFile: 'index.html', offline: !!offline,
      folderId: null, createdAt: now, updatedAt: now
    };
    const filename = `${this._slugify(title)}-${this._shortId()}.hbproject`;
    this._buildZip({ manifest, code, iconBase64, attachments })
      .writeZip(this._projectPath(filename));

    const index = this._readIndex();
    index.projects.push({
      id, title, description: description || '', iconBase64: iconBase64 || null,
      offline: !!offline, folderId: null, createdAt: now, updatedAt: now, filename
    });
    this._writeIndex(index);

    return {
      id, title, description: description || '', iconBase64: iconBase64 || null,
      code, offline: !!offline,
      attachments: Array.isArray(attachments) ? attachments : [],
      folderId: null, createdAt: now, updatedAt: now
    };
  }

  update(id, updates) {
    const index = this._readIndex();
    const idx = index.projects.findIndex(p => p.id === id);
    if (idx === -1) return null;
    const entry = index.projects[idx];
    const fp = this._projectPath(entry.filename);
    const now = new Date().toISOString();

    let existing;
    try { existing = this._readZip(fp); } catch (_) { return null; }

    const m = existing.manifest;
    const newManifest = {
      ...m,
      title: updates.title !== undefined ? updates.title : m.title,
      description: updates.description !== undefined ? updates.description : m.description,
      offline: updates.offline !== undefined ? !!updates.offline : m.offline,
      folderId: updates.folderId !== undefined ? updates.folderId : m.folderId,
      updatedAt: now
    };
    const newCode = updates.code !== undefined ? updates.code : existing.code;
    const newIcon = updates.iconBase64 !== undefined ? updates.iconBase64 : existing.iconBase64;
    const newAtts = updates.attachments !== undefined ? updates.attachments : existing.attachments;

    const zip = this._buildZip({ manifest: newManifest, code: newCode, iconBase64: newIcon, attachments: newAtts });
    // Preserve state/ and thumbnail.png from old ZIP
    try {
      const old = new AdmZip(fp);
      for (const e of old.getEntries()) {
        if ((e.entryName.startsWith('state/') || e.entryName === 'thumbnail.png') && !e.isDirectory) {
          zip.addFile(e.entryName, e.getData());
        }
      }
    } catch (_) {}
    zip.writeZip(fp);

    index.projects[idx] = {
      ...entry, title: newManifest.title, description: newManifest.description,
      iconBase64: newIcon || entry.iconBase64, offline: newManifest.offline,
      folderId: newManifest.folderId, updatedAt: now
    };
    this._writeIndex(index);

    return {
      id, title: newManifest.title, description: newManifest.description,
      iconBase64: newIcon || null, code: newCode, offline: newManifest.offline,
      attachments: Array.isArray(newAtts) ? newAtts : [],
      folderId: newManifest.folderId, createdAt: newManifest.createdAt, updatedAt: now
    };
  }

  delete(id) {
    const index = this._readIndex();
    const entry = index.projects.find(p => p.id === id);
    if (!entry) return false;
    try { fs.unlinkSync(this._projectPath(entry.filename)); } catch (_) {}
    index.projects = index.projects.filter(p => p.id !== id);
    this._writeIndex(index);
    return true;
  }

  getProjectFilePath(id) {
    const entry = this._readIndex().projects.find(p => p.id === id);
    if (!entry || !entry.filename) return null;
    return this._projectPath(entry.filename);
  }

  rebuildIndex() {
    const files = fs.readdirSync(this.projectsDir).filter(f => f.endsWith('.hbproject'));
    const existingFolders = this._readIndex().folders;
    const projects = [];
    for (const filename of files) {
      try {
        const { manifest, iconBase64 } = this._readZip(this._projectPath(filename));
        projects.push({
          id: manifest.id, title: manifest.title, description: manifest.description,
          iconBase64: iconBase64 || null, offline: !!manifest.offline,
          folderId: manifest.folderId || null,
          createdAt: manifest.createdAt, updatedAt: manifest.updatedAt, filename
        });
      } catch (_) {}
    }
    this._writeIndex({ version: 1, projects, folders: existingFolders });
    return projects;
  }

  // ---- Folders ----

  getFolders() { return this._readIndex().folders; }

  createFolder({ name }) {
    const now = new Date().toISOString();
    const folder = { id: this.generateFolderId(), name: String(name || 'New Folder'), createdAt: now, updatedAt: now };
    const index = this._readIndex();
    index.folders.push(folder);
    this._writeIndex(index);
    return folder;
  }

  renameFolder(id, name) {
    const index = this._readIndex();
    const idx = index.folders.findIndex(f => f.id === id);
    if (idx === -1) return null;
    const now = new Date().toISOString();
    index.folders[idx] = { ...index.folders[idx], name: String(name || index.folders[idx].name), updatedAt: now };
    this._writeIndex(index);
    return index.folders[idx];
  }

  deleteFolder(id) {
    const index = this._readIndex();
    const next = index.folders.filter(f => f.id !== id);
    if (next.length === index.folders.length) return false;
    const now = new Date().toISOString();
    for (const p of index.projects) {
      if (p.folderId === id) {
        p.folderId = null;
        p.updatedAt = now;
      }
    }
    index.folders = next;
    this._writeIndex(index);
    return true;
  }

  // ---- Migration from legacy projects.json ----

  migrateFromLegacy(legacyBaseDir) {
    const legacyFile = path.join(legacyBaseDir, 'HostBuddy', 'projects.json');
    if (!fs.existsSync(legacyFile)) return false;
    let legacy;
    try { legacy = JSON.parse(fs.readFileSync(legacyFile, 'utf-8')); } catch (_) { return false; }
    const projects = Array.isArray(legacy.projects) ? legacy.projects : [];
    const folders = Array.isArray(legacy.folders) ? legacy.folders : [];
    if (projects.length === 0 && folders.length === 0) return false;

    for (const p of projects) {
      if (!p.id || !p.title) continue;
      const now = new Date().toISOString();
      const manifest = {
        id: p.id, title: p.title, description: p.description || '', version: 1,
        mainFile: 'index.html', offline: !!p.offline, folderId: p.folderId || null,
        createdAt: p.createdAt || now, updatedAt: p.updatedAt || now
      };
      const filename = `${this._slugify(p.title)}-${this._shortId()}.hbproject`;
      this._buildZip({
        manifest, code: p.code || '', iconBase64: p.iconBase64 || null,
        attachments: Array.isArray(p.attachments) ? p.attachments : []
      }).writeZip(this._projectPath(filename));

      const index = this._readIndex();
      index.projects.push({
        id: p.id, title: p.title, description: p.description || '',
        iconBase64: p.iconBase64 || null, offline: !!p.offline,
        folderId: p.folderId || null, createdAt: manifest.createdAt,
        updatedAt: manifest.updatedAt, filename
      });
      this._writeIndex(index);
    }

    if (folders.length > 0) {
      const index = this._readIndex();
      index.folders = folders;
      this._writeIndex(index);
    }

    try { fs.renameSync(legacyFile, legacyFile + '.migrated'); } catch (_) {}
    return true;
  }
}

module.exports = ProjectsStore;
