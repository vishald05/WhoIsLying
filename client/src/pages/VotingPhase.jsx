/**
 * Voting Phase Page (V1.2 Desktop Layout)
 * 
 * Players vote for who they think is the imposter.
 * 
 * V1.2 LAYOUT STRATEGY:
 * - Mobile (<1024px): Vertical stacked layout (unchanged from V1.1)
 * - Desktop (≥1024px): Three-panel grid layout + bottom chat panel
 *   - Left panel: Player list for voting
 *   - Center panel: Descriptions and voting confirmation
 *   - Right panel: Timer, progress, instructions
 *   - Bottom panel: Chat section
 * 
 * V1.1 Features retained:
 * - Two-step voting: Select → Confirm
 * - 60 second timer
 * - Shows descriptions with player names (attributed)
 * - Cannot vote for yourself
 * - Early end when all players confirm
 * - Real-time chat for discussion
 */

import { useState, useRef, useEffect } from 'react';
import { useGame } from '../GameContext';
import Avatar from '../components/Avatar';

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
        clearError,
        // V1.3: Revote state
        votingRound,
        allowedVoteTargets
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
    
    // V1.3: Check if a player is a valid vote target during revotes
    const isValidTarget = (playerId) => {
        if (playerId === player.id) return false; // Can't vote for yourself
        if (!allowedVoteTargets) return true; // No restrictions = all players valid
        return allowedVoteTargets.some(t => t.id === playerId);
    };
    
    // V1.3: Check if we're in a revote round
    const isRevote = votingRound > 1;

    // Chat section component (reused in mobile and desktop layouts)
    const ChatSection = () => (
        <div className="chat-section">
            <h3>💬 Discussion</h3>
            <div className="chat-messages">
                {chatMessages.length === 0 ? (
                    <p className="chat-empty">No messages yet. Discuss who the imposter might be!</p>
                ) : (
                    chatMessages.map((msg) => (
                        <div 
                            key={msg.id} 
                            className={`chat-message-with-avatar ${msg.senderId === player?.id ? 'own' : ''}`}
                        >
                            <Avatar 
                                seed={msg.senderId || msg.senderName}
                                size={28}
                                className="avatar-sm"
                            />
                            <div className="chat-content">
                                <span className="chat-sender">{msg.senderName}:</span>
                                <span className="chat-text">{msg.text}</span>
                            </div>
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
    );

    return (
        <>
            {/* =================================================================
                LEFT PANEL - Players List for Voting (Desktop: left sidebar)
                ================================================================= */}
            <div className="game-panel-left">
                <h3>🗳️ {isRevote ? `Revote Round ${votingRound}` : 'Vote for Imposter'}</h3>
                
                {/* V1.3: Revote notice */}
                {isRevote && (
                    <div className="revote-notice">
                        ⚖️ There was a tie! Vote again among the tied players.
                    </div>
                )}
                
                <div className="vote-buttons">
                    {room.players.map((p) => {
                        const canVote = isValidTarget(p.id);
                        return (
                            <button
                                key={p.id}
                                onClick={() => canVote && handleSelect(p.id)}
                                disabled={!canVote || hasConfirmedVote}
                                className={`vote-button-with-avatar
                                    ${!canVote ? 'disabled' : ''}
                                    ${selectedVote === p.id ? 'selected' : ''}
                                    ${!canVote && p.id !== player.id ? 'not-in-revote' : ''}
                                `}
                            >
                                <Avatar 
                                    seed={p.id || p.name}
                                    size={32}
                                    className="avatar-sm"
                                />
                                <span className="player-name">
                                    {p.name}
                                    {p.id === player.id && ' (You)'}
                                </span>
                                {selectedVote === p.id && <span className="check-mark">✓</span>}
                            </button>
                        );
                    })}
                </div>
                
                {/* Confirm section - shown in left panel on desktop */}
                {selectedVote && !hasConfirmedVote && (
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
                    </div>
                )}
                
                {hasConfirmedVote && (
                    <div className="voted-message">
                        <p>✅ Vote confirmed!</p>
                        <p>Voted for: <strong>{selectedPlayer?.name}</strong></p>
                    </div>
                )}
            </div>

            {/* =================================================================
                CENTER PANEL - Main Content
                Descriptions and voting (mobile layout preserved within)
                ================================================================= */}
            <div className="game-panel-center">
                <div className="page voting-phase">
                    <h2>{isRevote ? `Revote Round ${votingRound}` : 'Voting Phase'}</h2>
                    
                    {/* V1.3: Revote notice for mobile */}
                    {isRevote && (
                        <div className="revote-notice mobile-only">
                            ⚖️ There was a tie! Vote again among the tied players.
                        </div>
                    )}
                    
                    {/* Timer - shown here on mobile */}
                    <div className="mobile-only">
                        {timer.phase === 'voting' && timer.remainingSeconds > 0 && (
                            <div className={`timer ${timer.remainingSeconds <= 10 ? 'timer-warning' : ''}`}>
                                ⏱️ {timer.remainingSeconds}s
                            </div>
                        )}
                    </div>
                    
                    {error && (
                        <div className="error">{error}</div>
                    )}
                    
                    {/* Descriptions with player attribution */}
                    <div className="descriptions-list">
                        <h3>What Everyone Said</h3>
                        <ul>
                            {descriptions.map((d, index) => (
                                <li key={index}>
                                    <Avatar 
                                        seed={d.playerId || d.playerName}
                                        size={28}
                                        className="avatar-sm"
                                    />
                                    <span className="description-content">
                                        <strong>{d.playerName}:</strong> "{d.description}"
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    
                    {/* Mobile-only: Full voting and chat section */}
                    <div className="mobile-only">
                        <div className="voting-chat-container">
                            {/* Voting section */}
                            <div className="voting-section-wrapper">
                                {!hasConfirmedVote ? (
                                    <div className="voting-section">
                                        <h3>Who is the imposter?</h3>
                                        
                                        {/* Player selection buttons */}
                                        <div className="vote-buttons">
                                            {room.players.map((p) => {
                                                const canVote = isValidTarget(p.id);
                                                return (
                                                    <button
                                                        key={p.id}
                                                        onClick={() => canVote && handleSelect(p.id)}
                                                        disabled={!canVote}
                                                        className={`vote-button-with-avatar
                                                            ${!canVote ? 'disabled' : ''}
                                                            ${selectedVote === p.id ? 'selected' : ''}
                                                            ${!canVote && p.id !== player.id ? 'not-in-revote' : ''}
                                                        `}
                                                    >
                                                        <Avatar 
                                                            seed={p.id || p.name}
                                                            size={32}
                                                            className="avatar-sm"
                                                        />
                                                        <span className="player-name">
                                                            {p.name}
                                                            {p.id === player.id && ' (You)'}
                                                        </span>
                                                        {selectedVote === p.id && <span className="check-mark">✓</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        
                                        {/* Confirm button */}
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
                            
                            {/* Chat section - mobile */}
                            <ChatSection />
                        </div>
                    </div>
                </div>
            </div>

            {/* =================================================================
                RIGHT PANEL - Timer & Progress (Desktop only)
                ================================================================= */}
            <div className="game-panel-right desktop-only">
                <h3>⏱️ Time Remaining</h3>
                {timer.phase === 'voting' && timer.remainingSeconds > 0 ? (
                    <div className={`timer ${timer.remainingSeconds <= 10 ? 'timer-warning' : ''}`}>
                        {timer.remainingSeconds}s
                    </div>
                ) : (
                    <div className="timer">--</div>
                )}
                
                <div className="progress-section">
                    <h3>📊 Voting Progress</h3>
                    {isRevote && (
                        <p className="voting-round-indicator">Round {votingRound} of 3</p>
                    )}
                    <div className="progress">
                        Confirmed: {confirmProgress.count} / {confirmProgress.total}
                    </div>
                    <p className="confirm-hint">
                        {confirmProgress.count === confirmProgress.total 
                            ? 'All votes in!' 
                            : 'Waiting for all players to confirm...'}
                    </p>
                </div>
                
                <div className="phase-info">
                    <h3>📝 Instructions</h3>
                    <div className="info-box">
                        {isRevote ? (
                            <>
                                <p>⚖️ <strong>Tie breaker!</strong></p>
                                <p>Only vote for tied players</p>
                                <p>Max 3 rounds before random elimination</p>
                            </>
                        ) : (
                            <>
                                <p>1. Read the descriptions carefully</p>
                                <p>2. Discuss in chat who seems suspicious</p>
                                <p>3. Select and confirm your vote</p>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* =================================================================
                BOTTOM PANEL - Chat Section (Desktop only, full width)
                ================================================================= */}
            <div className="game-panel-bottom desktop-only">
                <ChatSection />
            </div>
        </>
    );
}
