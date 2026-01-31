/**
 * Tie Transition Component (V1.3)
 * 
 * Displays a full-screen transition overlay when a voting tie occurs.
 * Shows for ~2-3 seconds before automatically fading out.
 * 
 * Purpose:
 * - Clearly communicate that a tie occurred
 * - Indicate the same imposter is kept
 * - Signal a new round is beginning
 * - Provide smooth visual transition between rounds
 */

import { useGame } from '../GameContext';

export default function TieTransition() {
    const { showTieTransition } = useGame();
    
    if (!showTieTransition) return null;
    
    return (
        <div className="tie-transition-overlay">
            <div className="tie-transition-content">
                <div className="tie-icon">⚖️</div>
                <h1>It's a Tie!</h1>
                <p className="tie-subtitle">Same imposter. New round begins...</p>
                <div className="tie-spinner"></div>
            </div>
        </div>
    );
}
