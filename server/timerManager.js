/**
 * Timer Manager Module
 * 
 * Manages server-controlled timers for each game phase.
 * Timers emit countdown events and trigger auto-progression when they expire.
 * 
 * TIMER LIFECYCLE:
 * 1. Timer is started when a phase begins
 * 2. Every second, server emits remaining time to all players
 * 3. When timer expires, server auto-progresses to next phase
 * 4. Timer is cleared on:
 *    - Phase change (normal progression)
 *    - Game end (results phase)
 *    - Room deletion (all players leave)
 * 
 * TIMER DURATIONS:
 * - roleReveal: 10 seconds → auto-move to description
 * - description: 60 seconds → auto-submit empty for missing players
 * - voting: 30 seconds → auto-submit abstain votes (ignored in tie logic)
 */

// =============================================================================
// TIMER CONFIGURATION
// =============================================================================

const PHASE_DURATIONS = {
    roleReveal: 10,   // seconds
    description: 60,  // seconds
    voting: 30        // seconds
};

// =============================================================================
// TIMER STORAGE
// =============================================================================

/**
 * Active timers per room.
 * 
 * Structure:
 * {
 *   [roomCode]: {
 *     phase: string,           // Current phase this timer is for
 *     intervalId: number,      // setInterval ID for countdown
 *     timeoutId: number,       // setTimeout ID for expiration
 *     remainingSeconds: number // Current countdown value
 *   }
 * }
 */
const roomTimers = new Map();

// =============================================================================
// TIMER FUNCTIONS
// =============================================================================

/**
 * Starts a timer for a specific phase in a room.
 * Clears any existing timer before starting a new one.
 * 
 * @param {string} roomCode - The room code
 * @param {string} phase - The phase to time (roleReveal, description, voting)
 * @param {Function} onTick - Called every second with (roomCode, phase, remainingSeconds)
 * @param {Function} onExpire - Called when timer expires
 */
function startTimer(roomCode, phase, onTick, onExpire) {
    // Clear any existing timer for this room
    clearTimer(roomCode);
    
    const duration = PHASE_DURATIONS[phase];
    
    if (!duration) {
        console.log(`[Timer] No timer configured for phase: ${phase}`);
        return;
    }
    
    let remainingSeconds = duration;
    
    console.log(`[Timer] Starting ${duration}s timer for room ${roomCode} (phase: ${phase})`);
    
    // Emit initial time immediately
    onTick(roomCode, phase, remainingSeconds);
    
    // Set up countdown interval (every second)
    const intervalId = setInterval(() => {
        remainingSeconds--;
        
        // Update stored remaining time
        const timerData = roomTimers.get(roomCode);
        if (timerData) {
            timerData.remainingSeconds = remainingSeconds;
        }
        
        // Emit current time to room
        onTick(roomCode, phase, remainingSeconds);
        
        // Check if timer has expired
        if (remainingSeconds <= 0) {
            console.log(`[Timer] Timer expired for room ${roomCode} (phase: ${phase})`);
            clearTimer(roomCode);
            onExpire(roomCode, phase);
        }
    }, 1000);
    
    // Store timer reference
    roomTimers.set(roomCode, {
        phase: phase,
        intervalId: intervalId,
        timeoutId: null, // We use interval-based countdown instead
        remainingSeconds: remainingSeconds
    });
}

/**
 * Clears any active timer for a room.
 * Called on phase change, game end, or room deletion.
 * 
 * @param {string} roomCode - The room code
 */
function clearTimer(roomCode) {
    const timerData = roomTimers.get(roomCode);
    
    if (timerData) {
        if (timerData.intervalId) {
            clearInterval(timerData.intervalId);
        }
        if (timerData.timeoutId) {
            clearTimeout(timerData.timeoutId);
        }
        
        roomTimers.delete(roomCode);
        console.log(`[Timer] Cleared timer for room ${roomCode}`);
    }
}

/**
 * Gets the remaining seconds for a room's timer.
 * 
 * @param {string} roomCode - The room code
 * @returns {number|null} - Remaining seconds or null if no timer
 */
function getRemainingSeconds(roomCode) {
    const timerData = roomTimers.get(roomCode);
    return timerData ? timerData.remainingSeconds : null;
}

/**
 * Gets the current timer phase for a room.
 * 
 * @param {string} roomCode - The room code
 * @returns {string|null} - Phase name or null if no timer
 */
function getTimerPhase(roomCode) {
    const timerData = roomTimers.get(roomCode);
    return timerData ? timerData.phase : null;
}

/**
 * Checks if a room has an active timer.
 * 
 * @param {string} roomCode - The room code
 * @returns {boolean}
 */
function hasTimer(roomCode) {
    return roomTimers.has(roomCode);
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
    PHASE_DURATIONS,
    startTimer,
    clearTimer,
    getRemainingSeconds,
    getTimerPhase,
    hasTimer
};
