export class Player {
    constructor(id, name) {
        this.id = id;
        this.name = name;
        this.hand = [];
    }   
    addCard(card) {
        this.hand.push(card)
    }
    legalAsk(ask) {
        for (const card of this.hand) {
            if (card[0] == ask[0] && card[1] != ask[1]) { 
                return true; 
            }
        }
        return false;
    }
}