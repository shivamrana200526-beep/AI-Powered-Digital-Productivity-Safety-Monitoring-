import { Server } from 'socket.io';
import { verifyToken } from '../auth/authService.js';

let ioInstance = null;

export function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Socket authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }
    try {
      const decoded = verifyToken(token);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`[Socket] Connected: ${user.name} (${user.role} - ${user.id})`);

    // Join role-specific and user-specific rooms
    socket.join(`user:${user.id}`);
    if (user.role === 'PARENT') {
      socket.join(`parent:${user.id}`);
    } else if (user.role === 'STUDENT') {
      socket.join(`student:${user.id}`);
    }

    socket.on('parent:request_screenshot', (data) => {
      if (user.role === 'PARENT' && data?.studentId) {
        io.to(`user:${data.studentId}`).emit('student:capture_requested', { parentId: user.id });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${user.name} (${user.id})`);
    });
  });

  ioInstance = io;
  return io;
}

export function getSocketServer() {
  return ioInstance;
}

export default {
  initSocketServer,
  getSocketServer,
};
