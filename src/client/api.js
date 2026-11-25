import { API_PREFIX } from "../shared/constants.js";

async function request(path, { method = "GET", body, timeoutMs = 15000 } = {}) {
  const init = {
    method,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_PREFIX}/${path}`, init);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`服务返回无效响应 (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : `请求失败 (${res.status})`);
  }
  return data;
}

export function fetchState(sessionId) {
  return request(`state?sessionId=${encodeURIComponent(sessionId)}`);
}

export function addMark(sessionId, { label, turn } = {}) {
  return request("mark", {
    method: "POST",
    body: { sessionId, label, turn },
  });
}

export function removeMark(sessionId, markId) {
  return request("mark", {
    method: "POST",
    body: { sessionId, action: "remove", markId },
  });
}

export function prepareFold(sessionId, { turns, startTurn, endTurn, title }) {
  return request("prepare", {
    method: "POST",
    body: { sessionId, turns, startTurn, endTurn, title },
    timeoutMs: 120000,
  });
}

export function applyFold(sessionId, { foldId, title, summary, details }) {
  return request("apply", {
    method: "POST",
    body: { sessionId, foldId, title, summary, details },
    timeoutMs: 30000,
  });
}

export function discardDraft(sessionId, foldId) {
  return request("discard", {
    method: "POST",
    body: { sessionId, foldId },
  });
}

export function fetchDocument(sessionId, foldId) {
  return request(
    `document?sessionId=${encodeURIComponent(sessionId)}&foldId=${encodeURIComponent(foldId)}`
  );
}

export function saveDocumentOnly(sessionId, { foldId, title, summary, details }) {
  return request("save-file", {
    method: "POST",
    body: { sessionId, foldId, title, summary, details },
  });
}

export function syncFold(sessionId, { foldId, title, summary, details }) {
  return request("sync", {
    method: "POST",
    body: {
      sessionId,
      foldId,
      ...(title !== undefined ? { title } : {}),
      ...(summary !== undefined ? { summary } : {}),
      ...(details !== undefined ? { details } : {}),
    },
    timeoutMs: 30000,
  });
}
