/**
 * Description Phase Page (V1.1 Sequential Mode)
 * 
 * Turn-based description phase where players speak one at a time.
 * - Shows current speaker and turn order
 * - Only active speaker can submit
 * - Descriptions are shown with player names (not anonymous)
 * - Timer counts down 10 seconds per speaker
 */

import { useState, useEffect } from 'react';
import { useGame } from '../GameContext';

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
        <div className="page description-phase">
            <h2>Description Phase</h2>
            
            {/* Timer - shows per-turn countdown */}
            {timer.phase === 'descriptionTurn' && timer.remainingSeconds > 0 && (
                <div className={`timer ${timer.remainingSeconds <= 3 ? 'timer-warning' : ''}`}>
                    ⏱️ {timer.remainingSeconds}s
                </div>
            )}
            
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
            
            {/* Speaking order display */}
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
                                <strong>{d.playerName}:</strong> "{d.description}"
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            
            <div className="progress">
                Completed: {submissionProgress.count} / {submissionProgress.total}
            </div>
        </div>
    );
}
