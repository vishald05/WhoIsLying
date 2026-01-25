/**
 * Description Phase Page
 * 
 * Players submit their description of the secret word.
 * - Text input for description
 * - Shows submission progress
 * - Imposter must guess and blend in
 * - Timer auto-submits "(No response)" after 60 seconds
 */

import { useState } from 'react';
import { useGame } from '../GameContext';

export default function DescriptionPhase() {
    const { 
        topic,
        isImposter,
        secretWord,
        submitDescription,
        hasSubmittedDescription,
        submissionProgress,
        timer,
        error,
        clearError 
    } = useGame();
    
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!description.trim()) return;
        
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
            
            {timer.phase === 'description' && timer.remainingSeconds > 0 && (
                <div className={`timer ${timer.remainingSeconds <= 10 ? 'timer-warning' : ''}`}>
                    ⏱️ {timer.remainingSeconds}s
                </div>
            )}
            
            {error && (
                <div className="error">{error}</div>
            )}
            
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
            
            {!hasSubmittedDescription ? (
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
                        />
                    </div>
                    
                    <button 
                        onClick={handleSubmit}
                        disabled={!description.trim() || submitting}
                        className="primary"
                    >
                        {submitting ? 'Submitting...' : 'Submit Description'}
                    </button>
                </div>
            ) : (
                <div className="submitted-message">
                    <p>✅ Description submitted!</p>
                    <p>Waiting for other players...</p>
                </div>
            )}
            
            <div className="progress">
                Submitted: {submissionProgress.count} / {submissionProgress.total}
            </div>
        </div>
    );
}
