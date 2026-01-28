/**
 * Socket.io Client Connection
 * 
 * Singleton socket instance used throughout the app.
 * Connects to the game server for real-time communication.
 * 
 * Environment Configuration:
 * - Development: Uses VITE_SOCKET_URL from .env.development (localhost:3001)
 * - Production: Uses VITE_SOCKET_URL from .env.production (Render backend)
 */

import { io } from 'socket.io-client';

// Connect to the backend server
// Environment variable is set in .env.development and .env.production
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

// Determine if we're in production
const isProduction = import.meta.env.PROD;

export const socket = io(SOCKET_URL, {
    autoConnect: false, // We'll connect manually when needed
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    // Production: Use WebSocket with polling fallback for Render compatibility
    // Development: Use default (polling then upgrade to WebSocket)
    transports: isProduction ? ['websocket', 'polling'] : ['polling', 'websocket']
});

// Debug logging in development
if (import.meta.env.DEV) {
    socket.onAny((event, ...args) => {
        console.log(`[Socket] ${event}`, args);
    });
}

export default socket;
