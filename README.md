# Who Is Lying

A real-time multiplayer bluffing game where players must identify an imposter among them. One player is secretly assigned the role of imposter and must blend in without knowing the secret word that all other players share.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [System Architecture](#system-architecture)
4. [Game Flow](#game-flow)
5. [Real-Time Design](#real-time-design)
6. [Security and Fairness](#security-and-fairness)
7. [Resilience and Edge Cases](#resilience-and-edge-cases)
8. [How to Run Locally](#how-to-run-locally)
9. [Future Improvements](#future-improvements)

---

## Project Overview

### Game Concept

Who Is Lying is a social deduction game inspired by party games like Spyfall and Werewolf. Players join a room and are assigned roles: one player becomes the **imposter**, while all others are **regular players**. Regular players receive a secret word within a given topic, but the imposter only knows the topic—not the word itself.

Each player submits an anonymous description of the word. The imposter must craft a convincing bluff without knowing what they are describing. After all descriptions are revealed (in randomized order), players vote on who they believe is the imposter.

### Core Mechanics

- **Role Assignment**: One randomly selected player becomes the imposter
- **Secret Word**: Only non-imposters see the word; the imposter sees only the topic
- **Anonymous Descriptions**: All descriptions are shuffled before display to prevent identification
- **Voting**: Players vote for who they suspect; the player with the most votes is eliminated
- **Win Conditions**: Players win if they vote out the imposter; the imposter wins if they survive

---

## Tech Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| React 18 | Component-based UI framework |
| Vite | Development server and build tool |
| Socket.io Client | Real-time server communication |
| Context API | Global state management |

### Backend

| Technology | Purpose |
|------------|---------|
| Node.js | JavaScript runtime |
| Express | HTTP server framework |
| Socket.io | WebSocket-based real-time communication |
| UUID | Unique identifier generation |

### Development

| Tool | Purpose |
|------|---------|
| npm | Package management |
| nodemon | Development auto-restart (optional) |

---

## System Architecture

### Client-Server Responsibility Split

The architecture follows a strict separation of concerns where the **server is the single source of truth** for all game state.

```
┌─────────────────────────────────────────────────────────────────┐
│                           SERVER                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Room Manager   │  │  Timer Manager  │  │  Game Logic     │  │
│  │  - Players      │  │  - Phase timers │  │  - Role assign  │  │
│  │  - Phases       │  │  - Auto-submit  │  │  - Vote calc    │  │
│  │  - Host mgmt    │  │  - Countdown    │  │  - Tie-breaking │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Socket.io
                              │
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENTS                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  React UI       │  │  Game Context   │  │  Socket Handler │  │
│  │  - Phase pages  │  │  - Local state  │  │  - Event listen │  │
│  │  - Timer display│  │  - Actions      │  │  - Emit actions │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Why Server is Source of Truth

1. **Cheat Prevention**: Clients cannot manipulate game state or access hidden information
2. **Consistency**: All players see the same state at the same time
3. **Validation**: Every action is validated server-side before being applied
4. **Privacy**: Sensitive data (imposter identity, secret word) never leaves the server except to authorized recipients

### Privacy Enforcement

The server enforces strict information boundaries:

| Information | Who Receives It |
|-------------|-----------------|
| Topic | All players |
| Secret Word | Non-imposters only (via private socket emission) |
| Imposter Identity | Only the imposter knows their role |
| Vote Targets | No one until results phase |
| Description Authors | Never revealed (shuffled before broadcast) |

---

## Game Flow

The game progresses through five distinct phases managed by a server-side state machine.

```
┌─────────┐     ┌──────────────┐     ┌─────────────┐     ┌────────┐     ┌─────────┐
│  LOBBY  │ ──▶ │  ROLE REVEAL │ ──▶ │ DESCRIPTION │ ──▶ │ VOTING │ ──▶ │ RESULTS │
└─────────┘     └──────────────┘     └─────────────┘     └────────┘     └─────────┘
   Host           10 seconds           60 seconds        30 seconds      Final
  starts           timer                 timer             timer         reveal
```

### Phase Details

**Lobby**
- Players join using a 6-character room code
- Minimum 4 players required to start
- Host controls when to begin

**Role Reveal**
- Each player privately receives their role
- Imposter sees: topic only
- Regular players see: topic and secret word
- 10-second timer before auto-progression

**Description**
- All players submit a description of the word
- Imposter must guess and bluff convincingly
- 60-second timer; non-submitters receive "(No response)"

**Voting**
- Anonymized, shuffled descriptions displayed
- Players vote for suspected imposter
- Cannot vote for yourself
- 30-second timer; non-voters abstain

**Results**
- Voted-out player revealed
- Imposter identity revealed
- Win/loss announced
- Secret word shown to all

---

## Real-Time Design

### Socket Event Model

Communication follows a request-response pattern with server-initiated broadcasts for state changes.

**Client to Server Events**

| Event | Payload | Description |
|-------|---------|-------------|
| `room:create` | `{ playerName }` | Create a new game room |
| `room:join` | `{ roomCode, playerName }` | Join existing room |
| `room:leave` | (none) | Voluntarily leave room |
| `game:start` | (none) | Host starts the game |
| `game:startDescriptionPhase` | (none) | Host advances phase |
| `game:submitDescription` | `{ text }` | Submit description |
| `game:submitVote` | `{ targetPlayerId }` | Cast vote |

**Server to Client Events**

| Event | Payload | Description |
|-------|---------|-------------|
| `player:joined` | `{ player, room }` | New player notification |
| `player:left` | `{ playerId, room }` | Player departure |
| `game:roleAssigned` | `{ isImposter, topic, word? }` | Private role info |
| `game:started` | `{ room, topic }` | Public game start |
| `game:phaseChanged` | `{ phase, room }` | Phase transition |
| `game:timer` | `{ phase, remainingSeconds }` | Countdown tick |
| `game:descriptionSubmitted` | `{ submittedCount, totalPlayers }` | Progress update |
| `game:descriptionPhaseEnded` | `{ descriptions, room }` | Anonymized descriptions |
| `game:voteSubmitted` | `{ votedCount, totalPlayers }` | Progress update |
| `game:results` | `{ votedOutPlayer, imposter, playersWin, voteSummary }` | Final results |
| `game:playerDisconnected` | `{ playerId, playerName, phase }` | Mid-game disconnect |

### Phase-Based State Machine

The server maintains a state machine that governs valid transitions:

```
lobby ──▶ roleReveal ──▶ description ──▶ voting ──▶ results
  │                                                    │
  └────────────────────────────────────────────────────┘
                    (new game)
```

Each phase has:
- Entry conditions (validated before transition)
- Timer duration (server-controlled)
- Completion criteria (all submitted or timer expired)
- Exit actions (broadcast state, start next timer)

---

## Security and Fairness

### Imposter Secrecy

The imposter's identity is protected through multiple mechanisms:

1. **Private Socket Emission**: Role assignment uses `io.to(socketId).emit()` to send role data only to the specific player
2. **No Client Storage**: The client never stores who the imposter is globally
3. **Server-Only Logic**: All game calculations happen server-side

### Anonymous Descriptions

Descriptions cannot be traced back to their authors:

1. Stored server-side with player IDs (for validation)
2. Stripped of identifiers before broadcast
3. Shuffled using Fisher-Yates algorithm
4. Sent as array of `{ description: string }` only

### Server-Side Voting

Vote integrity is maintained through:

1. **No Early Reveal**: Vote counts shown, but not targets
2. **Validation**: Cannot vote for self, cannot vote twice
3. **Tie-Breaking Rules**:
   - Clear winner: highest vote count wins
   - Tie includes imposter: imposter survives (confusion succeeded)
   - Tie without imposter: random selection among tied players

---

## Resilience and Edge Cases

### Disconnect Handling

The game gracefully handles player disconnections without resetting:

| Phase | Disconnect Behavior |
|-------|---------------------|
| Lobby | Player removed, others notified |
| Role Reveal | Player removed, game continues |
| Description | Auto-submit "(Disconnected)", check completion |
| Voting | Vote treated as abstain, check completion |
| Results | Player removed |

### Host Transfer

If the host disconnects:
1. Host role transfers to next player in order
2. `room:hostChanged` event broadcast
3. Game continues without interruption

### Rejoin Recovery

Players can recover from browser refresh:

1. Join with same room code and name
2. Server detects existing player, updates socket ID
3. Full state restoration sent to client:
   - Current phase
   - Role information (imposter status, word if applicable)
   - Submission/vote status
   - Descriptions (if voting phase)
   - Results (if results phase)

### Timer Auto-Submission

Server-controlled timers ensure games cannot stall:

| Phase | Duration | Auto-Action |
|-------|----------|-------------|
| Role Reveal | 10s | Transition to description |
| Description | 60s | Submit "(No response)" for missing players |
| Voting | 30s | Treat missing votes as abstain |

---

## How to Run Locally

### Prerequisites

- Node.js 18 or higher
- npm 9 or higher

### Server Setup

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Start the server
node server.js
```

The server runs on `http://localhost:3001` by default.

Verify with health check:
```bash
curl http://localhost:3001/health
```

### Client Setup

```bash
# Navigate to client directory
cd client

# Install dependencies
npm install

# Start development server
npm run dev
```

The client runs on `http://localhost:3000` by default.

### Playing the Game

1. Open `http://localhost:3000` in multiple browser tabs
2. One player creates a room and shares the room code
3. Other players join using the room code
4. Host starts the game when 4 or more players are present

---

## Future Improvements

### AI Imposter Mode

- Computer-controlled imposter for solo or small group play
- Natural language generation for convincing descriptions
- Difficulty levels based on bluffing sophistication

### Matchmaking System

- Public lobby for random player matching
- Skill-based matching using ELO or similar rating
- Regional servers for latency optimization

### Leaderboards and Progression

- Persistent player accounts
- Win/loss statistics
- Achievement system (e.g., "Won as imposter 10 times")
- Seasonal rankings

### Additional Game Modes

- Multiple imposters for larger groups
- Timed descriptions with varying difficulties
- Custom word/topic packs
- Spectator mode

### Production Deployment

- Database integration for persistent state
- Redis for horizontal scaling with Socket.io
- CDN for static asset delivery
- Rate limiting and abuse prevention

---

## License

This project is for educational and portfolio purposes.

---

## Author

Developed as a demonstration of real-time multiplayer game architecture using modern web technologies.
