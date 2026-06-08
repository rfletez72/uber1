'use strict';

/**
 * EVENT STORE
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight in-memory ring buffer that holds the most recent webhook events
 * and order actions so the dashboard can display live activity.
 *
 * Replace this with a real database (Postgres, MongoDB, etc.) in production.
 */

const MAX_EVENTS = 500;

/** @type {Array<object>} */
const events = [];

/**
 * Record a new event.
 * @param {'ORDER_RECEIVED'|'ORDER_ACCEPTED'|'ORDER_DENIED'|'STATUS_UPDATE'|'MENU_SYNC'|'ERROR'} type
 * @param {object} payload
 */
function pushEvent(type, payload) {
  const event = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    timestamp: new Date().toISOString(),
    ...payload
  };
  events.unshift(event); // newest first
  if (events.length > MAX_EVENTS) events.pop();
  return event;
}

/** Return up to `limit` recent events, optionally filtered by storeId. */
function getEvents({ limit = 50, storeId } = {}) {
  let result = events;
  if (storeId) result = events.filter((e) => e.storeId === storeId);
  return result.slice(0, limit);
}

/** Basic stats for the dashboard summary cards. */
function getStats() {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  const recent = events.filter((e) => now - new Date(e.timestamp).getTime() < oneHour);

  return {
    totalEventsAllTime: events.length,
    ordersLastHour: recent.filter((e) => e.type === 'ORDER_RECEIVED').length,
    acceptedLastHour: recent.filter((e) => e.type === 'ORDER_ACCEPTED').length,
    deniedLastHour: recent.filter((e) => e.type === 'ORDER_DENIED').length,
    errorsLastHour: recent.filter((e) => e.type === 'ERROR').length,
    menuSyncsLastHour: recent.filter((e) => e.type === 'MENU_SYNC').length
  };
}

module.exports = { pushEvent, getEvents, getStats };
