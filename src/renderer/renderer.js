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

// Default icon used when a project has no uploaded icon
const DEFAULT_APP_ICON = '../../assets/default-app.png';

let iconBase64 = null;
let editProjectId = null;

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
  showModal();
  updateLineNumbers();
}

async function fetchAndRender() {
  const projects = await window.api.listProjects();
  grid.innerHTML = '';
  if (!projects || projects.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  for (const p of projects) {
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
    const runBtn = document.createElement('button'); runBtn.className = 'btn run'; runBtn.textContent = 'Run';
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
    const editBtn = document.createElement('button'); editBtn.className = 'btn'; editBtn.textContent = 'Edit';
    editBtn.onclick = () => openEditModal(p);
    const exportBtn = document.createElement('button'); exportBtn.className = 'btn'; exportBtn.textContent = 'Export';
    exportBtn.onclick = async () => {
      try {
        await window.api.exportProject(p.id);
      } catch (e) {
        alert('Export failed.');
      }
    };
    const deleteBtn = document.createElement('button'); deleteBtn.className = 'btn delete'; deleteBtn.textContent = 'Delete';
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
  if (!title || !code) { alert('Please provide Title and HTML/React code.'); return; }
  if (editProjectId) {
    const updates = { title, description, code, offline: !!(offlineEl && offlineEl.checked) };
    if (iconBase64) updates.iconBase64 = iconBase64;
    await window.api.updateProject(editProjectId, updates);
  } else {
    await window.api.createProject({ title, description, iconBase64, code, offline: !!(offlineEl && offlineEl.checked) });
  }
  hideModal();
  await fetchAndRender();
});

fetchAndRender();


