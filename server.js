// server.js
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const cors    = require('cors');

const app  = express();
const PORT = 3000;

// Warns in dev if JWT_SECRET env var is missing — never silently use a weak secret in prod
const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
    console.warn('⚠️  WARNING: JWT_SECRET is not set in environment variables.');
    console.warn('   Using a temporary secret — DO NOT use this in production!');
}
const EFFECTIVE_SECRET = SECRET_KEY || 'temp-dev-only-secret';

app.use(cors({
    origin: ['http://127.0.0.1:5500', 'http://localhost:5500']
}));
app.use(express.json());

// ─── IN-MEMORY USER STORE ──────────────────────────────────────
// Replace with a real database (MySQL, PostgreSQL, etc.) in production.
let users = [
    {
        id:        1,
        username:  'admin@example.com',
        firstName: 'Admin',
        lastName:  'User',
        password:  bcrypt.hashSync('admin123', 10),
        role:      'admin',
        verified:  true
    },
    {
        id:        2,
        username:  'alice@example.com',
        firstName: 'Alice',
        lastName:  'Smith',
        password:  bcrypt.hashSync('user123', 10),
        role:      'user',
        verified:  true
    }
];

function nextId() {
    return users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
}

// ─── PUBLIC ROUTES ─────────────────────────────────────────────

// POST /api/register — new user, unverified until admin approves
app.post('/api/register', async (req, res) => {
    const { username, password, firstName = '', lastName = '' } = req.body;

    if (!username || !password)
        return res.status(400).json({ error: 'Username and password required' });
    if (password.length < 6)
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (users.find(u => u.username === username))
        return res.status(409).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        id: nextId(),
        username,
        firstName,
        lastName,
        password: hashedPassword,
        role:     'user',
        verified: false   // admin must approve before user can log in
    };
    users.push(newUser);

    res.status(201).json({
        message:  'Registration successful. Please wait for admin approval.',
        username,
        role:     'user',
        verified: false
    });
});

// POST /api/login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password)
        return res.status(400).json({ error: 'Username and password required' });

    const user = users.find(u => u.username === username);
    if (!user || !await bcrypt.compare(password, user.password))
        return res.status(401).json({ error: 'Invalid credentials' });

    if (!user.verified)
        return res.status(403).json({
            error: 'Your account is pending admin approval. Please wait for verification.'
        });

    const token = jwt.sign(
        {
            id:        user.id,
            username:  user.username,
            firstName: user.firstName,
            lastName:  user.lastName,
            role:      user.role
        },
        EFFECTIVE_SECRET,
        { expiresIn: '1h' }
    );

    res.json({
        token,
        user: {
            id:        user.id,
            username:  user.username,
            firstName: user.firstName,
            lastName:  user.lastName,
            role:      user.role,
            verified:  user.verified
        }
    });
});

// ─── PROTECTED ROUTES ──────────────────────────────────────────

// GET /api/profile
app.get('/api/profile', authenticateToken, (req, res) => {
    res.json({ user: req.user });
});

// PUT /api/profile
app.put('/api/profile', authenticateToken, async (req, res) => {
    const { firstName, lastName, email } = req.body;
    const userId = req.user.id;
    const idx    = users.findIndex(u => u.id === userId);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    if (email && email !== users[idx].username) {
        if (users.find(u => u.username === email && u.id !== userId))
            return res.status(409).json({ error: 'Email already in use' });
        users[idx].username = email;
    }
    if (firstName) users[idx].firstName = firstName;
    if (lastName)  users[idx].lastName  = lastName;

    const u        = users[idx];
    const newToken = jwt.sign(
        { id: u.id, username: u.username, firstName: u.firstName, lastName: u.lastName, role: u.role },
        EFFECTIVE_SECRET,
        { expiresIn: '1h' }
    );

    res.json({
        message: 'Profile updated',
        token:   newToken,
        user:    { id: u.id, username: u.username, firstName: u.firstName, lastName: u.lastName, role: u.role }
    });
});

// ─── ADMIN ROUTES ──────────────────────────────────────────────

// GET /api/admin/dashboard
app.get('/api/admin/dashboard', authenticateToken, authorizeRole('admin'), (req, res) => {
    res.json({ message: 'Welcome to the admin dashboard!', data: 'Secret admin info' });
});

// GET /api/users — list all users (no passwords)
app.get('/api/users', authenticateToken, authorizeRole('admin'), (req, res) => {
    res.json(users.map(({ password, ...u }) => u));
});

// POST /api/users — admin creates account
app.post('/api/users', authenticateToken, authorizeRole('admin'), async (req, res) => {
    const { username, password, firstName = '', lastName = '', role = 'user', verified = false } = req.body;

    if (!username || !password)
        return res.status(400).json({ error: 'Username and password required' });
    if (password.length < 6)
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (users.find(u => u.username === username))
        return res.status(409).json({ error: 'User already exists' });

    const newUser = {
        id:       nextId(),
        username,
        firstName,
        lastName,
        password: await bcrypt.hash(password, 10),
        role,
        verified
    };
    users.push(newUser);

    const { password: _, ...safeUser } = newUser;
    res.status(201).json({ message: 'Account created', user: safeUser });
});

// PUT /api/users/:id — admin edits account
app.put('/api/users/:id', authenticateToken, authorizeRole('admin'), (req, res) => {
    const id  = parseInt(req.params.id);
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    const { firstName, lastName, email, role, verified } = req.body;
    if (email && email !== users[idx].username) {
        if (users.find(u => u.username === email && u.id !== id))
            return res.status(409).json({ error: 'Email already in use' });
        users[idx].username = email;
    }
    if (firstName !== undefined) users[idx].firstName = firstName;
    if (lastName  !== undefined) users[idx].lastName  = lastName;
    if (role      !== undefined) users[idx].role      = role;
    if (verified  !== undefined) users[idx].verified  = verified;

    const { password: _, ...safeUser } = users[idx];
    res.json({ message: 'Account updated', user: safeUser });
});

// PATCH /api/users/:id/verify — admin approves or rejects
app.patch('/api/users/:id/verify', authenticateToken, authorizeRole('admin'), (req, res) => {
    const id  = parseInt(req.params.id);
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    users[idx].verified = req.body.verified;
    res.json({
        message: req.body.verified ? 'Account approved' : 'Account rejected',
        user:    { id, verified: req.body.verified }
    });
});

// PUT /api/users/:id/password — admin resets password
app.put('/api/users/:id/password', authenticateToken, authorizeRole('admin'), async (req, res) => {
    const id  = parseInt(req.params.id);
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    const { password } = req.body;
    if (!password || password.length < 6)
        return res.status(400).json({ error: 'Password must be at least 6 characters' });

    users[idx].password = await bcrypt.hash(password, 10);
    res.json({ message: 'Password reset successfully' });
});

// DELETE /api/users/:id
app.delete('/api/users/:id', authenticateToken, authorizeRole('admin'), (req, res) => {
    const id = parseInt(req.params.id);
    if (id === req.user.id)
        return res.status(403).json({ error: 'Cannot delete your own account' });

    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });

    users.splice(idx, 1);
    res.json({ message: 'Account deleted' });
});

// ─── MIDDLEWARE ────────────────────────────────────────────────

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token      = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token required' });

    jwt.verify(token, EFFECTIVE_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
}

function authorizeRole(role) {
    return (req, res, next) => {
        if (req.user.role !== role)
            return res.status(403).json({ error: 'Access denied: insufficient permissions' });
        next();
    };
}

// ─── START ─────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✅ Backend running on http://localhost:${PORT}`);
    console.log(`🔐 Demo credentials:`);
    console.log(`   Admin: admin@example.com  /  admin123`);
    console.log(`   User:  alice@example.com  /  user123`);
});