class Player {
    constructor(id, name) {
        this.id = id;
        this.name = name;
        this.hand = [];
    }   
    addCard(card) {
        this.hand.push(card);
    }
    loseCard(card) {
        let a = this.hand.findIndex(c => c[0] === card[0] && c[1] === card[1]);
        if (a != -1) {
            this.hand.splice(a, 1);
        }
    }
    hasCard(card) { 
        return this.hand.some(c => c[0] == card[0] && c[1] == card[1]);
    }
    legalAsk(ask) {
        for (const card of this.hand) {
            if (card != null && ask != null && card[0] == ask[0] && card[1] == ask[1]) { 
                return false; 
            }
        }
        for (const card of this.hand) {
            if (card != null && ask != null && card[0] == ask[0] && card[1] != ask[1]) { 
                return true; 
            }
        }
        return false;
    }
}

module.exports = { Player };