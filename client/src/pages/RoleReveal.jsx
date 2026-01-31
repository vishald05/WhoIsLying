/**
 * Role Reveal Page (V1.2 Desktop Layout)
 * 
 * Shows each player their role privately.
 * 
 * V1.2 LAYOUT STRATEGY:
 * - Mobile (<1024px): Vertical stacked layout (unchanged)
 * - Desktop (≥1024px): Three-panel grid layout
 *   - Left panel: Topic display
 *   - Center panel: Role card (imposter or regular player)
 *   - Right panel: Timer, instructions, host controls
 * 
 * Features:
 * - Imposter sees: topic only + "You are the imposter"
 * - Regular players see: topic + secret word
 * - Host can proceed to description phase
 * - Timer auto-advances after 10 seconds
 */

import { useGame } from '../GameContext';

export default function RoleReveal() {
    const { 
        isImposter, 
        secretWord, 
        topic, 
        isHost, 
        startDescriptionPhase,
        timer,
        error,
        clearError 
    } = useGame();

    const handleContinue = async () => {
        clearError();
        try {
            await startDescriptionPhase();
        } catch (err) {
            console.error('Failed to start description phase:', err);
        }
    };

    return (
        <>
            {/* =================================================================
                LEFT PANEL - Topic Display (Desktop: left sidebar)
                ================================================================= */}
            <div className="game-panel-left">
                <h3>🎯 Game Topic</h3>
                <div className="topic-display">
                    <span>Topic:</span>
                    <strong>{topic}</strong>
                </div>
                
                <div className="phase-info">
                    <h3>📖 About This Phase</h3>
                    <div className="info-box">
                        <p>Everyone is viewing their role.</p>
                        <p>Memorize your information before proceeding!</p>
                    </div>
                </div>
            </div>

            {/* =================================================================
                CENTER PANEL - Role Card
                ================================================================= */}
            <div className="game-panel-center">
                <div className="page role-reveal">
                    <h2>Your Role</h2>
                    
                    {/* Timer - shown here on mobile */}
                    <div className="mobile-only">
                        {timer.phase === 'roleReveal' && timer.remainingSeconds > 0 && (
                            <div className="timer">
                                ⏱️ {timer.remainingSeconds}s
                            </div>
                        )}
                    </div>
                    
                    {error && (
                        <div className="error">{error}</div>
                    )}
                    
                    {/* Topic - shown here on mobile */}
                    <div className="mobile-only">
                        <div className="topic-display">
                            <span>Topic:</span>
                            <strong>{topic}</strong>
                        </div>
                    </div>
                    
                    {isImposter ? (
                        <div className="role imposter">
                            <h3>🎭 You are the IMPOSTER!</h3>
                            <p>You don't know the secret word.</p>
                            <p>Try to blend in with your description!</p>
                        </div>
                    ) : (
                        <div className="role regular">
                            <h3>✅ You are a regular player</h3>
                            <div className="secret-word">
                                <span>The secret word is:</span>
                                <strong>{secretWord}</strong>
                            </div>
                            <p>Describe this word without saying it!</p>
                        </div>
                    )}
                    
                    {/* Host controls - shown here on mobile */}
                    <div className="mobile-only">
                        {isHost ? (
                            <button onClick={handleContinue} className="primary">
                                Continue to Descriptions
                            </button>
                        ) : (
                            <p className="waiting-message">
                                Waiting for host to continue...
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* =================================================================
                RIGHT PANEL - Timer & Host Controls (Desktop only)
                ================================================================= */}
            <div className="game-panel-right desktop-only">
                <h3>⏱️ Time Remaining</h3>
                {timer.phase === 'roleReveal' && timer.remainingSeconds > 0 ? (
                    <div className="timer">
                        {timer.remainingSeconds}s
                    </div>
                ) : (
                    <div className="timer">--</div>
                )}
                
                <div className="phase-info">
                    <h3>📝 Instructions</h3>
                    <div className="info-box">
                        {isImposter ? (
                            <>
                                <p><strong>You're the imposter!</strong></p>
                                <p>You don't know the secret word.</p>
                                <p>Listen to others and try to blend in!</p>
                            </>
                        ) : (
                            <>
                                <p>You're a regular player.</p>
                                <p>Remember the secret word.</p>
                                <p>Describe it without being too obvious!</p>
                            </>
                        )}
                    </div>
                </div>
                
                {isHost ? (
                    <div className="host-controls">
                        <button onClick={handleContinue} className="primary">
                            Continue to Descriptions
                        </button>
                    </div>
                ) : (
                    <p className="waiting-message">
                        Waiting for host to continue...
                    </p>
                )}
            </div>
        </>
    );
}
