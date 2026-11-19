// Tiny Chrome DevTools Protocol driver (uses the `ws` package already in node_modules).
const WebSocket = require('ws');
const http = require('http');

const getJSON = (url) => new Promise((res, rej) => http.get(url, (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));

class Page {
  static async open(port = 9222) {
    let targets;
    for (let i = 0; i < 40; i++) { try { targets = await getJSON(`http://127.0.0.1:${port}/json`); break; } catch { await new Promise(r => setTimeout(r, 250)); } }
    const t = targets.find(x => x.type === 'page');
    const p = new Page(); p.ws = new WebSocket(t.webSocketDebuggerUrl); p.id = 0; p.pending = new Map(); p.logs = [];
    await new Promise(r => p.ws.on('open', r));
    p.ws.on('message', (m) => {
      const msg = JSON.parse(m);
      if (msg.id && p.pending.has(msg.id)) { const { res, rej } = p.pending.get(msg.id); p.pending.delete(msg.id); msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result); }
      if (msg.method === 'Runtime.consoleAPICalled') p.logs.push(`[console.${msg.params.type}] ` + msg.params.args.map(a => a.value ?? a.description).join(' '));
      if (msg.method === 'Runtime.exceptionThrown') p.logs.push('[EXCEPTION] ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    });
    await p.send('Page.enable'); await p.send('Runtime.enable');
    return p;
  }
  send(method, params = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed'); return r.result.value; }
  async goto(url) { await this.send('Page.navigate', { url }); await new Promise(r => setTimeout(r, 900)); }
  async reload() { await this.send('Page.reload'); await new Promise(r => setTimeout(r, 1200)); }
  async waitFor(expr, ms = 6000) { const end = Date.now() + ms; while (Date.now() < end) { try { if (await this.eval(expr)) return true; } catch {} await new Promise(r => setTimeout(r, 120)); } return false; }
  async shot(file, full = false) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
    require('fs').writeFileSync(file, Buffer.from(r.data, 'base64'));
  }
  async viewport(w, h, mobile = false) { await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile }); }
  async click(sel) { return this.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`); }
  async type(sel, text) { return this.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.value = ${JSON.stringify(text)}; e.dispatchEvent(new Event('input', {bubbles:true})); return true; })()`); }
}
module.exports = { Page };
