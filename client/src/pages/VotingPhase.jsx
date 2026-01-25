/**
 * Voting Phase Page
 * 
 * Players vote for who they think is the imposter.
 * - Shows anonymized descriptions
 * - List of players to vote for
 * - Cannot vote for yourself
 * - Timer auto-submits abstain after 30 seconds
 */

import { useGame } from '../GameContext';

export default function VotingPhase() {
    const { 
        room,
        player,
        descriptions,
        submitVote,
        hasVoted,
        voteProgress,
        timer,
        error,
        clearError 
    } = useGame();

    const handleVote = async (targetPlayerId) => {
        clearError();
        try {
            await submitVote(targetPlayerId);
        } catch (err) {
            console.error('Failed to submit vote:', err);
        }
    };

    if (!room) return null;

    return (
        <div className="page voting-phase">
            <h2>Voting Phase</h2>
            
            {timer.phase === 'voting' && timer.remainingSeconds > 0 && (
                <div className={`timer ${timer.remainingSeconds <= 10 ? 'timer-warning' : ''}`}>
                    ⏱️ {timer.remainingSeconds}s
                </div>
            )}
            
            {error && (
                <div className="error">{error}</div>
            )}
            
            <div className="descriptions-list">
                <h3>Descriptions (Anonymous)</h3>
                <ul>
                    {descriptions.map((d, index) => (
                        <li key={index}>"{d.description}"</li>
                    ))}
                </ul>
            </div>
            
            {!hasVoted ? (
                <div className="voting-section">
                    <h3>Who is the imposter?</h3>
                    <div className="vote-buttons">
                        {room.players.map((p) => (
                            <button
                                key={p.id}
                                onClick={() => handleVote(p.id)}
                                disabled={p.id === player.id}
                                className={p.id === player.id ? 'disabled' : ''}
                            >
                                {p.name}
                                {p.id === player.id && ' (You)'}
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="voted-message">
                    <p>✅ Vote submitted!</p>
                    <p>Waiting for other players...</p>
                </div>
            )}
            
            <div className="progress">
                Voted: {voteProgress.count} / {voteProgress.total}
            </div>
        </div>
    );
}
