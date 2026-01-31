/**
 * End Game Button Component (V1.3)
 * 
 * Allows the host to end the current game at any time.
 * Shows a confirmation modal before ending.
 * 
 * Visibility:
 * - Only visible to the host
 * - Only during active game phases (roleReveal, description, voting)
 * - Hidden in lobby and postGame
 */

import { useState } from 'react';
import { useGame } from '../GameContext';

export default function EndGameButton() {
    const { isHost, phase, endGame, error } = useGame();
    const [showConfirm, setShowConfirm] = useState(false);
    const [isEnding, setIsEnding] = useState(false);
    
    // Only show during active game phases and only for host
    const activePhases = ['roleReveal', 'description', 'voting'];
    if (!isHost || !activePhases.includes(phase)) {
        return null;
    }
    
    const handleEndGame = async () => {
        setIsEnding(true);
        try {
            await endGame();
            setShowConfirm(false);
        } catch (err) {
            console.error('Failed to end game:', err);
        } finally {
            setIsEnding(false);
        }
    };
    
    return (
        <>
            {/* End Game Button */}
            <button 
                className="end-game-button"
                onClick={() => setShowConfirm(true)}
                title="End the current game"
            >
                🛑 End Game
            </button>
            
            {/* Confirmation Modal */}
            {showConfirm && (
                <div className="end-game-modal-overlay" onClick={() => setShowConfirm(false)}>
                    <div className="end-game-modal" onClick={e => e.stopPropagation()}>
                        <h3>⚠️ End Game?</h3>
                        <p>Are you sure you want to end the game?</p>
                        <p className="warning-text">This will reveal the imposter to all players.</p>
                        
                        {error && <p className="error">{error}</p>}
                        
                        <div className="modal-buttons">
                            <button 
                                className="cancel-btn"
                                onClick={() => setShowConfirm(false)}
                                disabled={isEnding}
                            >
                                Cancel
                            </button>
                            <button 
                                className="confirm-end-btn"
                                onClick={handleEndGame}
                                disabled={isEnding}
                            >
                                {isEnding ? 'Ending...' : 'Yes, End Game'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
