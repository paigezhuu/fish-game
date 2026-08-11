import { Player } from "./player.js";
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
console.log(cards);
let c = 54;
for (let a=0; a<6; a++) {
    for (let b=0; b<9; b++) {
        let d = Math.floor(Math.random() * c) + 1;
        players[a].addCard(cards[d]);
        cards.splice(d, d);
        c--;
    }
}
console.log(players);
