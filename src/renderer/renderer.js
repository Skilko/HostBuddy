const grid = document.getElementById('projectsGrid');
const empty = document.getElementById('emptyState');
const foldersList = document.getElementById('foldersList');
const btnAddFolder = document.getElementById('btnAddFolder');
const btnNew = document.getElementById('btnNew');
const btnGettingStarted = document.getElementById('btnGettingStarted');
const btnNew2 = document.getElementById('btnNew2');
const btnFeedback = document.getElementById('btnFeedback');
const btnImport = document.getElementById('btnImport');
const btnToggleEdit = document.getElementById('btnToggleEdit');
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
const btnCopyPromptTemplate = document.getElementById('btnCopyPromptTemplate');
const promptTemplate = document.getElementById('promptTemplate');
const loadingOverlay = document.getElementById('loadingOverlay');
const folderModal = document.getElementById('folderModal');
const folderForm = document.getElementById('folderForm');
const folderNameInput = document.getElementById('folderNameInput');
const btnCancelFolder = document.getElementById('btnCancelFolder');
const attachmentsEl = document.getElementById('attachments');
const attachmentsList = document.getElementById('attachmentsList');
const btnClearCode = document.getElementById('btnClearCode');
const btnPasteCode = document.getElementById('btnPasteCode');
const versionBadge = document.getElementById('versionBadge');

// Default icon used when a project has no uploaded icon
const DEFAULT_APP_ICON = '../../assets/default-app.png';

let iconBase64 = null;
let editProjectId = null;
let selectedFolderId = null; // null means "All"
let projectAttachments = []; // Array of { filename, mimeType, data }

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
    case 'plus': {
      svg.appendChild(p('M12 5v14'));
      svg.appendChild(p('M5 12h14'));
      break;
    }
    case 'feedback': {
      svg.appendChild(p('M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'));
      break;
    }
    case 'book-open': {
      svg.appendChild(p('M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z'));
      svg.appendChild(p('M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'));
      break;
    }
    case 'import': {
      svg.appendChild(p('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'));
      svg.appendChild(pl('7 10 12 15 17 10'));
      svg.appendChild(p('M12 15V3'));
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
  // Calculate the scroll position to keep line numbers aligned
  const lineHeight = parseFloat(getComputedStyle(codeEl).lineHeight);
  const scrollTop = codeEl.scrollTop;
  
  // Scroll the line numbers container
  lineNumbers.scrollTop = scrollTop;
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
  projectAttachments = [];
  renderAttachmentsList();
  if (modalTitle) modalTitle.textContent = 'Create Project';
  updateLineNumbers();
}

function openCreateModal() {
  editProjectId = null;
  if (modalTitle) modalTitle.textContent = 'Create Project';
  form.reset();
  iconBase64 = null;
  projectAttachments = [];
  renderAttachmentsList();
  if (offlineEl) offlineEl.checked = false;
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
  projectAttachments = Array.isArray(project.attachments) ? [...project.attachments] : [];
  renderAttachmentsList();
  if (offlineEl) offlineEl.checked = !!project.offline;
  showModal();
  updateLineNumbers();
}

async function fetchAndRender() {
  const [projects, folders] = await Promise.all([
    window.api.listProjects(),
    window.api.listFolders()
  ]);
  renderFolders(folders, projects);
  const visibleProjects = selectedFolderId ? projects.filter(p => p.folderId === selectedFolderId) : projects;
  grid.innerHTML = '';
  if (!visibleProjects || visibleProjects.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  for (const p of visibleProjects) {
    const card = document.createElement('div');
    card.className = 'card';
    card.draggable = true;
    card.dataset.projectId = p.id;
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', p.id);
      e.dataTransfer.effectAllowed = 'move';
    });
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
      runBtn.disabled = true;
      if (loadingOverlay) loadingOverlay.classList.remove('hidden');
      try {
        await window.api.runProject(p.id);
      } catch (err) {
        alert('Failed to run project. ' + (err && err.message ? err.message : ''));
      } finally {
        runBtn.disabled = false;
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
      }
    };
    const editBtn = document.createElement('button'); editBtn.className = 'btn edit-controls'; editBtn.setAttribute('aria-label', 'Edit'); editBtn.title = 'Edit'; editBtn.appendChild(createLucideIcon('edit'));
    editBtn.onclick = () => openEditModal(p);
    const exportBtn = document.createElement('button'); exportBtn.className = 'btn'; exportBtn.setAttribute('aria-label', 'Export'); exportBtn.title = 'Export'; exportBtn.appendChild(createLucideIcon('upload'));
    exportBtn.onclick = async () => {
      try {
        await window.api.exportProject(p.id);
      } catch (e) {
        alert('Export failed.');
      }
    };
    const deleteBtn = document.createElement('button'); deleteBtn.className = 'btn delete edit-controls'; deleteBtn.setAttribute('aria-label', 'Delete'); deleteBtn.title = 'Delete'; deleteBtn.appendChild(createLucideIcon('trash'));
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

function renderFolders(folders, projects) {
  if (!foldersList) return;
  foldersList.innerHTML = '';
  const allItem = document.createElement('div');
  allItem.className = 'folder' + (!selectedFolderId ? ' active' : '');
  const nameSpan = document.createElement('span'); nameSpan.className = 'name'; nameSpan.textContent = 'All Projects';
  allItem.appendChild(nameSpan);
  allItem.addEventListener('click', () => { selectedFolderId = null; fetchAndRender(); });
  // Allow drop to unassign
  allItem.addEventListener('dragover', (e) => { e.preventDefault(); allItem.classList.add('drop-target'); });
  allItem.addEventListener('dragleave', () => allItem.classList.remove('drop-target'));
  allItem.addEventListener('drop', async (e) => {
    e.preventDefault(); allItem.classList.remove('drop-target');
    const projectId = e.dataTransfer.getData('text/plain');
    if (!projectId) return;
    await window.api.updateProject(projectId, { folderId: null });
    fetchAndRender();
  });
  foldersList.appendChild(allItem);
  for (const f of folders) {
    const item = document.createElement('div');
    item.className = 'folder' + (selectedFolderId === f.id ? ' active' : '');
    const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = f.name || 'Folder';
    const ctr = document.createElement('span'); ctr.className = 'controls edit-controls';
    const renameBtn = document.createElement('button'); renameBtn.className = 'btn'; renameBtn.setAttribute('aria-label', 'Rename'); renameBtn.title = 'Rename'; renameBtn.appendChild(createLucideIcon('edit'));
    renameBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const next = prompt('Folder name', f.name || '');
      if (next && next.trim()) { await window.api.renameFolder(f.id, next.trim()); fetchAndRender(); }
    });
    const delBtn = document.createElement('button'); delBtn.className = 'btn delete'; delBtn.setAttribute('aria-label', 'Delete'); delBtn.title = 'Delete'; delBtn.appendChild(createLucideIcon('trash'));
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Delete this folder? Projects will remain, unassigned.')) {
        await window.api.deleteFolder(f.id);
        if (selectedFolderId === f.id) selectedFolderId = null;
        fetchAndRender();
      }
    });
    ctr.appendChild(renameBtn); ctr.appendChild(delBtn);
    item.appendChild(nm); item.appendChild(ctr);
    item.addEventListener('click', () => { selectedFolderId = f.id; fetchAndRender(); });
    // Drag/drop target
    item.addEventListener('dragover', (e) => { e.preventDefault(); item.classList.add('drop-target'); });
    item.addEventListener('dragleave', () => item.classList.remove('drop-target'));
    item.addEventListener('drop', async (e) => {
      e.preventDefault(); item.classList.remove('drop-target');
      const projectId = e.dataTransfer.getData('text/plain');
      if (!projectId) return;
      await window.api.updateProject(projectId, { folderId: f.id });
      fetchAndRender();
    });
    foldersList.appendChild(item);
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
}
btnCloseGs && btnCloseGs.addEventListener('click', closeGettingStarted);

btnCopyPromptTemplate && btnCopyPromptTemplate.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(promptTemplate.value);
    const originalHTML = btnCopyPromptTemplate.innerHTML;
    btnCopyPromptTemplate.innerHTML = '<span class="gs-copy-icon">✓</span><span class="gs-copy-text">Copied to Clipboard!</span>';
    setTimeout(() => (btnCopyPromptTemplate.innerHTML = originalHTML), 2000);
  } catch {
    alert('Failed to copy. Please select and copy the text manually.');
  }
});

// Getting Started Tab Switching
function initGettingStartedTabs() {
  const tabs = document.querySelectorAll('.gs-tab');
  const contents = document.querySelectorAll('.gs-tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      
      // Remove active class from all tabs and contents
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      
      // Add active class to clicked tab and corresponding content
      tab.classList.add('active');
      const targetContent = document.querySelector(`[data-content="${targetTab}"]`);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });
}

// Initialize tabs when document is ready
initGettingStartedTabs();

// Add icons to header buttons dynamically using the createLucideIcon function
function addIconToButton(button, iconName) {
  if (!button) return;
  const icon = createLucideIcon(iconName);
  icon.setAttribute('width', '18');
  icon.setAttribute('height', '18');
  icon.style.marginRight = '6px';
  button.prepend(icon);
}

// Apply icons to header buttons
addIconToButton(btnFeedback, 'feedback');
addIconToButton(btnGettingStarted, 'book-open');
addIconToButton(btnImport, 'import');
addIconToButton(btnToggleEdit, 'edit');
addIconToButton(btnNew, 'plus');
addIconToButton(btnNew2, 'plus');
addIconToButton(document.getElementById('btnImport2'), 'import');

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

function openFolderModal() {
  if (!folderModal) return;
  folderModal.classList.remove('hidden');
  if (folderNameInput) {
    folderNameInput.value = '';
    setTimeout(() => folderNameInput.focus(), 0);
  }
}

function closeFolderModal() {
  if (!folderModal) return;
  folderModal.classList.add('hidden');
}

btnAddFolder && btnAddFolder.addEventListener('click', () => openFolderModal());

// Ensure the add folder button uses a consistent icon
if (btnAddFolder) {
  btnAddFolder.innerHTML = '';
  btnAddFolder.appendChild(createLucideIcon('plus'));
}

btnCancelFolder && btnCancelFolder.addEventListener('click', () => closeFolderModal());

folderForm && folderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw = (folderNameInput && folderNameInput.value) || '';
  const name = raw.trim();
  if (!name) { return; }
  try {
    await window.api.createFolder(name);
    closeFolderModal();
    await fetchAndRender();
  } catch (e) {
    alert('Could not create folder.');
  }
});

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderAttachmentsList() {
  if (!attachmentsList) return;
  attachmentsList.innerHTML = '';
  
  if (projectAttachments.length === 0) {
    return;
  }
  
  for (let i = 0; i < projectAttachments.length; i++) {
    const att = projectAttachments[i];
    const item = document.createElement('div');
    item.className = 'attachment-item';
    
    const info = document.createElement('div');
    info.className = 'attachment-info';
    
    const name = document.createElement('div');
    name.className = 'attachment-name';
    name.textContent = att.filename;
    
    const size = document.createElement('div');
    size.className = 'attachment-size';
    // Estimate size from base64 data
    const estimatedBytes = att.data ? Math.round((att.data.length * 3) / 4) : 0;
    size.textContent = formatFileSize(estimatedBytes);
    
    info.appendChild(name);
    info.appendChild(size);
    
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'attachment-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.onclick = () => {
      projectAttachments.splice(i, 1);
      renderAttachmentsList();
    };
    
    item.appendChild(info);
    item.appendChild(removeBtn);
    attachmentsList.appendChild(item);
  }
}

async function handleAttachmentFiles(files) {
  for (const file of files) {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      projectAttachments.push({
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        data: dataUrl
      });
    } catch (err) {
      console.error('Failed to read file:', file.name, err);
      alert(`Failed to read file: ${file.name}`);
    }
  }
  renderAttachmentsList();
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

attachmentsEl && attachmentsEl.addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  await handleAttachmentFiles(Array.from(files));
  // Clear input so same file can be added again if needed
  e.target.value = '';
});

// Clear code button
btnClearCode && btnClearCode.addEventListener('click', () => {
  if (codeEl) {
    if (codeEl.value && !confirm('Are you sure you want to clear all code? This cannot be undone.')) {
      return;
    }
    codeEl.value = '';
    updateLineNumbers();
    codeEl.focus();
  }
});

// Paste from clipboard button
btnPasteCode && btnPasteCode.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text && codeEl) {
      codeEl.value = text;
      // Use a slight delay to ensure textarea has rendered with the new content
      setTimeout(() => {
        updateLineNumbers();
        syncScrollPosition();
      }, 10);
      codeEl.focus();
    }
  } catch (err) {
    alert('Failed to read from clipboard. Please make sure you have granted clipboard permissions.');
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = titleEl.value.trim();
  const description = descEl.value.trim();
  const code = codeEl.value;
  if (!title || !code) { alert('Please provide Title and HTML/React code.'); return; }
  if (editProjectId) {
    const updates = { 
      title, 
      description, 
      code, 
      offline: !!(offlineEl && offlineEl.checked),
      attachments: projectAttachments 
    };
    if (iconBase64) updates.iconBase64 = iconBase64;
    await window.api.updateProject(editProjectId, updates);
  } else {
    await window.api.createProject({ 
      title, 
      description, 
      iconBase64, 
      code, 
      offline: !!(offlineEl && offlineEl.checked),
      attachments: projectAttachments
    });
  }
  hideModal();
  await fetchAndRender();
});

fetchAndRender();

// Load and display version
async function loadVersion() {
  try {
    const version = await window.api.getVersion();
    if (versionBadge && version) {
      versionBadge.textContent = `v${version}`;
    }
  } catch (e) {
    console.error('Failed to load version:', e);
  }
}
loadVersion();

// Edit controls visibility toggle (default hidden)
document.body.classList.add('edit-hidden');
btnToggleEdit && btnToggleEdit.addEventListener('click', () => {
  if (document.body.classList.contains('edit-hidden')) {
    document.body.classList.remove('edit-hidden');
    btnToggleEdit.textContent = 'Done';
  } else {
    document.body.classList.add('edit-hidden');
    btnToggleEdit.textContent = 'Edit';
  }
});


