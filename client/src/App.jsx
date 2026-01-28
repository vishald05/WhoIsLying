/**
 * Main App Component
 * 
 * Renders the appropriate page based on the current game phase.
 * Phase changes are driven entirely by server events.
 */

import { useGame } from './GameContext';
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

    return (
        <div className="app">
            <div className="container">
                {renderPage()}
            </div>
        </div>
    );
}
