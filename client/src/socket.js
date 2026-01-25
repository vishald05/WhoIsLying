/**
 * Socket.io Client Connection
 * 
 * Singleton socket instance used throughout the app.
 * Connects to the game server for real-time communication.
 */

import { io } from 'socket.io-client';

// Connect to the backend server
// In development, Vite proxies /socket.io to localhost:3001
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

export const socket = io(SOCKET_URL, {
    autoConnect: false, // We'll connect manually when needed
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
});

// Debug logging in development
if (import.meta.env.DEV) {
    socket.onAny((event, ...args) => {
        console.log(`[Socket] ${event}`, args);
    });
}

export default socket;
