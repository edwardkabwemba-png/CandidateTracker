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
async function loadSources() {
  const sourceSelect = document.getElementById('f-source');
  if (!sourceSelect) return;

  try {
    const response = await fetch('/api/getSources');
    if (!response.ok) {
      throw new Error(`Server returned HTTP status ${response.status}`);
    }

    const sources = await response.json();

    // Reset dropdown to default option
    sourceSelect.innerHTML = '<option value="">— select source —</option>';

    // Append database records as dropdown options
    sources.forEach(source => {
      const option = document.createElement('option');
      // Use SourceID as value, and SourceName for display
      option.value = source.SourceID || source.SourceName;
      option.textContent = source.SourceName;
      sourceSelect.appendChild(option);
    });

  } catch (error) {
    console.error('Error loading sources from DB:', error);
    sourceSelect.innerHTML = '<option value="">— failed to load sources —</option>';
  }
}

// Call loadSources when initializing the app or navigating to the 'add' page
document.addEventListener('DOMContentLoaded', () => {
  loadSources();
});

async function loadPositions() {
  const jobSelect = document.getElementById('f-job');
  const jobsTableBody = document.getElementById('jobs-list');

  try {
    const response = await fetch('/api/getPositions');
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const positions = await response.json();

    // 1. Populate the dropdown on the "Add Recruit" page
    if (jobSelect) {
      jobSelect.innerHTML = '<option value="">— select position —</option>';
      positions.forEach(pos => {
        const option = document.createElement('option');
        option.value = pos.id;
        option.textContent = pos.title;
        jobSelect.appendChild(option);
      });
    }

    // 2. Populate the table on the "Manage Positions" page
    if (jobsTableBody) {
      jobsTableBody.innerHTML = '';
      if (positions.length === 0) {
        jobsTableBody.innerHTML = '<tr><td colspan="2" style="text-align:center; color:#888;">No positions found</td></tr>';
      } else {
        positions.forEach(pos => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${escapeHtml(pos.title)}</td>
            <td><span class="badge active" style="background:#e6f4ea; color:#137333; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600;">Active</span></td>
          `;
          jobsTableBody.appendChild(row);
        });
      }
    }

  } catch (error) {
    console.error('Error loading positions:', error);
    if (jobSelect) {
      jobSelect.innerHTML = '<option value="">— failed to load positions —</option>';
    }
  }
}

// Utility function to safely display text without XSS vulnerabilities
function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
  });
}

// Automatically load positions when the page loads
document.addEventListener('DOMContentLoaded', () => {
  loadPositions();
});

function showPage(pageId) {
    // 1. Hide all pages
    const pages = document.querySelectorAll('.content');
    pages.forEach(p => p.style.display = 'none');

    // 2. Show the selected page
    const selectedPage = document.getElementById(`page-${pageId}`);
    if (selectedPage) {
        selectedPage.style.display = 'block';
    }

    // --- ADD STEP 2 HERE ---
    // Fetch fresh database records whenever these pages open
    if (pageId === 'add' || pageId === 'jobs') {
        loadPositions();
    }
    if (pageId === 'add' || pageId === 'sources') {
        loadSources();
    }
}

// ALSO ADD IT HERE: Run once when the web page finishes loading
document.addEventListener('DOMContentLoaded', () => {
    loadPositions();
    loadSources();
});

async function loadUsers() {
  const recruiterSelect = document.getElementById('f-recruiter');
  const usersTableBody = document.getElementById('users-list');

  try {
    const response = await fetch('/api/getUsers');
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const users = await response.json();

    // 1. Populate the Recruiter dropdown (<select id="f-recruiter">)
    if (recruiterSelect) {
      recruiterSelect.innerHTML = '<option value="">— select recruiter —</option>';
      users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.name;
        recruiterSelect.appendChild(option);
      });
    }

    // 2. Populate the Manage Users table (<tbody id="users-list">)
    if (usersTableBody) {
      usersTableBody.innerHTML = '';
      if (users.length === 0) {
        usersTableBody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#888;">No users found</td></tr>';
      } else {
        users.forEach(user => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${escapeHtml(user.name)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td><span class="avatar-badge" style="background:#e8f0fe; color:var(--rt-navy); padding:2px 8px; border-radius:4px; font-weight:600; font-size:12px;">${escapeHtml(user.avatar)}</span></td>
          `;
          usersTableBody.appendChild(row);
        });
      }
    }

  } catch (error) {
    console.error('Error loading users:', error);
    if (recruiterSelect) {
      recruiterSelect.innerHTML = '<option value="">— failed to load recruiters —</option>';
    }
  }
}

function showPage(pageId) {
  // Hide all pages
  const pages = document.querySelectorAll('.content');
  pages.forEach(p => p.style.display = 'none');

  // Show selected page
  const selectedPage = document.getElementById(`page-${pageId}`);
  if (selectedPage) {
    selectedPage.style.display = 'block';
  }

  // Refresh dynamic database options based on active tab
  if (pageId === 'add' || pageId === 'users') {
    loadUsers();
  }
  if (pageId === 'add' || pageId === 'jobs') {
    loadPositions();
  }
  if (pageId === 'add' || pageId === 'sources') {
    loadSources();
  }
}

// Initial load on page startup
document.addEventListener('DOMContentLoaded', () => {
  loadUsers();
  loadPositions();
  loadSources();
});