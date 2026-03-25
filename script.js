// ============================================
// Configuration & Constants
// ============================================

const CONFIG = {
    STORAGE_KEY: 'ipt_demo_v1',
    APP_NAME: 'Full-Stack App',
    DEFAULT_DATA: {
        // FIX #1: Accounts array removed entirely.
        // All user/account data is now managed by the backend (server.js).
        // No passwords or user credentials should ever be stored in localStorage.
        departments: [
            {
                id: 1,
                name: 'Engineering',
                description: 'Software development team',
                createdAt: new Date().toISOString()
            },
            {
                id: 2,
                name: 'HR',
                description: 'Human Resources',
                createdAt: new Date().toISOString()
            }
        ],
        employees: [],
        requests: []
    }
};

// Helper function to generate unique IDs
function generateId(array) {
    if (!array || array.length === 0) return 1;
    return Math.max(...array.map(item => item.id || 0)) + 1;
}

// ============================================
// Data Storage Functions
// FIX #2: localStorage is used ONLY for non-sensitive local data:
//         departments, employees, requests.
// Accounts are fully handled by the backend API — never localStorage.
// ============================================

function loadFromStorage() {
    try {
        const data = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            // FIX #2: Strip out any leftover 'accounts' key from old localStorage data
            delete parsed.accounts;
            return parsed;
        }
    } catch (error) {
        console.error('Error loading data:', error);
    }
    return CONFIG.DEFAULT_DATA;
}

function saveToStorage(data) {
    try {
        // FIX #2: Never save accounts to localStorage
        const safeData = { ...data };
        delete safeData.accounts;
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(safeData));
        return true;
    } catch (error) {
        console.error('Error saving data:', error);
        return false;
    }
}

function initializeDatabase() {
    const data = loadFromStorage();
    window.db = data;
    persistDatabase(); // Save defaults to localStorage on first load
    return data;
}

function persistDatabase() {
    return saveToStorage(window.db);
}

function getAll(collection) {
    return window.db[collection] || [];
}

function getById(collection, id) {
    const items = getAll(collection);
    return items.find(item => item.id === parseInt(id));
}

function getByProperty(collection, property, value) {
    const items = getAll(collection);
    return items.find(item => item[property] === value);
}

function addItem(collection, item) {
    if (!window.db[collection]) {
        window.db[collection] = [];
    }
    item.id = generateId(window.db[collection]);
    item.createdAt = new Date().toISOString();
    window.db[collection].push(item);
    persistDatabase();
    return item;
}

function updateItem(collection, id, updates) {
    const items = window.db[collection];
    const index = items.findIndex(item => item.id === parseInt(id));
    if (index !== -1) {
        items[index] = { ...items[index], ...updates };
        items[index].updatedAt = new Date().toISOString();
        persistDatabase();
        return items[index];
    }
    return null;
}

function deleteItem(collection, id) {
    const items = window.db[collection];
    const index = items.findIndex(item => item.id === parseInt(id));
    if (index !== -1) {
        items.splice(index, 1);
        persistDatabase();
        return true;
    }
    return false;
}

// ============================================
// Authentication Functions
// ============================================

function getAuthHeader() {
    const token = sessionStorage.getItem('authToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function getCurrentUser() {
    const jwtToken = sessionStorage.getItem('authToken');
    if (!jwtToken) return null;

    try {
        const payload = JSON.parse(atob(jwtToken.split('.')[1]));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
            sessionStorage.removeItem('authToken');
            return null;
        }
        return {
            id: payload.id,
            firstName: payload.firstName || payload.username,
            lastName: payload.lastName || '',
            email: payload.username,
            role: payload.role,
            verified: true
        };
    } catch (e) {
        sessionStorage.removeItem('authToken');
        return null;
    }
}

function isAuthenticated() {
    return getCurrentUser() !== null;
}

function isAdmin() {
    const user = getCurrentUser();
    return user && user.role === 'admin';
}

function logout() {
    sessionStorage.removeItem('authToken');
    setAuthState(false, null);
    navigateTo('#/');
}

function requireAuth() {
    if (!isAuthenticated()) {
        navigateTo('#/login');
        return false;
    }
    return true;
}

function requireAdmin() {
    if (!requireAuth()) return false;
    if (!isAdmin()) {
        showToast('Access denied. Admin privileges required.', 'danger');
        navigateTo('#/');
        return false;
    }
    return true;
}

// ============================================
// Auth State Management
// ============================================

function setAuthState(isAuth, user) {
    document.body.classList.remove('authenticated', 'not-authenticated', 'is-admin');

    if (isAuth && user) {
        document.body.classList.add('authenticated');
        if (user.role === 'admin') {
            document.body.classList.add('is-admin');
        }
        document.querySelectorAll('.user-name').forEach(el => {
            el.textContent = user.firstName;
        });
    } else {
        document.body.classList.add('not-authenticated');
    }
}

// ============================================
// Client-Side Routing
// ============================================

let currentUser = null;

function navigateTo(hash) {
    window.location.hash = hash;
}

function handleRouting() {
    const hash = window.location.hash.slice(1) || '/';

    currentUser = getCurrentUser();
    setAuthState(isAuthenticated(), currentUser);

    const routes = {
        '/': renderHome,
        '/login': renderLogin,
        '/register': renderRegister,
        '/pending': renderPending,
        '/verify': renderVerify,
        '/verify-email': renderVerify,
        '/profile': () => requireAuth() && renderProfile(),
        '/requests': () => requireAuth() && renderRequests(),
        '/employees': () => requireAdmin() && renderEmployees(),
        '/accounts': () => requireAdmin() && renderAccounts(),
        '/departments': () => requireAdmin() && renderDepartments()
    };

    const route = routes[hash] || renderHome;
    route();
}

// ============================================
// Page Rendering Functions
// ============================================

function renderHome() {
    const content = document.getElementById('app-content');
    const isAuth = isAuthenticated();

    content.innerHTML = `
        <div class="text-center mb-5">
            <h1 class="display-4 fw-bold mb-3">Welcome to Full-Stack App</h1>
            <p class="lead text-muted mb-4">A role-based app with JWT authentication. Features:</p>

            <div class="row justify-content-center mb-4">
                <div class="col-md-6">
                    <ul class="list-unstyled text-start">
                        <li class="mb-2"><i class="bi bi-check-circle-fill text-success"></i> Email registration via backend</li>
                        <li class="mb-2"><i class="bi bi-check-circle-fill text-success"></i> Login with real JWT token</li>
                        <li class="mb-2"><i class="bi bi-check-circle-fill text-success"></i> Role-based UI (Admin/User)</li>
                        <li class="mb-2"><i class="bi bi-check-circle-fill text-success"></i> CRUD for Employees, Departments, Requests</li>
                    </ul>
                </div>
            </div>

            <div class="mt-4">
                ${!isAuth ? `
                    <a href="#/register" class="btn btn-primary btn-lg me-2">
                        Get Started <i class="bi bi-arrow-right"></i>
                    </a>
                ` : `
                    <a href="#/profile" class="btn btn-primary btn-lg">
                        Go to Profile <i class="bi bi-arrow-right"></i>
                    </a>
                `}
            </div>
        </div>
    `;
}

function renderLogin() {
    const content = document.getElementById('app-content');

    content.innerHTML = `
        <div class="row justify-content-center">
            <div class="col-md-6 col-lg-5">
                <div class="card shadow">
                    <div class="card-body p-4">
                        <h2 class="card-title mb-4">Login</h2>

                        <form id="loginForm">
                            <div class="mb-3">
                                <label for="email" class="form-label">Email</label>
                                <input type="email" class="form-control" id="email" required placeholder="Enter your email">
                            </div>

                            <div class="mb-3">
                                <label for="password" class="form-label">Password</label>
                                <input type="password" class="form-control" id="password" required placeholder="Enter your password">
                            </div>

                            <div class="d-grid gap-2">
                                <button type="submit" class="btn btn-primary">
                                    <i class="bi bi-box-arrow-in-right"></i> Login
                                </button>
                                <a href="#/" class="btn btn-outline-secondary">Cancel</a>
                            </div>
                        </form>

                        <div class="text-center mt-3">
                            <small class="text-muted">
                                Don't have an account? <a href="#/register">Register here</a>
                            </small>
                        </div>

                        <div class="alert alert-info mt-3 mb-0">
                            <strong><i class="bi bi-info-circle"></i> Demo Credentials:</strong><br>
                            <small>
                                <strong>Admin:</strong><br>
                                Email: admin@example.com<br>
                                Password: admin123<br>
                                <hr class="my-1">
                                <strong>User:</strong><br>
                                Email: alice@example.com<br>
                                Password: user123
                            </small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('loginForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (!isValidEmail(email)) {
            showToast('Please enter a valid email address', 'danger');
            return;
        }

        try {
            const response = await fetch('http://localhost:3000/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: email, password: password })
            });

            const data = await response.json();

            if (response.ok) {
                sessionStorage.setItem('authToken', data.token);
                currentUser = getCurrentUser();
                setAuthState(true, currentUser);
                showToast('Login successful!', 'success');
                setTimeout(() => {
                    navigateTo('#/profile');
                }, 500);
            } else {
                showToast(data.error || 'Invalid credentials', 'danger');
            }
        } catch (err) {
            showToast('Cannot connect to server. Please make sure the backend is running.', 'danger');
        }
    });
}

function renderRegister() {
    const content = document.getElementById('app-content');

    content.innerHTML = `
        <div class="row justify-content-center">
            <div class="col-md-6 col-lg-5">
                <div class="card shadow">
                    <div class="card-body p-4">
                        <h2 class="card-title mb-4">Register Account</h2>

                        <form id="registerForm">
                            <div class="mb-3">
                                <label for="firstName" class="form-label">First Name</label>
                                <input type="text" class="form-control" id="firstName" required placeholder="Enter your first name">
                            </div>

                            <div class="mb-3">
                                <label for="lastName" class="form-label">Last Name</label>
                                <input type="text" class="form-control" id="lastName" required placeholder="Enter your last name">
                            </div>

                            <div class="mb-3">
                                <label for="email" class="form-label">Email</label>
                                <input type="email" class="form-control" id="email" required placeholder="Enter your email">
                            </div>

                            <div class="mb-3">
                                <label for="password" class="form-label">Password</label>
                                <input type="password" class="form-control" id="password" required minlength="6" placeholder="Minimum 6 characters">
                                <div class="form-text">Password must be at least 6 characters long</div>
                            </div>

                            <div class="d-grid gap-2">
                                <button type="submit" class="btn btn-success">
                                    <i class="bi bi-person-plus"></i> Sign Up
                                </button>
                                <a href="#/" class="btn btn-outline-secondary">Cancel</a>
                            </div>
                        </form>

                        <div class="text-center mt-3">
                            <small class="text-muted">
                                Already have an account? <a href="#/login">Login here</a>
                            </small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('registerForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const firstName = document.getElementById('firstName').value.trim();
        const lastName = document.getElementById('lastName').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (!isValidEmail(email)) {
            showToast('Please enter a valid email address', 'danger');
            return;
        }

        if (password.length < 6) {
            showToast('Password must be at least 6 characters', 'danger');
            return;
        }

        try {
            const response = await fetch('http://localhost:3000/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: email, password, firstName, lastName })
            });

            const data = await response.json();

            if (response.ok) {
                navigateTo('#/pending');
            } else {
                showToast(data.error || 'Registration failed', 'danger');
            }
        } catch (err) {
            showToast('Cannot connect to server. Please make sure the backend is running.', 'danger');
        }
    });
}

function renderPending() {
    const content = document.getElementById('app-content');
    content.innerHTML = `
        <div class="row justify-content-center">
            <div class="col-md-6 col-lg-5">
                <div class="card shadow text-center">
                    <div class="card-body p-5">
                        <div class="display-1 text-warning mb-3">
                            <i class="bi bi-hourglass-split"></i>
                        </div>
                        <h3 class="mb-3">Account Pending Approval</h3>
                        <p class="text-muted mb-4">
                            Your account has been registered successfully.<br>
                            Please wait for an <strong>admin to approve</strong> your account before you can log in.
                        </p>
                        <div class="alert alert-warning">
                            <i class="bi bi-info-circle"></i>
                            You will not be able to log in until your account is verified by an admin.
                        </div>
                        <a href="#/login" class="btn btn-primary mt-2">
                            <i class="bi bi-box-arrow-in-right"></i> Back to Login
                        </a>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderVerify() {
    navigateTo('#/pending');
}

function renderProfile() {
    const content = document.getElementById('app-content');
    const user = getCurrentUser();

    if (!user) {
        navigateTo('#/login');
        return;
    }

    content.innerHTML = `
        <div class="row justify-content-center">
            <div class="col-md-8 col-lg-6">
                <div class="card shadow">
                    <div class="card-body p-4">
                        <h2 class="card-title mb-4">My Profile</h2>
                        <div id="profileContent">
                            <div class="text-center mb-4">
                                <div class="display-1 text-primary mb-3">
                                    <i class="bi bi-person-circle"></i>
                                </div>
                                <h3>${user.firstName} ${user.lastName}</h3>
                            </div>

                            <div class="list-group list-group-flush mb-3">
                                <div class="list-group-item">
                                    <div class="d-flex w-100 justify-content-between align-items-center">
                                        <strong><i class="bi bi-envelope"></i> Email</strong>
                                        <span class="text-muted">${user.email}</span>
                                    </div>
                                </div>
                                <div class="list-group-item">
                                    <div class="d-flex w-100 justify-content-between align-items-center">
                                        <strong><i class="bi bi-shield"></i> Role</strong>
                                        <span class="badge bg-${user.role === 'admin' ? 'primary' : 'success'}">
                                            ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                                        </span>
                                    </div>
                                </div>
                                <div class="list-group-item">
                                    <div class="d-flex w-100 justify-content-between align-items-center">
                                        <strong><i class="bi bi-check-circle"></i> Status</strong>
                                        <span class="badge bg-success">Verified</span>
                                    </div>
                                </div>
                            </div>

                            <div class="d-grid">
                                <button onclick="openEditModal()" class="btn btn-primary">
                                    <i class="bi bi-pencil"></i> Edit Profile
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function openEditModal() {
    const user = getCurrentUser();
    const modalsContainer = document.getElementById('modals-container');

    modalsContainer.innerHTML = `
        <div class="modal fade" id="editModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Edit Profile</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="editProfileForm">
                            <div class="mb-3">
                                <label for="editFirstName" class="form-label">First Name</label>
                                <input type="text" class="form-control" id="editFirstName" required value="${user.firstName}">
                            </div>
                            <div class="mb-3">
                                <label for="editLastName" class="form-label">Last Name</label>
                                <input type="text" class="form-control" id="editLastName" required value="${user.lastName}">
                            </div>
                            <div class="mb-3">
                                <label for="editEmail" class="form-label">Email</label>
                                <input type="email" class="form-control" id="editEmail" required value="${user.email}">
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="saveProfile()">Save Changes</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modal = new bootstrap.Modal(document.getElementById('editModal'));
    modal.show();
}

async function saveProfile() {
    const firstName = document.getElementById('editFirstName').value.trim();
    const lastName = document.getElementById('editLastName').value.trim();
    const email = document.getElementById('editEmail').value.trim();

    if (!firstName || !lastName || !email) {
        showToast('Please fill in all fields', 'danger');
        return;
    }

    if (!isValidEmail(email)) {
        showToast('Please enter a valid email', 'danger');
        return;
    }

    try {
        const response = await fetch('http://localhost:3000/api/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeader()
            },
            body: JSON.stringify({ firstName, lastName, email })
        });

        const data = await response.json();

        if (response.ok) {
            sessionStorage.setItem('authToken', data.token);
            currentUser = getCurrentUser();
            setAuthState(true, currentUser);
            showToast('Profile updated successfully!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();
            renderProfile();
        } else {
            showToast(data.error || 'Failed to update profile', 'danger');
        }
    } catch (err) {
        showToast('Cannot connect to server.', 'danger');
    }
}

// ============================================
// Requests
// ============================================

function renderRequests() {
    const content = document.getElementById('app-content');

    content.innerHTML = `
        <div class="card shadow">
            <div class="card-header bg-white d-flex justify-content-between align-items-center">
                <h4 class="mb-0"><i class="bi bi-clipboard-check"></i> My Requests</h4>
                <button class="btn btn-success" onclick="openNewRequestModal()">
                    <i class="bi bi-plus-circle"></i> New Request
                </button>
            </div>
            <div class="card-body">
                <div id="noRequests" class="text-center py-5" style="display: none">
                    <i class="bi bi-inbox display-1 text-muted"></i>
                    <h3 class="text-muted mt-3">You have no requests yet.</h3>
                    <button class="btn btn-primary mt-3" onclick="openNewRequestModal()">
                        Create One
                    </button>
                </div>
                <div class="table-responsive" id="requestsTable" style="display: none">
                    <table class="table table-hover">
                        <thead class="table-dark">
                            <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Items</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="requestsBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    loadRequests();
}

let itemCounter = 0;

function loadRequests() {
    const loggedInUser = getCurrentUser();
    const allRequests = getAll('requests');
    const userRequests = allRequests.filter(req => req.employeeEmail === loggedInUser.email);

    const noRequestsDiv = document.getElementById('noRequests');
    const requestsTable = document.getElementById('requestsTable');
    const tbody = document.getElementById('requestsBody');

    if (userRequests.length === 0) {
        noRequestsDiv.style.display = 'block';
        requestsTable.style.display = 'none';
        return;
    }

    noRequestsDiv.style.display = 'none';
    requestsTable.style.display = 'block';

    userRequests.sort((a, b) => new Date(b.date) - new Date(a.date));

    tbody.innerHTML = userRequests.map(req => {
        const statusClass = req.status === 'Approved' ? 'success' : req.status === 'Rejected' ? 'danger' : 'warning';
        return `
            <tr>
                <td>${formatDate(req.date)}</td>
                <td><strong>${req.type}</strong></td>
                <td>${req.items.length} item(s)</td>
                <td><span class="badge bg-${statusClass}">${req.status}</span></td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-primary" onclick="viewRequest(${req.id})"><i class="bi bi-eye"></i> View</button>
                        ${req.status === 'Pending' ? `<button class="btn btn-danger" onclick="deleteRequest(${req.id})"><i class="bi bi-x-circle"></i> Cancel</button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function openNewRequestModal() {
    itemCounter = 0;
    const modalsContainer = document.getElementById('modals-container');

    modalsContainer.innerHTML = `
        <div class="modal fade" id="requestModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">New Request</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="requestForm">
                            <div class="mb-3">
                                <label class="form-label">Type</label>
                                <select class="form-select" id="requestType" required>
                                    <option value="">Select type...</option>
                                    <option value="Equipment">Equipment</option>
                                    <option value="Leave">Leave</option>
                                    <option value="Resources">Resources</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Items</label>
                                <div id="itemsList"></div>
                                <button type="button" class="btn btn-sm btn-outline-primary mt-2" onclick="addFormItem()">
                                    <i class="bi bi-plus"></i> Add Item
                                </button>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-success" onclick="submitRequest()">Submit Request</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modal = new bootstrap.Modal(document.getElementById('requestModal'));
    modal.show();
    addFormItem();
}

function addFormItem() {
    itemCounter++;
    const itemsList = document.getElementById('itemsList');
    const itemDiv = document.createElement('div');
    itemDiv.className = 'input-group mb-2';
    itemDiv.id = `item-${itemCounter}`;
    itemDiv.innerHTML = `
        <input type="text" class="form-control item-name" placeholder="Item name" required>
        <input type="number" class="form-control item-quantity" placeholder="Qty" value="1" min="1" required style="max-width: 100px;">
        <button type="button" class="btn btn-outline-danger" onclick="removeItem('item-${itemCounter}')">
            <i class="bi bi-x"></i>
        </button>
    `;
    itemsList.appendChild(itemDiv);
}

function removeItem(itemId) {
    const itemDiv = document.getElementById(itemId);
    const itemsList = document.getElementById('itemsList');
    if (itemsList.children.length > 1) {
        itemDiv.remove();
    } else {
        showToast('At least one item is required', 'warning');
    }
}

function submitRequest() {
    const type = document.getElementById('requestType').value;
    if (!type) {
        showToast('Please select a request type', 'danger');
        return;
    }

    const itemRows = document.querySelectorAll('#itemsList .input-group');
    const items = [];
    for (let row of itemRows) {
        const name = row.querySelector('.item-name').value.trim();
        const quantity = parseInt(row.querySelector('.item-quantity').value);
        if (!name || !quantity || quantity < 1) {
            showToast('Please fill in all item fields correctly', 'danger');
            return;
        }
        items.push({ name, quantity });
    }

    if (items.length === 0) {
        showToast('Please add at least one item', 'danger');
        return;
    }

    const loggedInUser = getCurrentUser();
    const newRequest = {
        type: type,
        items: items,
        status: 'Pending',
        employeeEmail: loggedInUser.email,
        date: new Date().toISOString(),
    };

    addItem('requests', newRequest);
    showToast('Request submitted successfully!', 'success');
    bootstrap.Modal.getInstance(document.getElementById('requestModal')).hide();
    loadRequests();
}

function viewRequest(id) {
    const request = getById('requests', id);
    const statusClass = request.status === 'Approved' ? 'success' : request.status === 'Rejected' ? 'danger' : 'warning';

    const modalsContainer = document.getElementById('modals-container');
    modalsContainer.innerHTML = `
        <div class="modal fade" id="viewRequestModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Request Details</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3"><strong>Type:</strong> ${request.type}</div>
                        <div class="mb-3"><strong>Date:</strong> ${formatDate(request.date)}</div>
                        <div class="mb-3"><strong>Status:</strong> <span class="badge bg-${statusClass}">${request.status}</span></div>
                        <div class="mb-3">
                            <strong>Items:</strong>
                            <table class="table table-sm mt-2">
                                <thead><tr><th>Item Name</th><th>Quantity</th></tr></thead>
                                <tbody>
                                    ${request.items.map(item => `<tr><td>${item.name}</td><td>${item.quantity}</td></tr>`).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modal = new bootstrap.Modal(document.getElementById('viewRequestModal'));
    modal.show();
}

function deleteRequest(id) {
    if (!confirm('Are you sure you want to cancel this request?')) return;
    deleteItem('requests', id);
    showToast('Request cancelled successfully', 'success');
    loadRequests();
}

// ============================================
// Admin Dashboard
// ============================================

async function loadAdminDashboard() {
    const res = await fetch('http://localhost:3000/api/admin/dashboard', {
        headers: getAuthHeader()
    });
    if (res.ok) {
        const data = await res.json();
        document.getElementById('content').innerText = data.message;
    } else {
        document.getElementById('content').innerText = 'Access denied!';
    }
}

// ============================================
// Employees
// ============================================

function renderEmployees() {
    const content = document.getElementById('app-content');

    content.innerHTML = `
        <div class="card shadow">
            <div class="card-header bg-white d-flex justify-content-between align-items-center">
                <h4 class="mb-0"><i class="bi bi-people"></i> Employees</h4>
                <button class="btn btn-success" onclick="openAddModal('employee')">
                    <i class="bi bi-plus-circle"></i> Add Employee
                </button>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead class="table-dark">
                            <tr>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Position</th>
                                <th>Department</th>
                                <th>Hire Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="employeesBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    renderEmployeesTable();
}

function renderEmployeesTable() {
    const employees = getAll('employees');
    const departments = getAll('departments');
    const tbody = document.getElementById('employeesBody');

    if (employees.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No employees found</td></tr>';
        return;
    }

    tbody.innerHTML = employees.map(emp => {
        const dept = departments.find(d => d.id === emp.departmentId);
        return `
            <tr>
                <td><strong>${emp.employeeNumber}</strong></td>
                <td>${emp.fullName || emp.userEmail}</td>
                <td>${emp.position}</td>
                <td>${dept ? dept.name : 'Unknown'}</td>
                <td>${emp.hireDate ? formatDate(emp.hireDate) : '-'}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-primary" onclick="editEmployee(${emp.id})"><i class="bi bi-pencil"></i></button>
                        <button class="btn btn-danger" onclick="deleteEmployee(${emp.id})"><i class="bi bi-trash"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function openAddModal(type) {
    if (type === 'employee') {
        const modalsContainer = document.getElementById('modals-container');
        const departments = getAll('departments');

        modalsContainer.innerHTML = `
            <div class="modal fade" id="employeeModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Add Employee</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="employeeForm">
                                <input type="hidden" id="employeeId">
                                <div class="mb-3">
                                    <label class="form-label">Employee ID</label>
                                    <input type="text" class="form-control" id="employeeNumber" required placeholder="e.g., EMP001">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Full Name</label>
                                    <input type="text" class="form-control" id="fullName" required placeholder="e.g., John Doe">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Email</label>
                                    <input type="email" class="form-control" id="userEmail" required placeholder="employee@example.com">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Position</label>
                                    <input type="text" class="form-control" id="position" required placeholder="e.g., Software Engineer">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Department</label>
                                    <select class="form-select" id="departmentId" required>
                                        <option value="">Select department...</option>
                                        ${departments.map(dept => `<option value="${dept.id}">${dept.name}</option>`).join('')}
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Hire Date</label>
                                    <input type="date" class="form-control" id="hireDate" required value="${new Date().toISOString().split('T')[0]}">
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="saveEmployee()">Save</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modal = new bootstrap.Modal(document.getElementById('employeeModal'));
        modal.show();
    }
}

function editEmployee(id) {
    const emp = getById('employees', id);
    const departments = getAll('departments');
    const modalsContainer = document.getElementById('modals-container');

    modalsContainer.innerHTML = `
        <div class="modal fade" id="employeeModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Edit Employee</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="employeeForm">
                            <input type="hidden" id="employeeId" value="${emp.id}">
                            <div class="mb-3">
                                <label class="form-label">Employee ID</label>
                                <input type="text" class="form-control" id="employeeNumber" required value="${emp.employeeNumber}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Full Name</label>
                                <input type="text" class="form-control" id="fullName" required value="${emp.fullName || ''}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Email</label>
                                <input type="email" class="form-control" id="userEmail" required value="${emp.userEmail}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Position</label>
                                <input type="text" class="form-control" id="position" required value="${emp.position}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Department</label>
                                <select class="form-select" id="departmentId" required>
                                    <option value="">Select department...</option>
                                    ${departments.map(dept => `<option value="${dept.id}" ${dept.id === emp.departmentId ? 'selected' : ''}>${dept.name}</option>`).join('')}
                                </select>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Hire Date</label>
                                <input type="date" class="form-control" id="hireDate" required value="${emp.hireDate}">
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="saveEmployee()">Save</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modal = new bootstrap.Modal(document.getElementById('employeeModal'));
    modal.show();
}

function saveEmployee() {
    const id = document.getElementById('employeeId').value;
    const employeeNumber = document.getElementById('employeeNumber').value.trim();
    const fullName = document.getElementById('fullName').value.trim();
    const userEmail = document.getElementById('userEmail').value.trim();
    const position = document.getElementById('position').value.trim();
    const departmentId = parseInt(document.getElementById('departmentId').value);
    const hireDate = document.getElementById('hireDate').value;

    if (!employeeNumber || !fullName || !userEmail || !position || !departmentId || !hireDate) {
        showToast('Please fill in all fields', 'danger');
        return;
    }

    const existing = getAll('employees').find(e =>
        e.employeeNumber === employeeNumber && (!id || e.id !== parseInt(id))
    );
    if (existing) {
        showToast('Employee ID already exists', 'danger');
        return;
    }

    const employeeData = { employeeNumber, fullName, userEmail, position, departmentId, hireDate };

    if (id) {
        updateItem('employees', id, employeeData);
        showToast('Employee updated successfully!', 'success');
    } else {
        addItem('employees', employeeData);
        showToast('Employee created successfully!', 'success');
    }

    bootstrap.Modal.getInstance(document.getElementById('employeeModal')).hide();
    renderEmployeesTable();
}

function deleteEmployee(id) {
    const emp = getById('employees', id);
    if (!confirm(`Are you sure you want to delete employee ${emp.employeeNumber}?`)) return;
    deleteItem('employees', id);
    showToast('Employee deleted successfully!', 'success');
    renderEmployeesTable();
}

// ============================================
// Accounts — All operations go through backend
// FIX #1 & #2: No localStorage for accounts whatsoever!
// ============================================

async function renderAccounts() {
    const content = document.getElementById('app-content');

    content.innerHTML = `
        <div class="card shadow">
            <div class="card-header bg-white d-flex justify-content-between align-items-center">
                <h4 class="mb-0"><i class="bi bi-person-badge"></i> Accounts</h4>
                <button class="btn btn-success" onclick="openAddAccountModal()">
                    <i class="bi bi-plus-circle"></i> Add Account
                </button>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead class="table-dark">
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Verified</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="accountsBody">
                            <tr><td colspan="5" class="text-center">
                                <div class="spinner-border spinner-border-sm"></div> Loading...
                            </td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    await renderAccountsList();
}

async function renderAccountsList() {
    const tbody = document.getElementById('accountsBody');
    const loggedInUser = getCurrentUser();

    try {
        const response = await fetch('http://localhost:3000/api/users', {
            headers: getAuthHeader()
        });

        if (!response.ok) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Failed to load accounts</td></tr>';
            return;
        }

        const accounts = await response.json();

        if (accounts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No accounts found</td></tr>';
            return;
        }

        tbody.innerHTML = accounts.map(account => `
            <tr class="${!account.verified ? 'table-warning' : ''}">
                <td>
                    <strong>${account.firstName} ${account.lastName}</strong>
                    ${!account.verified ? '<span class="badge bg-warning ms-1">Pending</span>' : ''}
                </td>
                <td>${account.username}</td>
                <td><span class="badge bg-${account.role === 'admin' ? 'primary' : 'success'}">${account.role.charAt(0).toUpperCase() + account.role.slice(1)}</span></td>
                <td>
                    ${account.verified
                        ? '<span class="badge bg-success"><i class="bi bi-check"></i> Verified</span>'
                        : '<span class="badge bg-warning text-dark"><i class="bi bi-hourglass-split"></i> Pending</span>'
                    }
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-primary" onclick="editAccount(${account.id}, '${account.firstName}', '${account.lastName}', '${account.username}', '${account.role}', ${account.verified})">
                            <i class="bi bi-pencil"></i> Edit
                        </button>
                        <button class="btn btn-warning" onclick="openResetPasswordModal(${account.id})">
                            <i class="bi bi-key"></i> Reset Password
                        </button>
                        ${account.username !== loggedInUser.email
                            ? `<button class="btn btn-danger" onclick="deleteAccount(${account.id}, '${account.firstName} ${account.lastName}')">
                                <i class="bi bi-trash"></i> Delete
                               </button>`
                            : `<button class="btn btn-outline-secondary" disabled title="Cannot delete yourself">
                                <i class="bi bi-trash"></i>
                               </button>`
                        }
                    </div>
                </td>
            </tr>
        `).join('');

    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Cannot connect to server</td></tr>';
    }
}

function openAddAccountModal() {
    const modalsContainer = document.getElementById('modals-container');

    modalsContainer.innerHTML = `
        <div class="modal fade" id="accountModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Add Account</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="accountForm">
                            <input type="hidden" id="accountId" value="">
                            <div class="mb-3">
                                <label class="form-label">First Name</label>
                                <input type="text" class="form-control" id="accFirstName" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Last Name</label>
                                <input type="text" class="form-control" id="accLastName" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Email</label>
                                <input type="email" class="form-control" id="accEmail" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Password</label>
                                <input type="password" class="form-control" id="accPassword" required minlength="6">
                                <div class="form-text">Minimum 6 characters — will be securely hashed</div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Role</label>
                                <select class="form-select" id="accRole" required>
                                    <option value="user">User</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" id="accVerified">
                                <label class="form-check-label" for="accVerified">Verified</label>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="saveAccount()">Save</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modal = new bootstrap.Modal(document.getElementById('accountModal'));
    modal.show();
}

function editAccount(id, firstName, lastName, email, role, verified) {
    const modalsContainer = document.getElementById('modals-container');

    modalsContainer.innerHTML = `
        <div class="modal fade" id="accountModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Edit Account</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="accountForm">
                            <input type="hidden" id="accountId" value="${id}">
                            <div class="mb-3">
                                <label class="form-label">First Name</label>
                                <input type="text" class="form-control" id="accFirstName" required value="${firstName}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Last Name</label>
                                <input type="text" class="form-control" id="accLastName" required value="${lastName}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Email</label>
                                <input type="email" class="form-control" id="accEmail" required value="${email}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Role</label>
                                <select class="form-select" id="accRole" required>
                                    <option value="user" ${role === 'user' ? 'selected' : ''}>User</option>
                                    <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>
                                </select>
                            </div>
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" id="accVerified" ${verified ? 'checked' : ''}>
                                <label class="form-check-label" for="accVerified">Verified</label>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="saveAccount()">Save</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modal = new bootstrap.Modal(document.getElementById('accountModal'));
    modal.show();
}

async function saveAccount() {
    const id = document.getElementById('accountId').value;
    const firstName = document.getElementById('accFirstName').value.trim();
    const lastName = document.getElementById('accLastName').value.trim();
    const email = document.getElementById('accEmail').value.trim();
    const password = document.getElementById('accPassword') ? document.getElementById('accPassword').value : null;
    const role = document.getElementById('accRole').value;
    const verified = document.getElementById('accVerified').checked;

    if (!firstName || !lastName || !email || !role) {
        showToast('Please fill in all fields', 'danger');
        return;
    }

    if (!isValidEmail(email)) {
        showToast('Please enter a valid email', 'danger');
        return;
    }

    try {
        let response;

        if (id) {
            response = await fetch(`http://localhost:3000/api/users/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify({ firstName, lastName, email, role, verified })
            });
        } else {
            if (!password || password.length < 6) {
                showToast('Password must be at least 6 characters', 'danger');
                return;
            }
            response = await fetch('http://localhost:3000/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify({ username: email, password, firstName, lastName, role, verified })
            });
        }

        const data = await response.json();

        if (response.ok) {
            showToast(id ? 'Account updated successfully!' : 'Account created successfully!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('accountModal')).hide();
            await renderAccountsList();
        } else {
            showToast(data.error || 'Operation failed', 'danger');
        }
    } catch (err) {
        showToast('Cannot connect to server', 'danger');
    }
}

function openResetPasswordModal(id) {
    const modalsContainer = document.getElementById('modals-container');
    modalsContainer.innerHTML = `
        <div class="modal fade" id="resetPasswordModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Reset Password</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <input type="hidden" id="resetAccountId" value="${id}">
                        <div class="mb-3">
                            <label class="form-label">New Password</label>
                            <input type="password" class="form-control" id="newPassword" required minlength="6">
                            <div class="form-text">Minimum 6 characters — will be securely hashed</div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="resetPassword()">Reset Password</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modal = new bootstrap.Modal(document.getElementById('resetPasswordModal'));
    modal.show();
}

async function resetPassword() {
    const id = document.getElementById('resetAccountId').value;
    const newPassword = document.getElementById('newPassword').value;

    if (!newPassword || newPassword.length < 6) {
        showToast('Password must be at least 6 characters', 'danger');
        return;
    }

    try {
        const response = await fetch(`http://localhost:3000/api/users/${id}/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify({ password: newPassword })
        });

        const data = await response.json();

        if (response.ok) {
            showToast('Password reset successfully! It is now hashed on the backend.', 'success');
            bootstrap.Modal.getInstance(document.getElementById('resetPasswordModal')).hide();
        } else {
            showToast(data.error || 'Failed to reset password', 'danger');
        }
    } catch (err) {
        showToast('Cannot connect to server', 'danger');
    }
}

async function deleteAccount(id, name) {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;

    try {
        const response = await fetch(`http://localhost:3000/api/users/${id}`, {
            method: 'DELETE',
            headers: getAuthHeader()
        });

        const data = await response.json();

        if (response.ok) {
            showToast('Account deleted successfully!', 'success');
            await renderAccountsList();
        } else {
            showToast(data.error || 'Failed to delete account', 'danger');
        }
    } catch (err) {
        showToast('Cannot connect to server', 'danger');
    }
}

// ============================================
// Departments
// ============================================

function renderDepartments() {
    const content = document.getElementById('app-content');

    content.innerHTML = `
        <div class="card shadow">
            <div class="card-header bg-white d-flex justify-content-between align-items-center">
                <h4 class="mb-0"><i class="bi bi-building"></i> Departments</h4>
                <button class="btn btn-success" onclick="openAddDepartmentModal()">
                    <i class="bi bi-plus-circle"></i> Add Department
                </button>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead class="table-dark">
                            <tr>
                                <th>Name</th>
                                <th>Description</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="departmentsBody"></tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    loadDepartments();
}

function loadDepartments() {
    const departments = getAll('departments');
    const tbody = document.getElementById('departmentsBody');

    if (departments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No departments found</td></tr>';
        return;
    }

    tbody.innerHTML = departments.map(dept => `
        <tr>
            <td><strong>${dept.name}</strong></td>
            <td>${dept.description || '-'}</td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-primary" onclick="editDepartment(${dept.id})"><i class="bi bi-pencil"></i> Edit</button>
                    <button class="btn btn-danger" onclick="deleteDepartment(${dept.id})"><i class="bi bi-trash"></i> Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function openAddDepartmentModal() {
    const modalsContainer = document.getElementById('modals-container');

    modalsContainer.innerHTML = `
        <div class="modal fade" id="departmentModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Add Department</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="departmentForm">
                            <input type="hidden" id="departmentId">
                            <div class="mb-3">
                                <label class="form-label">Name</label>
                                <input type="text" class="form-control" id="name" required placeholder="e.g., Engineering">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Description</label>
                                <textarea class="form-control" id="description" rows="3" placeholder="Brief description"></textarea>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="saveDepartment()">Save</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modal = new bootstrap.Modal(document.getElementById('departmentModal'));
    modal.show();
}

function editDepartment(id) {
    const dept = getById('departments', id);
    const modalsContainer = document.getElementById('modals-container');

    modalsContainer.innerHTML = `
        <div class="modal fade" id="departmentModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Edit Department</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="departmentForm">
                            <input type="hidden" id="departmentId" value="${dept.id}">
                            <div class="mb-3">
                                <label class="form-label">Name</label>
                                <input type="text" class="form-control" id="name" required value="${dept.name}">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Description</label>
                                <textarea class="form-control" id="description" rows="3">${dept.description || ''}</textarea>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="saveDepartment()">Save</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modal = new bootstrap.Modal(document.getElementById('departmentModal'));
    modal.show();
}

function saveDepartment() {
    const id = document.getElementById('departmentId').value;
    const name = document.getElementById('name').value.trim();
    const description = document.getElementById('description').value.trim();

    if (!name) {
        showToast('Please enter a department name', 'danger');
        return;
    }

    const existing = getAll('departments').find(d =>
        d.name.toLowerCase() === name.toLowerCase() && (!id || d.id !== parseInt(id))
    );

    if (existing) {
        showToast('Department name already exists', 'danger');
        return;
    }

    if (id) {
        updateItem('departments', id, { name, description });
        showToast('Department updated successfully!', 'success');
    } else {
        addItem('departments', { name, description });
        showToast('Department created successfully!', 'success');
    }

    bootstrap.Modal.getInstance(document.getElementById('departmentModal')).hide();
    loadDepartments();
}

function deleteDepartment(id) {
    const dept = getById('departments', id);
    const employees = getAll('employees').filter(emp => emp.departmentId === id);

    if (employees.length > 0) {
        showToast(`Cannot delete department with ${employees.length} employee(s)`, 'danger');
        return;
    }

    if (!confirm(`Are you sure you want to delete ${dept.name}?`)) return;
    deleteItem('departments', id);
    showToast('Department deleted successfully!', 'success');
    loadDepartments();
}

// ============================================
// Utility Functions
// ============================================

function showToast(message, type = 'info') {
    const toastHtml = `
        <div class="toast align-items-center text-white bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body">${message}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        </div>
    `;

    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
    }

    container.insertAdjacentHTML('beforeend', toastHtml);
    const toastElement = container.lastElementChild;
    const toast = new bootstrap.Toast(toastElement);
    toast.show();

    toastElement.addEventListener('hidden.bs.toast', function() {
        toastElement.remove();
    });
}

function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// ============================================
// Initialize Application
// ============================================

async function verifyTokenWithBackend() {
    const token = sessionStorage.getItem('authToken');
    if (!token) return;

    try {
        const response = await fetch('http://localhost:3000/api/profile', {
            headers: getAuthHeader()
        });

        if (!response.ok) {
            sessionStorage.removeItem('authToken');
            setAuthState(false, null);
            showToast('Session expired. Please log in again.', 'warning');
            navigateTo('#/login');
        } else {
            currentUser = getCurrentUser();
            setAuthState(true, currentUser);
        }
    } catch (e) {
        console.warn('Backend not reachable. Continuing with cached token.');
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    initializeDatabase();

    if (!window.location.hash) {
        window.location.hash = '#/';
    }

    await verifyTokenWithBackend();

    window.addEventListener('hashchange', handleRouting);
    handleRouting();
});