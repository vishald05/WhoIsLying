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
    
    // V1.1: Sequential description phase state
    const [speakingOrder, setSpeakingOrder] = useState([]);
    const [currentSpeaker, setCurrentSpeaker] = useState(null);
    const [liveDescriptions, setLiveDescriptions] = useState([]); // Descriptions submitted so far
    
    // V1.1: Enhanced voting state
    const [selectedVote, setSelectedVote] = useState(null);       // Current selection (not confirmed)
    const [hasConfirmedVote, setHasConfirmedVote] = useState(false);
    const [confirmProgress, setConfirmProgress] = useState({ count: 0, total: 0 });
    
    // V1.1: Chat state
    const [chatMessages, setChatMessages] = useState([]);
    
    // V1.3: Tie transition state (shows transition screen for 2-3 seconds)
    const [showTieTransition, setShowTieTransition] = useState(false);
    
    // Results state
    const [results, setResults] = useState(null);
    
    // Timer state
    const [timer, setTimer] = useState({ phase: null, remainingSeconds: 0 });
    
    // V1.2: Room settings state
    const [roomSettings, setRoomSettings] = useState({ descriptionTime: 10, votingTime: 60 });
    
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
            // V1.2: Sync settings when room updates
            if (data.room?.settings) {
                setRoomSettings(data.room.settings);
            }
        });
        
        // Player left room
        socket.on('player:left', (data) => {
            setRoom(data.room);
            if (data.room?.settings) {
                setRoomSettings(data.room.settings);
            }
        });
        
        // Host changed
        socket.on('room:hostChanged', (data) => {
            setRoom(data.room);
            if (data.room?.settings) {
                setRoomSettings(data.room.settings);
            }
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
                // V1.1: Initialize sequential description state
                if (data.speakingOrder) {
                    setSpeakingOrder(data.speakingOrder);
                    setLiveDescriptions([]);
                }
            }
        });
        
        // V1.1: Speaker turn changed
        socket.on('game:speakerTurn', (data) => {
            setCurrentSpeaker({
                id: data.speakerId,
                name: data.speakerName,
                index: data.speakerIndex,
                total: data.totalSpeakers
            });
        });
        
        // Description submitted (progress update)
        // V1.1: Now includes attribution
        socket.on('game:descriptionSubmitted', (data) => {
            setSubmissionProgress({ count: data.submittedCount, total: data.totalPlayers });
            // V1.1: Add to live descriptions list
            if (data.playerId && data.playerName !== undefined) {
                setLiveDescriptions(prev => [...prev, {
                    playerId: data.playerId,
                    playerName: data.playerName,
                    description: data.description,
                    isAutoSubmit: data.isAutoSubmit
                }]);
            }
        });
        
        // Description phase ended - receive descriptions
        socket.on('game:descriptionPhaseEnded', (data) => {
            setRoom(data.room);
            setDescriptions(data.descriptions);
            // V1.1: Reset voting state
            setHasVoted(false);
            setSelectedVote(null);
            setHasConfirmedVote(false);
            setVoteProgress({ count: 0, total: data.room.playerCount });
            setConfirmProgress({ count: 0, total: data.room.playerCount });
            setChatMessages([]); // Clear chat for new voting phase
        });
        
        // Vote submitted (progress update)
        socket.on('game:voteSubmitted', (data) => {
            setVoteProgress({ count: data.votedCount, total: data.totalPlayers });
        });
        
        // V1.1: Vote confirmed (progress update)
        socket.on('game:voteConfirmed', (data) => {
            setConfirmProgress({ count: data.confirmedCount, total: data.totalPlayers });
        });
        
        // V1.1: Chat message received
        socket.on('chat:message', (data) => {
            setChatMessages(prev => [...prev, data.message]);
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
        
        // V1.1: Game reset (Play Again)
        socket.on('game:reset', (data) => {
            setRoom(data.room);
            // Reset all game state
            setIsImposter(false);
            setSecretWord(null);
            setTopic(null);
            setDescriptions([]);
            setSubmissionProgress({ count: 0, total: 0 });
            setVoteProgress({ count: 0, total: 0 });
            setHasSubmittedDescription(false);
            setHasVoted(false);
            setSpeakingOrder([]);
            setCurrentSpeaker(null);
            setLiveDescriptions([]);
            setSelectedVote(null);
            setHasConfirmedVote(false);
            setConfirmProgress({ count: 0, total: 0 });
            setChatMessages([]);
            setResults(null);
            setTimer({ phase: null, remainingSeconds: 0 });
        });
        
        // Timer tick - server sends countdown every second
        socket.on('game:timer', (data) => {
            setTimer({ phase: data.phase, remainingSeconds: data.remainingSeconds });
        });
        
        // V1.2: Room settings updated by host
        socket.on('game:settingsUpdated', (data) => {
            setRoomSettings(data.settings);
        });
        
        // V1.3: Tie replay started (tie occurred - new round with same imposter)
        socket.on('game:tieReplayStarted', (data) => {
            console.log('[Game] Tie detected - starting replay round with new topic');
            
            // Show transition screen
            setShowTieTransition(true);
            
            // Update topic and speaking order
            setTopic(data.topic);
            setSpeakingOrder(data.speakingOrder || []);
            
            // Reset all round-specific state
            setDescriptions([]);
            setLiveDescriptions([]);
            setHasSubmittedDescription(false);
            setSubmissionProgress({ count: 0, total: 0 });
            setSelectedVote(null);
            setHasConfirmedVote(false);
            setHasVoted(false);
            setVoteProgress({ count: 0, total: 0 });
            setConfirmProgress({ count: 0, total: 0 });
            setChatMessages([]);
            setCurrentSpeaker(null);
            setResults(null);
            
            // Clear timer (server will restart it)
            setTimer({ phase: null, remainingSeconds: 0 });
            
            // Hide transition after 2.5 seconds
            setTimeout(() => {
                setShowTieTransition(false);
            }, 2500);
        });
        
        // Cleanup
        return () => {
            socket.off('player:joined');
            socket.off('player:left');
            socket.off('room:hostChanged');
            socket.off('game:roleAssigned');
            socket.off('game:started');
            socket.off('game:phaseChanged');
            socket.off('game:speakerTurn');
            socket.off('game:descriptionSubmitted');
            socket.off('game:descriptionPhaseEnded');
            socket.off('game:voteSubmitted');
            socket.off('game:voteConfirmed');
            socket.off('chat:message');
            socket.off('game:results');
            socket.off('game:reset');
            socket.off('game:timer');
            socket.off('game:settingsUpdated');
            socket.off('game:tieReplayStarted');
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
                    // V1.2: Initialize settings from room
                    if (response.room?.settings) {
                        setRoomSettings(response.room.settings);
                    }
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
                    
                    // V1.2: Restore settings from room
                    if (response.room?.settings) {
                        setRoomSettings(response.room.settings);
                    }
                    
                    // V1.1: Handle rejoin state restoration
                    if (response.isRejoin && response.rejoinState) {
                        const state = response.rejoinState;
                        
                        // V1.2: Restore settings from rejoin state
                        if (state.settings) {
                            setRoomSettings(state.settings);
                        }
                        
                        // Restore role information
                        if (state.isImposter !== undefined) {
                            setIsImposter(state.isImposter);
                        }
                        if (state.topic) {
                            setTopic(state.topic);
                        }
                        if (state.word) {
                            setSecretWord(state.word);
                        }
                        
                        // Restore description phase state
                        if (state.hasSubmittedDescription !== undefined) {
                            setHasSubmittedDescription(state.hasSubmittedDescription);
                        }
                        if (state.submissionProgress) {
                            setSubmissionProgress(state.submissionProgress);
                        }
                        
                        // V1.1: Restore sequential description state
                        if (state.speakingOrder) {
                            setSpeakingOrder(state.speakingOrder);
                        }
                        if (state.currentSpeakerIndex !== undefined && state.speakingOrder) {
                            const speaker = state.speakingOrder[state.currentSpeakerIndex];
                            if (speaker) {
                                setCurrentSpeaker({
                                    id: speaker.id,
                                    name: speaker.name,
                                    index: state.currentSpeakerIndex,
                                    total: state.speakingOrder.length
                                });
                            }
                        }
                        if (state.liveDescriptions) {
                            setLiveDescriptions(state.liveDescriptions);
                        }
                        
                        // Restore descriptions (for voting/results phase)
                        if (state.descriptions) {
                            setDescriptions(state.descriptions);
                        }
                        
                        // Restore voting state
                        if (state.hasVoted !== undefined) {
                            setHasVoted(state.hasVoted);
                            setHasConfirmedVote(state.hasVoted);
                        }
                        if (state.voteProgress) {
                            setVoteProgress(state.voteProgress);
                        }
                        
                        // V1.1: Restore two-step voting state
                        if (state.selectedVote) {
                            setSelectedVote(state.selectedVote);
                        }
                        if (state.confirmProgress) {
                            setConfirmProgress(state.confirmProgress);
                        }
                        
                        // V1.1: Restore chat messages
                        if (state.chatMessages) {
                            setChatMessages(state.chatMessages);
                        }
                        
                        // Restore results
                        if (state.results) {
                            setResults({
                                votedOutPlayer: state.results.voteSummary?.[0] || null,
                                imposter: state.results.imposter,
                                playersWin: state.results.imposter && 
                                    state.results.voteSummary?.[0]?.playerId === state.results.imposter.id,
                                voteSummary: state.results.voteSummary,
                                secretWord: state.results.secretWord
                            });
                        }
                    }
                    
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
    
    // V1.1: Select vote target (without confirming)
    const selectVote = useCallback((targetPlayerId) => {
        return new Promise((resolve, reject) => {
            socket.emit('game:selectVote', { targetPlayerId }, (response) => {
                if (response.success) {
                    setSelectedVote(targetPlayerId);
                    resolve(response);
                } else {
                    setError(response.error);
                    reject(response.error);
                }
            });
        });
    }, []);
    
    // V1.1: Confirm vote selection
    const confirmVote = useCallback(() => {
        return new Promise((resolve, reject) => {
            socket.emit('game:confirmVote', (response) => {
                if (response.success) {
                    setHasConfirmedVote(true);
                    setHasVoted(true); // For compatibility
                    setConfirmProgress({ 
                        count: response.confirmedCount, 
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
    
    // V1.1: Play Again action
    const playAgain = useCallback(() => {
        return new Promise((resolve, reject) => {
            socket.emit('game:playAgain', (response) => {
                if (response.success) {
                    resolve(response);
                } else {
                    setError(response.error);
                    reject(response.error);
                }
            });
        });
    }, []);
    
    // V1.2: Update room settings (host only)
    const updateSettings = useCallback((newSettings) => {
        return new Promise((resolve, reject) => {
            socket.emit('game:updateSettings', newSettings, (response) => {
                if (response.success) {
                    setRoomSettings(response.settings);
                    resolve(response);
                } else {
                    // Don't block gameplay - just reject quietly
                    reject(response.error);
                }
            });
        });
    }, []);
    
    // V1.1: Send chat message
    const sendChatMessage = useCallback((text) => {
        return new Promise((resolve, reject) => {
            socket.emit('chat:send', { text }, (response) => {
                if (response.success) {
                    resolve(response);
                } else {
                    // Don't set error for rate limiting - just reject quietly
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
        
        // V1.2: Room settings
        roomSettings,
        
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
        
        // V1.1: Sequential description phase
        speakingOrder,
        currentSpeaker,
        liveDescriptions,
        
        // V1.1: Enhanced voting
        selectedVote,
        hasConfirmedVote,
        confirmProgress,
        
        // V1.3: Tie transition state
        showTieTransition,
        
        // V1.1: Chat
        chatMessages,
        
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
        submitVote,
        selectVote,
        confirmVote,
        sendChatMessage,
        playAgain,
        updateSettings  // V1.2
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
