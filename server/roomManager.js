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
 *     phase: 'lobby' | 'roleReveal' | 'description' | 'voting' | 'results',
 *     players: Map<playerId, { id, name, socketId }>,
 *     createdAt: Date
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
        createdAt: new Date()
    };
    
    rooms.set(roomCode, room);
    
    console.log(`[Room] Created room ${roomCode} by ${hostName}`);
    
    return { room, player };
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
    
    if (room.phase !== 'lobby') {
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
    // =========================================================================
    if (phase === 'description') {
        // If player hasn't submitted a description, auto-submit for them
        if (!room.descriptions[playerId]) {
            room.descriptions[playerId] = '(Disconnected)';
            result.autoSubmitted = true;
            console.log(`[Game] Auto-submitted "(Disconnected)" for disconnected player in room ${roomCode}`);
        }
        
        // Check if all remaining players have submitted (excluding disconnected)
        // Note: The disconnected player is still in room.players at this point
        const submittedCount = Object.keys(room.descriptions).length;
        const totalPlayers = room.players.size; // Includes disconnected player
        result.descriptionComplete = submittedCount >= totalPlayers;
    }
    
    // =========================================================================
    // VOTING PHASE: Player's vote is ignored (abstain)
    // =========================================================================
    if (phase === 'voting') {
        // No action needed - player simply doesn't vote (abstain)
        // Their vote will be ignored in calculateVoteResults()
        console.log(`[Game] Disconnected player's vote ignored in room ${roomCode}`);
        
        // Check if all remaining players have voted
        // Note: We check against (total - 1) since this player won't vote
        const votedCount = Object.keys(room.votes).length;
        const remainingPlayers = room.players.size - 1; // Exclude disconnected player
        result.votingComplete = remainingPlayers > 0 && votedCount >= remainingPlayers;
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
        topic: room.topic || null
    };
    
    // Game in progress - include role information
    if (room.phase !== 'lobby' && room.imposterId) {
        state.isImposter = playerId === room.imposterId;
        
        // Only non-imposters see the word
        if (!state.isImposter && room.word) {
            state.word = room.word;
        }
    }
    
    // Description phase or later - include submission status
    if (room.descriptions) {
        state.hasSubmittedDescription = !!room.descriptions[playerId];
        state.submissionProgress = {
            count: Object.keys(room.descriptions).length,
            total: room.players.size
        };
    }
    
    // Voting phase or later - include vote status and descriptions
    if (room.phase === 'voting' || room.phase === 'results') {
        // Get anonymized descriptions for voting
        const descResult = getAnonymizedDescriptions(roomCode);
        if (descResult.success) {
            state.descriptions = descResult.descriptions;
        }
        
        if (room.votes) {
            state.hasVoted = !!room.votes[playerId];
            state.voteProgress = {
                count: Object.keys(room.votes).length,
                total: room.players.size
            };
        }
    }
    
    // Results phase - include final results
    if (room.phase === 'results') {
        // Recalculate vote summary for results display
        const voteCounts = {};
        for (const pid of room.players.keys()) {
            voteCounts[pid] = 0;
        }
        for (const targetId of Object.values(room.votes || {})) {
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
 * Initializes the descriptions storage.
 * 
 * @param {string} roomCode - The room code
 * @returns {Object} - { success, error?, room? }
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
    
    console.log(`[Game] Room ${roomCode} transitioned to description phase`);
    
    return { success: true, room: room };
}

/**
 * Submits a description from a player.
 * Validates phase, prevents duplicates, and checks for completion.
 * 
 * @param {string} roomCode - The room code
 * @param {string} playerId - The ID of the player submitting
 * @param {string} description - The description text
 * @returns {Object} - { success, error?, room?, allSubmitted? }
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
    
    // Validation: Player has not already submitted
    if (room.descriptions[playerId]) {
        return { success: false, error: 'ALREADY_SUBMITTED' };
    }
    
    // Validation: Description is non-empty
    const trimmedDescription = description.trim();
    if (trimmedDescription.length === 0) {
        return { success: false, error: 'EMPTY_DESCRIPTION' };
    }
    
    // Store the description (server knows who submitted, but won't reveal)
    room.descriptions[playerId] = trimmedDescription;
    
    const submittedCount = Object.keys(room.descriptions).length;
    const totalPlayers = room.players.size;
    const allSubmitted = submittedCount === totalPlayers;
    
    console.log(`[Game] ${room.players.get(playerId).name} submitted description (${submittedCount}/${totalPlayers})`);
    
    return {
        success: true,
        room: room,
        allSubmitted: allSubmitted,
        submittedCount: submittedCount,
        totalPlayers: totalPlayers
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
    room.votes = {}; // { [voterId]: targetPlayerId }
    
    console.log(`[Game] Room ${roomCode} transitioned to voting phase`);
    
    return { success: true, room: room };
}

/**
 * Submits a vote from a player.
 * Validates phase, prevents self-voting, and checks for completion.
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
 * Calculates the vote results and determines the winner.
 * 
 * TIE-BREAKING RULES (Deterministic & Fair):
 * 1. If there's a clear winner (single highest vote count), they are voted out
 * 2. If there's a tie that INCLUDES the imposter → Imposter wins
 *    (Rationale: Imposter successfully created confusion)
 * 3. If there's a tie that does NOT include the imposter → Random selection among tied
 *    (Rationale: Fair resolution when players couldn't decide)
 * 
 * ABSTAIN VOTE HANDLING:
 * - Players who did not vote are treated as abstaining
 * - Abstain votes do NOT count toward any player's vote total
 * - Abstaining players are NOT considered in tie-breaking
 * - Only actual votes cast are counted
 * 
 * @param {string} roomCode - The room code
 * @returns {Object} - { success, error?, results? }
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
        voteCounts[targetPlayerId]++;
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
    // STEP 3: Determine voted out player (handle ties)
    // =========================================================================
    let votedOutPlayerId;
    
    if (playersWithMaxVotes.length === 1) {
        // Clear winner - no tie
        votedOutPlayerId = playersWithMaxVotes[0];
        console.log(`[Game] Clear winner: ${room.players.get(votedOutPlayerId).name} with ${maxVotes} votes`);
    } else {
        // TIE SCENARIO
        const imposterInTie = playersWithMaxVotes.includes(room.imposterId);
        
        if (imposterInTie) {
            // TIE INCLUDES IMPOSTER → Imposter wins (escapes detection)
            // We vote out a random non-imposter from the tied players
            // This means imposter successfully created confusion
            const nonImposterTied = playersWithMaxVotes.filter(id => id !== room.imposterId);
            if (nonImposterTied.length > 0) {
                // Vote out a random non-imposter from the tie
                votedOutPlayerId = nonImposterTied[Math.floor(Math.random() * nonImposterTied.length)];
            } else {
                // Edge case: only imposter is tied (shouldn't happen with >1 players)
                votedOutPlayerId = room.imposterId;
            }
            console.log(`[Game] Tie includes imposter - voting out ${room.players.get(votedOutPlayerId).name}`);
        } else {
            // TIE DOES NOT INCLUDE IMPOSTER → Random selection among tied
            votedOutPlayerId = playersWithMaxVotes[Math.floor(Math.random() * playersWithMaxVotes.length)];
            console.log(`[Game] Tie without imposter - randomly selected ${room.players.get(votedOutPlayerId).name}`);
        }
    }
    
    // =========================================================================
    // STEP 4: Determine winner
    // =========================================================================
    const playersWin = votedOutPlayerId === room.imposterId;
    
    // =========================================================================
    // STEP 5: Build vote summary (revealed only in results)
    // =========================================================================
    const voteSummary = [];
    for (const [playerId, count] of Object.entries(voteCounts)) {
        const player = room.players.get(playerId);
        voteSummary.push({
            playerId: playerId,
            playerName: player.name,
            votes: count
        });
    }
    
    // Sort by votes (descending) for display
    voteSummary.sort((a, b) => b.votes - a.votes);
    
    // =========================================================================
    // STEP 6: Transition to results phase
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
        playerCount: room.players.size
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
    getAnonymizedDescriptions,
    transitionToVotingPhase,
    submitVote,
    calculateVoteResults,
    MIN_PLAYERS
};
