const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public')); 

let activePlayers = [];

io.on('connection', (socket) => {
  console.log('A player connected:', socket.id);
  
  activePlayers.push(socket.id);

  io.emit('player_list_updated', activePlayers);

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    activePlayers = activePlayers.filter(id => id !== socket.id);
    
    io.emit('player_list_updated', activePlayers);
  });
});

server.listen(3000, () => console.log('Server running on http://localhost:3000'));