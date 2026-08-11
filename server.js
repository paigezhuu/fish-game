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
    games[roomName].players.push({ name: playerName, team: 1 });
    
    socket.join(roomName);
    
    io.emit('game_list_updated', games);
    io.to(roomName).emit('room_data_updated', games[roomName]);
  });

  socket.on('join_game', (roomName) => {
    if (!players[socket.id] || !games[roomName]) return;
    
    if (games[roomName].players.length >= 6) {
      socket.emit('error_message', 'that team is already full... they dont want u :(');
      return;
    }

    const playerName = players[socket.id].name;
    players[socket.id].room = roomName;
    
    const team1Count = games[roomName].players.filter(p => p.team === 1).length;
    const assignedTeam = team1Count < 3 ? 1 : 2;
    
    games[roomName].players.push({ name: playerName, team: assignedTeam });
    socket.join(roomName);
    
    io.emit('game_list_updated', games);
    io.to(roomName).emit('room_data_updated', games[roomName]);
  });

  socket.on('switch_team', () => {
    if (!players[socket.id]) return;
    
    const roomName = players[socket.id].room;
    const playerName = players[socket.id].name;
    
    if (roomName && games[roomName]) {
      const playerObj = games[roomName].players.find(p => p.name === playerName);
      if (playerObj) {
        const targetTeam = playerObj.team === 1 ? 2 : 1;
        const targetTeamCount = games[roomName].players.filter(p => p.team === targetTeam).length;
        
        if (targetTeamCount < 3) {
          playerObj.team = targetTeam;
          io.to(roomName).emit('room_data_updated', games[roomName]);
        } else {
          socket.emit('error_message', 'That team is already full!');
        }
      }
    }
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
        games[roomName].players = games[roomName].players.filter(p => p.name !== targetName);

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
        games[roomName].players = games[roomName].players.filter(p => p.name !== playerName);
        socket.leave(roomName);
        players[socket.id].room = null; 
        
        if (games[roomName].players.length === 0) {
          delete games[roomName];
        } else {
          if (games[roomName].host === playerName) {
            games[roomName].host = games[roomName].players[0].name; 
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
        games[roomName].players = games[roomName].players.filter(p => p.name !== playerName);
        
        if (games[roomName].players.length === 0) {
          delete games[roomName];
        } else {
          if (games[roomName].host === playerName) {
            games[roomName].host = games[roomName].players[0].name;
          }
          io.to(roomName).emit('room_data_updated', games[roomName]);
        }
        io.emit('game_list_updated', games);
      }
      
      delete players[socket.id];
      io.emit('global_player_list', Object.values(players).map(p => p.name));
    }
  });

  socket.on('chat_message', (msg) => {
    if (!players[socket.id]) return;
    
    const roomName = players[socket.id].room;
    const playerName = players[socket.id].name;

    if (roomName) {
      io.to(roomName).emit('room_chat_message', { sender: playerName, text: msg });
    } else {
      io.emit('global_chat_message', { sender: playerName, text: msg });
    }
  });

  socket.on('typing', (data) => {
    if (!players[socket.id]) return;
    const roomName = players[socket.id].room;
    const playerName = players[socket.id].name;

    if (roomName && data.context === 'room') {
      socket.to(roomName).emit('user_typing', { name: playerName, isTyping: data.isTyping, context: 'room' });
    } else if (!roomName && data.context === 'lobby') {
      socket.broadcast.emit('user_typing', { name: playerName, isTyping: data.isTyping, context: 'lobby' });
    }
  });
});

server.listen(3000, () => console.log('Server running on http://localhost:3000'));