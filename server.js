const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const { Player } = require('./public/player.js');
const { Game } = require('./public/game.js');

const PORT = process.env.PORT || 3000;

const MAX_PLAYERS = 6;
const TEAM_SIZE = 3;

// How long a dropped connection (refresh, flaky wifi, closed laptop) keeps its seat.
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS) || 2 * 60 * 1000;
const LOBBY_GRACE_MS = Number(process.env.LOBBY_GRACE_MS) || 15 * 1000;

const MAX_CHAT_HISTORY = 60;
const MAX_LOG_ENTRIES = 80;
const MAX_MESSAGE_LENGTH = 300;

const SUIT_NAMES = [
  'Low Spades', 'High Spades', 'Low Hearts', 'High Hearts',
  'Low Clubs', 'High Clubs', 'Low Diamonds', 'High Diamonds', '8s and Jokers'
];

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

/* ------------------------------------------------------------------ *
 *  State
 *
 *  A "session" is one person, identified by a token the browser keeps
 *  in sessionStorage. Sessions outlive individual socket connections,
 *  which is what lets a refresh drop you straight back into your seat.
 * ------------------------------------------------------------------ */
const sessions = new Map();        // token -> session (a session can have several tokens)
const socketSessions = new Map();  // socket.id -> session
const games = {};                  // roomName -> room
const lobbyChat = [];

/* ------------------------------------------------------------------ *
 *  Helpers
 * ------------------------------------------------------------------ */
const channel = (room) => `room:${room.name}`;
const cleanText = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const notify = (target, kind, text) => target.emit('notice', { kind, text });
const pushLimited = (list, item, max = MAX_CHAT_HISTORY) => {
  list.push(item);
  while (list.length > max) list.shift();
};

function isCard(card) {
  return Array.isArray(card) && card.length === 2 &&
    Number.isInteger(card[0]) && card[0] >= 0 && card[0] <= 8 &&
    Number.isInteger(card[1]) && card[1] >= 0 && card[1] <= 5;
}

const roomOf = (session) => (session && session.room ? games[session.room] || null : null);
const seatIndex = (room, session) => room.players.findIndex(p => p.session === session);
const uniqueSessions = () => new Set(sessions.values());

function findRoomByName(name) {
  const key = name.toLowerCase();
  return Object.values(games).find(r => r.name.toLowerCase() === key) || null;
}

function findSessionByName(name) {
  const key = name.toLowerCase();
  for (const s of uniqueSessions()) {
    if (s.name.toLowerCase() === key) return s;
  }
  return null;
}

function addLog(room, entry) {
  pushLimited(room.log, { ...entry, at: Date.now() }, MAX_LOG_ENTRIES);
}

/* What the lobby is allowed to know about a room (never any hands). */
function publicGames() {
  const out = {};
  for (const [name, room] of Object.entries(games)) {
    out[name] = {
      host: room.host,
      status: room.status,
      players: room.players.map(p => ({ name: p.name, team: p.team }))
    };
  }
  return out;
}

function onlinePlayers() {
  return [...uniqueSessions()]
    .filter(s => s.socketId)
    .map(s => ({ name: s.name, room: s.room }));
}

function broadcastLobby() {
  io.emit('game_list_updated', publicGames());
  io.emit('global_player_list', onlinePlayers());
}

function getRoomData(room) {
  const game = room.instance;
  return {
    roomName: room.name,
    host: room.host,
    status: room.status,
    turn: game ? game.turn : null,
    score: room.score,
    declaredSuits: room.declaredSuits,
    declaredBy: room.declaredBy,
    maxPlayers: MAX_PLAYERS,
    teamSize: TEAM_SIZE,
    players: room.players.map((p, i) => ({
      name: p.name,
      team: p.team,
      cardCount: game ? game.players[i].hand.length : 0,
      connected: Boolean(p.session.socketId)
    })),
    log: room.log
  };
}

const sendRoom = (room) => io.to(channel(room)).emit('room_data_updated', getRoomData(room));

function sendHand(room, index) {
  const seat = room.players[index];
  if (!seat || !seat.session.socketId || !room.instance) return;
  io.to(seat.session.socketId).emit('receive_hand', room.instance.players[index].hand);
}

const sendAllHands = (room) => room.players.forEach((_, i) => sendHand(room, i));

/* ------------------------------------------------------------------ *
 *  Room lifecycle
 * ------------------------------------------------------------------ */
function enterRoom(session, socket, room) {
  session.room = room.name;
  socket.join(channel(room));
  socket.emit('room_joined', { roomName: room.name });
  socket.emit('chat_history', { context: 'room', messages: room.chat });
  sendRoom(room);
  broadcastLobby();
}

function finishGame(room, { cancelled = false, text = '' } = {}) {
  const score = { ...room.score };
  let winner = text;
  let winningTeam = null;

  if (!cancelled) {
    if (score[1] > score[2]) { winningTeam = 1; winner = 'Team 1 wins!'; }
    else if (score[2] > score[1]) { winningTeam = 2; winner = 'Team 2 wins!'; }
    else winner = "It's a tie!";
  }

  room.status = 'waiting';
  room.instance = null;
  room.score = { 1: 0, 2: 0 };
  room.declaredSuits = [];
  room.declaredBy = {};

  io.to(channel(room)).emit('game_over', { winner, winningTeam, score, cancelled });
  sendRoom(room);
  broadcastLobby();
}

function removeFromRoom(session, cancelText) {
  const room = roomOf(session);
  if (!room) return;

  const wasPlaying = room.status === 'playing';
  room.players = room.players.filter(p => p.session !== session);
  session.room = null;

  const sock = session.socketId && io.sockets.sockets.get(session.socketId);
  if (sock) sock.leave(channel(room));

  if (room.players.length === 0) {
    delete games[room.name];
  } else {
    if (room.host === session.name) room.host = room.players[0].name;
    if (wasPlaying) finishGame(room, { cancelled: true, text: cancelText });
    else sendRoom(room);
  }
  broadcastLobby();
}

/* Called when a dropped connection never came back. */
function expireSession(session) {
  if (session.socketId) return;
  removeFromRoom(session, `Game cancelled. ${session.name} didn't make it back in time.`);
  for (const [token, s] of sessions) {
    if (s === session) sessions.delete(token);
  }
  io.emit('global_player_list', onlinePlayers());
}

/* Send a (re)connecting browser everything it needs to rebuild its screen. */
function syncSession(socket, session) {
  const room = roomOf(session);

  socket.emit('session_ready', { name: session.name, room: room ? room.name : null });
  socket.emit('game_list_updated', publicGames());
  socket.emit('chat_history', { context: 'lobby', messages: lobbyChat });

  if (room) {
    socket.join(channel(room));
    socket.emit('room_joined', { roomName: room.name });
    socket.emit('chat_history', { context: 'room', messages: room.chat });
    if (room.status === 'playing') {
      const i = seatIndex(room, session);
      if (i !== -1) sendHand(room, i);
    }
  }
}

/* ------------------------------------------------------------------ *
 *  Sockets
 * ------------------------------------------------------------------ */
io.on('connection', (socket) => {

  // Wraps a handler so a bad payload can never take the server down.
  function handle(event, fn) {
    socket.on(event, (...args) => {
      try {
        const session = socketSessions.get(socket.id);
        if (!session) return;
        fn(session, ...args);
      } catch (err) {
        console.error(`[${event}]`, err);
        notify(socket, 'error', 'Something went wrong on the server. Try again.');
      }
    });
  }

  socket.on('register_player', (payload) => {
    try {
      const name = cleanText(payload && payload.name, 20);
      const token = payload && typeof payload.token === 'string' ? payload.token : '';

      if (!name) return socket.emit('name_error', 'Enter a name (up to 20 characters).');
      if (token.length < 8 || token.length > 128) return socket.emit('name_error', 'Bad session. Refresh the page.');

      let session = sessions.get(token);

      if (session) {
        // Returning player (refresh / reconnect), possibly renaming.
        if (session.name.toLowerCase() !== name.toLowerCase() || session.name !== name) {
          const other = findSessionByName(name);
          if (session.room) {
            notify(socket, 'error', 'Leave your room before changing your name.');
          } else if (other && other !== session) {
            socket.emit('name_error', `"${name}" is already taken.`);
            if (socketSessions.get(socket.id) !== session) return;
          } else {
            session.name = name;
          }
        }
      } else {
        const existing = findSessionByName(name);
        if (existing && existing.socketId) {
          return socket.emit('name_error', `"${name}" is already taken.`);
        }
        if (existing) {
          // Same name, and that player is currently disconnected: let them back in
          // (covers closing a tab and opening a new one).
          session = existing;
          sessions.set(token, session);
        } else {
          session = { token, name, socketId: null, room: null, timer: null };
          sessions.set(token, session);
        }
      }

      // A second tab with the same token takes over; the old one is told to stand down.
      if (session.socketId && session.socketId !== socket.id) {
        const old = io.sockets.sockets.get(session.socketId);
        socketSessions.delete(session.socketId);
        if (old) { old.emit('replaced'); old.disconnect(true); }
      }

      clearTimeout(session.timer);
      const wasAway = !session.socketId;
      session.socketId = socket.id;
      socketSessions.set(socket.id, session);

      syncSession(socket, session);

      const room = roomOf(session);
      if (room) {
        if (wasAway && room.status === 'playing') addLog(room, { t: 'info', text: `${session.name} is back.` });
        sendRoom(room);
      }
      io.emit('global_player_list', onlinePlayers());
    } catch (err) {
      console.error('[register_player]', err);
      socket.emit('name_error', 'Something went wrong. Refresh and try again.');
    }
  });

  handle('create_game', (session, rawName) => {
    if (session.room) return notify(socket, 'error', 'Leave your current room first.');

    const roomName = cleanText(rawName, 30);
    if (!roomName) return notify(socket, 'error', 'Enter a room name cuh');
    if (findRoomByName(roomName)) return notify(socket, 'error', 'A room with that name already exists.');

    const room = {
      name: roomName,
      host: session.name,
      players: [{ name: session.name, team: 1, session }],
      status: 'waiting',
      score: { 1: 0, 2: 0 },
      declaredSuits: [],
      declaredBy: {},
      instance: null,
      chat: [],
      log: []
    };
    games[roomName] = room;
    enterRoom(session, socket, room);
  });

  handle('join_game', (session, roomName) => {
    const room = games[roomName];
    if (!room) return notify(socket, 'error', 'That room no longer exists.');
    if (session.room) return notify(socket, 'error', 'Leave your current room first.');
    if (room.status === 'playing') return notify(socket, 'error', 'That game is already in progress.');
    if (room.players.length >= MAX_PLAYERS) {
      return notify(socket, 'error', 'bro they dont want you... the game is already full');
    }

    const team1 = room.players.filter(p => p.team === 1).length;
    const team2 = room.players.length - team1;
    room.players.push({ name: session.name, team: team1 <= team2 ? 1 : 2, session });
    enterRoom(session, socket, room);
  });

  handle('switch_team', (session) => {
    const room = roomOf(session);
    if (!room) return;
    if (room.status !== 'waiting') return notify(socket, 'error', "You can't switch teams mid-game.");

    const seat = room.players[seatIndex(room, session)];
    const target = seat.team === 1 ? 2 : 1;
    if (room.players.filter(p => p.team === target).length >= TEAM_SIZE) {
      return notify(socket, 'error', 'bro they dont want you... that team is already full');
    }
    seat.team = target;
    sendRoom(room);
    broadcastLobby();
  });

  handle('start_game', (session) => {
    const room = roomOf(session);
    if (!room) return;
    if (room.host !== session.name) return notify(socket, 'error', 'Only the host can start the game.');
    if (room.status !== 'waiting') return;
    if (room.players.length !== MAX_PLAYERS) {
      return notify(socket, 'error', 'you dont have enough friends (yikes)... you need 6 players to start');
    }
    if (room.players.filter(p => p.team === 1).length !== TEAM_SIZE) {
      return notify(socket, 'error', 'Teams need to be 3 v 3. Use "Switch Team" to balance them.');
    }
    const away = room.players.find(p => !p.session.socketId);
    if (away) return notify(socket, 'error', `${away.name} is disconnected. Wait for them to come back.`);

    const game = new Game(room.players.map((p, i) => new Player(i, p.name)), 0);
    game.deal();

    room.instance = game;
    room.status = 'playing';
    room.score = { 1: 0, 2: 0 };
    room.declaredSuits = [];
    room.declaredBy = {};
    room.log = [];
    addLog(room, { t: 'start', first: room.players[0].name });

    sendRoom(room);
    sendAllHands(room);
    broadcastLobby();
  });

  handle('card_asked', (session, choice, target) => {
    const room = roomOf(session);
    if (!room || room.status !== 'playing' || !room.instance) {
      return notify(socket, 'error', 'No game is in progress.');
    }
    const game = room.instance;
    const me = seatIndex(room, session);
    if (me === -1) return;

    if (game.turn !== me) return notify(socket, 'error', "chill it's not ur turn bud");

    target = Number(target);
    if (!Number.isInteger(target) || target < 0 || target >= room.players.length) {
      return notify(socket, 'error', 'Pick a player to ask.');
    }
    if (room.players[target].team === room.players[me].team) {
      return notify(socket, 'error', 'You can only ask players on the other team.');
    }
    if (game.players[target].hand.length === 0) {
      return notify(socket, 'error', `${room.players[target].name} has no cards to ask for.`);
    }
    if (!isCard(choice) || !game.players[me].legalAsk(choice)) {
      return notify(socket, 'error', 'illegal ask');
    }

    const successful = game.players[target].hasCard(choice);
    game.takeTurn(choice, target);

    addLog(room, {
      t: 'ask',
      asker: room.players[me].name,
      askerTeam: room.players[me].team,
      target: room.players[target].name,
      targetTeam: room.players[target].team,
      card: [choice[0], choice[1]],
      ok: successful
    });

    sendHand(room, me);
    sendHand(room, target);
    sendRoom(room);
  });

  handle('declare_suit', (session, suit, holders) => {
    const room = roomOf(session);
    if (!room || room.status !== 'playing' || !room.instance) {
      return notify(socket, 'error', 'No game is in progress.');
    }
    const game = room.instance;
    const me = seatIndex(room, session);
    if (me === -1) return;

    suit = Number(suit);
    if (!Number.isInteger(suit) || suit < 0 || suit > 8) return notify(socket, 'error', 'Choose a half-suit.');
    if (room.declaredSuits.includes(suit)) {
      return notify(socket, 'error', 'That half-suit has already been declared.');
    }
    if (!Array.isArray(holders) || holders.length !== 6 ||
        holders.some(h => !Number.isInteger(h) || h < 0 || h >= room.players.length)) {
      return notify(socket, 'error', 'Say who holds every card in the half-suit.');
    }

    const declaringTeam = room.players[me].team;
    const opposingTeam = declaringTeam === 1 ? 2 : 1;
    if (holders.some(h => room.players[h].team !== declaringTeam)) {
      return notify(socket, 'error', 'You can only name players on your own team.');
    }

    const correct = game.declareSuit(suit, holders);
    const scoringTeam = correct ? declaringTeam : opposingTeam;
    room.score[scoringTeam] += 1;
    room.declaredSuits.push(suit);
    room.declaredBy[suit] = scoringTeam;

    const who = room.players[me].name;
    const suitName = SUIT_NAMES[suit];
    addLog(room, { t: 'declare', player: who, team: declaringTeam, suit, ok: correct, pointTo: scoringTeam });

    io.to(channel(room)).emit('notice', correct
      ? { kind: 'success', text: `${who} correctly declared ${suitName} (not bad for a kid?). Team ${scoringTeam} gets a point ;)` }
      : { kind: 'error', text: `BOOM. ${who} incorrectly declared ${suitName} (yikes). Team ${scoringTeam} gets a point ;)` });

    if (room.declaredSuits.length === 9) {
      finishGame(room);
      return;
    }

    sendRoom(room);
    sendAllHands(room);
  });

  handle('pass_turn', (session, target) => {
    const room = roomOf(session);
    if (!room || room.status !== 'playing' || !room.instance) return;
    const game = room.instance;
    const me = seatIndex(room, session);
    if (me === -1) return;

    if (game.turn !== me) return notify(socket, 'error', 'you cant pass the turn if its not your turn');
    if (game.players[me].hand.length !== 0) return notify(socket, 'error', 'nice try, get rid of your cards first');

    target = Number(target);
    if (!Number.isInteger(target) || target < 0 || target >= room.players.length || target === me ||
        room.players[target].team !== room.players[me].team) {
      return notify(socket, 'error', 'Pass the turn to a teammate.');
    }
    if (game.players[target].hand.length === 0) {
      return notify(socket, 'error', `${room.players[target].name} has no cards either.`);
    }

    game.passTurn(target);
    addLog(room, { t: 'pass', from: room.players[me].name, to: room.players[target].name, team: room.players[me].team });
    sendRoom(room);
  });

  handle('kick_player', (session, targetName) => {
    const room = roomOf(session);
    if (!room || room.host !== session.name || room.status !== 'waiting') return;

    const seat = room.players.find(p => p.name === targetName);
    if (!seat || seat.session === session) return;

    const kicked = seat.session;
    const kickedSocket = kicked.socketId && io.sockets.sockets.get(kicked.socketId);
    removeFromRoom(kicked);
    if (kickedSocket) kickedSocket.emit('room_left', { reason: 'kicked' });
  });

  handle('leave_game', (session) => {
    const name = session.name;
    removeFromRoom(session, `Game cancelled. ${name} left.`);
    socket.emit('room_left', { reason: 'left' });
  });

  handle('chat_message', (session, msg) => {
    const text = String(msg ?? '').trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!text) return;

    const entry = { sender: session.name, text };
    const room = roomOf(session);
    if (room) {
      pushLimited(room.chat, entry);
      io.to(channel(room)).emit('room_chat_message', entry);
    } else {
      pushLimited(lobbyChat, entry);
      io.emit('global_chat_message', entry);
    }
  });

  handle('typing', (session, data) => {
    if (!data) return;
    const room = roomOf(session);
    const payload = { name: session.name, isTyping: Boolean(data.isTyping) };

    if (room && data.context === 'room') {
      socket.to(channel(room)).emit('user_typing', { ...payload, context: 'room' });
    } else if (!room && data.context === 'lobby') {
      socket.broadcast.emit('user_typing', { ...payload, context: 'lobby' });
    }
  });

  socket.on('disconnect', () => {
    const session = socketSessions.get(socket.id);
    socketSessions.delete(socket.id);
    if (!session || session.socketId !== socket.id) return; // replaced by a newer tab

    session.socketId = null;

    const room = roomOf(session);
    if (room) {
      if (room.status === 'playing') {
        addLog(room, { t: 'info', text: `${session.name} lost connection. Holding their seat.` });
      }
      sendRoom(room);
    }
    io.emit('global_player_list', onlinePlayers());

    // Don't drop them yet: a refresh reconnects within a second or two.
    clearTimeout(session.timer);
    session.timer = setTimeout(() => expireSession(session), room ? RECONNECT_GRACE_MS : LOBBY_GRACE_MS);
  });
});

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
