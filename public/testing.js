import { Player } from "./player.js";
import { Game } from "./game.js";
import readline from "readline";
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
function ask(question) {
    return new Promise(resolve => {
        rl.question(question, resolve);
    });
}
let players = [];
let h = new Player(0, "hm");
let a = new Player(1, "ap");
let w = new Player(2, "wh");
let f = new Player(3, "fo");
let p = new Player(4, "pz");
let s = new Player(5, "ss");
players = [h, a, w, f, p, s];
let turn = 0;
let g = new Game(players, turn);
let cards = g.deal();
for (const player of players) {
    console.log(`${player.name}: ${JSON.stringify(player.hand)}`);
}
for (let a = 0; a <5; a++) {
    let valid = [];
    for (let i=0; i<54; i++){
        if (players[turn].legalAsk(cards[i])) {
            valid.push(cards[i])
        }
    }
    for (const player of players) {
        console.log(`${player.name}: ${JSON.stringify(player.hand)}`);
    }
    console.log(turn);
    console.log(`${JSON.stringify(players[turn].hand)}`);
    console.log(`${JSON.stringify(valid)}`);
    const choice = await ask("select a card (by index) ");
    for (const player of players) {
        console.log(`${player.name}`);
    }
    const target = await ask("select a player to ask ");
    if (target%2 == turn%2) { 
        continue; 
    }
    else {
        turn = g.takeTurn(valid[choice], target);
    }
}
const suit = Number(await ask("suit to declare? "));
let holders = [];
for (let a = 0; a<6; a++) {
    holders.push(Number(await ask("who has next card? ")));
}
console.log(g.declareSuit(suit, holders));
for (const player of players) {
    console.log(`${player.name}: ${JSON.stringify(player.hand)}`);
}