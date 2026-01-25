/**
 * Role Reveal Page
 * 
 * Shows each player their role privately.
 * - Imposter sees: topic only + "You are the imposter"
 * - Regular players see: topic + secret word
 * 
 * Host can proceed to description phase.
 * Timer auto-advances after 10 seconds.
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
        <div className="page role-reveal">
            <h2>Your Role</h2>
            
            {timer.phase === 'roleReveal' && timer.remainingSeconds > 0 && (
                <div className="timer">
                    ⏱️ {timer.remainingSeconds}s
                </div>
            )}
            
            {error && (
                <div className="error">{error}</div>
            )}
            
            <div className="topic-display">
                <span>Topic:</span>
                <strong>{topic}</strong>
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
    );
}
