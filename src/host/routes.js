import { API_PREFIX } from "../shared/constants.js";

async function readJsonBody(req, limitBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) {
      throw new Error("请求体超过限制 (2MB)");
    }
    chunks.push(Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function queryParam(req, name) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  return url.searchParams.get(name) ?? "";
}

/**
 * Register HTTP JSON routes for the right-sidebar UI panel under `/api/context-fold/*`.
 */
export function registerFoldRoutes(ctx, service) {
  if (!ctx.webServer || typeof ctx.webServer.register !== "function") return;

  const routes = [
    {
      name: "state",
      handle: async (req) => {
        if (req.method !== "GET") throw new Error("仅支持 GET");
        const sessionId = queryParam(req, "sessionId");
        if (!sessionId) throw new Error("缺少 sessionId 参数");
        return await service.inspect(sessionId);
      },
    },
    {
      name: "mark",
      handle: async (req) => {
        if (req.method !== "POST") throw new Error("仅支持 POST");
        const data = await readJsonBody(req);
        if (!data.sessionId) throw new Error("缺少 sessionId");
        if (data.action === "remove") {
          return await service.removeMark(data.sessionId, { markId: data.markId });
        }
        return await service.addMark(data.sessionId, {
          label: data.label,
          turn: data.turn,
        });
      },
    },
    {
      name: "prepare",
      handle: async (req) => {
        if (req.method !== "POST") throw new Error("仅支持 POST");
        const data = await readJsonBody(req);
        if (!data.sessionId) throw new Error("缺少 sessionId");
        return await service.prepareFold(data.sessionId, {
          turns: data.turns,
          startTurn: data.startTurn,
          endTurn: data.endTurn,
          title: data.title,
        });
      },
    },
    {
      name: "apply",
      handle: async (req) => {
        if (req.method !== "POST") throw new Error("仅支持 POST");
        const data = await readJsonBody(req);
        if (!data.sessionId) throw new Error("缺少 sessionId");
        return await service.applyFold(data.sessionId, {
          foldId: data.foldId,
          title: data.title,
          summary: data.summary,
          details: data.details,
        });
      },
    },
    {
      name: "discard",
      handle: async (req) => {
        if (req.method !== "POST") throw new Error("仅支持 POST");
        const data = await readJsonBody(req);
        if (!data.sessionId || !data.foldId) throw new Error("缺少 sessionId 或 foldId");
        return await service.discardDraft(data.sessionId, { foldId: data.foldId });
      },
    },
    {
      name: "document",
      handle: async (req) => {
        if (req.method !== "GET") throw new Error("仅支持 GET");
        const sessionId = queryParam(req, "sessionId");
        const foldId = queryParam(req, "foldId");
        if (!sessionId || !foldId) throw new Error("缺少 sessionId 或 foldId");
        return await service.readDocument(sessionId, { foldId });
      },
    },
    {
      name: "save-file",
      handle: async (req) => {
        if (req.method !== "POST") throw new Error("仅支持 POST");
        const data = await readJsonBody(req);
        if (!data.sessionId || !data.foldId) throw new Error("缺少 sessionId 或 foldId");
        return await service.saveDocumentOnly(data.sessionId, {
          foldId: data.foldId,
          title: data.title,
          summary: data.summary,
          details: data.details,
        });
      },
    },
    {
      name: "sync",
      handle: async (req) => {
        if (req.method !== "POST") throw new Error("仅支持 POST");
        const data = await readJsonBody(req);
        if (!data.sessionId) throw new Error("缺少 sessionId");
        return await service.syncFold(data.sessionId, {
          foldId: data.foldId,
          title: data.title,
          summary: data.summary,
          details: data.details,
        });
      },
    },
  ];

  for (const route of routes) {
    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: "exact",
          path: `${API_PREFIX}/${route.name}`,
          handler: async (req, res) => {
            try {
              const payload = await route.handle(req);
              sendJson(res, 200, payload);
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              sendJson(res, 400, { error: message });
            }
          },
        }),
      `context-fold route ${API_PREFIX}/${route.name}`
    );
  }
}
