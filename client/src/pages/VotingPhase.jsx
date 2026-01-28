/**
 * Voting Phase Page (V1.1)
 * 
 * Players vote for who they think is the imposter.
 * V1.1 Changes:
 * - Two-step voting: Select → Confirm
 * - 60 second timer
 * - Shows descriptions with player names (attributed)
 * - Cannot vote for yourself
 * - Early end when all players confirm
 * - Real-time chat for discussion
 */

import { useState, useRef, useEffect } from 'react';
import { useGame } from '../GameContext';

export default function VotingPhase() {
    const { 
        room,
        player,
        descriptions,
        selectVote,
        confirmVote,
        selectedVote,
        hasConfirmedVote,
        confirmProgress,
        chatMessages,
        sendChatMessage,
        timer,
        error,
        clearError 
    } = useGame();

    const [chatInput, setChatInput] = useState('');
    const [chatError, setChatError] = useState(null);
    const chatEndRef = useRef(null);

    // Auto-scroll chat to bottom
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    const handleSelect = async (targetPlayerId) => {
        if (hasConfirmedVote) return; // Can't change after confirming
        clearError();
        try {
            await selectVote(targetPlayerId);
        } catch (err) {
            console.error('Failed to select vote:', err);
        }
    };

    const handleConfirm = async () => {
        if (!selectedVote || hasConfirmedVote) return;
        clearError();
        try {
            await confirmVote();
        } catch (err) {
            console.error('Failed to confirm vote:', err);
        }
    };

    const handleSendChat = async (e) => {
        e.preventDefault();
        if (!chatInput.trim()) return;
        
        setChatError(null);
        try {
            await sendChatMessage(chatInput.trim());
            setChatInput('');
        } catch (err) {
            if (err === 'RATE_LIMITED') {
                setChatError('Slow down! Too many messages.');
            } else {
                setChatError('Failed to send message');
            }
            setTimeout(() => setChatError(null), 3000);
        }
    };

    if (!room) return null;

    // Get the selected player's name for display
    const selectedPlayer = selectedVote 
        ? room.players.find(p => p.id === selectedVote) 
        : null;

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
            
            {/* V1.1: Descriptions with player attribution */}
            <div className="descriptions-list">
                <h3>What Everyone Said</h3>
                <ul>
                    {descriptions.map((d, index) => (
                        <li key={index}>
                            <strong>{d.playerName}:</strong> "{d.description}"
                        </li>
                    ))}
                </ul>
            </div>
            
            <div className="voting-chat-container">
                {/* Voting section */}
                <div className="voting-section-wrapper">
                    {!hasConfirmedVote ? (
                        <div className="voting-section">
                            <h3>Who is the imposter?</h3>
                            
                            {/* Player selection buttons */}
                            <div className="vote-buttons">
                                {room.players.map((p) => (
                                    <button
                                        key={p.id}
                                        onClick={() => handleSelect(p.id)}
                                        disabled={p.id === player.id}
                                        className={`
                                            ${p.id === player.id ? 'disabled' : ''}
                                            ${selectedVote === p.id ? 'selected' : ''}
                                        `}
                                    >
                                        {p.name}
                                        {p.id === player.id && ' (You)'}
                                        {selectedVote === p.id && ' ✓'}
                                    </button>
                                ))}
                            </div>
                            
                            {/* V1.1: Confirm button */}
                            {selectedVote && (
                                <div className="confirm-section">
                                    <p className="selection-preview">
                                        Selected: <strong>{selectedPlayer?.name}</strong>
                                    </p>
                                    <button 
                                        onClick={handleConfirm}
                                        className="primary confirm-btn"
                                    >
                                        🔒 Confirm Vote
                                    </button>
                                    <p className="confirm-hint">
                                        You can change your selection until you confirm
                                    </p>
                                </div>
                            )}
                            
                            {!selectedVote && (
                                <p className="selection-hint">
                                    Select a player to vote for
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="voted-message">
                            <p>✅ Vote confirmed for {selectedPlayer?.name}!</p>
                            <p>Waiting for other players...</p>
                        </div>
                    )}
                    
                    <div className="progress">
                        Confirmed: {confirmProgress.count} / {confirmProgress.total}
                    </div>
                </div>
                
                {/* V1.1: Chat section */}
                <div className="chat-section">
                    <h3>💬 Discussion</h3>
                    <div className="chat-messages">
                        {chatMessages.length === 0 ? (
                            <p className="chat-empty">No messages yet. Discuss who the imposter might be!</p>
                        ) : (
                            chatMessages.map((msg) => (
                                <div 
                                    key={msg.id} 
                                    className={`chat-message ${msg.senderId === player?.id ? 'own' : ''}`}
                                >
                                    <span className="chat-sender">{msg.senderName}:</span>
                                    <span className="chat-text">{msg.text}</span>
                                </div>
                            ))
                        )}
                        <div ref={chatEndRef} />
                    </div>
                    
                    <form onSubmit={handleSendChat} className="chat-input-form">
                        <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="Type a message..."
                            maxLength={200}
                        />
                        <button type="submit" disabled={!chatInput.trim()}>
                            Send
                        </button>
                    </form>
                    {chatError && <p className="chat-error">{chatError}</p>}
                </div>
            </div>
        </div>
    );
}
