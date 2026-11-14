import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const JWT_SECRET = process.env.JWT_SECRET || 'messenger-secret-key-change-in-production';
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'data.json');
const isProduction = process.env.NODE_ENV === 'production';

// Simple JSON database
function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    return { users: [], chats: [], chat_members: [], messages: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { users: [], chats: [], chat_members: [], messages: [] };
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

let db = loadDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const onlineUsers = new Map();

// Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    if (db.users.some(u => u.username === username || u.email === email)) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = {
      id: uuidv4(),
      username,
      email,
      password: hashed,
      avatar: null,
      status: 'offline',
      lastSeen: Date.now()
    };
    db.users.push(user);
    saveDB(db);
    const token = jwt.sign({ id: user.id, username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, username, email } });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.users.find(u => u.email === email);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar }
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/me', auth, (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const { password, ...safe } = user;
  res.json(safe);
});

app.get('/api/users/search', auth, (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const users = db.users
    .filter(u => u.id !== req.user.id && u.username.toLowerCase().includes(q))
    .map(({ id, username, avatar, status }) => ({ id, username, avatar, status }))
    .slice(0, 20);
  res.json(users);
});

app.get('/api/chats', auth, (req, res) => {
  const myChats = db.chat_members
    .filter(m => m.userId === req.user.id)
    .map(m => m.chatId);

  const chats = db.chats
    .filter(c => myChats.includes(c.id))
    .map(c => {
      const last = db.messages
        .filter(m => m.chatId === c.id)
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      return {
        ...c,
        lastMessage: last?.content || last?.fileName || null,
        lastMessageAt: last?.createdAt || null
      };
    })
    .sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));

  res.json(chats);
});

app.post('/api/chats/private', auth, (req, res) => {
  const { userId } = req.body;
  const existing = db.chats.find(c => {
    if (c.type !== 'private') return false;
    const members = db.chat_members.filter(m => m.chatId === c.id).map(m => m.userId);
    return members.includes(req.user.id) && members.includes(userId);
  });
  if (existing) return res.json({ chatId: existing.id });

  const chatId = uuidv4();
  db.chats.push({ id: chatId, type: 'private', name: null, avatar: null, createdAt: Date.now() });
  db.chat_members.push(
    { chatId, userId: req.user.id, role: 'member', joinedAt: Date.now() },
    { chatId, userId, role: 'member', joinedAt: Date.now() }
  );
  saveDB(db);
  res.json({ chatId });
});

app.post('/api/chats/group', auth, (req, res) => {
  const { name, memberIds = [] } = req.body;
  const chatId = uuidv4();
  db.chats.push({ id: chatId, type: 'group', name, avatar: null, createdAt: Date.now() });
  db.chat_members.push({ chatId, userId: req.user.id, role: 'admin', joinedAt: Date.now() });
  for (const id of memberIds) {
    db.chat_members.push({ chatId, userId: id, role: 'member', joinedAt: Date.now() });
  }
  saveDB(db);
  res.json({ chatId });
});

app.get('/api/chats/:chatId/messages', auth, (req, res) => {
  const messages = db.messages
    .filter(m => m.chatId === req.params.chatId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-100)
    .map(m => {
      const user = db.users.find(u => u.id === m.senderId);
      return { ...m, username: user?.username || 'Unknown', avatar: user?.avatar };
    });
  res.json(messages);
});

app.post('/api/upload', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const type = req.file.mimetype.startsWith('image/') ? 'image'
    : req.file.mimetype.startsWith('audio/') ? 'voice'
    : 'file';
  res.json({
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname,
    type
  });
});

// Socket.io
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Auth required'));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user.id;
  onlineUsers.set(userId, socket.id);

  const user = db.users.find(u => u.id === userId);
  if (user) {
    user.status = 'online';
    user.lastSeen = Date.now();
    saveDB(db);
  }
  io.emit('user:status', { userId, status: 'online' });

  socket.on('chat:join', (chatId) => {
    socket.join(chatId);
  });

  socket.on('message:send', (data) => {
    const { chatId, content, type = 'text', fileUrl, fileName } = data;
    const message = {
      id: uuidv4(),
      chatId,
      senderId: userId,
      content: content || null,
      type,
      fileUrl: fileUrl || null,
      fileName: fileName || null,
      createdAt: Date.now()
    };
    db.messages.push(message);
    saveDB(db);

    const full = { ...message, username: socket.user.username };
    io.to(chatId).emit('message:new', full);
  });

  socket.on('typing:start', (chatId) => {
    socket.to(chatId).emit('typing:start', { chatId, userId, username: socket.user.username });
  });

  socket.on('typing:stop', (chatId) => {
    socket.to(chatId).emit('typing:stop', { chatId, userId });
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(userId);
    const u = db.users.find(u => u.id === userId);
    if (u) {
      u.status = 'offline';
      u.lastSeen = Date.now();
      saveDB(db);
    }
    io.emit('user:status', { userId, status: 'offline', lastSeen: Date.now() });
  });
});

// Serve frontend in production
if (isProduction) {
  const frontendPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads') && !req.path.startsWith('/socket.io')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    }
  });
}

httpServer.listen(PORT, () => {
  console.log(`Messenger running on port ${PORT}`);
});
