/**
 * Results Page
 * 
 * Shows the final game results.
 * - Who was voted out
 * - Who the imposter actually was
 * - Win/lose message
 * - Vote summary
 * - Secret word reveal
 */

import { useGame } from '../GameContext';

export default function Results() {
    const { results, player } = useGame();

    if (!results) {
        return (
            <div className="page results">
                <h2>Calculating Results...</h2>
            </div>
        );
    }

    const { votedOutPlayer, imposter, playersWin, voteSummary, secretWord } = results;
    
    // Determine if the current player won
    const isCurrentPlayerImposter = player.id === imposter.id;
    const didIWin = isCurrentPlayerImposter ? !playersWin : playersWin;

    return (
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
            
            <p className="restart-hint">
                Refresh the page to play again!
            </p>
        </div>
    );
}
