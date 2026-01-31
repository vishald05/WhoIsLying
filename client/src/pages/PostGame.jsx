/**
 * Post Game Page (V1.2 Desktop Layout)
 * 
 * Shown after results phase. Room stays open for replaying.
 * 
 * V1.2 LAYOUT STRATEGY:
 * - Mobile (<1024px): Vertical stacked layout (unchanged)
 * - Desktop (≥1024px): Three-panel grid layout
 *   - Left panel: Player list
 *   - Center panel: Last game summary, room code
 *   - Right panel: Host controls, invite info
 * 
 * Features:
 * - Shows last game results summary
 * - Play Again button for host
 * - Player list with current players
 * - Host transfer info if host left
 */

import { useGame } from '../GameContext';
import Avatar from '../components/Avatar';

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
        <>
            {/* =================================================================
                LEFT PANEL - Player List (Desktop: left sidebar)
                ================================================================= */}
            <div className="game-panel-left">
                <div className="player-list">
                    <h3>👥 Players ({room.playerCount})</h3>
                    <ul>
                        {room.players.map((p) => (
                            <li key={p.id} className={p.id === player?.id ? 'you' : ''}>
                                <Avatar 
                                    seed={p.id || p.name}
                                    size={40}
                                    className="avatar-md"
                                />
                                <span className="player-info">
                                    {p.name}
                                    {p.id === room.hostId && <span className="host-badge">👑 Host</span>}
                                    {p.id === player?.id && <span className="you-badge">(You)</span>}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* =================================================================
                CENTER PANEL - Game Summary & Room Code
                ================================================================= */}
            <div className="game-panel-center">
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
                    
                    {/* Game number badge */}
                    {room.gameNumber > 0 && (
                        <div className="game-count">
                            Games played: {room.gameNumber}
                        </div>
                    )}
                    
                    {/* Mobile-only: Player list and controls */}
                    <div className="mobile-only">
                        {/* Player list */}
                        <div className="player-list">
                            <h3>Players ({room.playerCount})</h3>
                            <ul>
                                {room.players.map((p) => (
                                    <li key={p.id} className={p.id === player?.id ? 'you' : ''}>
                                        <Avatar 
                                            seed={p.id || p.name}
                                            size={36}
                                            className="avatar-sm"
                                        />
                                        <span className="player-info">
                                            {p.name}
                                            {p.id === room.hostId && <span className="host-badge">👑 Host</span>}
                                            {p.id === player?.id && <span className="you-badge">(You)</span>}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        
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
                </div>
            </div>

            {/* =================================================================
                RIGHT PANEL - Host Controls & Invite (Desktop only)
                ================================================================= */}
            <div className="game-panel-right desktop-only">
                <h3>🎮 Next Game</h3>
                
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
                
                <div className="phase-info">
                    <h3>📤 Invite Friends</h3>
                    <div className="info-box">
                        <p>Share this room code:</p>
                        <p className="room-code-highlight"><strong>{room.code}</strong></p>
                    </div>
                </div>
                
                {room.gameNumber > 0 && (
                    <div className="stats-section">
                        <h3>📊 Session Stats</h3>
                        <div className="game-count">
                            Games played: {room.gameNumber}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
