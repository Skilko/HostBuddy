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
const btnSettings = document.getElementById('btnSettings');
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
const dropZone = document.getElementById('dropZone');
const dropZoneInput = document.getElementById('dropZoneInput');
const projectFilesList = document.getElementById('projectFilesList');
const btnClearCode = document.getElementById('btnClearCode');
const btnPasteCode = document.getElementById('btnPasteCode');
const btnCopyAiContext = document.getElementById('btnCopyAiContext');
const btnCopyAiContextText = document.getElementById('btnCopyAiContextText');
const versionBadge = document.getElementById('versionBadge');
const exportForAIStep = document.getElementById('exportForAIStep');
const btnExportForAI = document.getElementById('btnExportForAI');
const stageTabs = document.querySelectorAll('.stage-tab');
const stageContents = document.querySelectorAll('.stage-content');
const stageConnectors = document.querySelectorAll('.stage-connector');
const btnPrevStage = document.getElementById('btnPrevStage');
const btnNextStage = document.getElementById('btnNextStage');
const stageImproveTab = document.getElementById('stageImproveTab');

const customPictureInput = document.getElementById('customPictureInput');
const pictureHint = document.getElementById('pictureHint');
const pictureModeRadios = document.querySelectorAll('input[name="pictureMode"]');

// Default icon used when a project has no uploaded icon
const DEFAULT_APP_ICON = '../../assets/default-app.png';

let iconBase64 = null;
let pictureMode = 'default'; // 'default' | 'screenshot' | 'custom'
let editProjectId = null;
let selectedFolderId = null;
let projectAttachments = [];
let projectFiles = []; // Array of { filename, mimeType, data (base64 dataUri), isHtml }
let mainFileIndex = 0;
let currentEditProject = null;
let currentStage = 'setup';
const stages = ['setup', 'code', 'improve'];

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
    case 'sparkles': {
      svg.appendChild(p('M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z'));
      svg.appendChild(p('M5 19l1 3 1-3 3-1-3-1-1-3-1 3-3 1 3 1z'));
      svg.appendChild(p('M19 13l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5L17 15l1.5-.5.5-1.5z'));
      break;
    }
    case 'settings': {
      svg.appendChild(p('M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'));
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '3');
      svg.appendChild(c);
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
  currentEditProject = null;
  projectAttachments = [];
  projectFiles = [];
  mainFileIndex = 0;
  renderAttachmentsList();
  renderProjectFilesList();
  if (modalTitle) modalTitle.textContent = 'Create Project';
  updateLineNumbers();
  switchToStage('setup');
  // Reset code input tabs to "Drop Files"
  document.querySelectorAll('.code-input-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.code-input-panel').forEach(p => p.classList.remove('active'));
  const dropTab = document.querySelector('[data-input-tab="drop"]');
  const dropPanel = document.querySelector('[data-input-panel="drop"]');
  if (dropTab) dropTab.classList.add('active');
  if (dropPanel) dropPanel.classList.add('active');
}

// Stage navigation functions
function switchToStage(stageName) {
  currentStage = stageName;
  const stageIndex = stages.indexOf(stageName);
  
  // Update tabs
  stageTabs.forEach((tab, idx) => {
    const tabStage = tab.dataset.stage;
    tab.classList.remove('active', 'completed');
    if (tabStage === stageName) {
      tab.classList.add('active');
    } else if (stages.indexOf(tabStage) < stageIndex) {
      tab.classList.add('completed');
    }
  });
  
  // Update connectors
  stageConnectors.forEach((connector, idx) => {
    connector.classList.remove('completed');
    if (idx < stageIndex) {
      connector.classList.add('completed');
    }
  });
  
  // Update content
  stageContents.forEach(content => {
    content.classList.remove('active');
    if (content.dataset.stageContent === stageName) {
      content.classList.add('active');
    }
  });
  
  // Update navigation buttons
  updateStageNavButtons();
  
  // Update line numbers if switching to code stage
  if (stageName === 'code') {
    setTimeout(updateLineNumbers, 0);
  }
}

function updateStageNavButtons() {
  const stageIndex = stages.indexOf(currentStage);
  const isEditing = !!editProjectId;
  
  // Show/hide previous button
  if (btnPrevStage) {
    btnPrevStage.style.display = stageIndex > 0 ? 'inline-flex' : 'none';
  }
  
  // Show/hide next button (hide on last stage, or hide "improve" stage for new projects)
  if (btnNextStage) {
    const isLastAccessibleStage = isEditing ? (stageIndex >= stages.length - 1) : (stageIndex >= 1);
    btnNextStage.style.display = isLastAccessibleStage ? 'none' : 'inline-flex';
  }
  
  // Hide/show improve tab for new projects
  if (stageImproveTab) {
    stageImproveTab.style.display = isEditing ? 'flex' : 'none';
  }
  // Hide/show the second connector too
  if (stageConnectors[1]) {
    stageConnectors[1].style.display = isEditing ? 'block' : 'none';
  }
}

function goToNextStage() {
  const stageIndex = stages.indexOf(currentStage);
  const isEditing = !!editProjectId;
  const maxStage = isEditing ? stages.length - 1 : 1; // New projects can only go to 'code' stage
  
  if (stageIndex < maxStage) {
    switchToStage(stages[stageIndex + 1]);
  }
}

function goToPrevStage() {
  const stageIndex = stages.indexOf(currentStage);
  if (stageIndex > 0) {
    switchToStage(stages[stageIndex - 1]);
  }
}

// Stage tab click handlers
stageTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetStage = tab.dataset.stage;
    const isEditing = !!editProjectId;
    
    // Prevent navigating to 'improve' stage for new projects
    if (targetStage === 'improve' && !isEditing) {
      return;
    }
    
    switchToStage(targetStage);
  });
});

// Stage navigation button handlers
btnPrevStage && btnPrevStage.addEventListener('click', goToPrevStage);
btnNextStage && btnNextStage.addEventListener('click', goToNextStage);

function openCreateModal() {
  editProjectId = null;
  currentEditProject = null;
  if (modalTitle) modalTitle.textContent = 'Create Project';
  form.reset();
  iconBase64 = null;
  projectAttachments = [];
  projectFiles = [];
  mainFileIndex = 0;
  renderAttachmentsList();
  renderProjectFilesList();
  if (offlineEl) offlineEl.checked = false;
  const defaultRadio = document.querySelector('input[name="pictureMode"][value="default"]');
  if (defaultRadio) defaultRadio.checked = true;
  setPictureMode('default');
  switchToStage('setup');
  showModal();
}

function openGettingStarted() {
  if (gsModal) gsModal.classList.remove('hidden');
}
function closeGettingStarted() {
  if (gsModal) gsModal.classList.add('hidden');
}

async function openEditModal(projectSummary) {
  const project = await window.api.getProject(projectSummary.id);
  if (!project) { alert('Could not load project data.'); return; }
  editProjectId = project.id;
  currentEditProject = project;
  if (modalTitle) modalTitle.textContent = 'Edit Project';
  titleEl.value = project.title || '';
  descEl.value = project.description || '';
  codeEl.value = project.code || '';
  iconEl.value = '';
  iconBase64 = null;
  projectAttachments = Array.isArray(project.attachments) ? [...project.attachments] : [];
  renderAttachmentsList();
  if (offlineEl) offlineEl.checked = !!project.offline;
  // Restore picture mode from project data
  const mode = project.useAppScreenshot ? 'screenshot' : (project.iconBase64 ? 'custom' : 'default');
  const radio = document.querySelector(`input[name="pictureMode"][value="${mode}"]`);
  if (radio) radio.checked = true;
  setPictureMode(mode);
  switchToStage('setup');
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
    avatar.src = p.useAppScreenshot && p.thumbnailBase64
      ? p.thumbnailBase64
      : (p.iconBase64 || DEFAULT_APP_ICON);
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
    const exportBtn = document.createElement('button'); exportBtn.className = 'btn'; exportBtn.setAttribute('aria-label', 'Export'); exportBtn.title = 'Export .hbproject'; exportBtn.appendChild(createLucideIcon('upload'));
    exportBtn.onclick = async () => {
      try { await window.api.exportProject(p.id); } catch (e) { alert('Export failed.'); }
    };
    exportBtn.oncontextmenu = async (e) => {
      e.preventDefault();
      try { await window.api.exportProjectHtml(p.id); } catch (e) { alert('Export as HTML failed.'); }
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

// Settings is icon-only — add icon without margin
if (btnSettings) {
  const icon = createLucideIcon('settings');
  icon.setAttribute('width', '18');
  icon.setAttribute('height', '18');
  btnSettings.prepend(icon);
}

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

// ---- Picture mode radio handling ----
function setPictureMode(mode) {
  pictureMode = mode;
  if (customPictureInput) customPictureInput.classList.toggle('hidden', mode !== 'custom');
  if (mode !== 'custom') { iconBase64 = null; if (iconEl) iconEl.value = ''; }
  if (pictureHint) {
    const hints = {
      default: 'The default HostBuddy icon will be used.',
      screenshot: 'The picture updates each time you run the project.',
      custom: 'Upload an image to use as the project picture.'
    };
    pictureHint.textContent = hints[mode] || '';
  }
}
pictureModeRadios.forEach(radio => {
  radio.addEventListener('change', () => setPictureMode(radio.value));
});

attachmentsEl && attachmentsEl.addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  await handleDroppedFiles(Array.from(files));
  e.target.value = '';
});

// ---- Code input tab switching ----
document.querySelectorAll('.code-input-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.code-input-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.code-input-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const panel = document.querySelector(`[data-input-panel="${tab.dataset.inputTab}"]`);
    if (panel) panel.classList.add('active');
    if (tab.dataset.inputTab === 'paste') setTimeout(updateLineNumbers, 0);
  });
});

// ---- Drop zone ----
function isHtmlFile(name) { return /\.(html?|htm)$/i.test(name); }
function isImageFile(name) { return /\.(png|jpe?g|gif|webp|svg)$/i.test(name); }

async function handleDroppedFiles(files) {
  for (const file of files) {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const isHtml = isHtmlFile(file.name);
      projectFiles.push({ filename: file.name, mimeType: file.type || 'application/octet-stream', data: dataUrl, isHtml });
    } catch (err) {
      alert(`Failed to read file: ${file.name}`);
    }
  }
  autoSelectMainFile();
  renderProjectFilesList();
  syncFilesToCodeAndAttachments();
}

function autoSelectMainFile() {
  const htmlFiles = projectFiles.filter(f => f.isHtml);
  if (htmlFiles.length === 0) { mainFileIndex = -1; return; }
  const indexFile = projectFiles.findIndex(f => f.isHtml && /^index\.html?$/i.test(f.filename));
  if (indexFile >= 0) { mainFileIndex = indexFile; return; }
  const first = projectFiles.findIndex(f => f.isHtml);
  mainFileIndex = first >= 0 ? first : -1;
}

function syncFilesToCodeAndAttachments() {
  if (mainFileIndex >= 0 && mainFileIndex < projectFiles.length) {
    const mainFile = projectFiles[mainFileIndex];
    const raw = mainFile.data;
    const base64Part = raw.includes(',') ? raw.split(',')[1] : raw;
    try { codeEl.value = atob(base64Part); } catch (_) { codeEl.value = ''; }
    updateLineNumbers();
  }
  projectAttachments = projectFiles.filter((f, i) => i !== mainFileIndex && !f.isHtml).map(f => ({
    filename: f.filename, mimeType: f.mimeType, data: f.data
  }));
}

function renderProjectFilesList() {
  if (!projectFilesList) return;
  projectFilesList.innerHTML = '';
  if (projectFiles.length === 0) return;

  const header = document.createElement('div');
  header.className = 'project-files-header';
  header.textContent = `Project Files (${projectFiles.length})`;
  projectFilesList.appendChild(header);

  for (let i = 0; i < projectFiles.length; i++) {
    const f = projectFiles[i];
    const item = document.createElement('div');
    item.className = 'project-file-item';

    if (f.isHtml) {
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'mainFile';
      radio.className = 'file-radio';
      radio.checked = (i === mainFileIndex);
      radio.onchange = () => { mainFileIndex = i; syncFilesToCodeAndAttachments(); renderProjectFilesList(); };
      item.appendChild(radio);
    }

    const info = document.createElement('div');
    info.className = 'file-info';
    const name = document.createElement('div');
    name.className = 'file-name';
    name.textContent = f.filename;
    const size = document.createElement('div');
    size.className = 'file-size';
    const bytes = f.data ? Math.round((f.data.length * 3) / 4) : 0;
    size.textContent = formatFileSize(bytes);
    info.appendChild(name);
    info.appendChild(size);
    item.appendChild(info);

    if (i === mainFileIndex) {
      const badge = document.createElement('span');
      badge.className = 'file-main-badge';
      badge.textContent = 'Main';
      item.appendChild(badge);
    }

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'file-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.onclick = () => {
      projectFiles.splice(i, 1);
      autoSelectMainFile();
      renderProjectFilesList();
      syncFilesToCodeAndAttachments();
    };
    item.appendChild(removeBtn);
    projectFilesList.appendChild(item);
  }
}

if (dropZone) {
  dropZone.addEventListener('click', () => dropZoneInput && dropZoneInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files && files.length > 0) await handleDroppedFiles(Array.from(files));
  });
}
if (dropZoneInput) {
  dropZoneInput.addEventListener('change', async (e) => {
    if (e.target.files && e.target.files.length > 0) await handleDroppedFiles(Array.from(e.target.files));
    e.target.value = '';
  });
}

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

// Copy AI Context button (in code stage)
btnCopyAiContext && btnCopyAiContext.addEventListener('click', async () => {
  try {
    // Get the AI context template from the Getting Started modal
    const templateText = promptTemplate ? promptTemplate.value : '';
    if (!templateText) {
      alert('Could not find AI context template.');
      return;
    }
    
    await navigator.clipboard.writeText(templateText);
    
    // Visual feedback
    if (btnCopyAiContextText) {
      const originalText = btnCopyAiContextText.textContent;
      btnCopyAiContextText.textContent = 'Copied!';
      setTimeout(() => {
        btnCopyAiContextText.textContent = originalText;
      }, 2000);
    }
  } catch (err) {
    alert('Failed to copy to clipboard. Please try again.');
  }
});

// Export for AI from edit modal
btnExportForAI && btnExportForAI.addEventListener('click', async () => {
  if (!currentEditProject) {
    alert('Please save the project first before exporting for AI.');
    return;
  }
  try {
    await window.api.exportProjectForAI(currentEditProject.id);
  } catch (e) {
    alert('Export failed: ' + (e.message || e));
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = titleEl.value.trim();
  const description = descEl.value.trim();
  const code = codeEl.value;
  if (!title) { alert('Please provide a project title.'); return; }
  if (!code && projectFiles.length === 0) { alert('Please provide code or drop files.'); return; }
  // Build the attachments list: non-main, non-HTML files from projectFiles + any manually added attachments
  const allAttachments = [...projectAttachments];
  for (const f of projectFiles) {
    const idx = projectFiles.indexOf(f);
    if (idx === mainFileIndex) continue;
    if (f.isHtml) continue;
    if (!allAttachments.some(a => a.filename === f.filename)) {
      allAttachments.push({ filename: f.filename, mimeType: f.mimeType, data: f.data });
    }
  }
  const useAppScreenshot = pictureMode === 'screenshot';
  if (editProjectId) {
    const updates = { title, description, code, offline: !!(offlineEl && offlineEl.checked), attachments: allAttachments, useAppScreenshot };
    if (pictureMode === 'custom' && iconBase64) updates.iconBase64 = iconBase64;
    if (pictureMode !== 'custom') updates.iconBase64 = null;
    await window.api.updateProject(editProjectId, updates);
  } else {
    await window.api.createProject({ title, description, iconBase64: pictureMode === 'custom' ? iconBase64 : null, code, offline: !!(offlineEl && offlineEl.checked), attachments: allAttachments, useAppScreenshot });
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
  const textNode = Array.from(btnToggleEdit.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
  if (document.body.classList.contains('edit-hidden')) {
    document.body.classList.remove('edit-hidden');
    if (textNode) textNode.textContent = 'Done';
  } else {
    document.body.classList.add('edit-hidden');
    if (textNode) textNode.textContent = 'Edit';
  }
});

// ---- Settings modal ----
const settingsModal = document.getElementById('settingsModal');
const settingsProjectsDir = document.getElementById('settingsProjectsDir');
const btnChangeProjectsDir = document.getElementById('btnChangeProjectsDir');
const btnCloseSettings = document.getElementById('btnCloseSettings');

async function openSettingsModal() {
  if (!settingsModal) return;
  settingsModal.classList.remove('hidden');
  try {
    const dir = await window.api.getProjectsDir();
    if (settingsProjectsDir) settingsProjectsDir.textContent = dir || 'Default';
  } catch (_) {}
}

btnSettings && btnSettings.addEventListener('click', openSettingsModal);
btnCloseSettings && btnCloseSettings.addEventListener('click', () => settingsModal && settingsModal.classList.add('hidden'));

btnChangeProjectsDir && btnChangeProjectsDir.addEventListener('click', async () => {
  try {
    const newDir = await window.api.setProjectsDir();
    if (newDir && settingsProjectsDir) {
      settingsProjectsDir.textContent = newDir;
    }
  } catch (_) {
    alert('Failed to change directory.');
  }
});

// ---- File association: import on open ----
if (window.api.onImportFile) {
  window.api.onImportFile(async (filePath) => {
    try {
      const res = await window.api.importProjectFile(filePath);
      if (res && res.length) await fetchAndRender();
    } catch (_) {}
  });
}

// ---- Global drag-to-import for .hbproject files ----
const globalDropOverlay = document.getElementById('globalDropOverlay');
let dragCounter = 0;

document.addEventListener('dragenter', (e) => {
  if (modal && !modal.classList.contains('hidden')) return;
  const items = e.dataTransfer && e.dataTransfer.items;
  if (!items) return;
  const hasHbproject = Array.from(items).some(i => i.kind === 'file');
  if (hasHbproject) {
    dragCounter++;
    if (globalDropOverlay) globalDropOverlay.classList.remove('hidden');
  }
});

document.addEventListener('dragleave', () => {
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    if (globalDropOverlay) globalDropOverlay.classList.add('hidden');
  }
});

document.addEventListener('dragover', (e) => {
  if (modal && !modal.classList.contains('hidden')) return;
  e.preventDefault();
});

document.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragCounter = 0;
  if (globalDropOverlay) globalDropOverlay.classList.add('hidden');
  if (modal && !modal.classList.contains('hidden')) return;
  const files = e.dataTransfer && e.dataTransfer.files;
  if (!files) return;
  let imported = false;
  for (const file of files) {
    if (file.name.endsWith('.hbproject') || file.name.endsWith('.hbproj')) {
      try {
        const filePath = window.api.getFilePathFromDrop ? window.api.getFilePathFromDrop(file) : file.path;
        if (filePath) {
          const res = await window.api.importProjectFile(filePath);
          if (res) imported = true;
        }
      } catch (_) {}
    }
  }
  if (imported) await fetchAndRender();
});


