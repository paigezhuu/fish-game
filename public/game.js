import { Player } from "./player.js";
export class Game {
    constructor(players, turn) {
        this.cards = [];
        this.players = players;
        this.turn = turn;
    }
    deal() {
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
                this.players[a].addCard(cardsC[d]);
                cardsC.splice(d, 1);
                c--;
            }
        }
        return this.cards;
    }
    takeTurn(choice, target) {
    
        if (this.players[target].hasCard(choice))
        {
            this.players[target].loseCard(choice);
            this.players[this.turn].addCard(choice);
        }
        else
        {
            this.turn = target;
        }
        return this.turn;
    }
    declareSuit(suit, holders) {
        let stat = true;
        for (let a = 0; a<6; a++) {
            if (!(this.players[holders[a]].hasCard([suit, a])))
            {
                stat = false;
            }
        }
        for (let i = 0; i<6; i++) {
            for (let j = 0; j<6; j++) {
                this.players[i].loseCard([suit, j]);
            }
        }
        return stat;
    }
}