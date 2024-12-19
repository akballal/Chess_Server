const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
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

    if (!gameRooms[gameId]) {
      gameRooms[gameId] = {
        chess: new Chess(),
        players: [],
      };
    }

    const room = gameRooms[gameId];

    if (room.players.length < 2) {
      const color = room.players.length === 0 ? 'w' : 'b';
      room.players.push({ id: socket.id, color });
      socket.join(gameId);
      socket.emit('init', { board: room.chess.board(), color });

      socket.to(gameId).emit('playerJoined', { playerId: socket.id, color });

      if (room.players.length === 2) {
        io.in(gameId).emit('opponentJoined');
        console.log(`Both players joined game - ${gameId}. Game is starting.`);
      }
      console.log(`Player ${socket.id} assigned color ${color} in game - ${gameId}`);
    } else {
      socket.emit('error', { message: 'Game room is full' });
    }
  });

  // Player makes a move
  socket.on('move', ({ gameId, from, to, promotion }) => {
    console.log(`Move received from player ${socket.id} in game ${gameId}:`, { from, to, promotion });
    const room = gameRooms[gameId];
    if (room) {
        console.log('Current board state:', room.chess.ascii());

        if (promotion && !['q', 'r', 'b', 'n'].includes(promotion)) {
            console.error('Invalid promotion piece:', promotion);
            socket.emit('error', { message: 'Invalid promotion piece' });
            return;
        }

        const move = room.chess.move({ from, to, promotion });

        if (move) {
            console.log('Move executed successfully:', move);
            io.in(gameId).emit('move', { from, to, promotion: move.promotion });
            io.in(gameId).emit('updateBoard', room.chess.board());
            
            if (room.chess.isCheckmate()) {
                console.log('Game over: Checkmate');
                io.in(gameId).emit('gameOver', {
                    winner: room.chess.turn() === 'w' ? 'Black' : 'White',
                });
            }
        } else {
            console.error('Invalid move:', { from, to, promotion });
            socket.emit('error', { message: 'Invalid move' });
        }
    } else {
        console.error('Game room not found:', gameId);
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

        if (room.players.length === 0) {
          delete gameRooms[gameId];
        }
        break;
      }
    }
  });
});
