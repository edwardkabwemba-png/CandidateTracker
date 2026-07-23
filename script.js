// --- GLOBAL DECLARED CORE STATE CACHE ---
let allRecruitsData = [];

// ------------------- UNIFIED MAIN ROUTER FUNCTION -------------------
function showPage(page) {
  // 1. Hide all page sections
  const pages = document.querySelectorAll('.content, [id^="page-"]');
  pages.forEach(p => {
    if (p.id !== 'page-login') p.style.display = 'none';
  });

  // 2. Remove active state from sidebar navigation links
  const navLinks = document.querySelectorAll('.nav-item, [id^="nav-"]');
  navLinks.forEach(n => n.classList.remove('active'));

  // 3. Display target page and activate its nav button
  const target = document.getElementById(`page-${page}`);
  if (target) target.style.display = 'block';

  const nav = document.getElementById(`nav-${page}`);
  if (nav) nav.classList.add('active');

  // 4. Update Header Title
  const titles = {
    dashboard: 'Dashboard',
    add: 'Add New Recruit',
    jobs: 'Manage Positions',
    sources: 'Manage Sources',
    users: 'Manage Users'
  };
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = titles[page] || page;

  // 5. Toggle Dashboard Search Container Bar
  const sBox = document.getElementById('search-container');
  if (sBox) sBox.style.display = (page === 'dashboard') ? 'flex' : 'none';

  // 6. Clear form alert messages
  const fSuccess = document.getElementById('form-success');
  if (fSuccess) fSuccess.style.display = 'none';
  const fErr = document.getElementById('form-err');
  if (fErr) fErr.style.display = 'none';

  // --- TRIGGER DATA LOADERS FOR ACTIVE VIEW ---
  if (page === 'dashboard') {
    const sInput = document.getElementById('recruit-search'); if (sInput) sInput.value = '';
    const minInput = document.getElementById('filter-min-rate'); if (minInput) minInput.value = '';
    const maxInput = document.getElementById('filter-max-rate'); if (maxInput) maxInput.value = '';
    
    // FETCH RECRUITS FROM AZURE DATABASE & REFRESH TABLE
    renderTable(); 
  } 
  else if (page === 'add') {
    setDefaultSourcedDate();
    loadUsers();
    loadPositions();
    loadSources();
  } 
  else if (page === 'jobs') {
    loadPositions();
  } 
  else if (page === 'sources') {
    loadSources();
  } 
  else if (page === 'users') {
    loadUsers();
  }
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
async function doLogin() {
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-pass').value;
    const errBanner = document.getElementById('login-err');
    
    if (!email || !pass) { 
        errBanner.textContent = "Please fill in all layout credentials.";
        errBanner.style.display = ''; 
        return; 
    }
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: pass })
        });

        if (response.status === 401) throw new Error('Invalid user credentials.');
        if (!response.ok) throw new Error('Database server connection issue.');

        const data = await response.json();

        // 1. Update UI layout displays
        errBanner.style.display = 'none';
        document.getElementById('page-login').style.display = 'none';
        document.getElementById('sidebar').style.display = 'flex';
        document.getElementById('topbar').style.display = 'flex';
        
        document.getElementById('user-name').textContent = data.name || 'Recruiter';
        document.getElementById('user-avatar').textContent = data.avatar || 'U';
        
        // 2. Clear dashboard filter inputs to avoid zero-match filtering
        const sInput = document.getElementById('recruit-search'); if (sInput) sInput.value = '';
        const minInput = document.getElementById('filter-min-rate'); if (minInput) minInput.value = '';
        const maxInput = document.getElementById('filter-max-rate'); if (maxInput) maxInput.value = '';

        // 3. Navigate to dashboard and FORCE-AWAIT the table fetch
        showPage('dashboard');
        await renderTable();

        if (typeof populateFormDropdowns === 'function') populateFormDropdowns();

    } catch (error) {
        errBanner.textContent = error.message;
        errBanner.style.display = '';
    }
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


// Initial load on page startup
document.addEventListener('DOMContentLoaded', () => {
  loadUsers();
  loadPositions();
  loadSources();
});

function setDefaultSourcedDate() {
  const dateInput = document.getElementById('f-date');
  if (!dateInput) return;

  // Get current date
  const today = new Date();
  const year = today.getFullYear();
  // Pad month and day with leading zeros if under 10
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  // Set the field value to YYYYMMDD
  dateInput.value = `${year}${month}${day}`;
}



// Set default date when application initializes
document.addEventListener('DOMContentLoaded', () => {
  setDefaultSourcedDate();
  loadUsers();
  loadPositions();
  loadSources();
});

function clearForm() {
  // Clear other inputs...
  document.getElementById('f-fname').value = '';
  document.getElementById('f-lname').value = '';
  
  // Reset date back to today
  setDefaultSourcedDate();
}

// 1. Sync phone country code dropdown with input formatting
function syncPhoneCode() {
    const countrySelect = document.getElementById('phone-country');
    const phoneInput = document.getElementById('phone-number');
    if (countrySelect && phoneInput) {
        // Keeps focus or updates placeholder prefix if needed
        phoneInput.placeholder = countrySelect.value === 'US' ? '(555) 000-0000' : '+1 555 000 0000';
    }
}

// 2. Character counter for notes/comments textarea
function updateCharCount(textarea) {
    const charCounter = document.getElementById('char-count');
    if (charCounter && textarea) {
        const currentLength = textarea.value.length;
        const maxLength = textarea.maxLength > 0 ? textarea.maxLength : 500;
        charCounter.textContent = `${currentLength}/${maxLength}`;
    }
}

async function submitForm(event) {
    if (event) event.preventDefault();
    console.log("Submitting form to /api/saveRecruit...");

    const fSuccess = document.getElementById('form-success');
    const fErr = document.getElementById('form-err');
    
    if (fSuccess) fSuccess.style.display = 'none';
    if (fErr) fErr.style.display = 'none';

    // Helper to safely extract input values
    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    };

    // 1. Convert uploaded files to base64 array matching the backend expectation
    const fileInput = document.getElementById('supporting-files') || document.getElementById('f-files');
    let filesArray = [];

    if (fileInput && fileInput.files && fileInput.files.length > 0) {
        for (const file of fileInput.files) {
            try {
                const base64Data = await convertFileToBase64(file);
                filesArray.push({
                    fileName: file.name,
                    base64: base64Data
                });
            } catch (fileErr) {
                console.error("Error reading file:", file.name, fileErr);
            }
        }
    }

    // 2. Map payload keys to match backend expected parameters
    const candidateData = {
        date: getVal('f-date') || getVal('sourced-date'),
        recruiter: getVal('f-recruiter') || getVal('recruiter'),
        name: getVal('f-fname') || getVal('first-name'),
        surname: getVal('f-lname') || getVal('surname'),
        role: getVal('f-job') || getVal('recruit-position'),
        mainCountryCode: getVal('f-main-code') || getVal('phone-country') || '+27',
        mainBaseNumber: getVal('f-main-phone') || getVal('contact-number'),
        alternateCountryCode: getVal('f-alt-code') || getVal('alt-phone-country'),
        alternateBaseNumber: getVal('f-alt-phone') || getVal('alt-contact-number'),
        email: getVal('f-email') || getVal('candidate-email'),
        noticePeriod: getVal('f-notice') || getVal('notice-period'),
        currentLocation: getVal('f-location') || getVal('current-location'),
        nationality: getVal('f-nationality') || getVal('nationality'),
        currentRate: getVal('f-crate') || getVal('current-rate'),
        expectedRate: getVal('f-erate') || getVal('expected-rate'),
        outcome: getVal('outcome') || getVal('candidate-outcome') || getVal('recruit-outcome'),
        source: getVal('f-source') || getVal('source'),
        yearsOfExperience: getVal('f-yoe') || getVal('years-experience'),
        comments: getVal('f-comments') || getVal('comments'),
        files: filesArray
    };

    console.log("Payload sending to /api/saveRecruit:", candidateData);

    // Validation checks required by backend
    if (!candidateData.name || !candidateData.surname || !candidateData.email) {
        showFormError("Missing required profile fields (First Name, Surname, or Email).");
        return;
    }

    try {
        const response = await fetch('/api/saveRecruit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(candidateData)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(errText || `Server error: ${response.status}`);
        }

        const resData = await response.json().catch(() => ({}));
        console.log("Save success response:", resData);

        if (fSuccess) {
            fSuccess.textContent = "Recruit successfully saved to database!";
            fSuccess.style.display = 'block';
        }

        // Reset the form after save
        if (typeof clearForm === 'function') {
            clearForm();
        } else {
            const form = document.querySelector('form');
            if (form) form.reset();
        }

        // Refresh main table
        if (typeof renderTable === 'function') {
            await renderTable();
        }

    } catch (error) {
        console.error("Error in saveRecruit request:", error);
        showFormError(error.message);
    }
}

// Helper: Convert file to Base64
function convertFileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// Helper: Error display
function showFormError(msg) {
    const fErr = document.getElementById('form-err');
    if (fErr) {
        fErr.textContent = msg;
        fErr.style.display = 'block';
    } else {
        alert(msg);
    }
}