import { Player } from "./player.js";
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
let cards = [];
for (let a=0; a < 9; a++) {
    for (let b=0; b < 6; b++) {
        cards.push([a, b]);
    }
}
let cardsC = [...cards];
let c = 54;
for (let a=0; a<6; a++) {
    for (let b=0; b<9; b++) {
        let d = Math.floor(Math.random() * c);
        players[a].addCard(cardsC[d]);
        cardsC.splice(d, 1);
        c--;
    }
}
let turn = 0; 
for (let a=0; a<10000; a++){
    let valid = [];
    for (let i=0; i<54; i++){
        if (players[turn].legalAsk(cards[i])) {
            valid.push(cards[i])
        }
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
        if (players[target].hasCard(valid[choice]))
        {
            players[target].loseCard(valid[choice]);
            players[turn].addCard(valid[choice]);
        }
        else
        {
            turn = target;
        }
    }
}
for (const player of players) {
    console.log(`${player.name}: ${JSON.stringify(player.hand)}`);
}