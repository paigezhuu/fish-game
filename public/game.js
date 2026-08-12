import { Player } from "./player.js";

export class Game {
    constructor() {
        this.cards = [];
    }
    deal(players) {
        for (let a=0; a < 9; a++) {
            for (let b=0; b < 6; b++) {
                this.cards.push([a, b]);
            }
        }
        let cardsC = [...this.cards];
        let c = 54;
        for (let a=0; a<6; a++) {
            for (let b=0; b<9; b++) {
                let d = Math.floor(Math.random() * c);
                players[a].addCard(cardsC[d]);
                cardsC.splice(d, 1);
                c--;
            }
        }
        return this.cards;
    }
    takeTurn(players, turn, choice, target) {
    
        if (players[target].hasCard(choice))
        {
            players[target].loseCard(choice);
            players[turn].addCard(choice);
            return turn;
        }
        else
        {
            return target;
        }
    }
    declareSuit(players, suit, holders) {
        let stat = true;
        for (let a = 0; a<6; a++) {
            if (!(players[holders[a]].hasCard([suit, a])))
            {
                stat = false;
            }
        }
        for (let i = 0; i<6; i++) {
            for (let j = 0; j<6; j++) {
                players[i].loseCard([suit, j]);
            }
        }
        return stat;
    }
}
