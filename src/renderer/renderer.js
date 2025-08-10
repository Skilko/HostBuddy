const grid = document.getElementById('projectsGrid');
const empty = document.getElementById('emptyState');
const btnNew = document.getElementById('btnNew');
const btnGettingStarted = document.getElementById('btnGettingStarted');
const btnNew2 = document.getElementById('btnNew2');
const modal = document.getElementById('modal');
const form = document.getElementById('projectForm');
const btnCancel = document.getElementById('btnCancel');
const titleEl = document.getElementById('title');
const descEl = document.getElementById('description');
const iconEl = document.getElementById('icon');
const codeEl = document.getElementById('code');
const offlineEl = document.getElementById('offline');
const modalTitle = document.getElementById('modalTitle');
const gsModal = document.getElementById('gsModal');
const btnCloseGs = document.getElementById('btnCloseGs');
const btnCopyPrompt = document.getElementById('btnCopyPrompt');
const promptTemplate = document.getElementById('promptTemplate');
const loadingOverlay = document.getElementById('loadingOverlay');

let iconBase64 = null;
let editProjectId = null;

function showModal() { modal.classList.remove('hidden'); }
function hideModal() { modal.classList.add('hidden'); form.reset(); iconBase64 = null; editProjectId = null; if (modalTitle) modalTitle.textContent = 'Create Project'; }

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
    avatar.src = p.iconBase64 || '';
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
    if (p.iconBase64) row.appendChild(avatar); else { const ph = document.createElement('div'); ph.className='avatar'; row.appendChild(ph); }
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
    const deleteBtn = document.createElement('button'); deleteBtn.className = 'btn delete'; deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = async () => {
      if (confirm(`Delete "${p.title}"? This cannot be undone.`)) {
        await window.api.deleteProject(p.id);
        await fetchAndRender();
      }
    };
    actions.appendChild(runBtn); actions.appendChild(editBtn); actions.appendChild(deleteBtn);
    card.appendChild(row); card.appendChild(actions);
    grid.appendChild(card);
  }
}

btnNew.addEventListener('click', () => openCreateModal());
btnGettingStarted.addEventListener('click', () => openGettingStarted());
btnNew2.addEventListener('click', () => openCreateModal());
btnCancel.addEventListener('click', hideModal);
btnCloseGs && btnCloseGs.addEventListener('click', closeGettingStarted);
btnCopyPrompt && btnCopyPrompt.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(promptTemplate.value);
    btnCopyPrompt.textContent = 'Copied!';
    setTimeout(() => (btnCopyPrompt.textContent = 'Copy Prompt'), 1200);
  } catch {}
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


