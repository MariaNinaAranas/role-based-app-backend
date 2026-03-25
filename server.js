// server.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = 3000;

// FIX #3: Hardened SECRET_KEY — warns in dev, never silently uses a weak secret
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

// ─── SINGLE SOURCE OF TRUTH ────────────────────────────────────
let users = [
    {
        id: 1,
        username: 'admin@example.com',
        firstName: 'Admin',
        lastName: 'User',
        password: bcrypt.hashSync('admin123', 10),
        role: 'admin',
        verified: true
    },
    {
        id: 2,
        username: 'alice@example.com',
        firstName: 'Alice',
        lastName: 'Smith',
        password: bcrypt.hashSync('user123', 10),
        role: 'user',
        verified: true
    }
];

function nextId() {
    return users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
}

// ─── PUBLIC ROUTES ─────────────────────────────────────────────

// POST /api/register
// Creates account with verified: false — must wait for admin approval
app.post('/api/register', async (req, res) => {
    const { username, password, firstName = '', lastName = '' } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = users.find(u => u.username === username);
    if (existing) {
        return res.status(409).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
        id: nextId(),
        username,
        firstName,
        lastName,
        password: hashedPassword,
        role: 'user',
        verified: false  // Must wait for admin approval
    };

    users.push(newUser);
    res.status(201).json({
        message: 'Registration successful. Please wait for admin approval before logging in.',
        username,
        role: 'user',
        verified: false
    });
});

// POST /api/login
// Blocks login if account is not verified
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    const user = users.find(u => u.username === username);
    if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Block login if not verified
    if (!user.verified) {
        return res.status(403).json({
            error: 'Your account is pending admin approval. Please wait for verification.'
        });
    }

    // FIX #3: Use EFFECTIVE_SECRET
    const token = jwt.sign(
        {
            id: user.id,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role
        },
        EFFECTIVE_SECRET,
        { expiresIn: '1h' }
    );

    res.json({
        token,
        user: {
            id: user.id,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            verified: user.verified
        }
    });
});

// GET /api/content/guest — Public
app.get('/api/content/guest', (req, res) => {
    res.json({ message: 'Public content for all visitors' });
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

    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (email && email !== users[userIndex].username) {
        const emailTaken = users.find(u => u.username === email && u.id !== userId);
        if (emailTaken) {
            return res.status(409).json({ error: 'Email already in use' });
        }
        users[userIndex].username = email;
    }

    if (firstName) users[userIndex].firstName = firstName;
    if (lastName) users[userIndex].lastName = lastName;

    const updatedUser = users[userIndex];

    // FIX #3: Use EFFECTIVE_SECRET
    const newToken = jwt.sign(
        {
            id: updatedUser.id,
            username: updatedUser.username,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            role: updatedUser.role
        },
        EFFECTIVE_SECRET,
        { expiresIn: '1h' }
    );

    res.json({
        message: 'Profile updated',
        token: newToken,
        user: {
            id: updatedUser.id,
            username: updatedUser.username,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            role: updatedUser.role
        }
    });
});

// ─── ADMIN ONLY ROUTES ─────────────────────────────────────────

// GET /api/admin/dashboard
app.get('/api/admin/dashboard', authenticateToken, authorizeRole('admin'), (req, res) => {
    res.json({ message: 'Welcome to admin dashboard!', data: 'Secret admin info' });
});

// GET /api/users — Get all users (passwords never included)
app.get('/api/users', authenticateToken, authorizeRole('admin'), (req, res) => {
    const safeUsers = users.map(({ password, ...u }) => u);
    res.json(safeUsers);
});

// POST /api/users — Admin creates account (can set verified directly)
app.post('/api/users', authenticateToken, authorizeRole('admin'), async (req, res) => {
    const { username, password, firstName = '', lastName = '', role = 'user', verified = false } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = users.find(u => u.username === username);
    if (existing) {
        return res.status(409).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
        id: nextId(),
        username,
        firstName,
        lastName,
        password: hashedPassword,
        role,
        verified
    };

    users.push(newUser);
    const { password: _, ...safeUser } = newUser;
    res.status(201).json({ message: 'Account created', user: safeUser });
});

// PUT /api/users/:id — Admin edits account
app.put('/api/users/:id', authenticateToken, authorizeRole('admin'), (req, res) => {
    const id = parseInt(req.params.id);
    const { firstName, lastName, email, role, verified } = req.body;

    const userIndex = users.findIndex(u => u.id === id);
    if (userIndex === -1) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (email && email !== users[userIndex].username) {
        const emailTaken = users.find(u => u.username === email && u.id !== id);
        if (emailTaken) {
            return res.status(409).json({ error: 'Email already in use' });
        }
        users[userIndex].username = email;
    }

    if (firstName !== undefined) users[userIndex].firstName = firstName;
    if (lastName !== undefined) users[userIndex].lastName = lastName;
    if (role !== undefined) users[userIndex].role = role;
    if (verified !== undefined) users[userIndex].verified = verified;

    const { password: _, ...safeUser } = users[userIndex];
    res.json({ message: 'Account updated', user: safeUser });
});

// PATCH /api/users/:id/verify — Admin approves/rejects account
app.patch('/api/users/:id/verify', authenticateToken, authorizeRole('admin'), (req, res) => {
    const id = parseInt(req.params.id);
    const { verified } = req.body;

    const userIndex = users.findIndex(u => u.id === id);
    if (userIndex === -1) {
        return res.status(404).json({ error: 'User not found' });
    }

    users[userIndex].verified = verified;

    res.json({
        message: verified ? 'Account approved successfully' : 'Account rejected',
        user: { id, verified }
    });
});

// PUT /api/users/:id/password — Admin resets password (hashed on backend)
app.put('/api/users/:id/password', authenticateToken, authorizeRole('admin'), async (req, res) => {
    const id = parseInt(req.params.id);
    const { password } = req.body;

    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const userIndex = users.findIndex(u => u.id === id);
    if (userIndex === -1) {
        return res.status(404).json({ error: 'User not found' });
    }

    users[userIndex].password = await bcrypt.hash(password, 10);
    res.json({ message: 'Password reset successfully' });
});

// DELETE /api/users/:id — Admin deletes account
app.delete('/api/users/:id', authenticateToken, authorizeRole('admin'), (req, res) => {
    const id = parseInt(req.params.id);

    if (id === req.user.id) {
        return res.status(403).json({ error: 'Cannot delete your own account' });
    }

    const userIndex = users.findIndex(u => u.id === id);
    if (userIndex === -1) {
        return res.status(404).json({ error: 'User not found' });
    }

    users.splice(userIndex, 1);
    res.json({ message: 'Account deleted' });
});

// ─── MIDDLEWARE ────────────────────────────────────────────────

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    // FIX #3: Use EFFECTIVE_SECRET
    jwt.verify(token, EFFECTIVE_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
}

function authorizeRole(role) {
    return (req, res, next) => {
        if (req.user.role !== role) {
            return res.status(403).json({ error: 'Access denied: insufficient permissions' });
        }
        next();
    };
}

// ─── START SERVER ──────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✅ Backend running on http://localhost:${PORT}`);
    console.log(`🔐 Try logging in with:`);
    console.log(`   - Admin: username=admin@example.com, password=admin123`);
    console.log(`   - User:  username=alice@example.com, password=user123`);
});