// Minimal Socket.IO client over the raw `ws` package, so the server can be tested
// without installing socket.io-client. Speaks Engine.IO v4 / Socket.IO v5 framing.
const WebSocket = require('ws');

class Bot {
  constructor(url, name, token) {
    this.url = url; this.name = name;
    this.token = token || `tok-${name}-${Math.random().toString(36).slice(2, 12)}`;
    this.handlers = {}; this.events = []; this.hand = []; this.room = null;
    this.open = false;
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url.replace('http', 'ws') + '/socket.io/?EIO=4&transport=websocket');
      this.ws.on('error', reject);
      this.ws.on('close', () => { this.open = false; });
      this.ws.on('message', (raw) => {
        const msg = raw.toString();
        if (msg[0] === '0') this.ws.send('40');                  // engine open -> socket.io connect
        else if (msg[0] === '2') this.ws.send('3');              // ping -> pong
        else if (msg.startsWith('40')) { this.open = true; resolve(this); }
        else if (msg.startsWith('42')) {
          const [event, ...args] = JSON.parse(msg.slice(2));
          this.events.push({ event, args });
          if (event === 'receive_hand') this.hand = args[0];
          if (event === 'room_data_updated') this.room = args[0];
          (this.handlers[event] || []).forEach(h => h(...args));
        }
      });
    });
  }
  emit(event, ...args) { this.ws.send('42' + JSON.stringify([event, ...args])); }
  on(event, fn) { (this.handlers[event] = this.handlers[event] || []).push(fn); }
  last(event) { for (let i = this.events.length - 1; i >= 0; i--) if (this.events[i].event === event) return this.events[i].args; return null; }
  clear() { this.events = []; }
  register() { this.emit('register_player', { name: this.name, token: this.token }); return this.wait('session_ready'); }
  wait(event, ms = 3000) {
    return new Promise((resolve, reject) => {
      const found = this.last(event);
      const t = setTimeout(() => reject(new Error(`${this.name}: timed out waiting for ${event}`)), ms);
      const h = (...a) => { clearTimeout(t); resolve(a); };
      (this.handlers[event] = this.handlers[event] || []).push(h);
      if (found && this._fresh) { /* never reuse stale events */ }
    });
  }
  async settle(ms = 120) { await new Promise(r => setTimeout(r, ms)); }
  close() { this.ws.close(); }
}
module.exports = { Bot };
