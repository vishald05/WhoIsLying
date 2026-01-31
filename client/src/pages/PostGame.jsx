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
 *   - Right panel: Host controls, settings, invite info
 * 
 * Features:
 * - Shows last game results summary
 * - Play Again button for host
 * - Player list with current players
 * - Host-configurable game settings
 * - Host transfer info if host left
 */

import { useState, useEffect } from 'react';
import { useGame } from '../GameContext';
import Avatar from '../components/Avatar';

export default function PostGame() {
    const { 
        room,
        player,
        isHost,
        results,
        roomSettings,
        hostEndedGame,
        playAgain,
        updateSettings,
        error,
        clearError
    } = useGame();
    
    // V1.2: Local form state for settings
    const [descriptionTime, setDescriptionTime] = useState(roomSettings?.descriptionTime || 10);
    const [votingTime, setVotingTime] = useState(roomSettings?.votingTime || 60);
    const [settingsChanged, setSettingsChanged] = useState(false);
    const [settingsError, setSettingsError] = useState(null);
    
    // Sync local state when roomSettings changes
    useEffect(() => {
        if (roomSettings) {
            setDescriptionTime(roomSettings.descriptionTime);
            setVotingTime(roomSettings.votingTime);
            setSettingsChanged(false);
        }
    }, [roomSettings]);

    const handlePlayAgain = async () => {
        clearError();
        try {
            await playAgain();
        } catch (err) {
            console.error('Failed to start new game:', err);
        }
    };
    
    // V1.2: Handle settings input changes
    const handleDescriptionTimeChange = (e) => {
        const value = parseInt(e.target.value, 10) || 5;
        setDescriptionTime(Math.min(60, Math.max(5, value)));
        setSettingsChanged(true);
        setSettingsError(null);
    };
    
    const handleVotingTimeChange = (e) => {
        const value = parseInt(e.target.value, 10) || 15;
        setVotingTime(Math.min(180, Math.max(15, value)));
        setSettingsChanged(true);
        setSettingsError(null);
    };
    
    // V1.2: Apply settings
    const handleApplySettings = async () => {
        setSettingsError(null);
        try {
            await updateSettings({ descriptionTime, votingTime });
            setSettingsChanged(false);
        } catch (err) {
            setSettingsError('Failed to update settings');
            console.error('Settings update failed:', err);
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
                    <h2>{hostEndedGame ? '🛑 Game Ended by Host' : '🎮 Game Complete!'}</h2>
                    
                    {error && (
                        <div className="error">{error}</div>
                    )}
                    
                    {/* Host ended game - special display */}
                    {hostEndedGame && results && (
                        <div className="last-game-summary host-ended">
                            <div className="result-mini host-ended-badge">
                                Game was ended early
                            </div>
                            <div className="summary-details">
                                <p>The Imposter was:</p>
                                <div className="imposter-reveal-mini">
                                    <Avatar 
                                        seed={results.imposter?.id || results.imposter?.name}
                                        size={60}
                                        className="avatar-lg"
                                    />
                                    <strong>{results.imposter?.name}</strong>
                                </div>
                                <p>Secret Word: <strong>{results.secretWord}</strong></p>
                            </div>
                        </div>
                    )}
                    
                    {/* Normal game complete - last game summary */}
                    {!hostEndedGame && results && (
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
                        
                        {/* V1.2: Game Settings (mobile) */}
                        <div className="settings-panel">
                            <h3>⚙️ Game Settings</h3>
                            
                            {isHost ? (
                                <>
                                    {settingsError && (
                                        <div className="settings-error">{settingsError}</div>
                                    )}
                                    
                                    <div className="settings-form">
                                        <div className="setting-row">
                                            <label htmlFor="descriptionTime-mobile">Description Time</label>
                                            <div className="setting-input-group">
                                                <input
                                                    type="number"
                                                    id="descriptionTime-mobile"
                                                    value={descriptionTime}
                                                    onChange={handleDescriptionTimeChange}
                                                    min={5}
                                                    max={60}
                                                />
                                                <span className="setting-unit">seconds</span>
                                            </div>
                                            <span className="setting-hint">5–60 seconds</span>
                                        </div>
                                        
                                        <div className="setting-row">
                                            <label htmlFor="votingTime-mobile">Voting Time</label>
                                            <div className="setting-input-group">
                                                <input
                                                    type="number"
                                                    id="votingTime-mobile"
                                                    value={votingTime}
                                                    onChange={handleVotingTimeChange}
                                                    min={15}
                                                    max={180}
                                                />
                                                <span className="setting-unit">seconds</span>
                                            </div>
                                            <span className="setting-hint">15–180 seconds</span>
                                        </div>
                                        
                                        <button 
                                            onClick={handleApplySettings}
                                            disabled={!settingsChanged}
                                            className="secondary apply-settings-btn"
                                        >
                                            Apply Settings
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="settings-readonly">
                                    <div className="setting-display">
                                        <span className="setting-label">Description Time:</span>
                                        <span className="setting-value">{roomSettings?.descriptionTime || 10}s</span>
                                    </div>
                                    <div className="setting-display">
                                        <span className="setting-label">Voting Time:</span>
                                        <span className="setting-value">{roomSettings?.votingTime || 60}s</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        
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
                
                {/* V1.2: Game Settings Panel */}
                <div className="settings-panel">
                    <h3>⚙️ Game Settings</h3>
                    
                    {isHost ? (
                        <>
                            {settingsError && (
                                <div className="settings-error">{settingsError}</div>
                            )}
                            
                            <div className="settings-form">
                                <div className="setting-row">
                                    <label htmlFor="descriptionTime">Description Time</label>
                                    <div className="setting-input-group">
                                        <input
                                            type="number"
                                            id="descriptionTime"
                                            value={descriptionTime}
                                            onChange={handleDescriptionTimeChange}
                                            min={5}
                                            max={60}
                                        />
                                        <span className="setting-unit">s</span>
                                    </div>
                                </div>
                                
                                <div className="setting-row">
                                    <label htmlFor="votingTime">Voting Time</label>
                                    <div className="setting-input-group">
                                        <input
                                            type="number"
                                            id="votingTime"
                                            value={votingTime}
                                            onChange={handleVotingTimeChange}
                                            min={15}
                                            max={180}
                                        />
                                        <span className="setting-unit">s</span>
                                    </div>
                                </div>
                                
                                <button 
                                    onClick={handleApplySettings}
                                    disabled={!settingsChanged}
                                    className="secondary apply-settings-btn"
                                >
                                    Apply
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="settings-readonly">
                            <div className="setting-display">
                                <span className="setting-label">Description Time:</span>
                                <span className="setting-value">{roomSettings?.descriptionTime || 10}s</span>
                            </div>
                            <div className="setting-display">
                                <span className="setting-label">Voting Time:</span>
                                <span className="setting-value">{roomSettings?.votingTime || 60}s</span>
                            </div>
                        </div>
                    )}
                </div>
                
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
