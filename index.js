const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for simplicity
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());

// Endpoint for testing
app.get('/', (req, res) => {
  res.send('Chess Server is running');
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// In-memory storage for game rooms
const gameRooms = {};

// Socket.IO logic
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Player joins a game
  socket.on('joinGame', ({ gameId }) => {
    console.log(`Player ${socket.id} joined game - ${gameId}`);
    
    // If the room doesn't exist, create it with a new Chess instance
    if (!gameRooms[gameId]) {
      gameRooms[gameId] = {
        chess: new Chess(),
        players: [],
      };
    }

    const room = gameRooms[gameId];

    // Assign player color and add to the room
    if (room.players.length < 2) {
      const color = room.players.length === 0 ? 'w' : 'b';
      room.players.push({ id: socket.id, color });
      socket.join(gameId);
      socket.emit('init', { board: room.chess.board(), color });

      // Notify the other player that someone joined
      socket.to(gameId).emit('playerJoined', { playerId: socket.id, color });

      // If both players are in the game, notify them that the game can begin
      if (room.players.length === 2) {
        // Notify both players that the opponent has joined
        io.in(gameId).emit('opponentJoined');
        console.log(`Both players joined game - ${gameId}. Game is starting.`);
      }

      console.log(`Player ${socket.id} assigned color ${color} in game - ${gameId}`);
    } else {
      socket.emit('error', { message: 'Game room is full' });
    }
  });

  // Player makes a move
  socket.on('move', ({ gameId, from, to }) => {
    const room = gameRooms[gameId];
    if (room) {
      const move = room.chess.move({ from, to });

      if (move) {
        // Broadcast the move to other players in the room
        io.in(gameId).emit('move', { from, to });

        // Check if the game is over
        if (room.chess.isCheckmate()) {
          io.in(gameId).emit('gameOver', {
            winner: room.chess.turn() === 'w' ? 'b' : 'w',
          });
        }
      } else {
        socket.emit('error', { message: 'Invalid move' });
      }
    } else {
      socket.emit('error', { message: 'Game room does not exist' });
    }
  });

  // Handle player disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    for (const [gameId, room] of Object.entries(gameRooms)) {
      const playerIndex = room.players.findIndex((p) => p.id === socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        socket.to(gameId).emit('playerLeft', { playerId: socket.id });

        // If the room is empty, delete it
        if (room.players.length === 0) {
          delete gameRooms[gameId];
        }
        break;
      }
    }
  });
});
