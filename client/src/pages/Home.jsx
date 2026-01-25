/**
 * Home Page
 * 
 * Entry point for players.
 * - Input player name
 * - Create new room OR join existing room
 */

import { useState } from 'react';
import { useGame } from '../GameContext';

export default function Home() {
    const { createRoom, joinRoom, error, clearError, isConnected } = useGame();
    
    const [playerName, setPlayerName] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [isJoining, setIsJoining] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleCreateRoom = async () => {
        if (!playerName.trim()) return;
        
        setLoading(true);
        clearError();
        
        try {
            await createRoom(playerName.trim());
        } catch (err) {
            console.error('Failed to create room:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleJoinRoom = async () => {
        if (!playerName.trim() || !roomCode.trim()) return;
        
        setLoading(true);
        clearError();
        
        try {
            await joinRoom(roomCode.trim().toUpperCase(), playerName.trim());
        } catch (err) {
            console.error('Failed to join room:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page home">
            <h1>🎭 Who Is Lying?</h1>
            
            {!isConnected && (
                <div className="error">
                    Connecting to server...
                </div>
            )}
            
            {error && (
                <div className="error">
                    {error}
                </div>
            )}
            
            <div className="form-group">
                <label>Your Name</label>
                <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Enter your name"
                    maxLength={20}
                    disabled={loading || !isConnected}
                />
            </div>
            
            {!isJoining ? (
                <div className="button-group">
                    <button 
                        onClick={handleCreateRoom}
                        disabled={!playerName.trim() || loading || !isConnected}
                        className="primary"
                    >
                        {loading ? 'Creating...' : 'Create Room'}
                    </button>
                    
                    <button 
                        onClick={() => setIsJoining(true)}
                        disabled={loading || !isConnected}
                    >
                        Join Room
                    </button>
                </div>
            ) : (
                <div className="join-section">
                    <div className="form-group">
                        <label>Room Code</label>
                        <input
                            type="text"
                            value={roomCode}
                            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                            placeholder="Enter 6-letter code"
                            maxLength={6}
                            disabled={loading}
                        />
                    </div>
                    
                    <div className="button-group">
                        <button 
                            onClick={handleJoinRoom}
                            disabled={!playerName.trim() || !roomCode.trim() || loading}
                            className="primary"
                        >
                            {loading ? 'Joining...' : 'Join'}
                        </button>
                        
                        <button onClick={() => setIsJoining(false)} disabled={loading}>
                            Back
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
