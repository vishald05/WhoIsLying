/**
 * Main App Component (V1.2)
 * 
 * Renders the appropriate page based on the current game phase.
 * Phase changes are driven entirely by server events.
 * 
 * V1.2: Added GameLayout wrapper for responsive desktop layout.
 * - Game phases (roleReveal, description, voting, results, postGame) use GameLayout
 * - Home and Lobby pages use the standard container layout
 */

import { useGame } from './GameContext';
import GameLayout from './components/GameLayout';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import RoleReveal from './pages/RoleReveal';
import DescriptionPhase from './pages/DescriptionPhase';
import VotingPhase from './pages/VotingPhase';
import Results from './pages/Results';
import PostGame from './pages/PostGame';
import './App.css';

export default function App() {
    const { room, phase } = useGame();

    // Render the appropriate page based on game phase
    const renderPage = () => {
        // If no room, show home page
        if (!room) {
            return <Home />;
        }

        // Otherwise, render based on phase
        switch (phase) {
            case 'lobby':
                return <Lobby />;
            case 'roleReveal':
                return <RoleReveal />;
            case 'description':
                return <DescriptionPhase />;
            case 'voting':
                return <VotingPhase />;
            case 'results':
                return <Results />;
            case 'postGame':
                return <PostGame />;
            default:
                return <Home />;
        }
    };

    // Check if current phase should use the game layout
    const isGamePhase = room && ['roleReveal', 'description', 'voting', 'results', 'postGame'].includes(phase);

    return (
        <div className="app">
            <div className="container">
                {isGamePhase ? (
                    <GameLayout>
                        {renderPage()}
                    </GameLayout>
                ) : (
                    renderPage()
                )}
            </div>
        </div>
    );
}
