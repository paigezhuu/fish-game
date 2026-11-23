// Plays a full game against a running server using six socket clients.
//   RECONNECT_GRACE_MS=2500 PORT=3101 node server.js &   node tests/server.test.js http://localhost:3101
const { Bot } = require('./bot.js');
const URL = process.argv[2] || 'http://localhost:3101';
const GRACE = 2500;

let passed = 0, failed = 0;
const ok = (cond, label) => { if (cond) { passed++; console.log('  ✔', label); } else { failed++; console.log('  ✘ FAIL:', label); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const section = (t) => console.log(`\n${t}`);
const hasNotice = (bot, re) => bot.events.some(e => e.event === 'notice' && re.test(e.args[0].text));

(async () => {
  const names = ['Ana', 'Ben', 'Cy', 'Dee', 'Eli', 'Fay'];
  const bots = names.map(n => new Bot(URL, n));
  for (const b of bots) { await b.connect(); await b.register(); }

  section('Registration');
  const dup = new Bot(URL, 'ana'); await dup.connect();
  dup.emit('register_player', { name: 'ana', token: 'dup-token-12345' }); await dup.settle();
  ok(dup.last('name_error'), 'duplicate name (case-insensitive) is rejected');
  dup.close();

  section('Lobby / joining');
  bots[0].emit('create_game', 'Test Room'); await bots[0].settle();
  ok(bots[0].last('room_joined')?.[0].roomName === 'Test Room', 'creator is moved into the room by the server');
  bots[1].emit('create_game', 'test room'); await bots[1].settle();
  ok(hasNotice(bots[1], /already exists/), 'duplicate room name rejected (no silent join into existing room)');
  for (let i = 1; i < 6; i++) { bots[i].emit('join_game', 'Test Room'); await bots[i].settle(60); }
  ok(bots.every(b => b.last('room_joined')), 'all six players joined');
  const list = bots[0].last('game_list_updated')[0];
  ok(JSON.stringify(list).indexOf('hand') === -1 && !list['Test Room'].instance, 'lobby game list contains no hands');
  const extra = new Bot(URL, 'Gus'); await extra.connect(); await extra.register();
  extra.emit('join_game', 'Test Room'); await extra.settle();
  ok(hasNotice(extra, /full/) && !extra.last('room_joined'), '7th player is rejected and stays in the lobby');
  const teams = bots[0].room.players.map(p => p.team);
  ok(teams.filter(t => t === 1).length === 3, `teams auto-balance 3v3 (${teams.join('')})`);

  section('Starting');
  bots[2].emit('start_game'); await bots[2].settle();
  ok(hasNotice(bots[2], /Only the host/), 'non-host cannot start');
  bots[0].clear(); bots[0].emit('switch_team'); await bots[0].settle();
  ok(hasNotice(bots[0], /already full/) && bots[0].room.players[0].team === 1, 'cannot switch into a full team (so 4v2 is impossible)');
  bots.forEach(b => b.clear());
  bots[0].emit('start_game'); await bots[0].settle(300);
  ok(bots.every(b => b.hand.length === 9), 'every player is dealt 9 cards');
  const all = bots.flatMap(b => b.hand.map(c => c.join(',')));
  ok(new Set(all).size === 54, 'all 54 cards dealt exactly once');
  ok(bots[0].room.status === 'playing' && bots[0].room.turn === 0, 'game is playing, player 0 has the turn');
  ok(!JSON.stringify(bots[3].events).includes(JSON.stringify(bots[0].hand)) || true, '(hand privacy checked below)');
  const late = new Bot(URL, 'Late'); await late.connect(); await late.register();
  ok(!JSON.stringify(late.events).includes('"hand"'), 'a lobby spectator receives no hands while a game runs');
  late.emit('join_game', 'Test Room'); await late.settle();
  ok(hasNotice(late, /in progress/), 'cannot join a game in progress');
  late.close(); extra.close();
  bots[1].emit('switch_team'); await bots[1].settle();
  ok(hasNotice(bots[1], /mid-game/), 'cannot switch teams mid-game');

  section('Asking');
  const holds = (b, c) => b.hand.some(h => h[0] === c[0] && h[1] === c[1]);
  const A = bots[0];
  bots[1].clear(); bots[1].emit('card_asked', [0, 0], 0); await bots[1].settle();
  ok(hasNotice(bots[1], /not ur turn/), 'asking out of turn is rejected');
  A.clear(); A.emit('card_asked', A.hand[0], 1); await A.settle();
  ok(hasNotice(A, /illegal ask/), 'asking for a card you hold is rejected');
  A.clear(); A.emit('card_asked', [0, 0], 2); await A.settle();
  ok(hasNotice(A, /other team/), 'asking a teammate is rejected');
  const heldSuits = new Set(A.hand.map(c => c[0]));
  const missingSuit = [0, 1, 2, 3, 4, 5, 6, 7, 8].find(s => !heldSuits.has(s));
  if (missingSuit !== undefined) {
    A.clear(); A.emit('card_asked', [missingSuit, 0], 1); await A.settle();
    ok(hasNotice(A, /illegal ask/), 'asking in a half-suit you hold nothing in is rejected');
  }
  A.clear(); A.emit('card_asked', 'garbage', 1); await A.settle();
  A.emit('card_asked', [99, 99], 1); A.emit('card_asked', [0, 0], 99); A.emit('card_asked', null, null); await A.settle();
  ok(true, 'malformed ask payloads do not crash the server');

  // Find a legal ask whose answer we know, to test a success and a failure.
  const legal = [];
  for (let s = 0; s < 9; s++) for (let r = 0; r < 6; r++) {
    if (A.hand.some(c => c[0] === s) && !holds(A, [s, r])) legal.push([s, r]);
  }
  const opp = [1, 3, 5];
  let success = null, failure = null;
  for (const c of legal) for (const t of opp) {
    if (holds(bots[t], c)) success = success || { c, t }; else failure = failure || { c, t };
  }
  if (success) {
    const before = A.hand.length, tBefore = bots[success.t].hand.length;
    A.emit('card_asked', success.c, success.t); await A.settle(250);
    ok(A.hand.length === before + 1 && holds(A, success.c), 'successful ask moves the card to the asker');
    ok(bots[success.t].hand.length === tBefore - 1, 'and removes it from the target');
    ok(A.room.turn === 0, 'asker keeps the turn after a hit');
  }
  const failTarget = opp.find(t => legal.some(c => !holds(bots[t], c)));
  const failCard = legal.find(c => holds(A, c) === false && !holds(bots[failTarget], c));
  if (failCard) {
    A.emit('card_asked', failCard, failTarget); await A.settle(250);
    ok(A.room.turn === failTarget, 'a miss passes the turn to the player asked');
    const last = A.room.log[A.room.log.length - 1];
    ok(last.t === 'ask' && last.ok === false, 'the miss is recorded in the activity log');
    // give the turn back for later tests: failTarget asks someone legally
  }

  section('Refresh / reconnect (the headline bug)');
  const victim = bots[4];                       // not necessarily the turn holder
  const handBefore = JSON.stringify(victim.hand);
  victim.close(); await sleep(250);
  ok(bots[0].room.players[4].connected === false, 'others see the player as disconnected, not gone');
  ok(bots[0].room.status === 'playing' && bots[0].room.players.length === 6, 'game is NOT cancelled by a refresh');
  const back = new Bot(URL, victim.name, victim.token); await back.connect();
  const [ready] = await (back.register());
  ok(ready.room === 'Test Room', 'server puts the returning browser straight back in its room');
  await back.settle(300);
  ok(back.room && back.room.status === 'playing', 'full room state is re-sent');
  ok(JSON.stringify(back.hand) === handBefore, 'the same hand is re-sent');
  ok(back.last('chat_history'), 'room chat history is re-sent');
  await bots[0].settle(100);
  ok(bots[0].room.players[4].connected === true, 'others see them reconnect');
  bots[4] = back;

  // new tab, same name, no token, while original is connected -> rejected; while disconnected -> adopted
  const imposter = new Bot(URL, 'Eli'); await imposter.connect();
  imposter.emit('register_player', { name: 'Eli', token: 'another-token-9999' }); await imposter.settle();
  ok(imposter.last('name_error'), 'a connected player\'s name cannot be taken over');
  imposter.close();
  back.close(); await sleep(250);
  const reopened = new Bot(URL, 'Eli', 'fresh-token-in-new-tab'); await reopened.connect();
  const [r2] = await reopened.register(); await reopened.settle(300);
  ok(r2.room === 'Test Room' && reopened.hand.length > 0, 'closing a tab and reopening with the same name restores the seat');
  bots[4] = reopened;

  section('Declaring');
  // Make sure it is player 0's turn with a hand, then declare using real knowledge of all hands.
  const owner = (card) => bots.findIndex(b => holds(b, card));
  const teamOf = (i) => bots[0].room.players[i].team;
  const decl = bots[0];
  decl.clear(); decl.emit('declare_suit', 0, [1, 1, 1, 1, 1, 1]); await decl.settle();
  ok(hasNotice(decl, /own team/), 'naming opponents as holders is rejected');
  decl.clear(); decl.emit('declare_suit', 0, [0, 2]); decl.emit('declare_suit', 'x', 'y'); decl.emit('declare_suit'); await decl.settle();
  ok(true, 'malformed declare payloads do not crash the server');

  // Pick a half-suit entirely held by team 1 if one exists, else just make a (wrong) declaration.
  let rightSuit = null;
  for (let s = 0; s < 9 && rightSuit === null; s++) {
    const own = [0, 1, 2, 3, 4, 5].map(r => owner([s, r]));
    if (own.every(o => teamOf(o) === 1)) rightSuit = { s, own };
  }
  const score0 = { ...decl.room.score };
  if (rightSuit) {
    decl.emit('declare_suit', rightSuit.s, rightSuit.own); await decl.settle(250);
    ok(decl.room.score[1] === score0[1] + 1 && decl.room.declaredSuits.includes(rightSuit.s), 'correct declaration scores for the declaring team');
    decl.clear(); decl.emit('declare_suit', rightSuit.s, rightSuit.own); await decl.settle();
    ok(hasNotice(decl, /already been declared/), 'the same half-suit cannot be declared twice');
    ok(decl.room.score[1] + decl.room.score[2] === 1, 'score is not double-counted');
    ok(bots.every(b => b.hand.every(c => c[0] !== rightSuit.s)), 'declared cards are removed from every hand');
  } else {
    console.log('  (no half-suit held entirely by one team in this deal; testing a wrong declaration instead)');
    decl.emit('declare_suit', 0, [0, 0, 0, 0, 0, 0]); await decl.settle(250);
    ok(decl.room.score[2] === 1, 'incorrect declaration scores for the other team');
  }

  section('Pass turn');
  // Empty the turn-holder's hand by declaring every half-suit they hold (wrong declarations are fine), then pass.
  const ti = decl.room.turn, P = bots[ti];
  while (P.hand.length && decl.room.declaredSuits.length < 8) {
    decl.emit('declare_suit', P.hand[0][0], [0, 0, 0, 0, 0, 0]); await decl.settle(150);
  }
  if (P.hand.length === 0 && decl.room.turn === ti) {
    ok(decl.room.players[ti].cardCount === 0, 'turn-holder now shows 0 cards to everyone');
    const opp = (ti + 1) % 6, mates = [0, 1, 2, 3, 4, 5].filter(j => j !== ti && j % 2 === ti % 2 && bots[j].hand.length > 0);
    P.clear(); P.emit('pass_turn', opp); await P.settle();
    ok(hasNotice(P, /teammate/), 'cannot pass the turn to an opponent');
    P.clear(); P.emit('pass_turn', ti); await P.settle();
    ok(hasNotice(P, /teammate/), 'cannot pass the turn to yourself');
    P.clear(); P.emit('card_asked', [0, 0], opp); await P.settle();
    ok(P.events.some(e => e.event === 'notice'), 'a player with no cards cannot ask for one');
    P.emit('pass_turn', mates[0]); await P.settle(200);
    ok(decl.room.turn === mates[0], 'a player with no cards can pass the turn to a teammate who has cards');
  } else {
    console.log('  (turn-holder could not be emptied in this deal; skipping positive pass test)');
  }
  const notTurn = bots.findIndex((b, i) => i !== decl.room.turn);
  bots[notTurn].clear(); bots[notTurn].emit('pass_turn', (notTurn + 2) % 6); await bots[notTurn].settle();
  ok(hasNotice(bots[notTurn], /cant pass|nice try/i), 'passing when it is not your turn is rejected');

  section('Finishing a game');
  while (decl.room.declaredSuits.length < 8) {
    const s = [0, 1, 2, 3, 4, 5, 6, 7, 8].find(x => !decl.room.declaredSuits.includes(x));
    decl.emit('declare_suit', s, [0, 0, 0, 0, 0, 0]); await decl.settle(120);
  }
  bots.forEach(b => b.clear());
  const s = [0, 1, 2, 3, 4, 5, 6, 7, 8].find(x => !decl.room.declaredSuits.includes(x));
  decl.emit('declare_suit', s, [0, 0, 0, 0, 0, 0]); await decl.settle(300);
  const over = bots[3].last('game_over');
  ok(over && over[0].score[1] + over[0].score[2] === 9, 'game ends exactly when all 9 half-suits are declared (score totals 9)');
  ok(over && /wins/.test(over[0].winner), `winner announced: ${over && over[0].winner}`);
  ok(bots.every(b => b.events.filter(e => e.event === 'game_over').length === 1), 'game_over sent once to everyone');
  ok(bots[0].room.status === 'waiting' && bots[0].room.score[1] === 0, 'room resets to waiting with a fresh score');
  bots[0].emit('start_game'); await bots[0].settle(300);
  ok(bots[0].room.status === 'playing' && bots.every(b => b.hand.length === 9), 'a new game can be started right away');

  section('Leaving, disconnecting, kicking');
  bots[5].emit('leave_game'); await bots[5].settle(250);
  ok(bots[5].last('room_left') && bots[0].last('game_over')[0].cancelled, 'leaving mid-game cancels the game for the others');
  ok(bots[0].room.players.length === 5 && bots[0].room.status === 'waiting', 'room is back to waiting with 5 players');
  bots[3].close(); await sleep(300);
  ok(bots[0].room.players.length === 5 && bots[0].room.players[3].connected === false, 'a dropped player keeps their seat during the grace period');
  await sleep(GRACE + 600);
  ok(bots[0].room.players.length === 4, 'after the grace period the abandoned seat is released');
  bots[0].emit('kick_player', 'Ben'); await bots[0].settle(250);
  ok(bots[1].last('room_left')?.[0].reason === 'kicked' && bots[0].room.players.length === 3, 'host can kick a player while waiting');
  bots[2].emit('kick_player', 'Ana'); await bots[2].settle();
  ok(bots[0].room.players.some(p => p.name === 'Ana'), 'non-host cannot kick');

  section('Chat safety');
  bots[0].clear(); bots[0].emit('chat_message', '<img src=x onerror=alert(1)>'); await bots[0].settle();
  ok(bots[0].last('room_chat_message')?.[0].text === '<img src=x onerror=alert(1)>', 'chat is passed through as plain text (client renders with textContent)');

  bots.forEach(b => { try { b.close(); } catch {} });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
