/**
 * Game Context
 * 
 * Manages all game state and socket event handling.
 * This is the central state management for the entire game.
 * 
 * IMPORTANT: The frontend NEVER calculates game results.
 * All game logic comes from the server via socket events.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import socket from './socket';

const GameContext = createContext(null);

export function GameProvider({ children }) {
    // Connection state
    const [isConnected, setIsConnected] = useState(false);
    
    // Player state
    const [player, setPlayer] = useState(null); // { id, name }
    
    // Room state
    const [room, setRoom] = useState(null); // { code, hostId, phase, players, topic }
    
    // Game state (received from server)
    const [isImposter, setIsImposter] = useState(false);
    const [secretWord, setSecretWord] = useState(null);
    const [topic, setTopic] = useState(null);
    
    // Phase-specific state
    const [descriptions, setDescriptions] = useState([]);
    const [submissionProgress, setSubmissionProgress] = useState({ count: 0, total: 0 });
    const [voteProgress, setVoteProgress] = useState({ count: 0, total: 0 });
    const [hasSubmittedDescription, setHasSubmittedDescription] = useState(false);
    const [hasVoted, setHasVoted] = useState(false);
    
    // Results state
    const [results, setResults] = useState(null);
    
    // Timer state
    const [timer, setTimer] = useState({ phase: null, remainingSeconds: 0 });
    
    // Error state
    const [error, setError] = useState(null);

    // =========================================================================
    // SOCKET CONNECTION
    // =========================================================================
    
    useEffect(() => {
        // Connect socket on mount
        socket.connect();
        
        // Connection handlers
        socket.on('connect', () => {
            setIsConnected(true);
            setError(null);
        });
        
        socket.on('disconnect', () => {
            setIsConnected(false);
        });
        
        socket.on('connect_error', (err) => {
            setError('Connection failed. Is the server running?');
        });
        
        // Cleanup on unmount
        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('connect_error');
            socket.disconnect();
        };
    }, []);

    // =========================================================================
    // SOCKET EVENT LISTENERS
    // =========================================================================
    
    useEffect(() => {
        // Player joined room
        socket.on('player:joined', (data) => {
            setRoom(data.room);
        });
        
        // Player left room
        socket.on('player:left', (data) => {
            setRoom(data.room);
        });
        
        // Host changed
        socket.on('room:hostChanged', (data) => {
            setRoom(data.room);
        });
        
        // Game started - receive role assignment
        socket.on('game:roleAssigned', (data) => {
            setIsImposter(data.isImposter);
            setTopic(data.topic);
            if (!data.isImposter) {
                setSecretWord(data.word);
            }
        });
        
        // Game started - public notification
        socket.on('game:started', (data) => {
            setRoom(data.room);
            setTopic(data.topic);
        });
        
        // Phase changed
        socket.on('game:phaseChanged', (data) => {
            setRoom(data.room);
            // Reset phase-specific state
            if (data.phase === 'description') {
                setHasSubmittedDescription(false);
                setSubmissionProgress({ count: 0, total: data.room.playerCount });
            }
        });
        
        // Description submitted (progress update)
        socket.on('game:descriptionSubmitted', (data) => {
            setSubmissionProgress({ count: data.submittedCount, total: data.totalPlayers });
        });
        
        // Description phase ended - receive anonymized descriptions
        socket.on('game:descriptionPhaseEnded', (data) => {
            setRoom(data.room);
            setDescriptions(data.descriptions);
            setHasVoted(false);
            setVoteProgress({ count: 0, total: data.room.playerCount });
        });
        
        // Vote submitted (progress update)
        socket.on('game:voteSubmitted', (data) => {
            setVoteProgress({ count: data.votedCount, total: data.totalPlayers });
        });
        
        // Game results
        socket.on('game:results', (data) => {
            setRoom(data.room);
            setResults({
                votedOutPlayer: data.votedOutPlayer,
                imposter: data.imposter,
                playersWin: data.playersWin,
                voteSummary: data.voteSummary,
                secretWord: data.secretWord
            });
            // Clear timer when game ends
            setTimer({ phase: null, remainingSeconds: 0 });
        });
        
        // Timer tick - server sends countdown every second
        socket.on('game:timer', (data) => {
            setTimer({ phase: data.phase, remainingSeconds: data.remainingSeconds });
        });
        
        // Cleanup
        return () => {
            socket.off('player:joined');
            socket.off('player:left');
            socket.off('room:hostChanged');
            socket.off('game:roleAssigned');
            socket.off('game:started');
            socket.off('game:phaseChanged');
            socket.off('game:descriptionSubmitted');
            socket.off('game:descriptionPhaseEnded');
            socket.off('game:voteSubmitted');
            socket.off('game:results');
            socket.off('game:timer');
        };
    }, []);

    // =========================================================================
    // ACTIONS (emit events to server)
    // =========================================================================
    
    const createRoom = useCallback((playerName) => {
        return new Promise((resolve, reject) => {
            socket.emit('room:create', { playerName }, (response) => {
                if (response.success) {
                    setPlayer(response.player);
                    setRoom(response.room);
                    resolve(response);
                } else {
                    setError(response.error);
                    reject(response.error);
                }
            });
        });
    }, []);
    
    const joinRoom = useCallback((roomCode, playerName) => {
        return new Promise((resolve, reject) => {
            socket.emit('room:join', { roomCode, playerName }, (response) => {
                if (response.success) {
                    setPlayer(response.player);
                    setRoom(response.room);
                    resolve(response);
                } else {
                    setError(response.error);
                    reject(response.error);
                }
            });
        });
    }, []);
    
    const startGame = useCallback(() => {
        return new Promise((resolve, reject) => {
            socket.emit('game:start', (response) => {
                if (response.success) {
                    resolve(response);
                } else {
                    setError(response.error);
                    reject(response.error);
                }
            });
        });
    }, []);
    
    const startDescriptionPhase = useCallback(() => {
        return new Promise((resolve, reject) => {
            socket.emit('game:startDescriptionPhase', (response) => {
                if (response.success) {
                    setRoom(response.room);
                    resolve(response);
                } else {
                    setError(response.error);
                    reject(response.error);
                }
            });
        });
    }, []);
    
    const submitDescription = useCallback((text) => {
        return new Promise((resolve, reject) => {
            socket.emit('game:submitDescription', { text }, (response) => {
                if (response.success) {
                    setHasSubmittedDescription(true);
                    setSubmissionProgress({ 
                        count: response.submittedCount, 
                        total: response.totalPlayers 
                    });
                    resolve(response);
                } else {
                    setError(response.error);
                    reject(response.error);
                }
            });
        });
    }, []);
    
    const submitVote = useCallback((targetPlayerId) => {
        return new Promise((resolve, reject) => {
            socket.emit('game:submitVote', { targetPlayerId }, (response) => {
                if (response.success) {
                    setHasVoted(true);
                    setVoteProgress({ 
                        count: response.votedCount, 
                        total: response.totalPlayers 
                    });
                    resolve(response);
                } else {
                    setError(response.error);
                    reject(response.error);
                }
            });
        });
    }, []);
    
    const clearError = useCallback(() => {
        setError(null);
    }, []);

    // =========================================================================
    // COMPUTED VALUES
    // =========================================================================
    
    const isHost = player && room && player.id === room.hostId;
    const phase = room?.phase || 'home';

    // =========================================================================
    // CONTEXT VALUE
    // =========================================================================
    
    const value = {
        // Connection
        isConnected,
        
        // Player & Room
        player,
        room,
        isHost,
        phase,
        
        // Game state
        isImposter,
        secretWord,
        topic,
        
        // Phase state
        descriptions,
        submissionProgress,
        voteProgress,
        hasSubmittedDescription,
        hasVoted,
        
        // Results
        results,
        
        // Timer
        timer,
        
        // Error
        error,
        clearError,
        
        // Actions
        createRoom,
        joinRoom,
        startGame,
        startDescriptionPhase,
        submitDescription,
        submitVote
    };

    return (
        <GameContext.Provider value={value}>
            {children}
        </GameContext.Provider>
    );
}

export function useGame() {
    const context = useContext(GameContext);
    if (!context) {
        throw new Error('useGame must be used within a GameProvider');
    }
    return context;
}

export default GameContext;
