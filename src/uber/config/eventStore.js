'use strict';

const MAX_EVENTS = 500;

/** @type {Array<object>} */
const events = [];

function pushEvent(type, payload) {
  const { storeId, orderId, ...rest } = payload || {};
  const event = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    timestamp: new Date().toISOString(),
    storeId: storeId || null,
    orderId: orderId || null,
    ...rest
  };

  events.unshift(event); // newest first
  if (events.length > MAX_EVENTS) events.pop();

  const meta = Object.keys(rest).length ? JSON.stringify(rest) : null;
  global.UberModels.UberEventStore
    .create({ type, storeId: storeId || null, orderId: orderId || null, meta })
    .catch(() => {}); // silent — memory is the fallback

  return event;
}

/** Load last MAX_EVENTS from DB into memory — call once at startup. */
async function loadEventsFromDB() {
  if (!global.UberModels?.UberEventStore) return;
  try {
    const rows = await global.UberModels.UberEventStore.findAll({
      order: [['createdAt', 'DESC']],
      limit: MAX_EVENTS
    });
    for (const row of rows) {
      const meta = row.meta ? JSON.parse(row.meta) : {};
      events.push({
        id: `evt_${row.id}`,
        type: row.type,
        timestamp: row.createdAt.toISOString(),
        storeId: row.storeId,
        orderId: row.orderId,
        ...meta
      });
    }
  } catch {
    // silent — memory array starts empty if DB unavailable
  }
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
    ordersLastHour:    recent.filter((e) => e.type === 'ORDER_RECEIVED').length,
    acceptedLastHour:  recent.filter((e) => e.type === 'ORDER_ACCEPTED').length,
    deniedLastHour:    recent.filter((e) => e.type === 'ORDER_DENIED').length,
    errorsLastHour:    recent.filter((e) => e.type === 'ERROR').length,
    menuSyncsLastHour: recent.filter((e) => e.type === 'MENU_SYNC').length
  };
}

module.exports = { pushEvent, getEvents, getStats, loadEventsFromDB };
