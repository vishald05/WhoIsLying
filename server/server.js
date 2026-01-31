/**
 * Who Is Lying - Game Server
 * 
 * Main entry point for the Express + Socket.io server.
 * Handles all real-time communication for the multiplayer game.
 * 
 * The server is the SINGLE SOURCE OF TRUTH.
 * Clients never know sensitive info (imposter identity, secret word for imposter).
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const roomManager = require('./roomManager');
const timerManager = require('./timerManager');

// =============================================================================
// SERVER SETUP
// =============================================================================

const app = express();
const server = http.createServer(app);

// Configure Socket.io with CORS for development
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        methods: ['GET', 'POST']
    }
});

// Express middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        game: 'Who Is Lying'
    });
});

// =============================================================================
// SOCKET.IO EVENT HANDLERS
// =============================================================================

io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // -------------------------------------------------------------------------
    // CREATE ROOM
    // Client sends: { playerName: string }
    // Server responds: { success, room?, player?, error? }
    // -------------------------------------------------------------------------
    socket.on('room:create', (data, callback) => {
        const { playerName } = data;

        // Validate input
        if (!playerName || typeof playerName !== 'string') {
            return callback({ success: false, error: 'INVALID_NAME' });
        }

        const trimmedName = playerName.trim();
        if (trimmedName.length < 1 || trimmedName.length > 20) {
            return callback({ success: false, error: 'NAME_LENGTH_INVALID' });
        }

        // Create the room
        const { room, player } = roomManager.createRoom(trimmedName, socket.id);

        // Join the socket to a Socket.io room (for broadcasting)
        socket.join(room.code);

        // Send success response with room and player data
        callback({
            success: true,
            room: roomManager.serializeRoom(room),
            player: { id: player.id, name: player.name }
        });

        console.log(`[Game] Room ${room.code} created by ${player.name}`);
    });

    // -------------------------------------------------------------------------
    // JOIN ROOM
    // Client sends: { roomCode: string, playerName: string }
    // Server responds: { success, room?, player?, error?, rejoinState? }
    // 
    // REJOIN SUPPORT:
    // - If player with same name exists in room, this is a rejoin (browser refresh)
    // - Original player's socket ID is updated to new socket
    // - Full game state is restored to the client
    // - Game continues uninterrupted
    // -------------------------------------------------------------------------
    socket.on('room:join', (data, callback) => {
        const { roomCode, playerName } = data;

        // Validate input
        if (!roomCode || typeof roomCode !== 'string') {
            return callback({ success: false, error: 'INVALID_ROOM_CODE' });
        }

        if (!playerName || typeof playerName !== 'string') {
            return callback({ success: false, error: 'INVALID_NAME' });
        }

        const trimmedName = playerName.trim();
        if (trimmedName.length < 1 || trimmedName.length > 20) {
            return callback({ success: false, error: 'NAME_LENGTH_INVALID' });
        }

        // =====================================================================
        // ATTEMPT REJOIN FIRST (browser refresh scenario)
        // =====================================================================
        const rejoinResult = roomManager.attemptRejoin(roomCode, trimmedName, socket.id);
        
        if (rejoinResult.success && rejoinResult.isRejoin) {
            const { room, player, oldSocketId } = rejoinResult;
            
            // Join the socket to the Socket.io room
            socket.join(room.code);
            
            // Get full rejoin state for client restoration
            const rejoinState = roomManager.getRejoinState(room.code, player.id);
            
            // Build response with rejoin data
            const response = {
                success: true,
                isRejoin: true,
                room: roomManager.serializeRoom(room),
                player: { id: player.id, name: player.name }
            };
            
            // Include phase-specific restoration data
            if (rejoinState.success) {
                response.rejoinState = {
                    phase: rejoinState.phase,
                    topic: rejoinState.topic,
                    isImposter: rejoinState.isImposter,
                    word: rejoinState.word, // Only for non-imposters
                    hasSubmittedDescription: rejoinState.hasSubmittedDescription,
                    submissionProgress: rejoinState.submissionProgress,
                    descriptions: rejoinState.descriptions,
                    hasVoted: rejoinState.hasVoted,
                    voteProgress: rejoinState.voteProgress,
                    results: rejoinState.results,
                    // V1.1: Sequential description phase
                    speakingOrder: rejoinState.speakingOrder,
                    currentSpeakerIndex: rejoinState.currentSpeakerIndex,
                    liveDescriptions: rejoinState.liveDescriptions,
                    // V1.1: Two-step voting
                    selectedVote: rejoinState.selectedVote,
                    confirmProgress: rejoinState.confirmProgress,
                    // V1.1: Chat
                    chatMessages: rejoinState.chatMessages,
                    // V1.1: Game number
                    gameNumber: rejoinState.gameNumber
                };
            }
            
            callback(response);
            
            console.log(`[Game] ${player.name} rejoined room ${room.code} (phase: ${room.phase})`);
            return;
        }

        // =====================================================================
        // NORMAL JOIN (new player)
        // =====================================================================
        const result = roomManager.joinRoom(roomCode, trimmedName, socket.id);

        if (result.error) {
            return callback({ success: false, error: result.error });
        }

        const { room, player } = result;

        // Join the socket to the Socket.io room
        socket.join(room.code);

        // Notify all other players in the room about the new player
        socket.to(room.code).emit('player:joined', {
            player: { id: player.id, name: player.name },
            room: roomManager.serializeRoom(room)
        });

        // Send success response to the joining player
        callback({
            success: true,
            room: roomManager.serializeRoom(room),
            player: { id: player.id, name: player.name }
        });

        console.log(`[Game] ${player.name} joined room ${room.code}`);
    });

    // -------------------------------------------------------------------------
    // LEAVE ROOM (Voluntary)
    // Client sends: (no data needed, uses socket.id)
    // Server responds: { success }
    // -------------------------------------------------------------------------
    socket.on('room:leave', (callback) => {
        handlePlayerLeave(socket, callback);
    });

    // -------------------------------------------------------------------------
    // DISCONNECT (Involuntary - browser close, network issue, etc.)
    // -------------------------------------------------------------------------
    socket.on('disconnect', (reason) => {
        console.log(`[Socket] Client disconnected: ${socket.id} (${reason})`);
        handlePlayerLeave(socket);
    });

    // -------------------------------------------------------------------------
    // GET ROOM STATE
    // Client sends: { roomCode: string }
    // Server responds: { success, room?, error? }
    // -------------------------------------------------------------------------
    socket.on('room:getState', (data, callback) => {
        const { roomCode } = data;

        const room = roomManager.getRoom(roomCode);

        if (!room) {
            return callback({ success: false, error: 'ROOM_NOT_FOUND' });
        }

        callback({
            success: true,
            room: roomManager.serializeRoom(room)
        });
    });

    // -------------------------------------------------------------------------
    // V1.2: UPDATE ROOM SETTINGS
    // Client sends: { descriptionTime?: number, votingTime?: number }
    // Server responds: { success, error?, settings? }
    // 
    // Host-only. Only allowed in lobby or postGame phase.
    // Broadcasts updated settings to all players in the room.
    // -------------------------------------------------------------------------
    socket.on('game:updateSettings', (data, callback) => {
        const playerData = roomManager.getPlayerBySocketId(socket.id);
        
        if (!playerData) {
            return callback({ success: false, error: 'NOT_IN_ROOM' });
        }
        
        const { room, player } = playerData;
        
        const result = roomManager.updateRoomSettings(room.code, player.id, data);
        
        if (!result.success) {
            return callback({
                success: false,
                error: result.error,
                field: result.field,
                limits: result.limits
            });
        }
        
        // Broadcast settings update to all players in the room
        io.to(room.code).emit('game:settingsUpdated', {
            settings: result.settings
        });
        
        callback({
            success: true,
            settings: result.settings
        });
        
        console.log(`[Settings] Room ${room.code} settings updated by ${player.name}`);
    });

    // -------------------------------------------------------------------------
    // START GAME
    // Client sends: (no data needed, uses socket.id to verify host)
    // Server responds: { success, error?, room? }
    // 
    // PRIVACY ENFORCEMENT:
    // - Each player receives their role privately via their own socketId
    // - Imposter receives: { isImposter: true, topic }
    // - Non-imposters receive: { isImposter: false, topic, word }
    // - Public broadcast only contains: phase change + topic (no roles/word)
    // -------------------------------------------------------------------------
    socket.on('game:start', (callback) => {
        // Get the player making the request
        const playerData = roomManager.getPlayerBySocketId(socket.id);
        
        if (!playerData) {
            return callback({ success: false, error: 'NOT_IN_ROOM' });
        }
        
        const { room, player } = playerData;
        
        // Attempt to start the game (validates host, player count, phase)
        const result = roomManager.startGame(room.code, player.id);
        
        if (!result.success) {
            return callback({ 
                success: false, 
                error: result.error,
                required: result.required,
                current: result.current
            });
        }
        
        const { gameData } = result;
        const updatedRoom = result.room;
        
        // =====================================================================
        // PRIVATE ROLE DISTRIBUTION
        // Each player receives their role info via their personal socket
        // This ensures the imposter never sees the word, and no one knows who
        // the imposter is except the imposter themselves.
        // =====================================================================
        
        for (const [playerId, playerInfo] of updatedRoom.players.entries()) {
            const isImposter = playerId === gameData.imposterId;
            
            // Build private role payload for this specific player
            const rolePayload = {
                isImposter: isImposter,
                topic: gameData.topic
            };
            
            // CRITICAL: Only non-imposters receive the secret word
            if (!isImposter) {
                rolePayload.word = gameData.word;
            }
            
            // Send private role info to this player's socket only
            io.to(playerInfo.socketId).emit('game:roleAssigned', rolePayload);
            
            console.log(`[Game] Role sent to ${playerInfo.name}: ${isImposter ? 'IMPOSTER' : 'Player'}`);
        }
        
        // =====================================================================
        // PUBLIC GAME STATE UPDATE
        // Broadcast to all players that game has started.
        // This contains NO sensitive info (no word, no imposter identity).
        // =====================================================================
        
        io.to(updatedRoom.code).emit('game:started', {
            room: roomManager.serializeRoom(updatedRoom),
            topic: gameData.topic
            // NOTE: word and imposterId are NEVER broadcast publicly
        });
        
        // Respond to the host who initiated the start
        callback({
            success: true,
            room: roomManager.serializeRoom(updatedRoom)
        });
        
        console.log(`[Game] Game started in room ${updatedRoom.code} by ${player.name}`);
        
        // =====================================================================
        // START ROLE REVEAL TIMER
        // Timer auto-progresses to description phase when it expires.
        // =====================================================================
        startPhaseTimer(updatedRoom.code, 'roleReveal');
    });

    // -------------------------------------------------------------------------
    // PLAY AGAIN (V1.1)
    // Client sends: (no data needed, uses socket.id to verify host)
    // Server responds: { success, error?, room? }
    // 
    // Resets the room to lobby state for a new game.
    // Only the host can initiate Play Again.
    // -------------------------------------------------------------------------
    socket.on('game:playAgain', (callback) => {
        const playerData = roomManager.getPlayerBySocketId(socket.id);
        
        if (!playerData) {
            return callback({ success: false, error: 'NOT_IN_ROOM' });
        }
        
        const { room, player } = playerData;
        
        // Reset the room for a new game
        const result = roomManager.resetRoomForNewGame(room.code, player.id);
        
        if (!result.success) {
            return callback({ 
                success: false, 
                error: result.error,
                required: result.required,
                current: result.current
            });
        }
        
        // Broadcast the reset to all players
        io.to(room.code).emit('game:reset', {
            room: roomManager.serializeRoom(result.room),
            gameNumber: result.room.gameNumber
        });
        
        callback({
            success: true,
            room: roomManager.serializeRoom(result.room)
        });
        
        console.log(`[Game] Room ${room.code} reset for new game by ${player.name}`);
    });

    // -------------------------------------------------------------------------
    // TRANSITION TO DESCRIPTION PHASE
    // Client sends: (no data needed, typically called after role reveal timeout)
    // Server responds: { success, error?, room? }
    // 
    // This can be triggered by the host or automatically by the timer.
    // -------------------------------------------------------------------------
    socket.on('game:startDescriptionPhase', (callback) => {
        const playerData = roomManager.getPlayerBySocketId(socket.id);
        
        if (!playerData) {
            return callback({ success: false, error: 'NOT_IN_ROOM' });
        }
        
        const { room, player } = playerData;
        
        // Only host can manually trigger phase transition
        if (room.hostId !== player.id) {
            return callback({ success: false, error: 'NOT_HOST' });
        }
        
        // Use the shared transition function
        transitionToDescriptionPhaseWithTimer(room.code);
        
        callback({
            success: true,
            room: roomManager.serializeRoom(room)
        });
    });

    // -------------------------------------------------------------------------
    // SUBMIT DESCRIPTION
    // Client sends: { text: string }
    // Server responds: { success, error?, submittedCount?, totalPlayers? }
    // 
    // V1.1 SEQUENTIAL MODE:
    // - Only the current speaker can submit
    // - Description is broadcast with player attribution (not anonymous)
    // - Advances to next speaker after submission
    // -------------------------------------------------------------------------
    socket.on('game:submitDescription', (data, callback) => {
        const { text } = data;
        
        // Validate input
        if (text === undefined || text === null) {
            return callback({ success: false, error: 'INVALID_DESCRIPTION' });
        }
        
        // Get player making the request
        const playerData = roomManager.getPlayerBySocketId(socket.id);
        
        if (!playerData) {
            return callback({ success: false, error: 'NOT_IN_ROOM' });
        }
        
        const { room, player } = playerData;
        
        // Submit the description
        const result = roomManager.submitDescription(room.code, player.id, text);
        
        if (!result.success) {
            return callback({ success: false, error: result.error });
        }
        
        // Clear turn timer since player submitted
        timerManager.clearTimer(room.code);
        
        // V1.1: Broadcast with attribution (player name and description visible to all)
        io.to(room.code).emit('game:descriptionSubmitted', {
            submittedCount: result.submittedCount,
            totalPlayers: result.totalPlayers,
            // V1.1: Include attribution
            playerId: result.submittedBy.id,
            playerName: result.submittedBy.name,
            description: result.description,
            isAutoSubmit: false
        });
        
        // Respond to submitter
        callback({
            success: true,
            submittedCount: result.submittedCount,
            totalPlayers: result.totalPlayers
        });
        
        // V1.1: Check if all players have had their turn
        if (result.allSubmitted) {
            console.log(`[Game] All speakers done in room ${room.code} - transitioning to voting`);
            handleDescriptionPhaseComplete(room.code);
        } else {
            // Advance to next speaker
            const speakerResult = roomManager.getCurrentSpeaker(room.code);
            if (speakerResult.success && !speakerResult.allComplete) {
                io.to(room.code).emit('game:speakerTurn', {
                    speakerId: speakerResult.currentSpeaker.id,
                    speakerName: speakerResult.currentSpeaker.name,
                    speakerIndex: speakerResult.currentSpeaker.index,
                    totalSpeakers: speakerResult.totalSpeakers
                });
                
                console.log(`[Game] Next speaker in room ${room.code}: ${speakerResult.currentSpeaker.name}`);
                
                // Start timer for next speaker
                startSpeakerTurnTimer(room.code);
            }
        }
    });

    // -------------------------------------------------------------------------
    // SUBMIT VOTE (V1.0 Legacy - kept for compatibility)
    // Client sends: { targetPlayerId: string }
    // Server responds: { success, error?, votedCount?, totalPlayers? }
    // 
    // V1.1: Use selectVote + confirmVote instead for two-step voting
    // -------------------------------------------------------------------------
    socket.on('game:submitVote', (data, callback) => {
        const { targetPlayerId } = data;
        
        // Validate input
        if (!targetPlayerId || typeof targetPlayerId !== 'string') {
            return callback({ success: false, error: 'INVALID_TARGET' });
        }
        
        // Get player making the request
        const playerData = roomManager.getPlayerBySocketId(socket.id);
        
        if (!playerData) {
            return callback({ success: false, error: 'NOT_IN_ROOM' });
        }
        
        const { room, player } = playerData;
        
        // Submit the vote
        const result = roomManager.submitVote(room.code, player.id, targetPlayerId);
        
        if (!result.success) {
            return callback({ success: false, error: result.error });
        }
        
        // Notify all players about voting progress (without revealing who voted or for whom)
        // PRIVACY: Only counts are broadcast, no vote details
        io.to(room.code).emit('game:voteSubmitted', {
            votedCount: result.votedCount,
            totalPlayers: result.totalPlayers
            // PRIVACY: No voterId, no targetPlayerId in broadcast
        });
        
        // Respond to voter
        callback({
            success: true,
            votedCount: result.votedCount,
            totalPlayers: result.totalPlayers
        });
        
        // If all players have voted, calculate results
        if (result.allVoted) {
            // Clear voting timer since everyone voted
            timerManager.clearTimer(room.code);
            handleVotingComplete(room.code);
        }
    });

    // -------------------------------------------------------------------------
    // SELECT VOTE (V1.1)
    // Client sends: { targetPlayerId: string }
    // Server responds: { success, error? }
    // 
    // Selects a vote target without confirming. Can be changed until confirmed.
    // Selection is NOT broadcast to other players for privacy.
    // -------------------------------------------------------------------------
    socket.on('game:selectVote', (data, callback) => {
        const { targetPlayerId } = data;
        
        if (!targetPlayerId || typeof targetPlayerId !== 'string') {
            return callback({ success: false, error: 'INVALID_TARGET' });
        }
        
        const playerData = roomManager.getPlayerBySocketId(socket.id);
        
        if (!playerData) {
            return callback({ success: false, error: 'NOT_IN_ROOM' });
        }
        
        const { room, player } = playerData;
        
        const result = roomManager.selectVote(room.code, player.id, targetPlayerId);
        
        if (!result.success) {
            return callback({ success: false, error: result.error });
        }
        
        // PRIVACY: Do NOT broadcast selection to other players
        callback({ success: true });
    });

    // -------------------------------------------------------------------------
    // CONFIRM VOTE (V1.1)
    // Client sends: (no data needed)
    // Server responds: { success, error?, confirmedCount?, totalPlayers? }
    // 
    // Locks in the current vote selection. Cannot be changed after confirmation.
    // Only the confirmation count is broadcast, not who confirmed.
    // -------------------------------------------------------------------------
    socket.on('game:confirmVote', (callback) => {
        const playerData = roomManager.getPlayerBySocketId(socket.id);
        
        if (!playerData) {
            return callback({ success: false, error: 'NOT_IN_ROOM' });
        }
        
        const { room, player } = playerData;
        
        const result = roomManager.confirmVote(room.code, player.id);
        
        if (!result.success) {
            return callback({ success: false, error: result.error });
        }
        
        // Broadcast confirmation progress (PRIVACY: only count, not who)
        io.to(room.code).emit('game:voteConfirmed', {
            confirmedCount: result.confirmedCount,
            totalPlayers: result.totalPlayers
        });
        
        callback({
            success: true,
            confirmedCount: result.confirmedCount,
            totalPlayers: result.totalPlayers
        });
        
        // V1.1: End voting early if all players confirmed
        if (result.allConfirmed) {
            timerManager.clearTimer(room.code);
            handleVotingComplete(room.code);
        }
    });

    // -------------------------------------------------------------------------
    // SEND CHAT MESSAGE (V1.1)
    // Client sends: { text: string }
    // Server responds: { success, error?, message? }
    // 
    // Chat is only available during voting phase.
    // Rate limited to 5 messages per 10 seconds.
    // PRIVACY: Chat does NOT reveal any vote information.
    // -------------------------------------------------------------------------
    socket.on('chat:send', (data, callback) => {
        const { text } = data;
        
        const playerData = roomManager.getPlayerBySocketId(socket.id);
        
        if (!playerData) {
            return callback({ success: false, error: 'NOT_IN_ROOM' });
        }
        
        const { room, player } = playerData;
        
        const result = roomManager.addChatMessage(room.code, player.id, text);
        
        if (!result.success) {
            return callback({ success: false, error: result.error });
        }
        
        // Broadcast the message to all players in the room
        io.to(room.code).emit('chat:message', {
            message: result.message
        });
        
        callback({ success: true, message: result.message });
    });
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// =============================================================================
// TIMER INTEGRATION
// =============================================================================

/**
 * Callback for timer tick events.
 * Emits remaining time to all players in the room.
 * 
 * @param {string} roomCode - The room code
 * @param {string} phase - Current phase
 * @param {number} remainingSeconds - Seconds remaining
 */
function onTimerTick(roomCode, phase, remainingSeconds) {
    io.to(roomCode).emit('game:timer', {
        phase: phase,
        remainingSeconds: remainingSeconds
    });
}

/**
 * Callback for timer expiration.
 * Handles auto-progression based on the expired phase.
 * 
 * TIMER EXPIRATION BEHAVIOR:
 * - roleReveal: Auto-transition to description phase
 * - description: Auto-submit empty descriptions, then transition to voting
 * - voting: Calculate results with abstain votes (missing votes ignored)
 * 
 * @param {string} roomCode - The room code
 * @param {string} phase - Phase that expired
 */
function onTimerExpire(roomCode, phase) {
    console.log(`[Timer] Phase ${phase} expired for room ${roomCode}`);
    
    switch (phase) {
        case 'roleReveal':
            // Auto-transition to description phase
            transitionToDescriptionPhaseWithTimer(roomCode);
            break;
            
        case 'description':
            // Auto-submit for players who didn't submit
            handleDescriptionTimeout(roomCode);
            break;
            
        case 'voting':
            // Calculate results with abstain votes
            handleVotingTimeout(roomCode);
            break;
            
        default:
            console.error(`[Timer] Unknown phase expired: ${phase}`);
    }
}

/**
 * Starts a timer for a specific phase.
 * V1.2: Added optional customDuration parameter for configurable timers.
 * 
 * @param {string} roomCode - The room code
 * @param {string} phase - The phase to time
 * @param {number} [customDuration] - Optional custom duration in seconds
 */
function startPhaseTimer(roomCode, phase, customDuration = null) {
    timerManager.startTimer(roomCode, phase, onTimerTick, onTimerExpire, customDuration);
}

/**
 * Transitions to description phase with timer.
 * V1.1: Uses sequential turn-based system with per-speaker timer.
 * 
 * @param {string} roomCode - The room code
 */
function transitionToDescriptionPhaseWithTimer(roomCode) {
    // Clear any existing timer (e.g., roleReveal timer)
    timerManager.clearTimer(roomCode);
    
    const result = roomManager.transitionToDescriptionPhase(roomCode);
    
    if (!result.success) {
        console.error(`[Game] Failed to transition to description phase: ${result.error}`);
        return;
    }
    
    // V1.1: Get first speaker info
    const firstSpeakerId = result.speakingOrder[0].id;
    const firstSpeaker = result.speakingOrder[0];
    
    // Broadcast phase change with speaking order
    io.to(roomCode).emit('game:phaseChanged', {
        phase: 'description',
        room: roomManager.serializeRoom(result.room),
        speakingOrder: result.speakingOrder,
        currentSpeakerIndex: 0
    });
    
    // V1.1: Emit first speaker turn
    io.to(roomCode).emit('game:speakerTurn', {
        speakerId: firstSpeaker.id,
        speakerName: firstSpeaker.name,
        speakerIndex: 0,
        totalSpeakers: result.speakingOrder.length
    });
    
    console.log(`[Game] Description phase started in room ${roomCode} - First speaker: ${firstSpeaker.name}`);
    
    // V1.1: Start per-speaker timer (10 seconds)
    startSpeakerTurnTimer(roomCode);
}

/**
 * V1.1: Starts a timer for the current speaker's turn.
 * V1.2: Uses room.settings.descriptionTime (configurable).
 * 
 * @param {string} roomCode - The room code
 */
function startSpeakerTurnTimer(roomCode) {
    const room = roomManager.getRoom(roomCode);
    const duration = room?.settings?.descriptionTime || 10;  // V1.2: Use configurable duration
    
    timerManager.startTimer(roomCode, 'descriptionTurn', onTimerTick, (roomCode, phase) => {
        // Turn timeout - auto-submit and advance
        handleSpeakerTurnTimeout(roomCode);
    }, duration);
}

/**
 * V1.1: Handles when a speaker's turn times out.
 * Auto-submits "(No response)" and advances to next speaker.
 * 
 * @param {string} roomCode - The room code
 */
function handleSpeakerTurnTimeout(roomCode) {
    const result = roomManager.autoSubmitCurrentSpeaker(roomCode);
    
    if (!result.success) {
        console.error(`[Game] Failed to auto-submit for speaker: ${result.error}`);
        return;
    }
    
    // Get the player who timed out for the broadcast
    const room = roomManager.getRoom(roomCode);
    const timedOutIndex = room.currentSpeakerIndex - 1;
    const timedOutId = room.speakingOrder[timedOutIndex];
    const timedOutPlayer = room.players.get(timedOutId);
    
    // Broadcast the auto-submitted description
    io.to(roomCode).emit('game:descriptionSubmitted', {
        submittedCount: result.submittedCount,
        totalPlayers: result.totalPlayers,
        // V1.1: Include attribution
        playerId: timedOutId,
        playerName: timedOutPlayer.name,
        description: '(No response)',
        isAutoSubmit: true
    });
    
    if (result.allSubmitted) {
        // All speakers done - move to voting
        console.log(`[Game] All speakers done in room ${roomCode} - transitioning to voting`);
        handleDescriptionPhaseComplete(roomCode);
    } else {
        // Advance to next speaker
        io.to(roomCode).emit('game:speakerTurn', {
            speakerId: result.nextSpeaker.id,
            speakerName: result.nextSpeaker.name,
            speakerIndex: result.nextSpeaker.index,
            totalSpeakers: result.totalPlayers
        });
        
        console.log(`[Game] Next speaker in room ${roomCode}: ${result.nextSpeaker.name}`);
        
        // Start timer for next speaker
        startSpeakerTurnTimer(roomCode);
    }
}

/**
 * Handles description phase timeout.
 * V1.1: This is now only called as a fallback - primary timeout is per-speaker.
 * Auto-submits for players who didn't submit, then transitions to voting.
 * 
 * @param {string} roomCode - The room code
 */
function handleDescriptionTimeout(roomCode) {
    // Auto-submit for missing players
    const autoResult = roomManager.autoSubmitMissingDescriptions(roomCode);
    
    if (!autoResult.success) {
        console.error(`[Game] Failed to auto-submit descriptions: ${autoResult.error}`);
        return;
    }
    
    if (autoResult.autoSubmittedCount > 0) {
        // Notify players about the auto-submissions
        io.to(roomCode).emit('game:descriptionSubmitted', {
            submittedCount: autoResult.room.players.size,
            totalPlayers: autoResult.room.players.size
        });
    }
    
    // Now transition to voting
    handleDescriptionPhaseComplete(roomCode);
}

/**
 * Handles voting phase timeout.
 * Calculates results with abstain votes (missing votes are ignored).
 * 
 * ABSTAIN VOTE LOGIC:
 * - Players who did not vote are treated as abstaining
 * - Their votes do NOT count toward any player's total
 * - They are NOT considered in tie-breaking logic
 * - Results are calculated only from actual votes cast
 * 
 * FIX 1: Auto-confirm any pending votes before calculating results
 * 
 * @param {string} roomCode - The room code
 */
function handleVotingTimeout(roomCode) {
    console.log(`[Game] Voting timeout for room ${roomCode}`);
    
    // FIX 1: Auto-confirm any pending votes before calculating results
    // This ensures players who selected but didn't confirm have their votes counted
    const autoConfirmResult = roomManager.autoConfirmPendingVotes(roomCode);
    if (autoConfirmResult.success && autoConfirmResult.autoConfirmed > 0) {
        // Broadcast updated confirmation count
        const room = roomManager.getRoom(roomCode);
        if (room) {
            io.to(roomCode).emit('game:voteConfirmed', {
                confirmedCount: Object.keys(room.confirmedVotes || {}).length,
                totalPlayers: room.players.size
            });
        }
    }
    
    // Calculate results with whatever votes we have
    // Abstaining players (those who didn't select anyone) are ignored in the count
    handleVotingComplete(roomCode);
}

/**
 * Handles completion of voting phase.
 * Calculates results and broadcasts the winner.
 * V1.1: Transitions to postGame after a delay for players to see results.
 * V1.3: Handles revotes on ties instead of ending the game.
 * FIX 3: Tracks timeout ID for cancellation if Play Again triggered.
 * 
 * RESULT REVEAL:
 * - voteSummary shows each player's vote count
 * - imposter identity is revealed
 * - playersWin indicates if players successfully caught the imposter
 * 
 * V1.3 TIE HANDLING:
 * - On tie, restarts round with same imposter, new topic/word
 * - Emits game:tieReplayStarted instead of results
 */
function handleVotingComplete(roomCode) {
    // Clear voting timer
    timerManager.clearTimer(roomCode);
    
    const result = roomManager.calculateVoteResults(roomCode);
    
    // =========================================================================
    // V1.3: Handle tie by restarting game round with same imposter
    // =========================================================================
    if (result.isTie) {
        console.log(`[Game] Tie detected in room ${roomCode} - starting tie-breaker replay round`);
        
        // Restart the game round with same imposter, new topic/word
        const restartResult = roomManager.restartGameRoundWithSameImposter(roomCode);
        
        if (!restartResult.success) {
            console.error(`[Game] Failed to restart round after tie: ${restartResult.error}`);
            return;
        }
        
        const room = restartResult.room;
        const gameData = restartResult.gameData;
        
        // Emit tie replay started to all players
        io.to(roomCode).emit('game:tieReplayStarted', {
            topic: gameData.topic,
            speakingOrder: restartResult.speakingOrder
        });
        
        // Send role assignments to each player (new word for non-imposters)
        for (const [playerId, player] of room.players) {
            const isImposter = playerId === gameData.imposterId;
            
            io.to(player.socketId).emit('game:roleAssigned', {
                isImposter: isImposter,
                topic: gameData.topic,
                word: isImposter ? null : gameData.word
            });
        }
        
        // Emit phase change to description
        io.to(roomCode).emit('game:phaseChanged', {
            phase: 'description',
            room: roomManager.serializeRoom(room),
            speakingOrder: restartResult.speakingOrder,
            currentSpeakerIndex: 0
        });
        
        // Emit first speaker turn
        const firstSpeakerId = room.speakingOrder[0];
        const firstSpeaker = room.players.get(firstSpeakerId);
        io.to(roomCode).emit('game:speakerTurn', {
            speakerId: firstSpeakerId,
            speakerName: firstSpeaker.name,
            speakerIndex: 0,
            totalSpeakers: room.speakingOrder.length
        });
        
        // Start description timer for first speaker
        const descriptionDuration = room.settings?.descriptionTime || 10;
        startPhaseTimer(roomCode, 'description', descriptionDuration);
        
        console.log(`[Game] Tie-breaker replay started in room ${roomCode}. First speaker: ${firstSpeaker.name}`);
        return;
    }
    
    // =========================================================================
    // Normal result flow (no tie)
    // =========================================================================
    if (!result.success) {
        console.error(`[Game] Failed to calculate results for room ${roomCode}: ${result.error}`);
        return;
    }
    
    // Broadcast final results to all players
    // This is the ONLY time vote information and imposter identity are revealed
    io.to(roomCode).emit('game:results', {
        phase: 'results',
        room: roomManager.serializeRoom(result.room),
        votedOutPlayer: result.results.votedOutPlayer,
        imposter: result.results.imposter,
        playersWin: result.results.playersWin,
        voteSummary: result.results.voteSummary,
        secretWord: result.results.secretWord
    });
    
    console.log(`[Game] Results broadcast for room ${roomCode}`);
    
    // FIX 3: V1.1 - Transition to postGame after 5 seconds, with tracked timeout
    const postGameTimeoutId = setTimeout(() => {
        const postGameResult = roomManager.transitionToPostGame(roomCode);
        if (postGameResult.success) {
            io.to(roomCode).emit('game:phaseChanged', {
                phase: 'postGame',
                room: roomManager.serializeRoom(postGameResult.room)
            });
            console.log(`[Game] Room ${roomCode} now in postGame phase`);
        }
        // Clear the stored timeout ID after execution
        roomManager.clearPostGameTimeout(roomCode);
    }, 5000);
    
    // FIX 3: Store timeout ID so it can be cancelled if Play Again is triggered
    roomManager.setPostGameTimeout(roomCode, postGameTimeoutId);
}

/**
 * Handles completion of description phase.
 * Transitions to voting and broadcasts descriptions.
 * 
 * V1.1: Descriptions are now ATTRIBUTED (not anonymous).
 * Players can see who said what during voting.
 */
function handleDescriptionPhaseComplete(roomCode) {
    // Clear any existing timer
    timerManager.clearTimer(roomCode);
    
    // V1.1: Get attributed descriptions (with player names)
    const descResult = roomManager.getAttributedDescriptions(roomCode);
    
    if (!descResult.success) {
        console.error(`[Game] Failed to get descriptions for room ${roomCode}`);
        return;
    }
    
    // Transition to voting phase
    const transitionResult = roomManager.transitionToVotingPhase(roomCode);
    
    if (!transitionResult.success) {
        console.error(`[Game] Failed to transition to voting for room ${roomCode}`);
        return;
    }
    
    // Broadcast to all players
    // V1.1: descriptions now include player attribution
    io.to(roomCode).emit('game:descriptionPhaseEnded', {
        phase: 'voting',
        room: roomManager.serializeRoom(transitionResult.room),
        descriptions: descResult.descriptions
        // V1.1 format: [{ playerId, playerName, description }, ...]
    });
    
    console.log(`[Game] Description phase ended in room ${roomCode}, ${descResult.descriptions.length} descriptions collected`);
    
    // Start voting phase timer with configurable duration
    const room = roomManager.getRoom(roomCode);
    const votingDuration = room?.settings?.votingTime || 60;  // V1.2: Use configurable duration
    startPhaseTimer(roomCode, 'voting', votingDuration);
}

/**
 * Handles player leaving (voluntary or disconnect).
 * Cleans up room state and notifies remaining players.
 * 
 * DISCONNECT RECOVERY BEHAVIOR:
 * - Lobby phase: Simple removal, notify others
 * - RoleReveal phase: Remove player, game continues
 * - Description phase: Auto-submit "(Disconnected)", check for completion
 * - Voting phase: Ignore their vote (abstain), check for completion
 * - Results phase: Simple removal
 * 
 * TIMER CLEANUP:
 * - If room is deleted (last player left), clear any active timer
 * 
 * HOST TRANSFER:
 * - If host disconnects, automatically transfer to next player
 * - Game continues without reset
 */
function handlePlayerLeave(socket, callback = null) {
    // First, find the player's room and ID before any cleanup
    const playerData = roomManager.getPlayerBySocketId(socket.id);
    
    if (!playerData) {
        // Player wasn't in any room
        if (callback) callback({ success: true });
        return;
    }
    
    const { room, player } = playerData;
    const roomCode = room.code;
    const phase = room.phase;
    
    // =========================================================================
    // PHASE-SPECIFIC CLEANUP (before removing player)
    // =========================================================================
    let phaseCleanupResult = null;
    
    if (phase !== 'lobby') {
        // Handle mid-game disconnect
        phaseCleanupResult = roomManager.handlePlayerDisconnectMidGame(roomCode, player.id);
    }
    
    // =========================================================================
    // REMOVE PLAYER FROM ROOM
    // =========================================================================
    const result = roomManager.removePlayerBySocketId(socket.id);

    if (!result) {
        if (callback) callback({ success: true });
        return;
    }

    const { room: updatedRoom, newHostId, roomDeleted } = result;

    // Leave the Socket.io room
    socket.leave(roomCode);

    // If room was deleted, clear any active timer
    if (roomDeleted) {
        timerManager.clearTimer(roomCode);
        if (callback) callback({ success: true });
        console.log(`[Game] ${player.name} left room ${roomCode} (room deleted)`);
        return;
    }

    // =========================================================================
    // NOTIFY REMAINING PLAYERS
    // =========================================================================
    
    // Emit game:playerDisconnected for mid-game disconnects
    if (phase !== 'lobby') {
        io.to(roomCode).emit('game:playerDisconnected', {
            playerId: player.id,
            playerName: player.name,
            phase: phase
        });
    }
    
    // Standard player:left event
    io.to(roomCode).emit('player:left', {
        playerId: player.id,
        playerName: player.name,
        room: roomManager.serializeRoom(updatedRoom),
        newHostId: newHostId || null
    });

    // If host changed, send specific notification
    if (newHostId) {
        io.to(roomCode).emit('room:hostChanged', {
            newHostId: newHostId,
            room: roomManager.serializeRoom(updatedRoom)
        });
    }

    // =========================================================================
    // CHECK FOR PHASE COMPLETION (after disconnect)
    // =========================================================================
    
    if (phaseCleanupResult) {
        // Description phase: Check if all remaining players have submitted
        if (phaseCleanupResult.phase === 'description' && phaseCleanupResult.descriptionComplete) {
            console.log(`[Game] All descriptions submitted after disconnect - completing phase`);
            timerManager.clearTimer(roomCode);
            handleDescriptionPhaseComplete(roomCode);
        }
        // V1.1: If current speaker disconnected, advance to next speaker
        else if (phaseCleanupResult.phase === 'description' && phaseCleanupResult.wasCurrentSpeaker) {
            console.log(`[Game] Current speaker disconnected - advancing turn`);
            timerManager.clearTimer(roomCode);
            
            // Notify about the auto-submitted description
            io.to(roomCode).emit('game:descriptionSubmitted', {
                playerId: player.id,
                playerName: player.name,
                description: '(Disconnected)',
                isAutoSubmit: true,
                submittedCount: Object.keys(updatedRoom.descriptions || {}).length,
                totalPlayers: updatedRoom.players.size
            });
            
            // Start next speaker turn or complete if done
            if (phaseCleanupResult.newSpeakerIndex >= (updatedRoom.speakingOrder?.length || 0)) {
                handleDescriptionPhaseComplete(roomCode);
            } else {
                startSpeakerTurnTimer(roomCode);
            }
        }
        else if (phaseCleanupResult.phase === 'description') {
            const submittedCount = Object.keys(updatedRoom.descriptions || {}).length;
            io.to(roomCode).emit('game:descriptionSubmitted', {
                submittedCount: submittedCount,
                totalPlayers: updatedRoom.players.size
            });
        }
        
        // Voting phase: Check if all remaining players have voted
        if (phaseCleanupResult.phase === 'voting' && phaseCleanupResult.votingComplete) {
            console.log(`[Game] All votes confirmed after disconnect - completing phase`);
            timerManager.clearTimer(roomCode);
            handleVotingComplete(roomCode);
        }
        else if (phaseCleanupResult.phase === 'voting') {
            // V1.1: Use confirmedVotes for progress
            const confirmedCount = Object.keys(updatedRoom.confirmedVotes || {}).length;
            io.to(roomCode).emit('game:voteConfirmed', {
                confirmedCount: confirmedCount,
                totalPlayers: updatedRoom.players.size
            });
        }
    }

    if (callback) callback({ success: true });

    console.log(`[Game] ${player.name} left room ${roomCode} (phase: ${phase})`);
}

// =============================================================================
// START SERVER
// =============================================================================

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`  Who Is Lying - Game Server`);
    console.log(`  Running on port ${PORT}`);
    console.log(`  Health check: http://localhost:${PORT}/health`);
    console.log('='.repeat(50));
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM received, shutting down...');
    server.close(() => {
        console.log('[Server] Server closed');
        process.exit(0);
    });
});
