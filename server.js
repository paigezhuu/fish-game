const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public')); 

let players = {};

io.on('connection', (socket) => {
  
  socket.on('register_player', (permanentId) => {
    
    players[socket.id] = permanentId;
    
    const activePlayerIds = Object.values(players);
    io.emit('player_list_updated', activePlayerIds);
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    
    const activePlayerIds = Object.values(players);
    io.emit('player_list_updated', activePlayerIds);
  });
});

server.listen(3000, () => console.log('Server running on http://localhost:3000'));