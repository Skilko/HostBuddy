const grid = document.getElementById('projectsGrid');
const empty = document.getElementById('emptyState');
const btnNew = document.getElementById('btnNew');
const btnGettingStarted = document.getElementById('btnGettingStarted');
const btnNew2 = document.getElementById('btnNew2');
const btnFeedback = document.getElementById('btnFeedback');
const btnImport = document.getElementById('btnImport');
const modal = document.getElementById('modal');
const form = document.getElementById('projectForm');
const btnCancel = document.getElementById('btnCancel');
const titleEl = document.getElementById('title');
const descEl = document.getElementById('description');
const iconEl = document.getElementById('icon');
const codeEl = document.getElementById('code');
const offlineEl = document.getElementById('offline');
const modalTitle = document.getElementById('modalTitle');
const lineNumbers = document.getElementById('lineNumbers');
const gsModal = document.getElementById('gsModal');
const btnCloseGs = document.getElementById('btnCloseGs');
const btnCopyPrompt = document.getElementById('btnCopyPrompt');
const promptTemplate = document.getElementById('promptTemplate');
const loadingOverlay = document.getElementById('loadingOverlay');
const folderFilter = document.getElementById('folderFilter');
const folderSelect = document.getElementById('folderSelect');
const btnManageFolders = document.getElementById('btnManageFolders');
const foldersModal = document.getElementById('foldersModal');
const foldersList = document.getElementById('foldersList');
const folderNameInput = document.getElementById('folderNameInput');
const btnAddFolder = document.getElementById('btnAddFolder');
const btnCloseFolders = document.getElementById('btnCloseFolders');

// Default icon used when a project has no uploaded icon
const DEFAULT_APP_ICON = '../../assets/default-app.png';

let iconBase64 = null;
let editProjectId = null;
let cachedFolders = [];
let cachedProjects = [];

function createLucideIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const NS = 'http://www.w3.org/2000/svg';
  function p(d) { const el = document.createElementNS(NS, 'path'); el.setAttribute('d', d); return el; }
  function pl(points) { const el = document.createElementNS(NS, 'polyline'); el.setAttribute('points', points); return el; }
  function pg(points) { const el = document.createElementNS(NS, 'polygon'); el.setAttribute('points', points); return el; }
  switch (name) {
    case 'play': {
      svg.appendChild(pg('5 3 19 12 5 21 5 3'));
      break;
    }
    case 'edit': {
      svg.appendChild(p('M12 20h9'));
      svg.appendChild(p('M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'));
      break;
    }
    case 'upload': {
      svg.appendChild(p('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'));
      svg.appendChild(pl('17 8 12 3 7 8'));
      svg.appendChild(p('M12 3v12'));
      break;
    }
    case 'trash': {
      svg.appendChild(pl('3 6 5 6 21 6'));
      svg.appendChild(p('M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'));
      svg.appendChild(p('M10 11v6'));
      svg.appendChild(p('M14 11v6'));
      svg.appendChild(p('M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'));
      break;
    }
  }
  return svg;
}

// Line numbers functionality
function updateLineNumbers() {
  if (!codeEl || !lineNumbers) return;
  
  const lines = codeEl.value.split('\n');
  const lineCount = Math.max(lines.length, 1);
  
  let lineNumbersText = '';
  for (let i = 1; i <= lineCount; i++) {
    lineNumbersText += i + '\n';
  }
  
  lineNumbers.textContent = lineNumbersText;
}

function syncScrollPosition() {
  if (!codeEl || !lineNumbers) return;
  lineNumbers.scrollTop = codeEl.scrollTop;
}

function syncScrollFromLineNumbers() {
  if (!codeEl || !lineNumbers) return;
  codeEl.scrollTop = lineNumbers.scrollTop;
}

function showModal() { 
  modal.classList.remove('hidden'); 
  updateLineNumbers();
}
function hideModal() { 
  modal.classList.add('hidden'); 
  form.reset(); 
  iconBase64 = null; 
  editProjectId = null; 
  if (modalTitle) modalTitle.textContent = 'Create Project';
  updateLineNumbers();
}

function openCreateModal() {
  editProjectId = null;
  if (modalTitle) modalTitle.textContent = 'Create Project';
  form.reset();
  iconBase64 = null;
  if (offlineEl) offlineEl.checked = false;
  if (folderSelect) folderSelect.value = '';
  showModal();
}

function openGettingStarted() {
  if (gsModal) gsModal.classList.remove('hidden');
}
function closeGettingStarted() {
  if (gsModal) gsModal.classList.add('hidden');
}

function openEditModal(project) {
  editProjectId = project.id;
  if (modalTitle) modalTitle.textContent = 'Edit Project';
  titleEl.value = project.title || '';
  descEl.value = project.description || '';
  codeEl.value = project.code || '';
  iconEl.value = '';
  iconBase64 = null;
  if (offlineEl) offlineEl.checked = !!project.offline;
  if (folderSelect) folderSelect.value = project.folderId || '';
  showModal();
  updateLineNumbers();
}

async function fetchAndRender() {
  const projects = await window.api.listProjects();
  cachedProjects = projects || [];
  grid.innerHTML = '';
  // Apply folder filter
  const selectedFolder = folderFilter ? folderFilter.value : 'all';
  const filtered = (selectedFolder && selectedFolder !== 'all')
    ? projects.filter(p => (p.folderId || '') === selectedFolder)
    : projects;
  if (!filtered || filtered.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  for (const p of filtered) {
    const card = document.createElement('div');
    card.className = 'card';
    const avatar = document.createElement('img');
    avatar.className = 'avatar';
    avatar.alt = '';
    avatar.src = p.iconBase64 || DEFAULT_APP_ICON;
    avatar.onerror = () => {
      // Fallback to placeholder on broken image
      if (avatar.parentElement) {
        const ph = document.createElement('div');
        ph.className = 'avatar';
        avatar.parentElement.replaceChild(ph, avatar);
      }
    };
    const title = document.createElement('h3'); title.className = 'title'; title.textContent = p.title;
    const desc = document.createElement('p'); desc.className = 'desc'; desc.textContent = p.description || '';
    const row = document.createElement('div'); row.className = 'row';
    row.appendChild(avatar);
    const textWrap = document.createElement('div'); textWrap.appendChild(title); textWrap.appendChild(desc); row.appendChild(textWrap);
    const actions = document.createElement('div'); actions.className = 'actions';
    const runBtn = document.createElement('button'); runBtn.className = 'btn run'; runBtn.setAttribute('aria-label', 'Run'); runBtn.title = 'Run'; runBtn.appendChild(createLucideIcon('play'));
    runBtn.onclick = async () => {
      const previousText = runBtn.textContent;
      runBtn.disabled = true;
      runBtn.textContent = 'Loading…';
      if (loadingOverlay) loadingOverlay.classList.remove('hidden');
      try {
        await window.api.runProject(p.id);
      } catch (err) {
        alert('Failed to run project. ' + (err && err.message ? err.message : ''));
      } finally {
        runBtn.disabled = false;
        runBtn.textContent = previousText;
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
      }
    };
    const editBtn = document.createElement('button'); editBtn.className = 'btn'; editBtn.setAttribute('aria-label', 'Edit'); editBtn.title = 'Edit'; editBtn.appendChild(createLucideIcon('edit'));
    editBtn.onclick = () => openEditModal(p);
    const exportBtn = document.createElement('button'); exportBtn.className = 'btn'; exportBtn.setAttribute('aria-label', 'Export'); exportBtn.title = 'Export'; exportBtn.appendChild(createLucideIcon('upload'));
    exportBtn.onclick = async () => {
      try {
        await window.api.exportProject(p.id);
      } catch (e) {
        alert('Export failed.');
      }
    };
    const deleteBtn = document.createElement('button'); deleteBtn.className = 'btn delete'; deleteBtn.setAttribute('aria-label', 'Delete'); deleteBtn.title = 'Delete'; deleteBtn.appendChild(createLucideIcon('trash'));
    deleteBtn.onclick = async () => {
      if (confirm(`Delete "${p.title}"? This cannot be undone.`)) {
        await window.api.deleteProject(p.id);
        await fetchAndRender();
      }
    };
    actions.appendChild(runBtn); actions.appendChild(editBtn); actions.appendChild(exportBtn); actions.appendChild(deleteBtn);
    card.appendChild(row); card.appendChild(actions);
    grid.appendChild(card);
  }
}

btnNew.addEventListener('click', () => openCreateModal());
btnGettingStarted.addEventListener('click', () => openGettingStarted());
btnNew2.addEventListener('click', () => openCreateModal());
document.getElementById('btnImport2') && document.getElementById('btnImport2').addEventListener('click', async () => {
  try {
    const res = await window.api.importProjects();
    if (res && res.length) {
      await fetchAndRender();
    }
  } catch (e) {
    alert('Import failed.');
  }
});
btnCancel.addEventListener('click', hideModal);

// Add event listeners for line numbers functionality
if (codeEl && lineNumbers) {
  // Update line numbers when content changes
  codeEl.addEventListener('input', updateLineNumbers);
  codeEl.addEventListener('paste', () => setTimeout(updateLineNumbers, 0));
  codeEl.addEventListener('keydown', (e) => {
    // Update line numbers after a short delay to account for text changes
    setTimeout(updateLineNumbers, 0);
  });
  
  // Sync scroll positions
  codeEl.addEventListener('scroll', syncScrollPosition);
  lineNumbers.addEventListener('scroll', syncScrollFromLineNumbers);
  
  // Handle wheel events for better synchronization
  codeEl.addEventListener('wheel', (e) => {
    setTimeout(syncScrollPosition, 0);
  });
  
  lineNumbers.addEventListener('wheel', (e) => {
    setTimeout(syncScrollFromLineNumbers, 0);
  });
}
btnCloseGs && btnCloseGs.addEventListener('click', closeGettingStarted);
btnCopyPrompt && btnCopyPrompt.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(promptTemplate.value);
    btnCopyPrompt.textContent = 'Copied!';
    setTimeout(() => (btnCopyPrompt.textContent = 'Copy Prompt'), 1200);
  } catch {}
});

btnFeedback && btnFeedback.addEventListener('click', async () => {
  try {
    await window.api.openFeedback();
  } catch (e) {
    alert('Could not open feedback page.');
  }
});

btnImport && btnImport.addEventListener('click', async () => {
  try {
    const res = await window.api.importProjects();
    if (res && res.length) {
      await fetchAndRender();
    }
  } catch (e) {
    alert('Import failed.');
  }
});

async function loadFolders() {
  try {
    const folders = await window.api.listFolders();
    cachedFolders = Array.isArray(folders) ? folders : [];
    // Populate header filter
    if (folderFilter) {
      const current = folderFilter.value || 'all';
      folderFilter.innerHTML = '';
      const optAll = document.createElement('option'); optAll.value = 'all'; optAll.textContent = 'All projects'; folderFilter.appendChild(optAll);
      for (const f of cachedFolders) {
        const opt = document.createElement('option');
        opt.value = f.id; opt.textContent = f.name;
        folderFilter.appendChild(opt);
      }
      // restore selection if still valid
      const hasCurrent = current === 'all' || cachedFolders.some(f => f.id === current);
      folderFilter.value = hasCurrent ? current : 'all';
    }
    // Populate project form select
    if (folderSelect) {
      const selected = folderSelect.value || '';
      folderSelect.innerHTML = '';
      const optNone = document.createElement('option'); optNone.value = ''; optNone.textContent = 'None'; folderSelect.appendChild(optNone);
      for (const f of cachedFolders) {
        const opt = document.createElement('option'); opt.value = f.id; opt.textContent = f.name; folderSelect.appendChild(opt);
      }
      if (selected && cachedFolders.some(f => f.id === selected)) {
        folderSelect.value = selected;
      }
    }
    // Render folders list in modal if open
    renderFoldersList();
  } catch (_) {
    // ignore
  }
}

function renderFoldersList() {
  if (!foldersList) return;
  foldersList.innerHTML = '';
  for (const f of cachedFolders) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    const left = document.createElement('div');
    left.textContent = f.name;
    const count = cachedProjects.filter(p => p.folderId === f.id).length;
    const right = document.createElement('div');
    const meta = document.createElement('span'); meta.style.color = '#9ca3af'; meta.style.fontSize = '12px'; meta.textContent = count + (count === 1 ? ' project' : ' projects');
    const del = document.createElement('button'); del.className = 'btn delete'; del.textContent = 'Delete';
    del.disabled = count > 0;
    del.title = count > 0 ? 'Remove projects from this folder first' : 'Delete folder';
    del.onclick = async () => {
      try {
        const ok = await window.api.deleteFolder(f.id);
        if (!ok) {
          alert('Folder is not empty. Move or remove projects first.');
          return;
        }
        await loadFolders();
        await fetchAndRender();
      } catch (e) {
        alert('Could not delete folder.');
      }
    };
    right.style.display = 'flex'; right.style.gap = '8px'; right.style.alignItems = 'center';
    right.appendChild(meta); right.appendChild(del);
    row.appendChild(left); row.appendChild(right);
    foldersList.appendChild(row);
  }
}

function openFoldersModal() { if (foldersModal) { foldersModal.classList.remove('hidden'); renderFoldersList(); } }
function closeFoldersModal() { if (foldersModal) foldersModal.classList.add('hidden'); }

btnManageFolders && btnManageFolders.addEventListener('click', async () => { await loadFolders(); openFoldersModal(); });
btnCloseFolders && btnCloseFolders.addEventListener('click', closeFoldersModal);
btnAddFolder && btnAddFolder.addEventListener('click', async () => {
  const name = (folderNameInput && folderNameInput.value || '').trim();
  if (!name) { alert('Enter a folder name'); return; }
  try {
    await window.api.createFolder(name);
    if (folderNameInput) folderNameInput.value = '';
    await loadFolders();
  } catch (e) {
    alert('Could not create folder. It may already exist.');
  }
});

folderFilter && folderFilter.addEventListener('change', async () => { await fetchAndRender(); });

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

async function normalizeImageToPng(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    return canvas.toDataURL('image/png');
  } catch (e) {
    return null;
  }
}

iconEl.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) { iconBase64 = null; return; }
  const allowed = new Set(['image/png','image/jpeg','image/webp','image/gif','image/svg+xml']);
  try {
    if (allowed.has(file.type)) {
      iconBase64 = await readFileAsDataUrl(file);
    } else {
      const converted = await normalizeImageToPng(file);
      if (converted) {
        iconBase64 = converted;
      } else {
        iconBase64 = null;
        alert('This image format is not supported. Please use PNG, JPG, or WEBP.');
      }
    }
  } catch (err) {
    iconBase64 = null;
    alert('Could not read image. Please try a different file.');
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = titleEl.value.trim();
  const description = descEl.value.trim();
  const code = codeEl.value;
  const folderId = folderSelect ? (folderSelect.value || null) : null;
  if (!title || !code) { alert('Please provide Title and HTML/React code.'); return; }
  if (editProjectId) {
    const updates = { title, description, code, offline: !!(offlineEl && offlineEl.checked), folderId };
    if (iconBase64) updates.iconBase64 = iconBase64;
    await window.api.updateProject(editProjectId, updates);
  } else {
    await window.api.createProject({ title, description, iconBase64, code, offline: !!(offlineEl && offlineEl.checked), folderId });
  }
  hideModal();
  await fetchAndRender();
});

loadFolders().then(fetchAndRender);


