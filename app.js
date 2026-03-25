/* ============================================================
   FULL-STACK MIGRATION - app.js
   Auth: Node.js/Express backend (JWT)
   Data: Backend API (in-memory, ready for MySQL)
   ============================================================ */

const API_URL = 'http://localhost:3000';

/* ============================================================
   AUTH HELPERS
   ============================================================ */

function getAuthHeader() {
  const token = sessionStorage.getItem('authToken');
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

function isLoggedIn() {
  return !!sessionStorage.getItem('authToken');
}

function getCurrentUser() {
  const u = sessionStorage.getItem('currentUser');
  return u ? JSON.parse(u) : null;
}

/* ============================================================
   GLOBAL STATE
   ============================================================ */

let currentUser = null;

// In-memory data (non-auth features kept client-side for now)
window.db = {
  departments: [],
  employees: [],
  requests: []
};

// Load non-auth data from localStorage (departments, employees, requests)
function loadLocalData() {
  try {
    const raw = localStorage.getItem('ipt_local_data');
    if (raw) {
      const parsed = JSON.parse(raw);
      window.db.departments = parsed.departments || [];
      window.db.employees   = parsed.employees   || [];
      window.db.requests    = parsed.requests    || [];
    } else {
      seedLocalDefaults();
    }
  } catch (e) {
    seedLocalDefaults();
  }
}

function saveLocalData() {
  localStorage.setItem('ipt_local_data', JSON.stringify({
    departments: window.db.departments,
    employees:   window.db.employees,
    requests:    window.db.requests
  }));
}

function seedLocalDefaults() {
  window.db.departments = [
    { id: 'dept-1', name: 'Engineering', description: 'Software team' },
    { id: 'dept-2', name: 'HR',          description: 'Human Resources' }
  ];
  window.db.employees = [];
  window.db.requests  = [];
  saveLocalData();
}

/* ============================================================
   CLIENT-SIDE ROUTING
   ============================================================ */

function navigateTo(hash) {
  window.location.hash = hash;
}

function handleRouting() {
  const hash            = window.location.hash || '#/';
  const protectedRoutes = ['#/profile', '#/requests'];
  const adminRoutes     = ['#/employees', '#/accounts', '#/departments'];

  if (protectedRoutes.includes(hash) && !currentUser) {
    navigateTo('#/login');
    return;
  }

  if (adminRoutes.includes(hash)) {
    if (!currentUser || currentUser.role !== 'admin') {
      showToast('Access denied. Admins only.', 'danger');
      navigateTo('#/');
      return;
    }
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  switch (hash) {
    case '#/':            showPage('home-page');         break;
    case '#/register':    showPage('register-page');     break;
    case '#/login':       showPage('login-page');        break;
    case '#/profile':     showPage('profile-page');      renderProfile();          break;
    case '#/employees':   showPage('employees-page');    renderEmployeesTable();   break;
    case '#/departments': showPage('departments-page');  renderDepartmentsTable(); break;
    case '#/accounts':    showPage('accounts-page');     renderAccountsList();     break;
    case '#/requests':    showPage('requests-page');     renderRequests();         break;
    default:              showPage('home-page');
  }
}

function showPage(pageId) {
  const el = document.getElementById(pageId);
  if (el) el.classList.add('active');
}

window.addEventListener('hashchange', handleRouting);

/* ============================================================
   AUTH STATE — updates navbar and body classes
   ============================================================ */

function setAuthState(isAuth, user) {
  currentUser = user;
  const body  = document.body;

  if (isAuth && user) {
    body.classList.remove('not-authenticated');
    body.classList.add('authenticated');

    const navUser = document.getElementById('nav-username');
    if (navUser) navUser.textContent = user.firstName || user.username;

    if (user.role === 'admin') {
      body.classList.add('is-admin');
    } else {
      body.classList.remove('is-admin');
    }
  } else {
    body.classList.remove('authenticated', 'is-admin');
    body.classList.add('not-authenticated');
    const navUser = document.getElementById('nav-username');
    if (navUser) navUser.textContent = 'User';
  }
}

/* ============================================================
   A. REGISTRATION — calls POST /api/register
   ============================================================ */

document.getElementById('btn-register').addEventListener('click', async () => {
  const firstName = document.getElementById('reg-firstname').value.trim();
  const lastName  = document.getElementById('reg-lastname').value.trim();
  const email     = document.getElementById('reg-email').value.trim().toLowerCase();
  const password  = document.getElementById('reg-password').value;
  const errEl     = document.getElementById('register-error');

  if (!firstName || !lastName || !email || !password) {
    showFormError(errEl, 'All fields are required.'); return;
  }
  if (password.length < 6) {
    showFormError(errEl, 'Password must be at least 6 characters.'); return;
  }

  try {
    const res  = await fetch(`${API_URL}/api/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username: email, password, role: 'user' })
    });
    const data = await res.json();

    if (res.ok) {
      // Save extra profile info (firstName, lastName) locally
      const extras         = JSON.parse(localStorage.getItem('ipt_extras') || '{}');
      extras[email]        = { firstName, lastName, email };
      localStorage.setItem('ipt_extras', JSON.stringify(extras));

      errEl.classList.add('d-none');
      ['reg-firstname','reg-lastname','reg-email','reg-password'].forEach(id => {
        document.getElementById(id).value = '';
      });

      showToast('Registered successfully! You can now log in.', 'success');
      document.getElementById('login-success-msg')?.classList.remove('d-none');
      navigateTo('#/login');
    } else {
      showFormError(errEl, 'Registration failed: ' + data.error);
    }
  } catch (err) {
    showFormError(errEl, 'Network error. Is the backend running?');
    console.error(err);
  }
});

/* ============================================================
   B. LOGIN — calls POST /api/login
   ============================================================ */

document.getElementById('btn-login').addEventListener('click', async () => {
  const emailInput = document.getElementById('login-email').value.trim().toLowerCase();
  const password   = document.getElementById('login-password').value;
  const errEl      = document.getElementById('login-error');

  try {
    const res  = await fetch(`${API_URL}/api/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username: emailInput, password })
    });
    const data = await res.json();

    if (res.ok) {
      // Merge backend user with locally stored firstName/lastName
      const extras   = JSON.parse(localStorage.getItem('ipt_extras') || '{}');
      const extra    = extras[data.user.username] || {};
      const fullUser = { ...data.user, ...extra };

      sessionStorage.setItem('authToken',   data.token);
      sessionStorage.setItem('currentUser', JSON.stringify(fullUser));

      errEl.classList.add('d-none');
      document.getElementById('login-success-msg')?.classList.add('d-none');
      document.getElementById('login-email').value    = '';
      document.getElementById('login-password').value = '';

      setAuthState(true, fullUser);
      showToast('Welcome back, ' + (fullUser.firstName || fullUser.username) + '!', 'success');
      navigateTo('#/profile');
    } else {
      showFormError(errEl, 'Invalid email/password, or account not verified.');
    }
  } catch (err) {
    showFormError(errEl, 'Network error. Is the backend running?');
    console.error(err);
  }
});

/* ============================================================
   C. LOGOUT
   ============================================================ */

document.getElementById('btn-logout').addEventListener('click', (e) => {
  e.preventDefault();
  sessionStorage.removeItem('authToken');
  sessionStorage.removeItem('currentUser');
  setAuthState(false, null);
  showToast('Logged out successfully.', 'info');
  navigateTo('#/');
});

/* ============================================================
   D. AUTO-LOGIN on page refresh — verifies token with backend
   ============================================================ */

async function checkAutoLogin() {
  if (!isLoggedIn()) return;

  try {
    const res = await fetch(`${API_URL}/api/profile`, { headers: getAuthHeader() });

    if (res.ok) {
      const data     = await res.json();
      const extras   = JSON.parse(localStorage.getItem('ipt_extras') || '{}');
      const extra    = extras[data.user.username] || {};
      const fullUser = { ...data.user, ...extra };

      sessionStorage.setItem('currentUser', JSON.stringify(fullUser));
      setAuthState(true, fullUser);
    } else {
      // Token expired or invalid — clear session
      sessionStorage.removeItem('authToken');
      sessionStorage.removeItem('currentUser');
      setAuthState(false, null);
    }
  } catch (err) {
    console.error('Auto-login check failed:', err);
  }
}

/* ============================================================
   PHASE 5 - Profile Page
   ============================================================ */

function renderProfile() {
  if (!currentUser) return;
  const content = document.getElementById('profile-content');
  if (!content) return;

  const firstName = currentUser.firstName || currentUser.username;
  const lastName  = currentUser.lastName  || '';
  const email     = currentUser.email     || currentUser.username;

  content.innerHTML = `
    <h5>${firstName} ${lastName}</h5>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Role:</strong> ${currentUser.role}</p>
    <button class="btn btn-outline-primary btn-sm"
            onclick="showToast('Edit Profile coming soon!', 'info')">
      Edit Profile
    </button>
  `;
}

/* ============================================================
   PHASE 6 - Admin: Accounts (fetched from backend)
   ============================================================ */

async function renderAccountsList() {
  const tbody = document.getElementById('accounts-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="text-center">Loading...</td></tr>';

  try {
    const res = await fetch(`${API_URL}/api/admin/accounts`, { headers: getAuthHeader() });

    if (!res.ok) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Access denied or error loading accounts.</td></tr>';
      return;
    }

    const data     = await res.json();
    const accounts = data.accounts || [];
    tbody.innerHTML = '';

    if (accounts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center">No accounts.</td></tr>';
      return;
    }

    accounts.forEach(acc => {
      const extras  = JSON.parse(localStorage.getItem('ipt_extras') || '{}');
      const extra   = extras[acc.username] || {};
      const display = extra.firstName ? `${extra.firstName} ${extra.lastName}` : acc.username;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${display}</td>
        <td>${acc.username}</td>
        <td>${acc.role}</td>
        <td>✅</td>
        <td><em class="text-muted">Managed on server</em></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Network error.</td></tr>';
    console.error(err);
  }
}

document.getElementById('btn-add-account')?.addEventListener('click', () => {
  showToast('Account creation is now handled via the Register page.', 'info');
});

/* ============================================================
   PHASE 6 - Admin: Departments (kept local)
   ============================================================ */

function renderDepartmentsTable() {
  const tbody = document.getElementById('departments-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (window.db.departments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center">No departments.</td></tr>';
    return;
  }

  window.db.departments.forEach(dept => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${dept.name}</td>
      <td>${dept.description}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary me-1" onclick="editDept('${dept.id}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteDept('${dept.id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('btn-add-dept')?.addEventListener('click', () => {
  clearDeptForm();
  document.getElementById('dept-form-card').style.display = 'block';
});

document.getElementById('btn-cancel-dept')?.addEventListener('click', () => {
  document.getElementById('dept-form-card').style.display = 'none';
});

document.getElementById('btn-save-dept')?.addEventListener('click', () => {
  const editingId = document.getElementById('dept-editing-id').value;
  const name      = document.getElementById('dept-name').value.trim();
  const desc      = document.getElementById('dept-desc').value.trim();

  if (!name) { showToast('Department name is required.', 'danger'); return; }

  if (editingId) {
    const dept = window.db.departments.find(d => d.id === editingId);
    if (dept) { dept.name = name; dept.description = desc; }
    showToast('Department updated.', 'success');
  } else {
    window.db.departments.push({ id: 'dept-' + Date.now(), name, description: desc });
    showToast('Department added.', 'success');
  }

  saveLocalData();
  clearDeptForm();
  document.getElementById('dept-form-card').style.display = 'none';
  renderDepartmentsTable();
});

function editDept(id) {
  const dept = window.db.departments.find(d => d.id === id);
  if (!dept) return;
  document.getElementById('dept-editing-id').value       = id;
  document.getElementById('dept-name').value             = dept.name;
  document.getElementById('dept-desc').value             = dept.description;
  document.getElementById('dept-form-card').style.display = 'block';
}

function deleteDept(id) {
  if (!confirm('Delete this department?')) return;
  window.db.departments = window.db.departments.filter(d => d.id !== id);
  saveLocalData();
  renderDepartmentsTable();
  showToast('Department deleted.', 'info');
}

function clearDeptForm() {
  document.getElementById('dept-editing-id').value = '';
  document.getElementById('dept-name').value        = '';
  document.getElementById('dept-desc').value        = '';
}

/* ============================================================
   PHASE 6 - Admin: Employees (kept local)
   ============================================================ */

function renderEmployeesTable() {
  const tbody = document.getElementById('employees-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!window.db.employees || window.db.employees.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">No employees.</td></tr>';
  } else {
    window.db.employees.forEach(emp => {
      const dept = window.db.departments.find(d => d.id === emp.deptId);
      const tr   = document.createElement('tr');
      tr.innerHTML = `
        <td>${emp.employeeId}</td>
        <td>${emp.userEmail}</td>
        <td>${emp.position}</td>
        <td>${dept ? dept.name : 'N/A'}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary me-1" onclick="editEmployee('${emp.employeeId}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteEmployee('${emp.employeeId}')">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  populateDeptDropdown('emp-dept');
}

function populateDeptDropdown(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = '';
  window.db.departments.forEach(dept => {
    const opt       = document.createElement('option');
    opt.value       = dept.id;
    opt.textContent = dept.name;
    select.appendChild(opt);
  });
}

document.getElementById('btn-add-employee')?.addEventListener('click', () => {
  clearEmployeeForm();
  document.getElementById('employee-form-card').style.display = 'block';
});

document.getElementById('btn-cancel-employee')?.addEventListener('click', () => {
  document.getElementById('employee-form-card').style.display = 'none';
});

document.getElementById('btn-save-employee')?.addEventListener('click', () => {
  const editingId  = document.getElementById('emp-editing-id').value;
  const employeeId = document.getElementById('emp-id').value.trim();
  const userEmail  = document.getElementById('emp-email').value.trim().toLowerCase();
  const position   = document.getElementById('emp-position').value.trim();
  const deptId     = document.getElementById('emp-dept').value;
  const hireDate   = document.getElementById('emp-hiredate').value;

  if (!employeeId || !userEmail || !position) {
    showToast('Employee ID, email, and position are required.', 'danger'); return;
  }

  if (editingId) {
    const emp = window.db.employees.find(e => e.employeeId === editingId);
    if (emp) {
      emp.employeeId = employeeId;
      emp.userEmail  = userEmail;
      emp.position   = position;
      emp.deptId     = deptId;
      emp.hireDate   = hireDate;
    }
    showToast('Employee updated.', 'success');
  } else {
    window.db.employees.push({ employeeId, userEmail, position, deptId, hireDate });
    showToast('Employee added.', 'success');
  }

  saveLocalData();
  clearEmployeeForm();
  document.getElementById('employee-form-card').style.display = 'none';
  renderEmployeesTable();
});

function editEmployee(id) {
  const emp = window.db.employees.find(e => e.employeeId === id);
  if (!emp) return;
  document.getElementById('emp-editing-id').value  = id;
  document.getElementById('emp-id').value          = emp.employeeId;
  document.getElementById('emp-email').value       = emp.userEmail;
  document.getElementById('emp-position').value    = emp.position;
  document.getElementById('emp-hiredate').value    = emp.hireDate;
  populateDeptDropdown('emp-dept');
  document.getElementById('emp-dept').value = emp.deptId;
  document.getElementById('employee-form-card').style.display = 'block';
}

function deleteEmployee(id) {
  if (!confirm('Delete this employee?')) return;
  window.db.employees = window.db.employees.filter(e => e.employeeId !== id);
  saveLocalData();
  renderEmployeesTable();
  showToast('Employee deleted.', 'info');
}

function clearEmployeeForm() {
  ['emp-editing-id','emp-id','emp-email','emp-position','emp-hiredate'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

/* ============================================================
   PHASE 7 - User Requests (kept local)
   ============================================================ */

function renderRequests() {
  if (!currentUser) return;

  const myRequests = (window.db.requests || []).filter(
    r => r.employeeEmail === (currentUser.email || currentUser.username)
  );

  const emptyDiv = document.getElementById('requests-empty');
  const table    = document.getElementById('requests-table');
  const tbody    = document.getElementById('requests-table-body');

  if (myRequests.length === 0) {
    emptyDiv?.classList.remove('d-none');
    if (table) table.style.display = 'none';
  } else {
    emptyDiv?.classList.add('d-none');
    if (table) table.style.display = 'table';
    tbody.innerHTML = '';

    myRequests.forEach(req => {
      const itemsSummary = req.items.map(i => `${i.name} (x${i.qty})`).join(', ');
      let badgeClass = 'warning';
      if (req.status === 'Approved') badgeClass = 'success';
      if (req.status === 'Rejected') badgeClass = 'danger';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${req.date}</td>
        <td>${req.type}</td>
        <td>${itemsSummary}</td>
        <td><span class="badge bg-${badgeClass}">${req.status}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }
}

document.getElementById('btn-new-request')?.addEventListener('click', openRequestModal);
document.getElementById('btn-create-one')?.addEventListener('click', openRequestModal);

function openRequestModal() {
  resetRequestModal();
  const modal = new bootstrap.Modal(document.getElementById('requestModal'));
  modal.show();
}

function resetRequestModal() {
  document.getElementById('req-type').value = 'Equipment';
  const container = document.getElementById('req-items-container');
  container.innerHTML = '';
  addItemRow();
}

function addItemRow() {
  const container = document.getElementById('req-items-container');
  const isFirst   = container.children.length === 0;
  const row       = document.createElement('div');
  row.className   = 'd-flex gap-2 mb-2 align-items-center req-item-row';
  row.innerHTML   = `
    <input type="text"   class="form-control item-name" placeholder="Item name" />
    <input type="number" class="form-control item-qty" value="1" min="1" style="width:80px;" />
    <button class="btn btn-sm ${isFirst ? 'btn-outline-secondary' : 'btn-danger'}"
            onclick="this.closest('.req-item-row').remove()">
      ${isFirst ? '+' : '×'}
    </button>
  `;
  container.appendChild(row);
}

document.getElementById('btn-add-item')?.addEventListener('click', addItemRow);

document.getElementById('btn-submit-request')?.addEventListener('click', () => {
  const type  = document.getElementById('req-type').value;
  const rows  = document.querySelectorAll('.req-item-row');
  const items = [];

  rows.forEach(row => {
    const name = row.querySelector('.item-name').value.trim();
    const qty  = row.querySelector('.item-qty').value;
    if (name) items.push({ name, qty: parseInt(qty) || 1 });
  });

  if (items.length === 0) { showToast('Add at least one item.', 'danger'); return; }

  const newRequest = {
    id:            'req-' + Date.now(),
    type,
    items,
    status:        'Pending',
    date:          new Date().toLocaleDateString(),
    employeeEmail: currentUser.email || currentUser.username
  };

  if (!window.db.requests) window.db.requests = [];
  window.db.requests.push(newRequest);
  saveLocalData();

  bootstrap.Modal.getInstance(document.getElementById('requestModal')).hide();
  showToast('Request submitted!', 'success');
  renderRequests();
});

/* ============================================================
   PHASE 8 - Toast Notifications
   ============================================================ */

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const id        = 'toast-' + Date.now();
  const colorMap  = {
    success: 'bg-success text-white',
    danger:  'bg-danger text-white',
    warning: 'bg-warning text-dark',
    info:    'bg-info text-dark'
  };

  const toastEl     = document.createElement('div');
  toastEl.id        = id;
  toastEl.className = `toast show align-items-center ${colorMap[type] || 'bg-info text-dark'} border-0 mb-2 toast-msg`;
  toastEl.setAttribute('role', 'alert');
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto"
              onclick="document.getElementById('${id}').remove()"></button>
    </div>
  `;

  container.appendChild(toastEl);
  setTimeout(() => { document.getElementById(id)?.remove(); }, 3500);
}

function showFormError(el, message) {
  if (!el) return;
  el.textContent = message;
  el.classList.remove('d-none');
}

/* ============================================================
   INIT — runs on page load
   ============================================================ */

loadLocalData();

checkAutoLogin().then(() => {
  if (!window.location.hash) window.location.hash = '#/';
  handleRouting();
});