/**
 * Lobby Page
 * 
 * Waiting room before game starts.
 * - Shows room code for sharing
 * - Lists all players (highlights host)
 * - Host can start the game
 */

import { useGame } from '../GameContext';

export default function Lobby() {
    const { room, player, isHost, startGame, error, clearError } = useGame();

    const handleStartGame = async () => {
        clearError();
        try {
            await startGame();
        } catch (err) {
            console.error('Failed to start game:', err);
        }
    };

    if (!room) return null;

    const minPlayers = 4;
    const canStart = room.players.length >= minPlayers;

    return (
        <div className="page lobby">
            <h2>Lobby</h2>
            
            <div className="room-code">
                <span>Room Code:</span>
                <strong>{room.code}</strong>
            </div>
            
            {error && (
                <div className="error">{error}</div>
            )}
            
            <div className="player-list">
                <h3>Players ({room.players.length})</h3>
                <ul>
                    {room.players.map((p) => (
                        <li key={p.id} className={p.id === player.id ? 'you' : ''}>
                            {p.name}
                            {p.id === room.hostId && <span className="host-badge">👑 Host</span>}
                            {p.id === player.id && <span className="you-badge">(You)</span>}
                        </li>
                    ))}
                </ul>
            </div>
            
            {isHost ? (
                <div className="host-controls">
                    {!canStart && (
                        <p className="waiting-message">
                            Need at least {minPlayers} players to start 
                            ({minPlayers - room.players.length} more needed)
                        </p>
                    )}
                    <button 
                        onClick={handleStartGame}
                        disabled={!canStart}
                        className="primary"
                    >
                        Start Game
                    </button>
                </div>
            ) : (
                <p className="waiting-message">
                    Waiting for host to start the game...
                </p>
            )}
        </div>
    );
}
