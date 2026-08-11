const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public')); 

let players = {};

let games = {};

io.on('connection', (socket) => {
  
  socket.on('register_player', (playerName) => {
    players[socket.id] = { name: playerName, room: null };
    socket.emit('game_list_updated', games);
    io.emit('global_player_list', Object.values(players).map(p => p.name));
  });

  socket.on('create_game', (roomName) => {
    if (!players[socket.id]) return;
    
    const playerName = players[socket.id].name;
    players[socket.id].room = roomName;
    
    if (!games[roomName]) {
      games[roomName] = { host: playerName, players: [] };
    }
    games[roomName].players.push(playerName);
    
    socket.join(roomName);
    
    io.emit('game_list_updated', games);
    io.to(roomName).emit('room_data_updated', games[roomName]);
  });

  socket.on('join_game', (roomName) => {
    if (!players[socket.id] || !games[roomName]) return;
    
    const playerName = players[socket.id].name;
    players[socket.id].room = roomName;
    
    games[roomName].players.push(playerName);
    socket.join(roomName);
    
    io.emit('game_list_updated', games);
    io.to(roomName).emit('room_data_updated', games[roomName]);
  });

  socket.on('kick_player', (targetName) => {
    if (!players[socket.id]) return;
    
    const roomName = players[socket.id].room;
    const playerName = players[socket.id].name;

    if (roomName && games[roomName] && games[roomName].host === playerName) {
      
      const targetSocketId = Object.keys(players).find(id => players[id].name === targetName);

      if (targetSocketId) {
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          targetSocket.leave(roomName);
          targetSocket.emit('kicked_from_room');
        }

        players[targetSocketId].room = null;
        games[roomName].players = games[roomName].players.filter(name => name !== targetName);

        io.to(roomName).emit('room_data_updated', games[roomName]);
        io.emit('game_list_updated', games);
      }
    }
  });

  socket.on('leave_game', () => {
    if (players[socket.id]) {
      const roomName = players[socket.id].room;
      const playerName = players[socket.id].name;
      
      if (roomName && games[roomName]) {
        games[roomName].players = games[roomName].players.filter(name => name !== playerName);
        socket.leave(roomName);
        players[socket.id].room = null; 
        
        if (games[roomName].players.length === 0) {
          delete games[roomName];
        } else {
          if (games[roomName].host === playerName) {
            games[roomName].host = games[roomName].players[0];
          }
          io.to(roomName).emit('room_data_updated', games[roomName]);
        }
        io.emit('game_list_updated', games);
      }
    }
  });

  socket.on('disconnect', () => {
    if (players[socket.id]) {
      const roomName = players[socket.id].room;
      const playerName = players[socket.id].name;
      
      if (roomName && games[roomName]) {
        games[roomName].players = games[roomName].players.filter(name => name !== playerName);
        
        if (games[roomName].players.length === 0) {
          delete games[roomName];
        } else {
          if (games[roomName].host === playerName) {
            games[roomName].host = games[roomName].players[0];
          }
          io.to(roomName).emit('room_data_updated', games[roomName]);
        }
        io.emit('game_list_updated', games);
      }
      
      delete players[socket.id];
      io.emit('global_player_list', Object.values(players).map(p => p.name));
    }
  });
});

server.listen(3000, () => console.log('Server running on http://localhost:3000'));