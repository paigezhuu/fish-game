const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const { Player } = require('./public/player.js');
const { Game } = require('./public/game.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public')); 

let players = {};
let games = {};

function getRoomData(room) {
  const game = room.instance;

  return {
    host: room.host,
    status: room.status,
    score: room.score || { 1: 0, 2: 0 },
    declaredSuits: room.declaredSuits || [],

    players: room.players.map(roomPlayer => {
      const gamePlayer = game?.players.find(
        p => p.name === roomPlayer.name
      );

      return {
        name: roomPlayer.name,
        team: roomPlayer.team,
        cardCount: gamePlayer ? gamePlayer.hand.length : 0
      };
    }),

    askHistory: game?.askHistory || []
  };
}

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
      games[roomName] = { host: playerName, players: [], status: 'waiting', score: { 1: 0, 2: 0 } };
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

  socket.on('start_game', () => {
    if (!players[socket.id]) return;
    
    const roomName = players[socket.id].room;
    const playerName = players[socket.id].name;

    games[roomName].score = { 1: 0, 2: 0 };
    games[roomName].declaredSuits = [];
    
    if (roomName && games[roomName]) {
      
      if (games[roomName].host !== playerName) {
        socket.emit('error_message', 'Only the group leader can start the game!');
        return;
      }

      if (games[roomName].players.length !== 6) {
        socket.emit('error_message', 'You must have exactly 6 players to start!');
        return;
      }

      const gamePlayers = games[roomName].players.map((p, index) => new Player(index, p.name));
      
      const newGame = new Game(gamePlayers, 0);
      games[roomName].instance = newGame;
      games[roomName].status = 'playing';
      
      newGame.deal();

      io.to(roomName).emit('game_started');
      io.to(roomName).emit('room_data_updated', games[roomName]);

      games[roomName].players.forEach((p, index) => {
        const targetSocketId = Object.keys(players).find(id => players[id].name === p.name);
        
        if (targetSocketId) {
          const myHand = newGame.players[index].hand;
          io.to(targetSocketId).emit('receive_hand', myHand);
        }
      });
    }
  });

  socket.on('card_asked', (choice, target) => {
    if (!players[socket.id]) return;

    const roomName = players[socket.id].room;
    if (!roomName || !games[roomName]) return;

    const game = games[roomName].instance;
    if (!game) return;

    const playerIndex = game.players.findIndex(
        p => p.name === players[socket.id].name
    );

    if (playerIndex === -1) return;

    if (game.turn !== playerIndex) {
        socket.emit('error_message', "It's not your turn!");
        return;
    }

    if (target < 0 || target >= game.players.length) {
        socket.emit('error_message', "Invalid target!");
        return;
    }

    if (target === playerIndex) {
        socket.emit('error_message', "You can't ask yourself!");
        return;
    }

    if (!game.players[playerIndex].legalAsk(choice)) {
        socket.emit('error_message', "That is not a legal ask!");
        return;
    }

    game.takeTurn(choice, target);

    socket.emit('receive_hand', game.players[playerIndex].hand);

    const targetSocketId = Object.keys(players).find(
        id => players[id].name === game.players[target].name
    );

    if (targetSocketId) {
        io.to(targetSocketId).emit('receive_hand', game.players[target].hand);
    }

    io.to(roomName).emit('room_data_updated', getRoomData(games[roomName]));
  });

  socket.on('declare_suit', (suit, holders) => {
    const roomName = players[socket.id].room;
    const game = games[roomName].instance;
    const successful = game.declareSuit(suit, holders);
    
    const suitNames = [
        'Minor Spades', 'Major Spades', 'Minor Hearts', 'Major Hearts',
        'Minor Clubs', 'Major Clubs', 'Minor Diamonds', 'Major Diamonds', 'the 8s and Jokers'
    ];
    const actualSuitName = suitNames[suit];

    const declaringPlayer = games[roomName].players.find(p => p.name === players[socket.id].name);
    const declaringTeam = declaringPlayer.team;
    const opposingTeam = declaringTeam === 1 ? 2 : 1;

    if (!games[roomName].score) games[roomName].score = { 1: 0, 2: 0 };
    if (!games[roomName].declaredSuits) games[roomName].declaredSuits = [];

    if (successful) {
        games[roomName].score[declaringTeam] += 1;
        io.to(roomName).emit('error_message', `${players[socket.id].name} correctly declared ${actualSuitName}! Team ${declaringTeam} gets a point!`);
    } else {
        games[roomName].score[opposingTeam] += 1;
        io.to(roomName).emit('error_message', `${players[socket.id].name} incorrectly declared ${actualSuitName}! Team ${opposingTeam} gets a point!`);
    }

    if (!games[roomName].declaredSuits.includes(suit)) {
        games[roomName].declaredSuits.push(suit);
    }

    if (games[roomName].score[1] + games[roomName].score[2] === 9) {
        let winnerName = "It's a tie!";
        if (games[roomName].score[1] > games[roomName].score[2]) winnerName = "Team 1 Wins!";
        if (games[roomName].score[2] > games[roomName].score[1]) winnerName = "Team 2 Wins!";

        io.to(roomName).emit('game_over', {
            winner: winnerName,
            score: games[roomName].score
        });

        games[roomName].status = 'waiting';
        games[roomName].score = { 1: 0, 2: 0 };
        games[roomName].declaredSuits = [];
    }

    io.to(roomName).emit('room_data_updated', getRoomData(games[roomName]));
    games[roomName].players.forEach((p, index) => {
        const targetSocketId = Object.keys(players).find(id => players[id].name === p.name);
        if (targetSocketId) {
            io.to(targetSocketId).emit('receive_hand', game.players[index].hand);
        }
    });
  });

  socket.on('kick_player', (targetName) => {
    if (!players[socket.id]) return;
    
    const roomName = players[socket.id].room;
    const playerName = players[socket.id].name;

    if (roomName && games[roomName] && games[roomName].host === playerName && games[roomName].status === 'waiting') {
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
        const wasPlaying = games[roomName].status === 'playing';
        
        games[roomName].players = games[roomName].players.filter(p => p.name !== playerName);
        socket.leave(roomName);
        players[socket.id].room = null; 
        
        if (games[roomName].players.length === 0) {
          delete games[roomName];
        } else {
          if (wasPlaying) {
            games[roomName].status = 'waiting';
            games[roomName].score = { 1: 0, 2: 0 };
            games[roomName].declaredSuits = [];
            
            io.to(roomName).emit('game_over', {
                winner: `Game Cancelled!\n${playerName} left.`,
                score: games[roomName].score
            });
          }
          
          if (games[roomName].host === playerName) {
            games[roomName].host = games[roomName].players[0].name; 
          }
          io.to(roomName).emit('room_data_updated', getRoomData(games[roomName]));
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
        const wasPlaying = games[roomName].status === 'playing';
        
        games[roomName].players = games[roomName].players.filter(p => p.name !== playerName);
        
        if (games[roomName].players.length === 0) {
          delete games[roomName];
        } else {
          if (wasPlaying) {
            games[roomName].status = 'waiting';
            games[roomName].score = { 1: 0, 2: 0 };
            games[roomName].declaredSuits = [];
            
            io.to(roomName).emit('game_over', {
                winner: `Game Cancelled!\n${playerName} disconnected.`,
                score: games[roomName].score
            });
          }
          
          if (games[roomName].host === playerName) {
            games[roomName].host = games[roomName].players[0].name;
          }
          io.to(roomName).emit('room_data_updated', getRoomData(games[roomName]));
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