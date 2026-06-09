'use strict';

function networkError(err) {
  if (err.message?.toLowerCase() === 'failed to fetch')
    throw new Error("Please check your network connection. It seems either you're offline or the server is not reachable at the moment.");
  throw err;
}

async function parseResponse(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function getData(url, headers = {}) {
  let res;
  try {
    res = await fetch(url, { headers });
  } catch (err) { networkError(err); }

  const body = await parseResponse(res);
  if (!res.ok) throw new Error(body?.message || body || `HTTP ${res.status}`);
  return body;
}

async function postData(url, data, headers = {}) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data)
    });
  } catch (err) { networkError(err); }

  const body = await parseResponse(res);
  if (!res.ok) throw new Error(body?.message || body || `HTTP ${res.status}`);
  return body;
}

// Used for OAuth token exchange (application/x-www-form-urlencoded)
async function postForm(url, params, headers = {}) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
      body: params.toString()
    });
  } catch (err) { networkError(err); }

  const body = await parseResponse(res);
  if (!res.ok) throw new Error(body?.message || body || `HTTP ${res.status}`);
  return body;
}

async function patchData(url, data, headers = {}) {
  let res;
  try {
    res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data)
    });
  } catch (err) { networkError(err); }

  const body = await parseResponse(res);
  if (!res.ok) throw new Error(body?.message || body || `HTTP ${res.status}`);
  return body;
}

module.exports = { getData, postData, patchData, postForm };
