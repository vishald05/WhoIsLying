/**
 * Results Page (V1.2 Desktop Layout)
 * 
 * Shows the final game results.
 * 
 * V1.2 LAYOUT STRATEGY:
 * - Mobile (<1024px): Vertical stacked layout (unchanged)
 * - Desktop (≥1024px): Three-panel grid layout
 *   - Left panel: Vote summary
 *   - Center panel: Result banner, winner announcement
 *   - Right panel: Game details (imposter, secret word)
 * 
 * Features:
 * - Who was voted out
 * - Who the imposter actually was
 * - Win/lose message
 * - Vote summary
 * - Secret word reveal
 * - Auto-transitions to postGame after 5 seconds
 */

import { useGame } from '../GameContext';

export default function Results() {
    const { results, player } = useGame();

    if (!results) {
        return (
            <div className="game-panel-center">
                <div className="page results">
                    <h2>Calculating Results...</h2>
                </div>
            </div>
        );
    }

    const { votedOutPlayer, imposter, playersWin, voteSummary, secretWord } = results;
    
    // Determine if the current player won
    const isCurrentPlayerImposter = player.id === imposter.id;
    const didIWin = isCurrentPlayerImposter ? !playersWin : playersWin;

    return (
        <>
            {/* =================================================================
                LEFT PANEL - Vote Summary (Desktop: left sidebar)
                ================================================================= */}
            <div className="game-panel-left">
                <div className="vote-summary">
                    <h3>🗳️ Vote Summary</h3>
                    <ul>
                        {voteSummary.map((entry) => (
                            <li key={entry.playerId}>
                                {entry.playerName}: {entry.votes} vote{entry.votes !== 1 ? 's' : ''}
                                {entry.playerId === imposter.id && <span className="imposter-tag"> 🎭</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* =================================================================
                CENTER PANEL - Main Results
                ================================================================= */}
            <div className="game-panel-center">
                <div className="page results">
                    <h2>Game Over!</h2>
                    
                    <div className={`result-banner ${playersWin ? 'players-win' : 'imposter-wins'}`}>
                        {playersWin ? (
                            <h3>🎉 Players Win!</h3>
                        ) : (
                            <h3>🎭 Imposter Wins!</h3>
                        )}
                    </div>
                    
                    <div className="personal-result">
                        {didIWin ? (
                            <p className="win">🏆 You won!</p>
                        ) : (
                            <p className="lose">😔 You lost!</p>
                        )}
                    </div>
                    
                    {/* Mobile-only: Vote summary and details */}
                    <div className="mobile-only">
                        <div className="result-details">
                            <div className="detail-item">
                                <span>Voted Out:</span>
                                <strong>{votedOutPlayer.name}</strong>
                            </div>
                            
                            <div className="detail-item">
                                <span>The Imposter Was:</span>
                                <strong>{imposter.name}</strong>
                            </div>
                            
                            <div className="detail-item">
                                <span>Secret Word:</span>
                                <strong>{secretWord}</strong>
                            </div>
                        </div>
                        
                        <div className="vote-summary">
                            <h3>Vote Summary</h3>
                            <ul>
                                {voteSummary.map((entry) => (
                                    <li key={entry.playerId}>
                                        {entry.playerName}: {entry.votes} vote{entry.votes !== 1 ? 's' : ''}
                                        {entry.playerId === imposter.id && <span className="imposter-tag"> 🎭</span>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    
                    <p className="transition-hint">
                        Moving to lobby in a few seconds...
                    </p>
                </div>
            </div>

            {/* =================================================================
                RIGHT PANEL - Game Details (Desktop only)
                ================================================================= */}
            <div className="game-panel-right desktop-only">
                <h3>📋 Game Details</h3>
                <div className="result-details">
                    <div className="detail-item">
                        <span>Voted Out:</span>
                        <strong>{votedOutPlayer.name}</strong>
                    </div>
                    
                    <div className="detail-item">
                        <span>The Imposter:</span>
                        <strong>{imposter.name}</strong>
                    </div>
                    
                    <div className="detail-item">
                        <span>Secret Word:</span>
                        <strong>{secretWord}</strong>
                    </div>
                </div>
                
                <div className="phase-info">
                    <h3>🎮 What Happened</h3>
                    <div className="info-box">
                        {playersWin ? (
                            <p>The players correctly identified <strong>{imposter.name}</strong> as the imposter!</p>
                        ) : (
                            <p><strong>{imposter.name}</strong> fooled everyone and wasn't caught!</p>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
