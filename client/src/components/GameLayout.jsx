/**
 * GameLayout Component (V1.2)
 * 
 * Provides a responsive layout wrapper for in-game phases.
 * 
 * LAYOUT STRATEGY:
 * - Mobile (<1024px): Vertical stacked layout (unchanged from current)
 * - Desktop (≥1024px): CSS Grid-based 3-column + bottom panel layout
 * 
 * DESKTOP GRID STRUCTURE:
 * ┌─────────────┬────────────────────────┬─────────────────┐
 * │   LEFT      │       CENTER           │     RIGHT       │
 * │  (Players)  │   (Main Content)       │  (Phase Info)   │
 * │  fixed 280px│     flexible           │   fixed 300px   │
 * ├─────────────┴────────────────────────┴─────────────────┤
 * │                    BOTTOM (Chat)                       │
 * │                   (full width, fixed height)           │
 * └────────────────────────────────────────────────────────┘
 * 
 * USAGE:
 * Wrap your page content with <GameLayout> and use the provided
 * panel classes to position content:
 * - .game-panel-left: Players list
 * - .game-panel-center: Main game content (word, descriptions, timer)
 * - .game-panel-right: Phase info, instructions, action buttons
 * - .game-panel-bottom: Chat section (desktop only, visible at bottom)
 * 
 * On mobile, all panels stack vertically in DOM order.
 * Use CSS only—no conditional rendering.
 */

import { useGame } from '../GameContext';

export default function GameLayout({ children }) {
    const { room, phase } = useGame();
    
    // Only apply game layout when in an active game phase
    // Home page and lobby use the simple container layout
    const isGamePhase = room && ['roleReveal', 'description', 'voting', 'results', 'postGame'].includes(phase);
    
    if (!isGamePhase) {
        // For non-game phases (home, lobby), render children without the game layout
        return <>{children}</>;
    }
    
    return (
        <div className="game-layout">
            {children}
        </div>
    );
}
