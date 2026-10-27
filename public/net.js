// Shared WebSocket client: reconnects with back-off, keeps a heartbeat, and measures clock offset (Section 15).
export const money = p => (p < 0 ? '−' : '') + '£' + (Math.abs(p) / 100).toFixed(2);
export const pence = p => (p < 100 ? p + 'p' : money(p));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class Conn {
  constructor(code, role, { onMessage, onStatus } = {}) {
    this.code = code; this.role = role; this.onMessage = onMessage; this.onStatus = onStatus;
    this.offset = 0; this.backoff = 500; this.queue = []; this.closedForGood = false; this.cid = 0;
    this.open();
    setInterval(() => this.heartbeat(), 5000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && (!this.ws || this.ws.readyState > 1)) this.open(); });
  }
  url() { const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'; return `${proto}//${location.host}/ws/${this.code}?role=${this.role}`; }
  open() {
    if (this.closedForGood) return;
    clearTimeout(this.retry);
    const ws = this.ws = new WebSocket(this.url());
    ws.onopen = () => {
      this.backoff = 500; this.onStatus?.('open');
      this.heartbeat();
      this.onOpen?.();
      for (const m of this.queue.splice(0)) this.send(m);
    };
    ws.onmessage = ev => {
      if (ev.data === 'pong') return;
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.type === 'sync') { const rtt = Date.now() - m.t; this.offset = m.now - (m.t + rtt / 2); return; }
      if (m.type === 'replaced' || m.type === 'removed') this.closedForGood = true;
      this.onMessage?.(m);
    };
    ws.onclose = ev => {
      this.onStatus?.('closed');
      if (this.closedForGood || ev.code === 4004) return;
      this.retry = setTimeout(() => this.open(), this.backoff);
      this.backoff = Math.min(5000, this.backoff * 2);
    };
    ws.onerror = () => {};
  }
  heartbeat() {
    if (this.ws?.readyState === 1) { this.ws.send('ping'); this.ws.send(JSON.stringify({ v: 1, type: 'sync', t: Date.now() })); }
  }
  send(m) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ v: 1, ...m }));
    else if (m.type !== 'plan.update') this.queue.push(m);
  }
  cmd(type, extra = {}) { this.send({ type, cid: 'c' + Date.now().toString(36) + (++this.cid), ...extra }); }
  now() { return Date.now() + this.offset; }
}

export const WEATHER_ICON = { sunny: '☀️', scorcher: '🔥', cloud: '☁️', cool: '🌬️', storm: '⛈️' };
export const FACE = { good: '😊', mid: '😐', bad: '☹️' };
export const VERDICT_COLOUR = { good: '#16a34a', mid: '#d97706', bad: '#dc2626' };
export const PATTERN = ['stripes', 'dots', 'zigzag', 'checks'];
export const LETTER = ['A', 'B', 'C', 'D'];
