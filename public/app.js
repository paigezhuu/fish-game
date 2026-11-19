(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  Card data
   * ------------------------------------------------------------------ */
  const HALF_SUITS = [
    { name: 'Low Spades',    symbol: '♠', red: false, ranks: ['2', '3', '4', '5', '6', '7'] },
    { name: 'High Spades',   symbol: '♠', red: false, ranks: ['9', '10', 'J', 'Q', 'K', 'A'] },
    { name: 'Low Hearts',    symbol: '♥', red: true,  ranks: ['2', '3', '4', '5', '6', '7'] },
    { name: 'High Hearts',   symbol: '♥', red: true,  ranks: ['9', '10', 'J', 'Q', 'K', 'A'] },
    { name: 'Low Clubs',     symbol: '♣', red: false, ranks: ['2', '3', '4', '5', '6', '7'] },
    { name: 'High Clubs',    symbol: '♣', red: false, ranks: ['9', '10', 'J', 'Q', 'K', 'A'] },
    { name: 'Low Diamonds',  symbol: '♦', red: true,  ranks: ['2', '3', '4', '5', '6', '7'] },
    { name: 'High Diamonds', symbol: '♦', red: true,  ranks: ['9', '10', 'J', 'Q', 'K', 'A'] },
    { name: '8s & Jokers',   symbol: '★', red: false, ranks: ['8♠', '8♥', '8♣', '8♦', 'Black Joker', 'Red Joker'] }
  ];
  const SUIT_WORDS = ['Spades', 'Spades', 'Hearts', 'Hearts', 'Clubs', 'Clubs', 'Diamonds', 'Diamonds'];
  const RANK_WORDS = {
    low: ['2', '3', '4', '5', '6', '7'],
    high: ['9', '10', 'Jack', 'Queen', 'King', 'Ace']
  };
  const EIGHTS_FILES = ['card_spades_08', 'card_hearts_08', 'card_clubs_08', 'card_diamonds_08', 'card_joker_black', 'card_joker_red'];
  const EIGHTS_NAMES = ['8 of Spades', '8 of Hearts', '8 of Clubs', '8 of Diamonds', 'Black Joker', 'Red Joker'];
  const FILE_SUITS = ['spades', 'spades', 'hearts', 'hearts', 'clubs', 'clubs', 'diamonds', 'diamonds'];
  const FILE_LOW = ['02', '03', '04', '05', '06', '07'];
  const FILE_HIGH = ['09', '10', 'J', 'Q', 'K', 'A'];

  const cardImage = (s, r) => '/images/' + (s === 8 ? EIGHTS_FILES[r] : `card_${FILE_SUITS[s]}_${(s % 2 === 0 ? FILE_LOW : FILE_HIGH)[r]}`) + '.png';
  const cardName = (s, r) => (s === 8 ? EIGHTS_NAMES[r] : `${(s % 2 === 0 ? RANK_WORDS.low : RANK_WORDS.high)[r]} of ${SUIT_WORDS[s]}`);
  const cardShort = (s, r) => (s === 8 ? HALF_SUITS[8].ranks[r] : HALF_SUITS[s].ranks[r] + HALF_SUITS[s].symbol);
  const sameCard = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];

  /* ------------------------------------------------------------------ *
   *  Tiny DOM helpers (everything user-supplied goes through textContent)
   * ------------------------------------------------------------------ */
  const $ = (id) => document.getElementById(id);

  function el(tag, props = {}, ...kids) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      node.append(kid);
    }
    return node;
  }
  const strong = (text) => el('strong', { text });

  function cardImg(card, cls = 'card-img') {
    return el('img', { class: cls, src: cardImage(card[0], card[1]), alt: cardName(card[0], card[1]), title: cardName(card[0], card[1]), draggable: 'false' });
  }

  function cardChip(card) {
    return el('span', { class: 'chip-card' + (HALF_SUITS[card[0]].red ? ' red' : ''), text: cardShort(card[0], card[1]), title: cardName(card[0], card[1]) });
  }

  function suitLabel(suit) {
    const hs = HALF_SUITS[suit];
    return el('span', {}, el('span', { class: hs.red ? 'red' : '', text: hs.symbol }), ' ' + hs.name);
  }

  const initial = (name) => (Array.from(name)[0] || '?').toUpperCase();

  function toast(kind, text, ms = 4500) {
    const node = el('div', { class: `toast ${kind || 'info'}`, text, role: 'status' });
    $('toasts').append(node);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => node.remove(), ms);
  }

  /* ------------------------------------------------------------------ *
   *  State
   *
   *  The player's identity lives in sessionStorage so it survives a page
   *  refresh (but stays separate per tab, which keeps multi-tab testing
   *  possible). The server uses the token to put a returning browser
   *  back in its seat.
   * ------------------------------------------------------------------ */
  function makeToken() {
    const bytes = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  function store(key, value) { try { sessionStorage.setItem(key, value); } catch { /* private mode */ } }
  function load(key) { try { return sessionStorage.getItem(key); } catch { return null; } }

  let token = load('fish_token');
  if (!token) { token = makeToken(); store('fish_token', token); }

  const state = {
    name: load('fish_player_id') || '',
    screen: 'loading',
    roomName: null,
    room: null,
    hand: [],
    selTarget: null,
    selCard: null,
    declare: { suit: null, holders: Array(6).fill(null) },
    typing: { lobby: [], room: [] },
    games: {}
  };

  function showScreen(id) {
    state.screen = id;
    document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== `screen-${id}`; });
    if (id === 'login') $('username-input').focus();
  }

  const openModal = (id) => { $(id).hidden = false; };
  const closeModal = (id) => { $(id).hidden = true; };

  /* ------------------------------------------------------------------ *
   *  Socket / connection
   * ------------------------------------------------------------------ */
  const socket = io();

  function register(name) {
    socket.emit('register_player', { name, token });
  }

  socket.on('connect', () => {
    $('conn-banner').hidden = true;
    if (state.name) register(state.name);
    else showScreen('login');
  });

  socket.on('disconnect', (reason) => {
    if (reason !== 'io client disconnect' && reason !== 'io server disconnect') $('conn-banner').hidden = false;
  });

  socket.on('replaced', () => {
    $('conn-banner').hidden = true;
    openModal('modal-replaced');
  });

  socket.on('session_ready', ({ name, room }) => {
    state.name = name;
    store('fish_player_id', name);
    $('welcome-name').textContent = name;
    $('login-error').hidden = true;
    closeModal('modal-rename');

    if (room) {
      state.roomName = room;
      $('room-title').textContent = room;
      showScreen('room');
    } else {
      resetRoomState();
      showScreen('lobby');
    }
  });

  socket.on('name_error', (message) => {
    if (state.screen === 'lobby' || state.screen === 'room') {
      toast('error', message);
      return;
    }
    // Stored name no longer works (taken by someone else, say): fall back to the login form.
    $('username-input').value = state.name;
    state.name = '';
    $('login-error').textContent = message;
    $('login-error').hidden = false;
    showScreen('login');
  });

  socket.on('notice', ({ kind, text }) => toast(kind, text));

  /* ------------------------------------------------------------------ *
   *  Login / rename
   * ------------------------------------------------------------------ */
  $('username-input').value = state.name;
  if (!state.name) showScreen('login');

  $('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('username-input').value.trim();
    if (!name) { $('login-error').textContent = 'enter yo name'; $('login-error').hidden = false; return; }
    state.name = name;
    register(name);
  });

  $('rename-btn').addEventListener('click', () => {
    $('rename-input').value = state.name;
    openModal('modal-rename');
    $('rename-input').select();
  });
  $('rename-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('rename-input').value.trim();
    if (name && name !== state.name) register(name);
    else closeModal('modal-rename');
  });

  /* ------------------------------------------------------------------ *
   *  Lobby
   * ------------------------------------------------------------------ */
  socket.on('global_player_list', (players) => {
    const list = $('global-player-list');
    list.replaceChildren();
    $('online-count').textContent = players.length;
    players.forEach((p) => {
      list.append(el('li', {},
        el('span', {}, el('span', { class: 'presence' }), p.name === state.name ? `${p.name} (You)` : p.name),
        p.room ? el('span', { class: 'tag', text: 'in a game' }) : null));
    });
  });

  socket.on('game_list_updated', (games) => {
    state.games = games;
    renderGameList();
  });

  function renderGameList() {
    const container = $('active-games-list');
    container.replaceChildren();
    const names = Object.keys(state.games);

    if (names.length === 0) {
      container.append(el('p', { class: 'muted', text: 'No active games right now (go touch grass)... #fairs' }));
      return;
    }

    names.forEach((roomName) => {
      const game = state.games[roomName];
      const count = game.players.length;
      const playing = game.status === 'playing';
      const full = count >= 6;

      const dots = el('span', { class: 'dots' });
      for (let i = 0; i < 6; i++) {
        const p = game.players[i];
        dots.append(el('span', { class: 'dot' + (p ? ' on' : ''), dataset: p ? { team: p.team } : {} }));
      }

      container.append(el('div', { class: 'game-item' },
        el('div', {},
          el('div', { class: 'name', text: roomName }),
          el('div', { class: 'meta' }, dots, `${count}/6`, ' · host ' + game.host, playing ? el('span', { class: 'badge live', text: 'In progress' }) : null)),
        el('button', {
          class: 'btn btn-primary btn-sm',
          text: playing ? 'In progress' : full ? 'Full' : 'Join',
          disabled: playing || full,
          onclick: () => socket.emit('join_game', roomName)
        })));
    });
  }

  $('create-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('new-room-input').value.trim();
    if (!name) return toast('error', 'Enter a room name cuh');
    socket.emit('create_game', name);
    $('new-room-input').value = '';
  });

  /* ------------------------------------------------------------------ *
   *  Room lifecycle
   * ------------------------------------------------------------------ */
  function resetRoomState() {
    state.roomName = null;
    state.room = null;
    state.hand = [];
    state.selTarget = null;
    state.selCard = null;
    state.typing.room = [];
    $('room-typing-indicator').textContent = '';
    document.title = 'Fish';
  }

  socket.on('room_joined', ({ roomName }) => {
    state.roomName = roomName;
    $('room-title').textContent = roomName;
    showScreen('room');
  });

  socket.on('room_left', ({ reason }) => {
    resetRoomState();
    ['modal-declare', 'modal-gameover'].forEach(closeModal);
    $('room-chat-box').replaceChildren();
    if (reason === 'kicked') toast('error', 'Immanuel threw a brick at your head and you died. #RIP', 6000);
    showScreen('lobby');
  });

  $('leave-btn').addEventListener('click', () => {
    if (state.room && state.room.status === 'playing' &&
        !confirm('Leaving cancels the game for everyone. Leave anyway?')) return;
    socket.emit('leave_game');
  });

  socket.on('room_data_updated', (room) => {
    state.room = room;
    renderRoom();
  });

  socket.on('receive_hand', (hand) => {
    state.hand = hand;
    if (state.room) renderRoom();
  });

  socket.on('game_over', ({ winner, winningTeam, score, cancelled }) => {
    state.hand = [];
    state.selCard = null;
    state.selTarget = null;
    closeModal('modal-declare');

    $('gameover-eyebrow').textContent = cancelled ? 'Game cancelled' : 'Game over';
    $('gameover-title').textContent = winner;
    $('gameover-title').style.color = winningTeam ? `var(--team${winningTeam})` : '';
    $('final-1').textContent = score[1];
    $('final-2').textContent = score[2];
    openModal('modal-gameover');
  });
  $('gameover-close').addEventListener('click', () => closeModal('modal-gameover'));

  /* ------------------------------------------------------------------ *
   *  Rendering the room
   * ------------------------------------------------------------------ */
  function renderRoom() {
    const room = state.room;
    if (!room) return;

    const meIdx = room.players.findIndex((p) => p.name === state.name);
    if (meIdx === -1) return;
    const me = room.players[meIdx];
    const playing = room.status === 'playing';

    $('room-title').textContent = room.roomName;
    $('lobby-area').hidden = playing;
    $('table-area').hidden = !playing;
    $('halfsuit-panel').hidden = !playing;
    $('activity-panel').hidden = !playing;
    $('scoreboard').hidden = !playing;

    if (!playing) {
      document.title = 'Fish';
      renderWaiting(room, me);
      return;
    }

    $('score-1').textContent = room.score[1];
    $('score-2').textContent = room.score[2];

    renderTurnBanner(room, me, meIdx);
    renderSeats(room, me, meIdx);
    renderHand();
    renderAsk(room, me, meIdx);
    renderHalfSuits(room);
    renderLog(room);
  }

  /* ----- waiting room ----- */
  function renderWaiting(room, me) {
    const isHost = room.host === state.name;
    $('seat-count').textContent = `${room.players.length}/${room.maxPlayers} players`;

    [1, 2].forEach((team) => {
      const box = $(`team-${team}-slots`);
      box.replaceChildren();
      const members = room.players.filter((p) => p.team === team);

      members.forEach((p) => {
        const row = el('div', { class: 'slot' + (p.connected ? '' : ' offline'), dataset: { team } },
          el('div', { class: 'avatar', text: initial(p.name) }),
          el('div', { class: 'grow' },
            p.name,
            p.name === state.name ? el('span', { class: 'you-tag', text: 'You' }) : null,
            p.name === room.host ? el('span', { class: 'host-tag', text: 'Host' }) : null,
            p.connected ? null : el('span', { class: 'you-tag', text: 'reconnecting…' })));
        if (isHost && p.name !== state.name) {
          row.append(el('button', { class: 'btn btn-danger btn-sm', text: 'Kick', onclick: () => socket.emit('kick_player', p.name) }));
        }
        box.append(row);
      });

      for (let i = members.length; i < room.teamSize; i++) {
        box.append(el('div', { class: 'slot empty', text: 'Open seat' }));
      }
    });

    const otherTeam = me.team === 1 ? 2 : 1;
    $('switch-team-btn').disabled = room.players.filter((p) => p.team === otherTeam).length >= room.teamSize;

    const start = $('start-game-btn');
    start.hidden = !isHost;
    const missing = room.maxPlayers - room.players.length;
    const away = room.players.find((p) => !p.connected);
    start.disabled = missing > 0 || Boolean(away);

    let hint;
    if (missing > 0) hint = `Waiting for ${missing} more player${missing === 1 ? '' : 's'}…`;
    else if (away) hint = `${away.name} is reconnecting…`;
    else hint = isHost ? "Everyone's here. Start whenever you're ready." : `Waiting for ${room.host} to start the game…`;
    $('start-hint').textContent = hint;
  }
  $('switch-team-btn').addEventListener('click', () => socket.emit('switch_team'));
  $('start-game-btn').addEventListener('click', () => socket.emit('start_game'));

  /* ----- turn banner ----- */
  function renderTurnBanner(room, me, meIdx) {
    const banner = $('turn-banner');
    banner.replaceChildren();
    const turnPlayer = room.players[room.turn];
    const myTurn = room.turn === meIdx;

    banner.className = 'turn-banner' + (myTurn ? ' mine' : '');
    banner.dataset.team = turnPlayer.team;
    document.title = (myTurn ? '▶ Your turn · ' : '') + 'Fish';

    if (myTurn && me.cardCount > 0) {
      banner.append(el('div', {},
        el('div', { class: 'title', text: 'Your turn' }),
        el('div', { class: 'sub', text: 'Pick an opponent and a card to ask for. Or declare a half-suit if you know where it all is.' })));
      return;
    }

    if (myTurn) {
      const mates = room.players
        .map((p, i) => ({ p, i }))
        .filter(({ p, i }) => i !== meIdx && p.team === me.team && p.cardCount > 0);

      banner.append(el('div', {},
        el('div', { class: 'title', text: "You're out of cards" }),
        el('div', { class: 'sub', text: mates.length ? 'Pass the turn to a teammate who still has cards.' : 'Your team has no cards left. The other team has to declare what remains.' })));
      if (mates.length) {
        banner.append(el('div', { class: 'banner-actions' },
          mates.map(({ p, i }) => el('button', { class: 'btn btn-primary btn-sm', text: `Pass to ${p.name}`, onclick: () => socket.emit('pass_turn', i) }))));
      }
      return;
    }

    let sub = `Team ${turnPlayer.team}`;
    if (!turnPlayer.connected) sub += ' · lost connection, their seat is being held';
    else if (turnPlayer.cardCount === 0) sub += ' · out of cards, passing to a teammate';
    banner.append(el('div', {},
      el('div', { class: 'title', text: `Waiting for ${turnPlayer.name}` }),
      el('div', { class: 'sub', text: sub })));
  }

  /* ----- seats ----- */
  function canAsk(room, me, meIdx) {
    return room.turn === meIdx && me.cardCount > 0;
  }

  function renderSeats(room, me, meIdx) {
    [1, 2].forEach((team) => {
      const box = $(`seats-${team}`);
      box.replaceChildren();

      room.players.forEach((p, i) => {
        if (p.team !== team) return;
        const clickable = canAsk(room, me, meIdx) && p.team !== me.team && p.cardCount > 0;
        const cls = 'seat' + (room.turn === i ? ' turn' : '') + (p.connected ? '' : ' offline') + (state.selTarget === i ? ' selected' : '');

        const body = [
          el('div', { class: 'avatar', text: initial(p.name), dataset: { team } }),
          el('div', { class: 'info' },
            el('div', { class: 'nm' }, p.name, i === meIdx ? el('span', { class: 'you-tag', text: 'You' }) : null),
            el('div', { class: 'ct', text: p.connected ? `${p.cardCount} card${p.cardCount === 1 ? '' : 's'}` : 'reconnecting…' }))
        ];

        const seat = clickable
          ? el('button', { class: cls, type: 'button', dataset: { team }, onclick: () => selectTarget(i) }, body)
          : el('div', { class: cls, dataset: { team } }, body);
        box.append(seat);
      });
    });
  }

  /* ----- hand ----- */
  function renderHand() {
    const container = $('my-hand');
    container.replaceChildren();
    $('hand-count').textContent = `${state.hand.length} card${state.hand.length === 1 ? '' : 's'}`;

    if (state.hand.length === 0) {
      container.append(el('p', { class: 'muted', text: 'You have no cards left.' }));
      return;
    }

    const groups = new Map();
    [...state.hand].sort((a, b) => a[0] - b[0] || a[1] - b[1]).forEach((card) => {
      if (!groups.has(card[0])) groups.set(card[0], []);
      groups.get(card[0]).push(card);
    });

    groups.forEach((cards, suit) => {
      container.append(el('div', { class: 'hand-group' },
        el('div', { class: 'hand-group-label' }, suitLabel(suit), el('span', { class: 'pill', text: cards.length })),
        el('div', { class: 'hand-cards' }, cards.map((c) => cardImg(c)))));
    });
  }

  /* ----- asking ----- */
  function legalAsks() {
    const suits = new Set(state.hand.map((c) => c[0]));
    const out = new Map();
    suits.forEach((suit) => {
      const missing = [];
      for (let rank = 0; rank < 6; rank++) {
        if (!state.hand.some((c) => c[0] === suit && c[1] === rank)) missing.push([suit, rank]);
      }
      if (missing.length) out.set(suit, missing);
    });
    return out;
  }

  function selectTarget(i) {
    state.selTarget = state.selTarget === i ? null : i;
    renderRoom();
  }

  function selectCard(card) {
    state.selCard = sameCard(state.selCard, card) ? null : card;
    renderRoom();
  }

  function renderAsk(room, me, meIdx) {
    const active = canAsk(room, me, meIdx);
    $('ask-panel').classList.toggle('waiting', !active);

    // Drop selections that stopped being valid (turn moved, card changed hands, ...).
    const target = state.selTarget != null ? room.players[state.selTarget] : null;
    if (!active || !target || target.team === me.team || target.cardCount === 0) state.selTarget = null;
    const asks = legalAsks();
    if (!active || !state.selCard || !(asks.get(state.selCard[0]) || []).some((c) => sameCard(c, state.selCard))) state.selCard = null;

    // 1. opponents
    const targets = $('ask-targets');
    targets.replaceChildren();
    room.players.forEach((p, i) => {
      if (p.team === me.team) return;
      targets.append(el('button', {
        class: 'chip' + (state.selTarget === i ? ' selected' : ''),
        type: 'button',
        dataset: { team: p.team },
        disabled: !active || p.cardCount === 0,
        onclick: () => selectTarget(i)
      }, el('span', { text: p.name }), el('small', { text: `${p.cardCount} card${p.cardCount === 1 ? '' : 's'}` })));
    });

    // 2. cards
    const cards = $('ask-cards');
    cards.replaceChildren();
    if (asks.size === 0) {
      cards.append(el('p', { class: 'muted', text: state.hand.length ? 'You hold every card in your half-suits. Declare one!' : 'You have no cards to ask with.' }));
    }
    asks.forEach((missing, suit) => {
      cards.append(el('div', {},
        el('div', { class: 'pick-group-label' }, suitLabel(suit)),
        el('div', { class: 'pick-row' }, missing.map((c) => el('button', {
          class: 'pick-card' + (sameCard(state.selCard, c) ? ' selected' : ''),
          type: 'button',
          title: cardName(c[0], c[1]),
          'aria-label': cardName(c[0], c[1]),
          disabled: !active,
          onclick: () => selectCard(c)
        }, cardImg(c))))));
    });

    // summary + button
    const summary = $('ask-summary');
    summary.replaceChildren();
    if (!active) {
      summary.textContent = 'Wait for your turn to ask. You can still declare a half-suit.';
    } else if (state.selTarget != null && state.selCard) {
      summary.append('Ask ', strong(room.players[state.selTarget].name), ' for ', cardChip(state.selCard));
    } else {
      summary.textContent = state.selTarget == null ? 'Choose who to ask.' : 'Choose which card to ask for.';
    }
    $('ask-btn').disabled = !(active && state.selTarget != null && state.selCard);
  }

  $('ask-btn').addEventListener('click', () => {
    if (state.selTarget == null || !state.selCard) return;
    socket.emit('card_asked', state.selCard, state.selTarget);
    state.selCard = null;
  });

  /* ----- half-suit tracker ----- */
  function renderHalfSuits(room) {
    const grid = $('halfsuit-grid');
    grid.replaceChildren();
    HALF_SUITS.forEach((hs, suit) => {
      const team = room.declaredBy[suit];
      grid.append(el('div', { class: 'hs-tile', dataset: { state: team ? String(team) : 'open', team: team || '' } },
        el('span', { class: 'sym' + (hs.red ? ' red' : ''), text: hs.symbol }),
        hs.name,
        el('span', { class: 'by', text: team ? `TEAM ${team}` : 'OPEN' })));
    });
  }

  /* ----- activity log ----- */
  function renderLog(room) {
    const box = $('activity-log');
    box.replaceChildren();
    const entries = [...room.log].reverse().slice(0, 40);

    entries.forEach((e, idx) => {
      const cls = (extra = '') => `log-item ${extra}${idx === 0 ? ' latest' : ''}`;

      if (e.t === 'ask') {
        box.append(el('div', { class: cls(), dataset: { team: e.askerTeam } },
          el('div', {}, strong(e.asker), ' asked ', strong(e.target), ' for ', cardChip(e.card)),
          el('div', { class: `result ${e.ok ? 'hit' : 'miss'}`, text: e.ok ? 'Got it ✓' : "Doesn't have it ✗ turn passes" })));
      } else if (e.t === 'declare') {
        box.append(el('div', { class: cls(), dataset: { team: e.team } },
          el('div', {}, strong(e.player), ' declared ', suitLabel(e.suit)),
          el('div', { class: `result ${e.ok ? 'hit' : 'miss'}`, text: e.ok ? `Correct ✓ Team ${e.pointTo} scores` : `Wrong ✗ Team ${e.pointTo} scores` })));
      } else if (e.t === 'pass') {
        box.append(el('div', { class: cls(), dataset: { team: e.team } },
          strong(e.from), ' passed the turn to ', strong(e.to)));
      } else if (e.t === 'start') {
        box.append(el('div', { class: cls('note') }, `Game started. ${e.first} goes first.`));
      } else {
        box.append(el('div', { class: cls('note'), text: e.text }));
      }
    });
  }

  /* ------------------------------------------------------------------ *
   *  Declaring a half-suit
   * ------------------------------------------------------------------ */
  function myTeamIndexes() {
    const room = state.room;
    const me = room.players.find((p) => p.name === state.name);
    return room.players.map((p, i) => ({ p, i })).filter(({ p }) => p.team === me.team);
  }

  $('declare-open-btn').addEventListener('click', () => {
    if (!state.room || state.room.status !== 'playing') return;
    state.declare = { suit: null, holders: Array(6).fill(null) };
    renderDeclare();
    openModal('modal-declare');
  });
  $('declare-cancel').addEventListener('click', () => closeModal('modal-declare'));

  function chooseSuit(suit) {
    const meIdx = state.room.players.findIndex((p) => p.name === state.name);
    state.declare.suit = suit;
    // Cards I'm holding are obviously mine: fill those in.
    state.declare.holders = Array.from({ length: 6 }, (_, rank) => (state.hand.some((c) => c[0] === suit && c[1] === rank) ? meIdx : null));
    renderDeclare();
  }

  function renderDeclare() {
    const room = state.room;
    if (!room) return;
    const { suit, holders } = state.declare;
    const meIdx = room.players.findIndex((p) => p.name === state.name);

    const picker = $('declare-suits');
    picker.replaceChildren();
    HALF_SUITS.forEach((hs, s) => {
      const done = room.declaredSuits.includes(s);
      picker.append(el('button', {
        class: 'suit-tile' + (suit === s ? ' active' : ''),
        type: 'button',
        disabled: done,
        title: done ? 'Already declared' : '',
        onclick: () => chooseSuit(s)
      }, el('span', { class: 'sym' + (hs.red ? ' red' : ''), text: hs.symbol }), hs.name));
    });

    const rows = $('declare-rows');
    rows.replaceChildren();
    if (suit == null) {
      rows.append(el('p', { class: 'muted', text: 'Choose a half-suit above.' }));
    } else {
      const mates = myTeamIndexes();
      for (let rank = 0; rank < 6; rank++) {
        rows.append(el('div', { class: 'declare-row' },
          cardImg([suit, rank]),
          el('div', { class: 'nm', text: cardName(suit, rank) }),
          el('div', { class: 'seg' }, mates.map(({ p, i }) => el('button', {
            type: 'button',
            class: holders[rank] === i ? 'on' : '',
            text: i === meIdx ? `${p.name} (you)` : p.name,
            onclick: () => { state.declare.holders[rank] = i; renderDeclare(); }
          })))));
      }
    }

    const ready = suit != null && holders.every((h) => h != null);
    const submit = $('declare-submit');
    submit.disabled = !ready;
    submit.textContent = suit == null ? 'Declare' : `Declare ${HALF_SUITS[suit].name}`;
  }

  $('declare-submit').addEventListener('click', () => {
    const { suit, holders } = state.declare;
    if (suit == null || holders.some((h) => h == null)) return;
    socket.emit('declare_suit', suit, holders);
    closeModal('modal-declare');
  });

  // Keep an open declare dialog honest if the game changes underneath it.
  socket.on('room_data_updated', (room) => {
    if (!$('modal-declare').hidden) {
      if (room.status !== 'playing') closeModal('modal-declare');
      else {
        if (state.declare.suit != null && room.declaredSuits.includes(state.declare.suit)) state.declare = { suit: null, holders: Array(6).fill(null) };
        renderDeclare();
      }
    }
  });

  /* ------------------------------------------------------------------ *
   *  Chat
   * ------------------------------------------------------------------ */
  function addChat(context, { sender, text }) {
    const box = $(`${context}-chat-box`);
    const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 24;
    box.append(el('div', { class: 'chat-message' + (sender === state.name ? ' mine' : '') }, el('strong', { text: sender + ':' }), ' ', text));
    if (atBottom || sender === state.name) box.scrollTop = box.scrollHeight;
  }

  socket.on('global_chat_message', (m) => addChat('lobby', m));
  socket.on('room_chat_message', (m) => addChat('room', m));
  socket.on('chat_history', ({ context, messages }) => {
    $(`${context}-chat-box`).replaceChildren();
    messages.forEach((m) => addChat(context, m));
  });

  let typingTimer;
  function handleTyping(context) {
    socket.emit('typing', { context, isTyping: true });
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => socket.emit('typing', { context, isTyping: false }), 2000);
  }

  document.querySelectorAll('.chat-form').forEach((form) => {
    const context = form.dataset.context;
    const input = form.querySelector('input');
    input.addEventListener('input', () => handleTyping(context));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      socket.emit('chat_message', text);
      input.value = '';
      clearTimeout(typingTimer);
      socket.emit('typing', { context, isTyping: false });
    });
  });

  socket.on('user_typing', ({ name, isTyping, context }) => {
    const list = state.typing[context];
    const i = list.indexOf(name);
    if (isTyping && i === -1) list.push(name);
    if (!isTyping && i > -1) list.splice(i, 1);

    let text = '';
    if (list.length === 1) text = `${list[0]} is typing...`;
    else if (list.length > 1) text = 'Several people are typing...';
    $(`${context}-typing-indicator`).textContent = text;
  });

  /* ------------------------------------------------------------------ *
   *  Misc wiring
   * ------------------------------------------------------------------ */
  document.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) openModal(open.dataset.open);
    const close = e.target.closest('[data-close]');
    if (close) closeModal(close.dataset.close);
    if (e.target.classList && e.target.classList.contains('modal') && e.target.id !== 'modal-replaced') {
      e.target.hidden = true;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.modal').forEach((m) => { if (m.id !== 'modal-replaced') m.hidden = true; });
  });

  // Show the loading screen first if we have a stored name; the server decides where to send us.
  showScreen(state.name ? 'loading' : 'login');
})();
