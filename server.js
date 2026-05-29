require('dotenv').config()
const express = require("express");
const cors = require('cors');
const connectDB = require("./config/db");
const authRoutes = require('./routes/authRoutes');
const postRoutes = require('./routes/postRoutes');
const userRoutes = require('./routes/userRoutes');
const communityRoutes = require('./routes/communityRoutes');
const commentRoutes = require('./routes/CommentRoutes');
const messageRoutes = require('./routes/messageRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();

// Use a single env var for the frontend origin in production.
// In development you can leave FRONTEND_URL undefined to allow all origins.
const frontendOrigin = process.env.FRONTEND_URL || '*';

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || frontendOrigin === '*' || origin === frontendOrigin) {
      // allow requests with no origin (like server-to-server or curl)
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

connectDB();

app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/user', userRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api', commentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/stories', require('./routes/storyRoutes'));

app.get('/', (req, res) => res.send("Wellness api running"));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || "Internal Server error"
  });
});

const PORT = process.env.PORT || 3000;

//socket
const http = require('http');
const server = http.createServer(app);

const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: frontendOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  }
});

app.locals.io = io;

const onlineUsers = new Map();

io.on('connection', (socket) => {
  // console.log('Socket connected:', socket.id);
  const userId = socket.handshake.query.userId;

  if (userId && userId !== "undefined") {
    onlineUsers.set(userId, socket.id);
    socket.join(userId); // Join a room for this user
    io.emit('getOnlineUsers', Array.from(onlineUsers.keys()));
  }

  socket.on('requestOnlineUsers', () => {
    socket.emit('getOnlineUsers', Array.from(onlineUsers.keys()));
  });

  // Regular conversation handling
  socket.on('joinConversation', (conversationId) => {
    if (conversationId) {
      socket.join(String(conversationId));
      socket.emit('joinedConversation', { conversationId });
    }
  });

  socket.on('leaveConversation', (conversationId) => {
    if (conversationId) socket.leave(String(conversationId));
  });

  socket.on('sendMessage', async (payload) => {
    const { conversationId, message } = payload || {};
    if (conversationId && message) {
      io.to(String(conversationId)).emit('newMessage', { conversationId, message });
    }
  });

  // WebRTC signaling for 1:1 call flow
  socket.on('call:initiate', (payload = {}) => {
    const { toUserId, fromUserId, conversationId, offer, isVideo, callId } = payload;
    if (!toUserId || !fromUserId || !conversationId || !offer) return;

    io.to(String(toUserId)).emit('call:incoming', {
      toUserId: String(toUserId),
      fromUserId: String(fromUserId),
      conversationId: String(conversationId),
      offer,
      isVideo: Boolean(isVideo),
      callId: callId || null
    });
  });

  socket.on('call:accept', (payload = {}) => {
    const { toUserId, fromUserId, conversationId, answer, callId } = payload;
    if (!toUserId || !fromUserId || !conversationId || !answer) return;

    io.to(String(toUserId)).emit('call:accepted', {
      toUserId: String(toUserId),
      fromUserId: String(fromUserId),
      conversationId: String(conversationId),
      answer,
      callId: callId || null
    });
  });

  socket.on('call:reject', (payload = {}) => {
    const { toUserId, fromUserId, conversationId, callId } = payload;
    if (!toUserId || !fromUserId || !conversationId) return;

    io.to(String(toUserId)).emit('call:rejected', {
      toUserId: String(toUserId),
      fromUserId: String(fromUserId),
      conversationId: String(conversationId),
      callId: callId || null
    });
  });

  socket.on('call:end', (payload = {}) => {
    const { toUserId, fromUserId, conversationId, callId } = payload;
    if (!toUserId || !fromUserId || !conversationId) return;

    io.to(String(toUserId)).emit('call:ended', {
      toUserId: String(toUserId),
      fromUserId: String(fromUserId),
      conversationId: String(conversationId),
      callId: callId || null
    });
  });

  socket.on('call:ice-candidate', (payload = {}) => {
    const { toUserId, fromUserId, conversationId, candidate, callId } = payload;
    if (!toUserId || !fromUserId || !conversationId || !candidate) return;

    io.to(String(toUserId)).emit('call:ice-candidate', {
      toUserId: String(toUserId),
      fromUserId: String(fromUserId),
      conversationId: String(conversationId),
      candidate,
      callId: callId || null
    });
  });

  // Typing indicators
  socket.on('typing', ({ conversationId, typistId }) => {
    if (conversationId && typistId) {
      socket.to(String(conversationId)).emit('typing', { conversationId, typistId });
    }
  });

  socket.on('stopTyping', ({ conversationId, typistId }) => {
    if (conversationId && typistId) {
      socket.to(String(conversationId)).emit('stopTyping', { conversationId, typistId });
    }
  });

  // Community chat handling
  socket.on('joinCommunity', (communityId) => {
    if (communityId) {
      const roomName = `community-${communityId}`;
      socket.join(roomName);
      // console.log(`Socket ${socket.id} joined community room: ${roomName}`);
    }
  });

  socket.on('leaveCommunity', (communityId) => {
    if (communityId) {
      const roomName = `community-${communityId}`;
      socket.leave(roomName);
      // console.log(`Socket ${socket.id} left community room: ${roomName}`);
    }
  });

  socket.on('sendCommunityMessage', (payload) => {
    const { communityId, message } = payload || {};
    if (communityId && message) {
      const roomName = `community-${communityId}`;
      io.to(roomName).emit('communityMessage', message);
      // console.log(`Message sent to community room: ${roomName}`);
    }
  });

  socket.on('disconnect', () => {
    // console.log('Socket disconnected', socket.id);
    if (userId && onlineUsers.get(userId) === socket.id) {
      onlineUsers.delete(userId);
      io.emit('getOnlineUsers', Array.from(onlineUsers.keys()));
    }
  });
});
server.listen(PORT, () => {
  console.log(`Server listening on PORT ${PORT} (with Socket.IO)`);
});
