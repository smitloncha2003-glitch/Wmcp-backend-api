'use strict';

/** Holds the active WebSocket server reference so routes can call broadcast(). */
let wss = null;

function setWss(instance) {
  wss = instance;
}

/**
 * Broadcast a typed message to all authenticated WebSocket clients.
 * @param {string} type  - Event type (e.g. 'performance', 'players')
 * @param {*}      data  - JSON-serialisable payload
 */
function broadcast(type, data) {
  if (!wss) return;
  const payload = JSON.stringify({ type, data, ts: Date.now() });
  wss.clients.forEach((client) => {
    if (client.readyState === 1 /* OPEN */ && client.authenticated) {
      try {
        client.send(payload);
      } catch (_) {
        // ignore send errors for individual clients
      }
    }
  });
}

module.exports = { setWss, broadcast };
