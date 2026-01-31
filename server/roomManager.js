/**
 * Room Management Module
 * Handles all room-related operations for the "Who Is Lying" game.
 * This module maintains the in-memory state - the single source of truth.
 */

const { v4: uuidv4 } = require('uuid');

// =============================================================================
// IN-MEMORY DATA STORE
// =============================================================================

/**
 * Rooms storage structure:
 * {
 *   [roomCode]: {
 *     code: string,
 *     hostId: string,          // Player ID of the room host
 *     phase: 'lobby' | 'roleReveal' | 'description' | 'voting' | 'results' | 'postGame',
 *     players: Map<playerId, { id, name, socketId }>,
 *     createdAt: Date,
 *     gameNumber: number       // V1.1: Track game count for replays
 *   }
 * }
 */
const rooms = new Map();

// =============================================================================
// TOPICS & WORDS DATA
// =============================================================================

/**
 * Temporary in-memory topic/word bank.
 * Each topic contains a list of words that players will describe.
 */
const TOPICS = [
    { topic: "Fruits", words: ["Apple", "Mango", "Banana", "Orange", "Grape", "Watermelon", "Strawberry"] },
    { topic: "Animals", words: ["Tiger", "Elephant", "Dog", "Cat", "Lion", "Penguin", "Dolphin"] },
    { topic: "Countries", words: ["Japan", "Brazil", "France", "Egypt", "Canada", "Australia", "India"] },
    { topic: "Sports", words: ["Football", "Basketball", "Tennis", "Swimming", "Golf", "Cricket", "Boxing"] },
    { topic: "Vehicles", words: ["Car", "Airplane", "Bicycle", "Motorcycle", "Train", "Helicopter", "Boat"] },
    { topic: "Professions", words: ["Doctor", "Teacher", "Chef", "Pilot", "Firefighter", "Police", "Engineer"] },
    { topic: "Movies", words: ["Titanic", "Avatar", "Inception", "Frozen", "Jaws", "Matrix", "Rocky"] },
    { topic: "Food", words: ["Pizza", "Sushi", "Burger", "Pasta", "Taco", "Curry", "Sandwich"] }
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generates a unique 6-character room code.
 * Uses uppercase letters for easy verbal communication.
 */
function generateRoomCode() {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars (0, O, 1, I)
    let code;
    
    do {
        code = '';
        for (let i = 0; i < 6; i++) {
            code += characters.charAt(Math.floor(Math.random() * characters.length));
        }
    } while (rooms.has(code)); // Ensure uniqueness
    
    return code;
}

/**
 * Generates a unique player ID.
 */
function generatePlayerId() {
    return uuidv4();
}

/**
 * Selects a random topic and word from that topic.
 * @returns {Object} - { topic: string, word: string }
 */
function getRandomTopicAndWord() {
    const topicData = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    const word = topicData.words[Math.floor(Math.random() * topicData.words.length)];
    return {
        topic: topicData.topic,
        word: word
    };
}

/**
 * Selects a random player as the imposter.
 * @param {Map} players - Map of players in the room
 * @returns {string} - Player ID of the selected imposter
 */
function selectRandomImposter(players) {
    const playerIds = Array.from(players.keys());
    const randomIndex = Math.floor(Math.random() * playerIds.length);
    return playerIds[randomIndex];
}

/**
 * Fisher-Yates shuffle algorithm for randomizing arrays.
 * Used to anonymize description order before broadcasting.
 * @param {Array} array - The array to shuffle
 * @returns {Array} - A new shuffled array
 */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// =============================================================================
// ROOM OPERATIONS
// =============================================================================

// =============================================================================
// DEFAULT ROOM SETTINGS
// =============================================================================

/**
 * V1.2: Default timer settings for new rooms.
 * These can be modified by the host in the lobby.
 */
const DEFAULT_SETTINGS = {
    descriptionTime: 10,   // seconds per speaker (min: 5, max: 60)
    votingTime: 60         // seconds for voting phase (min: 15, max: 180)
};

/**
 * V1.2: Validation limits for settings
 */
const SETTINGS_LIMITS = {
    descriptionTime: { min: 5, max: 60 },
    votingTime: { min: 15, max: 180 }
};

/**
 * Creates a new room with the specified host player.
 * @param {string} hostName - Name of the player creating the room
 * @param {string} socketId - Socket ID of the host
 * @returns {Object} - { room, player } The created room and host player
 */
function createRoom(hostName, socketId) {
    const roomCode = generateRoomCode();
    const playerId = generatePlayerId();
    
    const player = {
        id: playerId,
        name: hostName,
        socketId: socketId
    };
    
    const room = {
        code: roomCode,
        hostId: playerId,
        phase: 'lobby',
        players: new Map([[playerId, player]]),
        createdAt: new Date(),
        gameNumber: 0,              // V1.1: Track number of games played
        settings: { ...DEFAULT_SETTINGS }   // V1.2: Host-configurable settings
    };
    
    rooms.set(roomCode, room);
    
    console.log(`[Room] Created room ${roomCode} by ${hostName}`);
    
    return { room, player };
}

/**
 * V1.2: Updates room settings. Host-only, lobby phase only.
 * 
 * @param {string} roomCode - The room code
 * @param {string} playerId - The player requesting the update (must be host)
 * @param {Object} newSettings - Settings to update { descriptionTime?, votingTime? }
 * @returns {Object} - { success, error?, room?, settings? }
 */
function updateRoomSettings(roomCode, playerId, newSettings) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    // Only allow in lobby or postGame phase
    if (room.phase !== 'lobby' && room.phase !== 'postGame') {
        return { success: false, error: 'INVALID_PHASE' };
    }
    
    // Only host can update settings
    if (room.hostId !== playerId) {
        return { success: false, error: 'NOT_HOST' };
    }
    
    // Initialize settings if missing (for rooms created before v1.2)
    if (!room.settings) {
        room.settings = { ...DEFAULT_SETTINGS };
    }
    
    // Validate and apply each setting
    const updatedFields = [];
    
    if (newSettings.descriptionTime !== undefined) {
        const value = parseInt(newSettings.descriptionTime, 10);
        const limits = SETTINGS_LIMITS.descriptionTime;
        
        if (isNaN(value) || value < limits.min || value > limits.max) {
            return { 
                success: false, 
                error: 'INVALID_VALUE',
                field: 'descriptionTime',
                limits: limits
            };
        }
        
        room.settings.descriptionTime = value;
        updatedFields.push('descriptionTime');
    }
    
    if (newSettings.votingTime !== undefined) {
        const value = parseInt(newSettings.votingTime, 10);
        const limits = SETTINGS_LIMITS.votingTime;
        
        if (isNaN(value) || value < limits.min || value > limits.max) {
            return { 
                success: false, 
                error: 'INVALID_VALUE',
                field: 'votingTime',
                limits: limits
            };
        }
        
        room.settings.votingTime = value;
        updatedFields.push('votingTime');
    }
    
    console.log(`[Room] Settings updated in room ${roomCode}: ${updatedFields.join(', ')}`);
    
    return { 
        success: true, 
        room: room,
        settings: room.settings,
        updatedFields: updatedFields
    };
}

/**
 * Adds a player to an existing room.
 * @param {string} roomCode - The room code to join
 * @param {string} playerName - Name of the joining player
 * @param {string} socketId - Socket ID of the player
 * @returns {Object|null} - { room, player } or null if room doesn't exist
 */
function joinRoom(roomCode, playerName, socketId) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { error: 'ROOM_NOT_FOUND' };
    }
    
    // V1.1: Allow joining in lobby or postGame phase
    if (room.phase !== 'lobby' && room.phase !== 'postGame') {
        return { error: 'GAME_IN_PROGRESS' };
    }
    
    // Check for duplicate names
    for (const player of room.players.values()) {
        if (player.name.toLowerCase() === playerName.toLowerCase()) {
            return { error: 'NAME_TAKEN' };
        }
    }
    
    const playerId = generatePlayerId();
    const player = {
        id: playerId,
        name: playerName,
        socketId: socketId
    };
    
    room.players.set(playerId, player);
    
    console.log(`[Room] ${playerName} joined room ${roomCode}`);
    
    return { room, player };
}

/**
 * Removes a player from their room.
 * Handles host transfer if the host leaves.
 * Deletes room if empty.
 * 
 * DISCONNECT RECOVERY:
 * - This function only removes the player from the room
 * - Phase-specific cleanup (auto-submit, etc.) is handled by handlePlayerDisconnectMidGame()
 * - Call handlePlayerDisconnectMidGame() BEFORE calling this during active games
 * 
 * @param {string} socketId - Socket ID of the disconnecting player
 * @returns {Object|null} - { room, player, newHostId?, roomDeleted? } or null if not found
 */
function removePlayerBySocketId(socketId) {
    for (const [roomCode, room] of rooms.entries()) {
        for (const [playerId, player] of room.players.entries()) {
            if (player.socketId === socketId) {
                room.players.delete(playerId);
                
                console.log(`[Room] ${player.name} left room ${roomCode}`);
                
                // If room is now empty, delete it
                if (room.players.size === 0) {
                    rooms.delete(roomCode);
                    console.log(`[Room] Deleted empty room ${roomCode}`);
                    return { room: null, player, roomDeleted: true };
                }
                
                // If the host left, transfer host to the next player
                let newHostId = null;
                if (room.hostId === playerId) {
                    newHostId = room.players.keys().next().value;
                    room.hostId = newHostId;
                    const newHost = room.players.get(newHostId);
                    console.log(`[Room] Host transferred to ${newHost.name} in room ${roomCode}`);
                }
                
                return { room, player, newHostId };
            }
        }
    }
    
    return null;
}

/**
 * Handles phase-specific cleanup when a player disconnects mid-game.
 * This should be called BEFORE removePlayerBySocketId() during active games.
 * 
 * DISCONNECT RECOVERY BEHAVIOR:
 * - Lobby phase: No special handling needed
 * - RoleReveal phase: No special handling needed (timer will auto-progress)
 * - Description phase: Auto-submit "(Disconnected)" for the player
 * - Voting phase: Player's vote is ignored (treated as abstain)
 * - Results phase: No special handling needed
 * 
 * This ensures the game can continue without blocking on the disconnected player.
 * 
 * @param {string} roomCode - The room code
 * @param {string} playerId - The disconnecting player's ID
 * @returns {Object} - { phase, autoSubmitted?, descriptionComplete?, votingComplete? }
 */
function handlePlayerDisconnectMidGame(roomCode, playerId) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { phase: null, error: 'ROOM_NOT_FOUND' };
    }
    
    const phase = room.phase;
    const result = { phase };
    
    // =========================================================================
    // DESCRIPTION PHASE: Auto-submit "(Disconnected)" for the player
    // V1.1: Also handles sequential speaking order
    // =========================================================================
    if (phase === 'description') {
        // If player hasn't submitted a description, auto-submit for them
        if (!room.descriptions[playerId]) {
            room.descriptions[playerId] = '(Disconnected)';
            result.autoSubmitted = true;
            console.log(`[Game] Auto-submitted "(Disconnected)" for disconnected player in room ${roomCode}`);
            
            // V1.1: Check if disconnected player was the current speaker
            if (room.speakingOrder && room.currentSpeakerIndex !== undefined) {
                const currentSpeaker = room.speakingOrder[room.currentSpeakerIndex];
                if (currentSpeaker && currentSpeaker.id === playerId) {
                    result.wasCurrentSpeaker = true;
                    // Advance to next speaker
                    room.currentSpeakerIndex++;
                    result.newSpeakerIndex = room.currentSpeakerIndex;
                }
            }
        }
        
        // Check if all remaining players have submitted (excluding disconnected)
        // Note: The disconnected player is still in room.players at this point
        const submittedCount = Object.keys(room.descriptions).length;
        const totalPlayers = room.players.size; // Includes disconnected player
        result.descriptionComplete = submittedCount >= totalPlayers;
    }
    
    // =========================================================================
    // VOTING PHASE: Player's vote is ignored (abstain)
    // V1.1: Uses confirmedVotes for 2-step voting
    // =========================================================================
    if (phase === 'voting') {
        // No action needed - player simply doesn't vote (abstain)
        // Their vote will be ignored in calculateVoteResults()
        console.log(`[Game] Disconnected player's vote ignored in room ${roomCode}`);
        
        // V1.1: Check against confirmedVotes instead of votes
        const votes = room.confirmedVotes || room.votes || {};
        const votedCount = Object.keys(votes).length;
        const remainingPlayers = room.players.size - 1; // Exclude disconnected player
        result.votingComplete = remainingPlayers > 0 && votedCount >= remainingPlayers;
    }
    
    // V1.1: PostGame phase - nothing special to do
    if (phase === 'postGame') {
        // Player leaving postGame is handled normally
    }
    
    return result;
}

/**
 * Checks if a player can rejoin a room.
 * Used for browser refresh/reconnection scenarios.
 * 
 * REJOIN RULES:
 * - Player must provide the same name they used before
 * - Room must still exist
 * - If game is in progress, the original player slot must still exist
 * - New socket ID is associated with the existing player
 * 
 * @param {string} roomCode - The room code
 * @param {string} playerName - The player's name
 * @param {string} newSocketId - The new socket ID after reconnection
 * @returns {Object} - { success, player?, room?, error?, isRejoin? }
 */
function attemptRejoin(roomCode, playerName, newSocketId) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    // Look for existing player with same name (case-insensitive)
    for (const [playerId, player] of room.players.entries()) {
        if (player.name.toLowerCase() === playerName.toLowerCase()) {
            // Found existing player - update their socket ID
            const oldSocketId = player.socketId;
            player.socketId = newSocketId;
            
            console.log(`[Room] ${player.name} rejoined room ${roomCode} (socket: ${oldSocketId} -> ${newSocketId})`);
            
            return {
                success: true,
                isRejoin: true,
                player: player,
                room: room,
                oldSocketId: oldSocketId
            };
        }
    }
    
    // No existing player found - this is not a rejoin
    return { success: false, error: 'PLAYER_NOT_FOUND', isRejoin: false };
}

/**
 * Gets rejoin state data for a player.
 * Returns all necessary data to restore the client's state after reconnection.
 * 
 * STATE RESTORATION:
 * - Always includes: room, player info, phase
 * - RoleReveal+: Includes role (isImposter) and topic, word (if not imposter)
 * - Description+: Includes whether player has submitted
 * - Voting+: Includes anonymized descriptions, whether player has voted
 * - Results: Includes full results
 * 
 * @param {string} roomCode - The room code
 * @param {string} playerId - The player's ID
 * @returns {Object} - State data for client restoration
 */
function getRejoinState(roomCode, playerId) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    const player = room.players.get(playerId);
    if (!player) {
        return { success: false, error: 'PLAYER_NOT_IN_ROOM' };
    }
    
    const state = {
        success: true,
        room: room,
        player: player,
        phase: room.phase,
        topic: room.topic || null,
        gameNumber: room.gameNumber || 1,
        settings: room.settings || { descriptionTime: 10, votingTime: 60 }  // V1.2
    };
    
    // Game in progress - include role information
    if (room.phase !== 'lobby' && room.phase !== 'postGame' && room.imposterId) {
        state.isImposter = playerId === room.imposterId;
        
        // Only non-imposters see the word
        if (!state.isImposter && room.word) {
            state.word = room.word;
        }
    }
    
    // V1.1: Sequential description phase state
    if (room.phase === 'description' && room.speakingOrder) {
        state.speakingOrder = room.speakingOrder;
        state.currentSpeakerIndex = room.currentSpeakerIndex || 0;
        
        // Get attributed descriptions for live feed
        const descResult = getAttributedDescriptions(roomCode);
        if (descResult.success) {
            state.liveDescriptions = descResult.descriptions;
        }
        
        state.hasSubmittedDescription = !!room.descriptions[playerId];
    } else if (room.descriptions) {
        // Description phase or later - include submission status
        state.hasSubmittedDescription = !!room.descriptions[playerId];
        state.submissionProgress = {
            count: Object.keys(room.descriptions).length,
            total: room.players.size
        };
    }
    
    // Voting phase - include vote status, descriptions, and V1.1 fields
    if (room.phase === 'voting') {
        // Get attributed descriptions for voting display
        const descResult = getAttributedDescriptions(roomCode);
        if (descResult.success) {
            state.descriptions = descResult.descriptions;
        }
        
        // V1.1: Two-step voting state
        if (room.pendingVotes && room.pendingVotes[playerId]) {
            state.selectedVote = room.pendingVotes[playerId];
        }
        
        if (room.confirmedVotes) {
            state.hasVoted = !!room.confirmedVotes[playerId];
            state.confirmProgress = {
                count: Object.keys(room.confirmedVotes).length,
                total: room.players.size
            };
        }
        
        // V1.1: Chat messages
        if (room.chat && room.chat.messages) {
            state.chatMessages = room.chat.messages;
        }
    }
    
    // Results phase - include final results
    if (room.phase === 'results') {
        // Get attributed descriptions for display
        const descResult = getAttributedDescriptions(roomCode);
        if (descResult.success) {
            state.descriptions = descResult.descriptions;
        }
        
        // Recalculate vote summary for results display
        const voteCounts = {};
        for (const pid of room.players.keys()) {
            voteCounts[pid] = 0;
        }
        // Use confirmedVotes if available (v1.1), fallback to votes (v1.0)
        const votes = room.confirmedVotes || room.votes || {};
        for (const targetId of Object.values(votes)) {
            if (voteCounts[targetId] !== undefined) {
                voteCounts[targetId]++;
            }
        }
        
        const voteSummary = [];
        for (const [pid, count] of Object.entries(voteCounts)) {
            const p = room.players.get(pid);
            if (p) {
                voteSummary.push({ playerId: pid, playerName: p.name, votes: count });
            }
        }
        voteSummary.sort((a, b) => b.votes - a.votes);
        
        const imposter = room.players.get(room.imposterId);
        state.results = {
            imposter: imposter ? { id: imposter.id, name: imposter.name } : null,
            secretWord: room.word,
            voteSummary: voteSummary
        };
    }
    
    // V1.1: PostGame phase - include last results for display
    if (room.phase === 'postGame') {
        // Recalculate last game results
        const voteCounts = {};
        for (const pid of room.players.keys()) {
            voteCounts[pid] = 0;
        }
        const votes = room.confirmedVotes || room.votes || {};
        for (const targetId of Object.values(votes)) {
            if (voteCounts[targetId] !== undefined) {
                voteCounts[targetId]++;
            }
        }
        
        const voteSummary = [];
        for (const [pid, count] of Object.entries(voteCounts)) {
            const p = room.players.get(pid);
            if (p) {
                voteSummary.push({ playerId: pid, playerName: p.name, votes: count });
            }
        }
        voteSummary.sort((a, b) => b.votes - a.votes);
        
        const imposter = room.players.get(room.imposterId);
        state.results = {
            imposter: imposter ? { id: imposter.id, name: imposter.name } : null,
            secretWord: room.word,
            voteSummary: voteSummary
        };
    }
    
    return state;
}

// =============================================================================
// GAME OPERATIONS
// =============================================================================

/**
 * Minimum number of players required to start a game.
 */
const MIN_PLAYERS = 4;

/**
 * Starts the game for a room.
 * Validates host, player count, and game state.
 * Assigns imposter, topic, and word.
 * 
 * @param {string} roomCode - The room code
 * @param {string} requestingPlayerId - ID of player trying to start
 * @returns {Object} - { success, error?, room?, gameData? }
 */
function startGame(roomCode, requestingPlayerId) {
    const room = rooms.get(roomCode.toUpperCase());
    
    // Validation: Room exists
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    // Validation: Caller is the host
    if (room.hostId !== requestingPlayerId) {
        return { success: false, error: 'NOT_HOST' };
    }
    
    // Validation: Game not already started
    if (room.phase !== 'lobby') {
        return { success: false, error: 'GAME_ALREADY_STARTED' };
    }
    
    // Validation: Minimum player count
    if (room.players.size < MIN_PLAYERS) {
        return { 
            success: false, 
            error: 'NOT_ENOUGH_PLAYERS',
            required: MIN_PLAYERS,
            current: room.players.size
        };
    }
    
    // === GAME SETUP (Server-side only) ===
    
    // Select random topic and word
    const { topic, word } = getRandomTopicAndWord();
    
    // Select random imposter
    const imposterId = selectRandomImposter(room.players);
    
    // Update room state
    room.phase = 'roleReveal';
    room.topic = topic;
    room.word = word;           // SECRET: Only server knows, sent only to non-imposters
    room.imposterId = imposterId; // SECRET: Never sent to clients
    
    console.log(`[Game] Game started in room ${roomCode}`);
    console.log(`[Game] Topic: ${topic}, Word: ${word}, Imposter: ${room.players.get(imposterId).name}`);
    
    return {
        success: true,
        room: room,
        gameData: {
            topic: topic,
            word: word,
            imposterId: imposterId
        }
    };
}

/**
 * Transitions room from roleReveal to description phase.
 * Initializes the descriptions storage and sets up sequential speaking order.
 * 
 * V1.1 SEQUENTIAL DESCRIPTION:
 * - Generates randomized speaking order (all players including imposter)
 * - Sets currentSpeakerIndex to 0 (first speaker)
 * - Each speaker gets 10 seconds to submit
 * 
 * @param {string} roomCode - The room code
 * @returns {Object} - { success, error?, room?, speakingOrder? }
 */
function transitionToDescriptionPhase(roomCode) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    if (room.phase !== 'roleReveal') {
        return { success: false, error: 'INVALID_PHASE' };
    }
    
    // Transition to description phase
    room.phase = 'description';
    room.descriptions = {}; // { [playerId]: string }
    
    // V1.1: Set up sequential speaking order
    const playerIds = Array.from(room.players.keys());
    room.speakingOrder = shuffleArray(playerIds); // Randomize order
    room.currentSpeakerIndex = 0;
    room.currentDescription = null; // Live description being typed (not used server-side)
    
    console.log(`[Game] Room ${roomCode} transitioned to description phase (sequential mode)`);
    console.log(`[Game] Speaking order: ${room.speakingOrder.map(id => room.players.get(id).name).join(' → ')}`);
    
    return { 
        success: true, 
        room: room,
        speakingOrder: room.speakingOrder.map(id => ({
            id: id,
            name: room.players.get(id).name
        })),
        currentSpeakerIndex: 0
    };
}

/**
 * Submits a description from a player.
 * V1.1: Only the current speaker can submit during their turn.
 * 
 * @param {string} roomCode - The room code
 * @param {string} playerId - The ID of the player submitting
 * @param {string} description - The description text
 * @returns {Object} - { success, error?, room?, allSubmitted?, turnComplete? }
 */
function submitDescription(roomCode, playerId, description) {
    const room = rooms.get(roomCode.toUpperCase());
    
    // Validation: Room exists
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    // Validation: Correct phase
    if (room.phase !== 'description') {
        return { success: false, error: 'INVALID_PHASE' };
    }
    
    // Validation: Player is in this room
    if (!room.players.has(playerId)) {
        return { success: false, error: 'PLAYER_NOT_IN_ROOM' };
    }
    
    // V1.1: Validation - Only current speaker can submit
    const currentSpeakerId = room.speakingOrder[room.currentSpeakerIndex];
    if (playerId !== currentSpeakerId) {
        return { success: false, error: 'NOT_YOUR_TURN' };
    }
    
    // Validation: Player has not already submitted
    if (room.descriptions[playerId]) {
        return { success: false, error: 'ALREADY_SUBMITTED' };
    }
    
    // Validation: Description is non-empty (allow empty for auto-submit)
    const trimmedDescription = description.trim();
    const finalDescription = trimmedDescription.length === 0 ? '(No response)' : trimmedDescription;
    
    // Store the description with player attribution (V1.1: not anonymous)
    room.descriptions[playerId] = finalDescription;
    
    const submittedCount = Object.keys(room.descriptions).length;
    const totalPlayers = room.players.size;
    const allSubmitted = submittedCount === totalPlayers;
    
    // Move to next speaker
    room.currentSpeakerIndex++;
    const turnComplete = true;
    
    const player = room.players.get(playerId);
    console.log(`[Game] ${player.name} submitted description (${submittedCount}/${totalPlayers})`);
    
    return {
        success: true,
        room: room,
        allSubmitted: allSubmitted,
        turnComplete: turnComplete,
        submittedCount: submittedCount,
        totalPlayers: totalPlayers,
        submittedBy: {
            id: playerId,
            name: player.name
        },
        description: finalDescription
    };
}

/**
 * AUTO-SUBMISSION: Submits default descriptions for players who didn't submit.
 * Called when description phase timer expires.
 * 
 * AUTO-SUBMISSION LOGIC:
 * - Players who did not submit get "(No response)" as their description
 * - This ensures voting phase can proceed even if some players are AFK
 * - The default text is intentionally generic to not give away imposter
 * 
 * @param {string} roomCode - The room code
 * @returns {Object} - { success, error?, room?, autoSubmittedCount? }
 */
function autoSubmitMissingDescriptions(roomCode) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    if (room.phase !== 'description') {
        return { success: false, error: 'INVALID_PHASE' };
    }
    
    let autoSubmittedCount = 0;
    
    // Find players who haven't submitted and auto-submit for them
    for (const playerId of room.players.keys()) {
        if (!room.descriptions[playerId]) {
            // AUTO-SUBMIT: Default description for missing players
            room.descriptions[playerId] = '(No response)';
            autoSubmittedCount++;
            
            const player = room.players.get(playerId);
            console.log(`[Game] Auto-submitted description for ${player.name} (timeout)`);
        }
    }
    
    console.log(`[Game] Auto-submitted ${autoSubmittedCount} descriptions in room ${roomCode}`);
    
    return {
        success: true,
        room: room,
        autoSubmittedCount: autoSubmittedCount
    };
}

/**
 * V1.1: Auto-submit for current speaker when their turn times out.
 * Only submits for the current speaker, then advances to next.
 * 
 * @param {string} roomCode - The room code
 * @returns {Object} - { success, error?, room?, allSubmitted?, nextSpeaker? }
 */
function autoSubmitCurrentSpeaker(roomCode) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    if (room.phase !== 'description') {
        return { success: false, error: 'INVALID_PHASE' };
    }
    
    // Get current speaker
    const currentSpeakerId = room.speakingOrder[room.currentSpeakerIndex];
    if (!currentSpeakerId) {
        return { success: false, error: 'NO_CURRENT_SPEAKER' };
    }
    
    // FIX 2: Check if current speaker still exists (may have disconnected)
    const currentPlayer = room.players.get(currentSpeakerId);
    if (!currentPlayer) {
        // Player disconnected but still in speakingOrder - their description was
        // already auto-submitted by handlePlayerDisconnectMidGame, just advance
        console.log(`[Game] Skipping disconnected speaker at index ${room.currentSpeakerIndex}`);
        room.currentSpeakerIndex++;
        
        // Check if we need to skip more disconnected players (avoid infinite loop with limit)
        let skipCount = 0;
        const maxSkips = room.speakingOrder.length;
        while (room.currentSpeakerIndex < room.speakingOrder.length && skipCount < maxSkips) {
            const nextId = room.speakingOrder[room.currentSpeakerIndex];
            if (room.players.has(nextId)) {
                break; // Found a valid player
            }
            // Ensure description exists for this disconnected player
            if (!room.descriptions[nextId]) {
                room.descriptions[nextId] = '(Disconnected)';
            }
            room.currentSpeakerIndex++;
            skipCount++;
        }
        
        // Return with updated state
        const submittedCount = Object.keys(room.descriptions).length;
        const allSubmitted = room.currentSpeakerIndex >= room.speakingOrder.length;
        
        let nextSpeaker = null;
        if (!allSubmitted && room.currentSpeakerIndex < room.speakingOrder.length) {
            const nextSpeakerId = room.speakingOrder[room.currentSpeakerIndex];
            const nextPlayer = room.players.get(nextSpeakerId);
            if (nextPlayer) {
                nextSpeaker = {
                    id: nextSpeakerId,
                    name: nextPlayer.name,
                    index: room.currentSpeakerIndex
                };
            }
        }
        
        return {
            success: true,
            room: room,
            allSubmitted: allSubmitted,
            submittedCount: submittedCount,
            totalPlayers: room.players.size,
            nextSpeaker: nextSpeaker,
            skippedDisconnected: true
        };
    }
    
    // Only auto-submit if they haven't submitted yet
    if (!room.descriptions[currentSpeakerId]) {
        room.descriptions[currentSpeakerId] = '(No response)';
        console.log(`[Game] Auto-submitted "(No response)" for ${currentPlayer.name} (turn timeout)`);
    }
    
    // Move to next speaker
    room.currentSpeakerIndex++;
    
    const submittedCount = Object.keys(room.descriptions).length;
    const totalPlayers = room.players.size;
    const allSubmitted = room.currentSpeakerIndex >= room.speakingOrder.length;
    
    let nextSpeaker = null;
    if (!allSubmitted) {
        const nextSpeakerId = room.speakingOrder[room.currentSpeakerIndex];
        const nextPlayer = room.players.get(nextSpeakerId);
        nextSpeaker = {
            id: nextSpeakerId,
            name: nextPlayer.name,
            index: room.currentSpeakerIndex
        };
    }
    
    return {
        success: true,
        room: room,
        allSubmitted: allSubmitted,
        submittedCount: submittedCount,
        totalPlayers: totalPlayers,
        nextSpeaker: nextSpeaker
    };
}

/**
 * V1.1: Get current speaker information for the description phase.
 * 
 * @param {string} roomCode - The room code
 * @returns {Object} - { success, currentSpeaker?, speakingOrder?, allComplete? }
 */
function getCurrentSpeaker(roomCode) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    if (room.phase !== 'description') {
        return { success: false, error: 'INVALID_PHASE' };
    }
    
    // FIX 2: Skip any disconnected players in the speaking order
    let skipCount = 0;
    const maxSkips = room.speakingOrder.length;
    while (room.currentSpeakerIndex < room.speakingOrder.length && skipCount < maxSkips) {
        const speakerId = room.speakingOrder[room.currentSpeakerIndex];
        if (room.players.has(speakerId)) {
            break; // Found a valid player
        }
        // Auto-submit for disconnected player if not already done
        if (!room.descriptions[speakerId]) {
            room.descriptions[speakerId] = '(Disconnected)';
            console.log(`[Game] Skipping disconnected speaker, auto-submitted description`);
        }
        room.currentSpeakerIndex++;
        skipCount++;
    }
    
    const allComplete = room.currentSpeakerIndex >= room.speakingOrder.length;
    
    if (allComplete) {
        return {
            success: true,
            allComplete: true,
            currentSpeaker: null
        };
    }
    
    const currentSpeakerId = room.speakingOrder[room.currentSpeakerIndex];
    const currentPlayer = room.players.get(currentSpeakerId);
    
    // FIX 2: Safety check - if player somehow doesn't exist, return allComplete
    if (!currentPlayer) {
        console.error(`[Game] Current speaker ${currentSpeakerId} not found in players`);
        return {
            success: true,
            allComplete: true,
            currentSpeaker: null
        };
    }
    
    return {
        success: true,
        allComplete: false,
        currentSpeaker: {
            id: currentSpeakerId,
            name: currentPlayer.name,
            index: room.currentSpeakerIndex
        },
        // FIX 2: Filter out disconnected players from speaking order display
        speakingOrder: room.speakingOrder
            .filter(id => room.players.has(id))
            .map(id => ({
                id: id,
                name: room.players.get(id).name
            })),
        totalSpeakers: room.speakingOrder.filter(id => room.players.has(id)).length
    };
}

/**
 * V1.1: Get all descriptions with player attribution (not anonymized).
 * Used for the voting phase where players can see who said what.
 * 
 * @param {string} roomCode - The room code
 * @returns {Object} - { success, descriptions? }
 */
function getAttributedDescriptions(roomCode) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    // Build descriptions with player names (in speaking order)
    const descriptions = room.speakingOrder.map(playerId => {
        const player = room.players.get(playerId);
        return {
            playerId: playerId,
            playerName: player ? player.name : 'Unknown',
            description: room.descriptions[playerId] || '(No response)'
        };
    });
    
    return {
        success: true,
        descriptions: descriptions
    };
}

/**
 * Gets anonymized descriptions for broadcasting.
 * 
 * PRIVACY GUARANTEE:
 * - Returns ONLY the description text
 * - NO player IDs
 * - NO socket IDs
 * - NO imposter indicators
 * - Order is RANDOMIZED to prevent order-based identification
 * 
 * @param {string} roomCode - The room code
 * @returns {Object} - { success, error?, descriptions? }
 */
function getAnonymizedDescriptions(roomCode) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    // Extract only the description text (strip player IDs)
    const descriptionTexts = Object.values(room.descriptions).map(desc => ({
        description: desc
        // PRIVACY: No playerId, no socketId, no isImposter flag
    }));
    
    // CRITICAL: Shuffle to prevent order-based identification
    // (e.g., if descriptions were shown in submission order)
    const shuffledDescriptions = shuffleArray(descriptionTexts);
    
    return {
        success: true,
        descriptions: shuffledDescriptions
    };
}

/**
 * Transitions room from description to voting phase.
 * Initializes the votes storage.
 * V1.1: Adds pendingVotes and confirmedVotes for two-step voting.
 * V1.1: Adds chat for voting phase discussion.
 * 
 * @param {string} roomCode - The room code
 * @returns {Object} - { success, error?, room? }
 */
function transitionToVotingPhase(roomCode) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    if (room.phase !== 'description') {
        return { success: false, error: 'INVALID_PHASE' };
    }
    
    room.phase = 'voting';
    room.votes = {};            // Legacy, still used for final tally
    room.pendingVotes = {};     // V1.1: { [voterId]: targetPlayerId } - selected but not confirmed
    room.confirmedVotes = {};   // V1.1: { [voterId]: targetPlayerId } - locked in
    
    // V1.1: Initialize chat
    room.chat = {
        messages: [],           // Array of { id, senderId, senderName, text, timestamp }
        rateLimit: new Map()    // Map<playerId, timestamp[]> for rate limiting
    };
    
    // FIX 3: Clear any stale postGame timeout from previous game
    if (room.postGameTimeoutId) {
        clearTimeout(room.postGameTimeoutId);
        room.postGameTimeoutId = null;
    }
    
    console.log(`[Game] Room ${roomCode} transitioned to voting phase`);
    
    return { success: true, room: room };
}

/**
 * V1.1: Selects a vote target (does not confirm yet).
 * Player can change their selection until they confirm.
 * 
 * @param {string} roomCode - The room code
 * @param {string} voterId - The ID of the player voting
 * @param {string} targetPlayerId - The ID of the player being voted for
 * @returns {Object} - { success, error? }
 */
function selectVote(roomCode, voterId, targetPlayerId) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    if (room.phase !== 'voting') {
        return { success: false, error: 'INVALID_PHASE' };
    }
    
    if (!room.players.has(voterId)) {
        return { success: false, error: 'VOTER_NOT_IN_ROOM' };
    }
    
    if (!room.players.has(targetPlayerId)) {
        return { success: false, error: 'TARGET_NOT_IN_ROOM' };
    }
    
    if (voterId === targetPlayerId) {
        return { success: false, error: 'CANNOT_VOTE_SELF' };
    }
    
    // Cannot change selection after confirming
    if (room.confirmedVotes[voterId]) {
        return { success: false, error: 'ALREADY_CONFIRMED' };
    }
    
    // Set or update pending selection
    room.pendingVotes[voterId] = targetPlayerId;
    
    console.log(`[Game] ${room.players.get(voterId).name} selected ${room.players.get(targetPlayerId).name}`);
    
    return { success: true };
}

/**
 * V1.1: Confirms the current vote selection.
 * Once confirmed, the vote is locked and cannot be changed.
 * 
 * @param {string} roomCode - The room code
 * @param {string} voterId - The ID of the player confirming their vote
 * @returns {Object} - { success, error?, allConfirmed?, confirmedCount?, totalPlayers? }
 */
function confirmVote(roomCode, voterId) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    if (room.phase !== 'voting') {
        return { success: false, error: 'INVALID_PHASE' };
    }
    
    if (!room.players.has(voterId)) {
        return { success: false, error: 'VOTER_NOT_IN_ROOM' };
    }
    
    // Must have a pending selection
    if (!room.pendingVotes[voterId]) {
        return { success: false, error: 'NO_SELECTION' };
    }
    
    // Already confirmed
    if (room.confirmedVotes[voterId]) {
        return { success: false, error: 'ALREADY_CONFIRMED' };
    }
    
    // Lock in the vote
    const targetPlayerId = room.pendingVotes[voterId];
    room.confirmedVotes[voterId] = targetPlayerId;
    room.votes[voterId] = targetPlayerId; // For calculateVoteResults compatibility
    
    const confirmedCount = Object.keys(room.confirmedVotes).length;
    const totalPlayers = room.players.size;
    const allConfirmed = confirmedCount === totalPlayers;
    
    const voter = room.players.get(voterId);
    console.log(`[Game] ${voter.name} confirmed vote (${confirmedCount}/${totalPlayers})`);
    
    return {
        success: true,
        allConfirmed: allConfirmed,
        confirmedCount: confirmedCount,
        totalPlayers: totalPlayers
    };
}

/**
 * V1.1: Auto-confirms all pending votes when voting timer expires.
 * Players who have not selected anyone are treated as abstaining.
 * 
 * @param {string} roomCode - The room code
 * @returns {Object} - { success, error?, autoConfirmed? }
 */
function autoConfirmPendingVotes(roomCode) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    if (room.phase !== 'voting') {
        return { success: false, error: 'INVALID_PHASE' };
    }
    
    let autoConfirmed = 0;
    
    // Move all pending votes to confirmed votes
    for (const [voterId, targetId] of Object.entries(room.pendingVotes || {})) {
        // Only confirm if not already confirmed
        if (!room.confirmedVotes[voterId]) {
            room.confirmedVotes[voterId] = targetId;
            room.votes[voterId] = targetId; // For calculateVoteResults compatibility
            autoConfirmed++;
            
            const voter = room.players.get(voterId);
            if (voter) {
                console.log(`[Game] Auto-confirmed pending vote for ${voter.name}`);
            }
        }
    }
    
    // Players with no pendingVotes are treated as abstaining (no action needed)
    const abstainCount = room.players.size - Object.keys(room.confirmedVotes).length;
    if (abstainCount > 0) {
        console.log(`[Game] ${abstainCount} player(s) abstained (no selection made)`);
    }
    
    console.log(`[Game] Auto-confirmed ${autoConfirmed} pending votes in room ${roomCode}`);
    
    return { success: true, autoConfirmed: autoConfirmed };
}

/**
 * Submits a vote from a player.
 * @deprecated V1.1: Use selectVote + confirmVote instead.
 * Kept for backward compatibility.
 * 
 * @param {string} roomCode - The room code
 * @param {string} voterId - The ID of the player voting
 * @param {string} targetPlayerId - The ID of the player being voted for
 * @returns {Object} - { success, error?, room?, allVoted? }
 */
function submitVote(roomCode, voterId, targetPlayerId) {
    const room = rooms.get(roomCode.toUpperCase());
    
    // Validation: Room exists
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    // Validation: Correct phase
    if (room.phase !== 'voting') {
        return { success: false, error: 'INVALID_PHASE' };
    }
    
    // Validation: Voter is in this room
    if (!room.players.has(voterId)) {
        return { success: false, error: 'VOTER_NOT_IN_ROOM' };
    }
    
    // Validation: Target player exists in this room
    if (!room.players.has(targetPlayerId)) {
        return { success: false, error: 'TARGET_NOT_IN_ROOM' };
    }
    
    // Validation: Cannot vote for yourself
    if (voterId === targetPlayerId) {
        return { success: false, error: 'CANNOT_VOTE_SELF' };
    }
    
    // Validation: Player has not already voted
    if (room.votes[voterId]) {
        return { success: false, error: 'ALREADY_VOTED' };
    }
    
    // Store the vote (server tracks who voted for whom)
    room.votes[voterId] = targetPlayerId;
    
    const votedCount = Object.keys(room.votes).length;
    const totalPlayers = room.players.size;
    const allVoted = votedCount === totalPlayers;
    
    console.log(`[Game] ${room.players.get(voterId).name} voted (${votedCount}/${totalPlayers})`);
    
    return {
        success: true,
        room: room,
        allVoted: allVoted,
        votedCount: votedCount,
        totalPlayers: totalPlayers
    };
}

/**
 * Calculates vote results and determines the winner.
 * 
 * V1.3: Now handles ties with revotes instead of automatic imposter wins.
 * 
 * VOTE COUNTING BEHAVIOR:
 * - Only confirmed votes are counted (room.votes)
 * - Missing votes = abstain (ignored in counting)
 * 
 * TIE HANDLING (V1.3):
 * - If multiple players have highest vote count: trigger tie-breaker replay
 * - Returns { isTie: true } to signal server to restart game with same imposter
 * - No elimination occurs on tie
 * 
 * @param {string} roomCode - The room code
 * @returns {Object} - { success, error?, results?, isTie? }
 */
function calculateVoteResults(roomCode) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    if (room.phase !== 'voting') {
        return { success: false, error: 'INVALID_PHASE' };
    }
    
    // =========================================================================
    // STEP 1: Count votes for each player
    // NOTE: Only actual votes are counted. Abstains (missing votes) are ignored.
    // =========================================================================
    const voteCounts = {}; // { [playerId]: number }
    
    // Initialize all players with 0 votes
    for (const playerId of room.players.keys()) {
        voteCounts[playerId] = 0;
    }
    
    // Count only actual votes cast (abstains are simply not in room.votes)
    const actualVotesCast = Object.keys(room.votes).length;
    for (const targetPlayerId of Object.values(room.votes)) {
        if (voteCounts[targetPlayerId] !== undefined) {
            voteCounts[targetPlayerId]++;
        }
    }
    
    // Log abstain count for debugging
    const abstainCount = room.players.size - actualVotesCast;
    if (abstainCount > 0) {
        console.log(`[Game] ${abstainCount} player(s) abstained from voting in room ${roomCode}`);
    }
    
    // =========================================================================
    // STEP 2: Find the highest vote count and players with that count
    // =========================================================================
    let maxVotes = 0;
    for (const count of Object.values(voteCounts)) {
        if (count > maxVotes) {
            maxVotes = count;
        }
    }
    
    // Get all players with the max vote count (potential ties)
    const playersWithMaxVotes = [];
    for (const [playerId, count] of Object.entries(voteCounts)) {
        if (count === maxVotes) {
            playersWithMaxVotes.push(playerId);
        }
    }
    
    // =========================================================================
    // STEP 3: Handle ties (V1.3) - Signal tie-breaker replay
    // =========================================================================
    if (playersWithMaxVotes.length > 1) {
        // TIE DETECTED - Don't eliminate anyone
        const tiedPlayerNames = playersWithMaxVotes.map(id => room.players.get(id).name);
        console.log(`[Game] Tie detected in room ${roomCode}: ${tiedPlayerNames.join(', ')} with ${maxVotes} votes each`);
        
        return {
            success: false,
            isTie: true
        };
    }
    
    // =========================================================================
    // STEP 4: Clear winner - proceed to results
    // =========================================================================
    const votedOutPlayerId = playersWithMaxVotes[0];
    console.log(`[Game] Clear winner: ${room.players.get(votedOutPlayerId).name} with ${maxVotes} votes`);
    
    return finalizeResults(room, votedOutPlayerId, voteCounts);
}

/**
 * V1.3: Helper function to finalize and return vote results.
 * Transitions room to results phase and builds the result payload.
 * 
 * @param {Object} room - The room object
 * @param {string} votedOutPlayerId - The player who was voted out
 * @param {Object} voteCounts - Vote counts per player
 * @returns {Object} - Result payload
 */
function finalizeResults(room, votedOutPlayerId, voteCounts) {
    // =========================================================================
    // Determine winner
    // =========================================================================
    const playersWin = votedOutPlayerId === room.imposterId;
    
    // =========================================================================
    // Build vote summary (revealed only in results)
    // =========================================================================
    const voteSummary = [];
    for (const [playerId, count] of Object.entries(voteCounts)) {
        const player = room.players.get(playerId);
        if (player) {
            voteSummary.push({
                playerId: playerId,
                playerName: player.name,
                votes: count
            });
        }
    }
    
    // Sort by votes (descending) for display
    voteSummary.sort((a, b) => b.votes - a.votes);
    
    // =========================================================================
    // Transition to results phase
    // V1.1: Room stays open after results for replay
    // =========================================================================
    room.phase = 'results';
    
    const votedOutPlayer = room.players.get(votedOutPlayerId);
    const imposter = room.players.get(room.imposterId);
    
    console.log(`[Game] Results: ${playersWin ? 'PLAYERS WIN' : 'IMPOSTER WINS'}`);
    console.log(`[Game] Voted out: ${votedOutPlayer.name}, Imposter was: ${imposter.name}`);
    
    return {
        success: true,
        room: room,
        results: {
            votedOutPlayer: {
                id: votedOutPlayer.id,
                name: votedOutPlayer.name
            },
            imposter: {
                id: imposter.id,
                name: imposter.name
            },
            playersWin: playersWin,
            voteSummary: voteSummary,
            secretWord: room.word // Reveal the word in results
        }
    };
}

/**
 * Gets a room by its code.
 * @param {string} roomCode - The room code
 * @returns {Object|null} - The room or null
 */
function getRoom(roomCode) {
    return rooms.get(roomCode.toUpperCase()) || null;
}

/**
 * FIX 3: Sets the postGame transition timeout ID for a room.
 * This allows cancellation if Play Again is triggered during the delay.
 * 
 * @param {string} roomCode - The room code
 * @param {number} timeoutId - The setTimeout ID
 */
function setPostGameTimeout(roomCode, timeoutId) {
    const room = rooms.get(roomCode.toUpperCase());
    if (room) {
        room.postGameTimeoutId = timeoutId;
    }
}

/**
 * FIX 3: Clears the postGame transition timeout for a room.
 * 
 * @param {string} roomCode - The room code
 */
function clearPostGameTimeout(roomCode) {
    const room = rooms.get(roomCode.toUpperCase());
    if (room && room.postGameTimeoutId) {
        clearTimeout(room.postGameTimeoutId);
        room.postGameTimeoutId = null;
        console.log(`[Game] Cleared postGame timeout for room ${roomCode}`);
    }
}

/**
 * V1.1: Transitions room from results to postGame phase.
 * The room stays open for players to replay.
 * 
 * @param {string} roomCode - The room code
 * @returns {Object} - { success, error?, room? }
 */
function transitionToPostGame(roomCode) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    if (room.phase !== 'results') {
        return { success: false, error: 'INVALID_PHASE' };
    }
    
    room.phase = 'postGame';
    
    console.log(`[Game] Room ${roomCode} transitioned to postGame phase`);
    
    return { success: true, room: room };
}

/**
 * V1.1: Resets the room for a new game (Play Again).
 * Keeps players intact but clears all game-specific state.
 * 
 * @param {string} roomCode - The room code
 * @param {string} requestingPlayerId - Player ID requesting the reset (must be host)
 * @returns {Object} - { success, error?, room? }
 */
function resetRoomForNewGame(roomCode, requestingPlayerId) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    // V1.1: Allow reset from results or postGame phase
    if (room.phase !== 'results' && room.phase !== 'postGame') {
        return { success: false, error: 'INVALID_PHASE' };
    }
    
    // Only host can start a new game
    if (room.hostId !== requestingPlayerId) {
        return { success: false, error: 'NOT_HOST' };
    }
    
    // Validation: Minimum player count
    if (room.players.size < MIN_PLAYERS) {
        return { 
            success: false, 
            error: 'NOT_ENOUGH_PLAYERS',
            required: MIN_PLAYERS,
            current: room.players.size
        };
    }
    
    // FIX 3: Clear postGame timeout if pending
    if (room.postGameTimeoutId) {
        clearTimeout(room.postGameTimeoutId);
        console.log(`[Game] Cancelled pending postGame transition for room ${roomCode}`);
    }
    
    // Clear game-specific state
    delete room.topic;
    delete room.word;
    delete room.imposterId;
    delete room.descriptions;
    delete room.speakingOrder;
    delete room.currentSpeakerIndex;
    delete room.currentDescription;
    delete room.votes;
    delete room.pendingVotes;
    delete room.confirmedVotes;
    delete room.chat;
    delete room.postGameTimeoutId;
    
    // Reset to lobby and increment game number
    room.phase = 'lobby';
    room.gameNumber = (room.gameNumber || 0) + 1;
    
    console.log(`[Game] Room ${roomCode} reset for game #${room.gameNumber + 1}`);
    
    return { success: true, room: room };
}

/**
 * V1.3: Restarts the game round with the same imposter after a tie.
 * Generates new topic/word but keeps the same imposter.
 * Transitions directly to description phase.
 * 
 * PRESERVES:
 * - room.imposterId
 * - room.players
 * - room.hostId
 * - room.settings
 * - room.gameNumber
 * 
 * RESETS:
 * - descriptions, votes, confirmedVotes, pendingVotes
 * - chat
 * - speaking order
 * 
 * GENERATES:
 * - New random topic
 * - New random word
 * 
 * @param {string} roomCode - The room code
 * @returns {Object} - { success, error?, room?, gameData?, speakingOrder? }
 */
function restartGameRoundWithSameImposter(roomCode) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    // Should only be called from voting phase after a tie
    if (room.phase !== 'voting') {
        return { success: false, error: 'INVALID_PHASE' };
    }
    
    // Must have an imposter
    if (!room.imposterId) {
        return { success: false, error: 'NO_IMPOSTER' };
    }
    
    // Generate new topic and word
    const { topic, word } = getRandomTopicAndWord();
    
    console.log(`[Game] Tie-breaker replay in room ${roomCode}`);
    console.log(`[Game] New Topic: ${topic}, New Word: ${word}, Same Imposter: ${room.players.get(room.imposterId).name}`);
    
    // Update room with new topic/word (keep same imposterId)
    room.topic = topic;
    room.word = word;
    
    // Clear round-specific state
    room.descriptions = {};
    room.votes = {};
    room.pendingVotes = {};
    room.confirmedVotes = {};
    room.chat = {
        messages: [],
        rateLimit: new Map()
    };
    
    // Set up description phase with new speaking order
    room.phase = 'description';
    const playerIds = Array.from(room.players.keys());
    room.speakingOrder = shuffleArray(playerIds);
    room.currentSpeakerIndex = 0;
    room.currentDescription = null;
    
    console.log(`[Game] Speaking order: ${room.speakingOrder.map(id => room.players.get(id).name).join(' → ')}`);
    
    return {
        success: true,
        room: room,
        gameData: {
            topic: topic,
            word: word,
            imposterId: room.imposterId
        },
        speakingOrder: room.speakingOrder.map(id => ({
            id: id,
            name: room.players.get(id).name
        }))
    };
}

// =============================================================================
// V1.1: CHAT FUNCTIONS
// =============================================================================

/**
 * Rate limit configuration for chat
 */
const CHAT_RATE_LIMIT = {
    maxMessages: 5,      // Max messages per window
    windowMs: 10000      // 10 seconds
};

/**
 * V1.1: Adds a chat message during voting phase.
 * Includes rate limiting to prevent spam.
 * 
 * PRIVACY: Chat messages are visible to all players.
 * SECURITY: Messages are sanitized (trimmed, length-limited).
 * 
 * @param {string} roomCode - The room code
 * @param {string} playerId - The ID of the sender
 * @param {string} text - The message text
 * @returns {Object} - { success, error?, message? }
 */
function addChatMessage(roomCode, playerId, text) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    // Only allow chat during voting phase
    if (room.phase !== 'voting') {
        return { success: false, error: 'CHAT_NOT_AVAILABLE' };
    }
    
    const player = room.players.get(playerId);
    if (!player) {
        return { success: false, error: 'PLAYER_NOT_IN_ROOM' };
    }
    
    // Validate message
    if (!text || typeof text !== 'string') {
        return { success: false, error: 'INVALID_MESSAGE' };
    }
    
    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
        return { success: false, error: 'EMPTY_MESSAGE' };
    }
    
    if (trimmedText.length > 200) {
        return { success: false, error: 'MESSAGE_TOO_LONG' };
    }
    
    // Rate limiting check
    const now = Date.now();
    const playerMessageTimes = room.chat.rateLimit.get(playerId) || [];
    
    // Remove old timestamps outside the window
    const recentMessages = playerMessageTimes.filter(
        time => now - time < CHAT_RATE_LIMIT.windowMs
    );
    
    if (recentMessages.length >= CHAT_RATE_LIMIT.maxMessages) {
        return { success: false, error: 'RATE_LIMITED' };
    }
    
    // Add current timestamp
    recentMessages.push(now);
    room.chat.rateLimit.set(playerId, recentMessages);
    
    // Create message
    const message = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        senderId: playerId,
        senderName: player.name,
        text: trimmedText,
        timestamp: now
    };
    
    room.chat.messages.push(message);
    
    // Keep only last 100 messages
    if (room.chat.messages.length > 100) {
        room.chat.messages = room.chat.messages.slice(-100);
    }
    
    console.log(`[Chat] ${player.name}: ${trimmedText}`);
    
    return { success: true, message: message };
}

/**
 * V1.1: Gets all chat messages for a room.
 * 
 * @param {string} roomCode - The room code
 * @returns {Object} - { success, messages? }
 */
function getChatMessages(roomCode) {
    const room = rooms.get(roomCode.toUpperCase());
    
    if (!room) {
        return { success: false, error: 'ROOM_NOT_FOUND' };
    }
    
    if (!room.chat) {
        return { success: true, messages: [] };
    }
    
    return { success: true, messages: room.chat.messages };
}

/**
 * Gets a player by their socket ID.
 * @param {string} socketId - The socket ID
 * @returns {Object|null} - { room, player } or null
 */
function getPlayerBySocketId(socketId) {
    for (const room of rooms.values()) {
        for (const player of room.players.values()) {
            if (player.socketId === socketId) {
                return { room, player };
            }
        }
    }
    return null;
}

/**
 * Serializes room data for sending to clients.
 * Only includes safe, public information.
 * 
 * PRIVACY NOTES:
 * - socketId: NEVER sent (internal use only)
 * - word: NEVER included here (sent privately to non-imposters)
 * - imposterId: NEVER included here (only imposter knows they are imposter)
 * 
 * @param {Object} room - The room object
 * @returns {Object} - Serialized room data
 */
function serializeRoom(room) {
    const serialized = {
        code: room.code,
        hostId: room.hostId,
        phase: room.phase,
        players: Array.from(room.players.values()).map(p => ({
            id: p.id,
            name: p.name
            // Note: socketId is NOT sent to clients
        })),
        playerCount: room.players.size,
        gameNumber: room.gameNumber || 0,   // V1.1: Include game count
        settings: room.settings || { descriptionTime: 10, votingTime: 60 }   // V1.2: Include settings
    };
    
    // Include topic if game has started (topic is public knowledge)
    if (room.topic) {
        serialized.topic = room.topic;
    }
    
    // NEVER include: room.word, room.imposterId
    
    return serialized;
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
    createRoom,
    joinRoom,
    removePlayerBySocketId,
    handlePlayerDisconnectMidGame,
    attemptRejoin,
    getRejoinState,
    getRoom,
    getPlayerBySocketId,
    serializeRoom,
    startGame,
    transitionToDescriptionPhase,
    submitDescription,
    autoSubmitMissingDescriptions,
    autoSubmitCurrentSpeaker,
    getCurrentSpeaker,
    getAnonymizedDescriptions,
    getAttributedDescriptions,
    transitionToVotingPhase,
    selectVote,
    confirmVote,
    autoConfirmPendingVotes,
    submitVote,
    calculateVoteResults,
    transitionToPostGame,
    resetRoomForNewGame,
    restartGameRoundWithSameImposter,  // V1.3: Tie-breaker replay
    setPostGameTimeout,
    clearPostGameTimeout,
    addChatMessage,
    getChatMessages,
    updateRoomSettings,      // V1.2
    DEFAULT_SETTINGS,        // V1.2
    SETTINGS_LIMITS,         // V1.2
    MIN_PLAYERS
};
