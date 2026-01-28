/**
 * Post Game Page (V1.1)
 * 
 * Shown after results phase. Room stays open for replaying.
 * - Shows last game results summary
 * - Play Again button for host
 * - Player list with current players
 * - Host transfer info if host left
 */

import { useGame } from '../GameContext';

export default function PostGame() {
    const { 
        room,
        player,
        isHost,
        results,
        playAgain,
        error,
        clearError
    } = useGame();

    const handlePlayAgain = async () => {
        clearError();
        try {
            await playAgain();
        } catch (err) {
            console.error('Failed to start new game:', err);
        }
    };

    if (!room) return null;

    const minPlayers = 4;
    const canStartGame = room.playerCount >= minPlayers;

    return (
        <div className="page post-game">
            <h2>🎮 Game Complete!</h2>
            
            {error && (
                <div className="error">{error}</div>
            )}
            
            {/* Last game summary */}
            {results && (
                <div className="last-game-summary">
                    <h3>Last Game Results</h3>
                    <div className={`result-mini ${results.playersWin ? 'players-win' : 'imposter-wins'}`}>
                        {results.playersWin ? '🎉 Players Won!' : '🎭 Imposter Won!'}
                    </div>
                    <div className="summary-details">
                        <p>Imposter: <strong>{results.imposter.name}</strong></p>
                        <p>Secret Word: <strong>{results.secretWord}</strong></p>
                    </div>
                </div>
            )}
            
            {/* Room code display */}
            <div className="room-code">
                <span>Room Code</span>
                <strong>{room.code}</strong>
            </div>
            
            {/* Player list */}
            <div className="player-list">
                <h3>Players ({room.playerCount})</h3>
                <ul>
                    {room.players.map((p) => (
                        <li key={p.id} className={p.id === player?.id ? 'you' : ''}>
                            <span>{p.name}</span>
                            {p.id === room.hostId && <span className="host-badge">👑 Host</span>}
                            {p.id === player?.id && <span className="you-badge">(You)</span>}
                        </li>
                    ))}
                </ul>
            </div>
            
            {/* Game number badge */}
            {room.gameNumber > 0 && (
                <div className="game-count">
                    Games played: {room.gameNumber}
                </div>
            )}
            
            {/* Host controls */}
            {isHost ? (
                <div className="host-controls">
                    <button 
                        onClick={handlePlayAgain}
                        className="primary play-again-btn"
                        disabled={!canStartGame}
                    >
                        🔄 Play Again
                    </button>
                    {!canStartGame && (
                        <p className="waiting-message">
                            Need {minPlayers - room.playerCount} more player{minPlayers - room.playerCount !== 1 ? 's' : ''} to start
                        </p>
                    )}
                </div>
            ) : (
                <div className="waiting-message">
                    <p>Waiting for host to start a new game...</p>
                </div>
            )}
            
            <p className="invite-hint">
                Invite friends with room code: <strong>{room.code}</strong>
            </p>
        </div>
    );
}
