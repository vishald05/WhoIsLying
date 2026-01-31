/**
 * Description Phase Page (V1.2 Desktop Layout + Avatars)
 * 
 * Turn-based description phase where players speak one at a time.
 * 
 * V1.2 LAYOUT STRATEGY:
 * - Mobile (<1024px): Vertical stacked layout (unchanged)
 * - Desktop (≥1024px): Three-panel grid layout
 *   - Left panel: Speaking order / player status
 *   - Center panel: Word reminder, description input, live descriptions
 *   - Right panel: Timer, phase instructions, progress
 * 
 * V1.2 AVATARS:
 * - Speaking order shows avatars with speaking state
 * - Live descriptions include player avatars
 * 
 * IMPLEMENTATION:
 * - Uses CSS classes (game-panel-left/center/right) for positioning
 * - Mobile-only / desktop-only classes handle visibility
 * - No conditional rendering based on device
 */

import { useState, useEffect } from 'react';
import { useGame } from '../GameContext';
import Avatar from '../components/Avatar';

export default function DescriptionPhase() {
    const { 
        player,
        topic,
        isImposter,
        secretWord,
        submitDescription,
        hasSubmittedDescription,
        submissionProgress,
        speakingOrder,
        currentSpeaker,
        liveDescriptions,
        timer,
        error,
        clearError 
    } = useGame();
    
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Check if current player is the active speaker
    const isMyTurn = currentSpeaker && player && currentSpeaker.id === player.id;
    
    // Check if player has already spoken
    const hasSpoken = liveDescriptions.some(d => d.playerId === player?.id);

    // Reset description input when it becomes the player's turn
    useEffect(() => {
        if (isMyTurn) {
            setDescription('');
        }
    }, [isMyTurn]);

    const handleSubmit = async () => {
        if (!isMyTurn) return;
        
        setSubmitting(true);
        clearError();
        
        try {
            await submitDescription(description.trim());
        } catch (err) {
            console.error('Failed to submit description:', err);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            {/* =================================================================
                LEFT PANEL - Speaking Order (Desktop: left sidebar)
                On mobile: appears in normal flow after center panel styles kick in
                ================================================================= */}
            <div className="game-panel-left">
                <div className="speaking-order">
                    <h3>Speaking Order</h3>
                    <div className="order-list">
                        {speakingOrder.map((speaker, index) => {
                            const hasSpokenAlready = liveDescriptions.some(d => d.playerId === speaker.id);
                            const isCurrent = currentSpeaker && speaker.id === currentSpeaker.id;
                            const isMe = player && speaker.id === player.id;
                            
                            return (
                                <div 
                                    key={speaker.id}
                                    className={`speaker-item ${isCurrent ? 'current' : ''} ${hasSpokenAlready ? 'done' : ''} ${isMe ? 'is-me' : ''}`}
                                >
                                    <Avatar 
                                        seed={speaker.id || speaker.name}
                                        size={32}
                                        className="avatar-sm"
                                        speaking={isCurrent && !hasSpokenAlready}
                                    />
                                    <span className="speaker-number">{index + 1}.</span>
                                    <span className="speaker-name">
                                        {speaker.name}
                                        {isMe && ' (You)'}
                                    </span>
                                    {hasSpokenAlready && <span className="check">✓</span>}
                                    {isCurrent && !hasSpokenAlready && <span className="speaking">🎤</span>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* =================================================================
                CENTER PANEL - Main Game Content
                Word reminder, description input, live descriptions feed
                ================================================================= */}
            <div className="game-panel-center">
                <div className="page description-phase">
                    <h2>Description Phase</h2>
                    
                    {/* Timer - shown here on mobile, hidden on desktop (shown in right panel) */}
                    <div className="mobile-only">
                        {timer.phase === 'descriptionTurn' && timer.remainingSeconds > 0 && (
                            <div className={`timer ${timer.remainingSeconds <= 3 ? 'timer-warning' : ''}`}>
                                ⏱️ {timer.remainingSeconds}s
                            </div>
                        )}
                    </div>
                    
                    {error && (
                        <div className="error">{error}</div>
                    )}
                    
                    {/* Topic and word reminder */}
                    <div className="topic-display">
                        <span>Topic:</span>
                        <strong>{topic}</strong>
                    </div>
                    
                    {!isImposter && (
                        <div className="word-reminder">
                            Secret word: <strong>{secretWord}</strong>
                        </div>
                    )}
                    
                    {isImposter && (
                        <div className="imposter-reminder">
                            🎭 You are the imposter - guess the word!
                        </div>
                    )}
                    
                    {/* Speaking order - shown here on mobile only */}
                    <div className="mobile-only">
                        <div className="speaking-order">
                            <h3>Speaking Order</h3>
                            <div className="order-list">
                                {speakingOrder.map((speaker, index) => {
                                    const hasSpokenAlready = liveDescriptions.some(d => d.playerId === speaker.id);
                                    const isCurrent = currentSpeaker && speaker.id === currentSpeaker.id;
                                    const isMe = player && speaker.id === player.id;
                                    
                                    return (
                                        <div 
                                            key={speaker.id}
                                            className={`speaker-item ${isCurrent ? 'current' : ''} ${hasSpokenAlready ? 'done' : ''} ${isMe ? 'is-me' : ''}`}
                                        >
                                            <Avatar 
                                                seed={speaker.id || speaker.name}
                                                size={28}
                                                className="avatar-sm"
                                                speaking={isCurrent && !hasSpokenAlready}
                                            />
                                            <span className="speaker-number">{index + 1}.</span>
                                            <span className="speaker-name">
                                                {speaker.name}
                                                {isMe && ' (You)'}
                                            </span>
                                            {hasSpokenAlready && <span className="check">✓</span>}
                                            {isCurrent && !hasSpokenAlready && <span className="speaking">🎤</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    
                    {/* Current speaker callout */}
                    {currentSpeaker && (
                        <div className={`current-speaker-banner ${isMyTurn ? 'your-turn' : ''}`}>
                            {isMyTurn ? (
                                <strong>🎤 Your turn to speak!</strong>
                            ) : (
                                <span>Waiting for <strong>{currentSpeaker.name}</strong> to speak...</span>
                            )}
                        </div>
                    )}
                    
                    {/* Input form - only visible for current speaker */}
                    {isMyTurn && !hasSpoken && (
                        <div className="description-form">
                            <div className="form-group">
                                <label>Your Description</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Describe the word without saying it..."
                                    rows={3}
                                    maxLength={200}
                                    disabled={submitting}
                                    autoFocus
                                />
                            </div>
                            
                            <button 
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="primary"
                            >
                                {submitting ? 'Submitting...' : 'Submit Description'}
                            </button>
                            <p className="hint">Leave empty to skip (will submit "No response")</p>
                        </div>
                    )}
                    
                    {/* Waiting message for non-current players */}
                    {!isMyTurn && !hasSpoken && (
                        <div className="waiting-message">
                            <p>👀 Watch the descriptions and prepare yours!</p>
                        </div>
                    )}
                    
                    {/* Already spoken message */}
                    {hasSpoken && (
                        <div className="submitted-message">
                            <p>✅ You have spoken!</p>
                            <p>Waiting for other players...</p>
                        </div>
                    )}
                    
                    {/* Live descriptions feed */}
                    {liveDescriptions.length > 0 && (
                        <div className="live-descriptions">
                            <h3>Descriptions So Far</h3>
                            <ul>
                                {liveDescriptions.map((d, index) => (
                                    <li key={index} className={d.isAutoSubmit ? 'auto-submit' : ''}>
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
                    )}
                    
                    {/* Progress - shown here on mobile */}
                    <div className="mobile-only">
                        <div className="progress">
                            Completed: {submissionProgress.count} / {submissionProgress.total}
                        </div>
                    </div>
                </div>
            </div>

            {/* =================================================================
                RIGHT PANEL - Phase Info & Timer (Desktop only)
                Timer, phase instructions, progress indicator
                ================================================================= */}
            <div className="game-panel-right desktop-only">
                <h3>⏱️ Turn Timer</h3>
                {timer.phase === 'descriptionTurn' && timer.remainingSeconds > 0 ? (
                    <div className={`timer ${timer.remainingSeconds <= 3 ? 'timer-warning' : ''}`}>
                        {timer.remainingSeconds}s
                    </div>
                ) : (
                    <div className="timer">--</div>
                )}
                
                <div className="phase-info">
                    <h3>📝 Instructions</h3>
                    <div className="info-box">
                        <p>Each player takes a turn describing the secret word.</p>
                        {isImposter ? (
                            <p><strong>You're the imposter!</strong> Try to blend in!</p>
                        ) : (
                            <p>Describe the word without saying it directly.</p>
                        )}
                    </div>
                </div>
                
                <div className="progress-section">
                    <h3>📊 Progress</h3>
                    <div className="progress">
                        Completed: {submissionProgress.count} / {submissionProgress.total}
                    </div>
                </div>
            </div>
        </>
    );
}
