class Deck {
    constructor() {
        this.cards = [];
        for (let a=0; a < 9; a++) {
            for (let b=0; b < 6; b++) {
                this.cards.push([a, b]);
            }
        }
    }
    deal(players) {
        c = 54;
        for (let a=0; a<6; a++) {
            for (let b=0; b<9; b++) {
                players[a].addCard(this.cards[Math.floor(Math.random() * c) + 1]);
                c--;
            }
        }
    }
}