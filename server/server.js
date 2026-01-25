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
                    results: rejoinState.results
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
    // PRIVACY ENFORCEMENT:
    // - Server stores description with playerId (for internal tracking)
    // - When broadcasting, descriptions are ANONYMIZED and SHUFFLED
    // - No way to correlate description to player from client side
    // -------------------------------------------------------------------------
    socket.on('game:submitDescription', (data, callback) => {
        const { text } = data;
        
        // Validate input
        if (!text || typeof text !== 'string') {
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
        
        // Notify all players about submission progress (without revealing who submitted)
        io.to(room.code).emit('game:descriptionSubmitted', {
            submittedCount: result.submittedCount,
            totalPlayers: result.totalPlayers
            // PRIVACY: No playerId, no description content in broadcast
        });
        
        // Respond to submitter
        callback({
            success: true,
            submittedCount: result.submittedCount,
            totalPlayers: result.totalPlayers
        });
        
        // If all players have submitted, transition to voting phase
        if (result.allSubmitted) {
            // Clear description timer since everyone submitted
            timerManager.clearTimer(room.code);
            handleDescriptionPhaseComplete(room.code);
        }
    });

    // -------------------------------------------------------------------------
    // SUBMIT VOTE
    // Client sends: { targetPlayerId: string }
    // Server responds: { success, error?, votedCount?, totalPlayers? }
    // 
    // PRIVACY ENFORCEMENT:
    // - Votes are stored on server with voter ID (for validation)
    // - During voting, NO vote information is broadcast to clients
    // - Only after ALL votes are in, results are revealed
    // - This prevents vote manipulation based on others' votes
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
 * 
 * @param {string} roomCode - The room code
 * @param {string} phase - The phase to time
 */
function startPhaseTimer(roomCode, phase) {
    timerManager.startTimer(roomCode, phase, onTimerTick, onTimerExpire);
}

/**
 * Transitions to description phase with timer.
 * Used by both manual host trigger and timer expiration.
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
    
    // Broadcast phase change to all players
    io.to(roomCode).emit('game:phaseChanged', {
        phase: 'description',
        room: roomManager.serializeRoom(result.room)
    });
    
    console.log(`[Game] Description phase started in room ${roomCode}`);
    
    // Start description phase timer
    startPhaseTimer(roomCode, 'description');
}

/**
 * Handles description phase timeout.
 * Auto-submits for players who didn't submit, then transitions to voting.
 * 
 * AUTO-SUBMISSION LOGIC:
 * - Players who did not submit get "(No response)" as their description
 * - This ensures voting phase can proceed even if some players are AFK
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
 * @param {string} roomCode - The room code
 */
function handleVotingTimeout(roomCode) {
    console.log(`[Game] Voting timeout for room ${roomCode} - calculating results with abstains`);
    
    // Calculate results with whatever votes we have
    // Abstaining players (those who didn't vote) are ignored in the count
    handleVotingComplete(roomCode);
}

/**
 * Handles completion of voting phase.
 * Calculates results and broadcasts the winner.
 * 
 * RESULT REVEAL:
 * - voteSummary shows each player's vote count
 * - imposter identity is revealed
 * - playersWin indicates if players successfully caught the imposter
 */
function handleVotingComplete(roomCode) {
    // Clear voting timer
    timerManager.clearTimer(roomCode);
    
    const result = roomManager.calculateVoteResults(roomCode);
    
    if (!result.success) {
        console.error(`[Game] Failed to calculate results for room ${roomCode}`);
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
}

/**
 * Handles completion of description phase.
 * Transitions to voting and broadcasts anonymized descriptions.
 * 
 * ANONYMITY GUARANTEE:
 * - Descriptions are extracted without player IDs
 * - Order is randomized (shuffled) before broadcasting
 * - No way to correlate description to player
 */
function handleDescriptionPhaseComplete(roomCode) {
    // Clear any existing timer
    timerManager.clearTimer(roomCode);
    
    // Get anonymized descriptions (shuffled, no player IDs)
    const descResult = roomManager.getAnonymizedDescriptions(roomCode);
    
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
    // PRIVACY: descriptions array contains ONLY { description: string }
    // NO playerId, NO socketId, NO imposter hints, SHUFFLED order
    io.to(roomCode).emit('game:descriptionPhaseEnded', {
        phase: 'voting',
        room: roomManager.serializeRoom(transitionResult.room),
        descriptions: descResult.descriptions
        // descriptions format: [{ description: "text" }, { description: "text" }, ...]
    });
    
    console.log(`[Game] Description phase ended in room ${roomCode}, ${descResult.descriptions.length} descriptions collected`);
    
    // Start voting phase timer
    startPhaseTimer(roomCode, 'voting');
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
        
        // Voting phase: Check if all remaining players have voted
        if (phaseCleanupResult.phase === 'voting' && phaseCleanupResult.votingComplete) {
            console.log(`[Game] All votes submitted after disconnect - completing phase`);
            timerManager.clearTimer(roomCode);
            handleVotingComplete(roomCode);
        }
        
        // Update progress counts for remaining players
        if (phaseCleanupResult.phase === 'description') {
            const submittedCount = Object.keys(updatedRoom.descriptions || {}).length;
            io.to(roomCode).emit('game:descriptionSubmitted', {
                submittedCount: submittedCount,
                totalPlayers: updatedRoom.players.size
            });
        }
        
        if (phaseCleanupResult.phase === 'voting') {
            const votedCount = Object.keys(updatedRoom.votes || {}).length;
            io.to(roomCode).emit('game:voteSubmitted', {
                votedCount: votedCount,
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
