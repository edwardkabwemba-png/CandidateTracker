// --- GLOBAL DECLARED CORE STATE CACHE ---
let allRecruitsData = [];

// ------------------- SINGLE MAIN ROUTER FUNCTION -------------------
function showPage(page) {
  ['dashboard','add','jobs','sources','users'].forEach(p => {
    const el = document.getElementById('page-'+p); if(el) el.style.display = 'none';
    const n = document.getElementById('nav-'+p); if(n) n.classList.remove('active');
  });
  
  const target = document.getElementById('page-'+page); if(target) target.style.display = '';
  const nav = document.getElementById('nav-'+page); if(nav) nav.classList.add('active');
  
  const titles = {dashboard:'Dashboard', add:'Add New Recruit', jobs:'Manage Positions', sources:'Manage Sources', users:'Manage Users'};
  document.getElementById('page-title').textContent = titles[page] || page;
  
  // Toggle the search container header using flex layout bounds
  const sBox = document.getElementById('search-container');
  if(sBox) sBox.style.display = (page === 'dashboard') ? 'flex' : 'none';

  document.getElementById('form-success').style.display = 'none';
  document.getElementById('form-err').style.display = 'none';

  if (page === 'dashboard') {
    const sInput = document.getElementById('recruit-search'); if(sInput) sInput.value = '';
    const minInput = document.getElementById('filter-min-rate'); if(minInput) minInput.value = '';
    const maxInput = document.getElementById('filter-max-rate'); if(maxInput) maxInput.value = '';
    renderTable();
  }
  if (page === 'jobs') loadPositions();
  if (page === 'sources') loadSources();
  if (page === 'users') loadUsers();
}

// ------------------- DATA INGESTION LOGGER -------------------
async function renderTable() {
  const body = document.getElementById('recruit-table-body');
  if(!body) return;
  body.innerHTML = `<tr><td colspan="6" style="text-align:center;">Loading recruits from database...</td></tr>`;

  try {
    const response = await fetch('/api/getRecruits', { method: 'GET' }); 
    if (!response.ok) throw new Error('Database fetch failed');
    
    allRecruitsData = await response.json();
    filterRecruitsBySearch();
    
  } catch (error) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--rt-red);">Error connecting to database.</td></tr>`;
    console.error('API Error:', error);
  }
}

// ------------------- LIVE COMPOUND SEARCH AND CURRENCY SLIDER FILTER -------------------
function filterRecruitsBySearch() {
  const body = document.getElementById('recruit-table-body');
  if (!body) return;

  const searchStr = document.getElementById('recruit-search').value.toLowerCase().trim();
  const minRate = parseFloat(document.getElementById('filter-min-rate').value) || 0;
  const maxRate = parseFloat(document.getElementById('filter-max-rate').value) || Infinity;
  
  const filteredData = allRecruitsData.filter(r => {
    const posVal = r.position ? String(r.position).toLowerCase() : '';
    const nameVal = r.name ? String(r.name).toLowerCase() : '';
    const matchesText = posVal.includes(searchStr) || nameVal.includes(searchStr);

    const currentRate = parseFloat(r.rate) || 0;
    const matchesRateRange = (currentRate >= minRate) && (currentRate <= maxRate);

    return matchesText && matchesRateRange;
  });

  // Calculate Metrics
  const totalCount = filteredData.length;
  let placedCount = 0;
  let inProgressCount = 0;
  let thisMonthCount = 0;

  const now = new Date();
  const currentMonthPrefix = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0');

  filteredData.forEach(r => {
    if (r.outcome === 'Placed') placedCount++;
    else if (!r.outcome || r.outcome === 'In Progress' || r.outcome === 'On Hold') inProgressCount++;
    if (r.date && String(r.date).trim().startsWith(currentMonthPrefix)) thisMonthCount++;
  });

  document.getElementById('stat-total').textContent = totalCount;
  document.getElementById('stat-month').textContent = thisMonthCount;
  document.getElementById('stat-placed').textContent = placedCount;
  document.getElementById('stat-progress').textContent = inProgressCount;

  if (filteredData.length === 0) {
    body.innerHTML = `<tr><td colspan="6" style="text-align:center;">No matching positions found inside this range.</td></tr>`;
    return;
  }

  body.innerHTML = filteredData.map(r => {
    const bc = r.outcome === 'Placed' ? 'badge-green' : 'badge-amber';
    return `<tr>
      <td>${r.name || 'Unnamed'}</td>
      <td>${r.position || 'Unassigned'}</td>
      <td>${r.source || 'Unknown'}</td>
      <td>${r.date || ''}</td>
      <td>R ${r.rate ? Number(r.rate).toLocaleString() : '0'}</td>
      <td><span class="badge ${bc}">${r.outcome || 'In Progress'}</span></td>
    </tr>`;
  }).join('');
}

// ------------------- AUTHENTICATION CONTROLLER SYSTEM -------------------
function doLogin() {
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-pass').value;
    const errBanner = document.getElementById('login-err');
    
    if (!email || !pass) { 
        errBanner.textContent = "Please fill in all layout credentials.";
        errBanner.style.display = ''; 
        return; 
    }
    
    fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: pass })
    })
    .then(response => {
        if (response.status === 401) throw new Error('Invalid user credentials.');
        if (!response.ok) throw new Error('Database server connection issue.');
        return response.json();
    })
    .then(data => {
        errBanner.style.display = 'none';
        document.getElementById('page-login').style.display = 'none';
        document.getElementById('sidebar').style.display = 'flex';
        document.getElementById('topbar').style.display = 'flex';
        
        // Extract parameters safely from JSON configuration response
        document.getElementById('user-name').textContent = data.name || 'Recruiter';
        document.getElementById('user-avatar').textContent = data.avatar || 'U';
        
        showPage('dashboard');
        if (typeof populateFormDropdowns === 'function') populateFormDropdowns();
    })
    .catch(error => {
        errBanner.textContent = error.message;
        errBanner.style.display = '';
    });
}

function entralogin() {
  document.getElementById('page-login').style.display='none';
  document.getElementById('sidebar').style.display='flex';
  document.getElementById('topbar').style.display='flex';
  document.getElementById('user-name').textContent='Entra User';
  document.getElementById('user-avatar').textContent='EU';
  showPage('dashboard');
  if (typeof populateFormDropdowns === 'function') populateFormDropdowns();
}

function logout() {
  document.getElementById('sidebar').style.display='none';
  document.getElementById('page-login').style.display='flex';
  document.getElementById('topbar').style.display='none';
  ['dashboard','add','jobs','sources','users'].forEach(p => {
    const el = document.getElementById('page-'+p); if(el) el.style.display='none';
  });
}

// ------------------- ADMIN & CONFIG MANAGEMENT METHODS -------------------
async function loadUsers() {
  const tbody = document.getElementById('users-list'); if(!tbody) return;
  tbody.innerHTML = `<tr><td colspan="3">Loading system users...</td></tr>`;
  try {
    const res = await fetch('/api/getUsers');
    const data = await res.json();
    tbody.innerHTML = data.map(item => `
      <tr>
        <td><strong>${item.name || 'Unnamed'}</strong></td>
        <td>${item.email || ''}</td>
        <td><span class="avatar">${item.avatar || 'U'}</span></td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3" style="color:var(--rt-red)">Error loading users pipeline.</td></tr>`;
  }
}

async function addUser() {
  const name = document.getElementById('new-user-name').value.trim();
  const email = document.getElementById('new-user-email').value.trim();
  const password = document.getElementById('new-user-password').value;
  
  if(!name || !email || !password) {
    alert('Please fill out all user credentials.');
    return;
  }

  try {
    const response = await fetch('/api/saveUsers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });

    // Extract the server response payload
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      // Throw the detailed error returned by the Azure Function
      throw new Error(data.details || data.message || `Server returned status ${response.status}`);
    }

    // Clear form inputs on success
    document.getElementById('new-user-name').value = '';
    document.getElementById('new-user-email').value = '';
    document.getElementById('new-user-password').value = '';

    loadUsers();
    if (typeof populateFormDropdowns === 'function') populateFormDropdowns();

  } catch(e) {
    alert('Error adding user profile: ' + e.message);
  }
}

async function loadPositions() {
  const tbody = document.getElementById('jobs-list'); if(!tbody) return;
  tbody.innerHTML = `<tr><td colspan="2">Loading layout tables...</td></tr>`;
  try {
    const res = await fetch('/api/getPositions');
    const data = await res.json();
    tbody.innerHTML = data.map(item => `<tr><td>${item.title}</td><td><span class="badge badge-green">Active</span></td></tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="2" style="color:var(--rt-red)">Error loading positions.</td></tr>`;
  }
}

async function loadSources() {
  const tbody = document.getElementById('sources-list'); if(!tbody) return;
  tbody.innerHTML = `<tr><td colspan="2">Loading layout tables...</td></tr>`;
  try {
    const res = await fetch('/api/getSources');
    const data = await res.json();
    tbody.innerHTML = data.map(item => `<tr><td>${item.title}</td><td><span class="badge badge-green">Active</span></td></tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="2" style="color:var(--rt-red)">Error loading sources.</td></tr>`;
  }
}

async function addItem(type) {
  const inputId = type === 'job' ? 'new-job' : 'new-source';
  const val = document.getElementById(inputId).value.trim();
  if(!val) return;
  const endpoint = type === 'job' ? '/api/savePositions' : '/api/saveSources';
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: val })
    });
    if (!response.ok) throw new Error('Database layout update issue.');
    document.getElementById(inputId).value = '';
    if (type === 'job') loadPositions(); else loadSources();
    if (typeof populateFormDropdowns === 'function') populateFormDropdowns();
  } catch (error) {
    alert('Error adding item: ' + error.message);
  }
}

// Note: Ensure functions missing from original clip snippet like syncPhoneCode(), 
// fmtDate(), updateCharCount(), clearForm(), and submitForm() are appended if needed.

/**
 * Fetches sources from /api/Sources and populates both:
 * 1. The Add Recruit form dropdown (#f-source)
 * 2. The Manage Sources admin table (#sources-list)
 */
// ==========================================
// 1. DATA LOADING FUNCTIONS
// ==========================================

/**
 * Fetches sources from /api/Sources and populates both:
 * 1. The Add Recruit form dropdown (#f-source)
 * 2. The Manage Sources admin table (#sources-list)
 */
async function loadSources() {
  try {
    const response = await fetch('/api/getSources');
    if (!response.ok) {
      throw new Error(`Failed to fetch sources: ${response.statusText}`);
    }

    const sources = await response.json();

    // 1. Populate the Add Recruit form dropdown (#f-source)
    const sourceDropdown = document.getElementById('f-source');
    if (sourceDropdown) {
      sourceDropdown.innerHTML = '<option value="">— select source —</option>';
      
      sources.forEach((source) => {
        const option = document.createElement('option');
        // Uses SourceID if available, falls back to SourceName
        option.value = source.SourceID || source.SourceName; 
        option.textContent = source.SourceName;
        sourceDropdown.appendChild(option);
      });
    }

    // 2. Populate the Manage Sources table (#sources-list)
    const sourcesTableBody = document.getElementById('sources-list');
    if (sourcesTableBody) {
      sourcesTableBody.innerHTML = '';
      if (sources.length === 0) {
        sourcesTableBody.innerHTML = '<tr><td colspan="2">No sources found.</td></tr>';
      } else {
        sources.forEach((source) => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${escapeHtml(source.SourceName)}</td>
            <td><span class="badge badge-active">Active</span></td>
          `;
          sourcesTableBody.appendChild(row);
        });
      }
    }
  } catch (error) {
    console.error('Error loading sources:', error);
  }
}

// Utility function to safely display text in HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


// ==========================================
// 2. INITIALIZATION / PAGE LOAD (Step 3)
// ==========================================

// Run this when the web page finishes loading
document.addEventListener('DOMContentLoaded', () => {
  // Load sources right when the app starts
  loadSources();
});

// IF YOU HAVE A NAVIGATION / SWITCH-PAGE FUNCTION:
// Call loadSources() whenever the user opens the "Add Recruit" or "Manage Sources" screen
function showPage(pageId) {
  // ... your existing page switching code ...
  
  if (pageId === 'add-recruit-page' || pageId === 'manage-sources-page') {
    loadSources();
  }
}