/**
 * Lobby Page (V1.2)
 * 
 * Waiting room before game starts.
 * - Shows room code for sharing
 * - Lists all players with avatars (highlights host)
 * - Host can start the game
 * - Host can configure game settings
 * 
 * V1.2: Added DiceBear avatars to player list
 * V1.2: Added host-configurable game timers
 */

import { useState, useEffect } from 'react';
import { useGame } from '../GameContext';
import Avatar from '../components/Avatar';

export default function Lobby() {
    const { 
        room, 
        player, 
        isHost, 
        roomSettings, 
        startGame, 
        updateSettings, 
        error, 
        clearError 
    } = useGame();
    
    // V1.2: Local form state for settings
    const [descriptionTime, setDescriptionTime] = useState(roomSettings?.descriptionTime || 10);
    const [votingTime, setVotingTime] = useState(roomSettings?.votingTime || 60);
    const [settingsChanged, setSettingsChanged] = useState(false);
    const [settingsError, setSettingsError] = useState(null);
    
    // Sync local state when roomSettings changes (e.g., from another host)
    useEffect(() => {
        if (roomSettings) {
            setDescriptionTime(roomSettings.descriptionTime);
            setVotingTime(roomSettings.votingTime);
            setSettingsChanged(false);
        }
    }, [roomSettings]);

    const handleStartGame = async () => {
        clearError();
        try {
            await startGame();
        } catch (err) {
            console.error('Failed to start game:', err);
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
                            <Avatar 
                                seed={p.id || p.name} 
                                size={40}
                                className="avatar-md"
                            />
                            <span className="player-info">
                                {p.name}
                                {p.id === room.hostId && <span className="host-badge">👑 Host</span>}
                                {p.id === player.id && <span className="you-badge">(You)</span>}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
            
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
                                <label htmlFor="descriptionTime">Description Time (per speaker)</label>
                                <div className="setting-input-group">
                                    <input
                                        type="number"
                                        id="descriptionTime"
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
