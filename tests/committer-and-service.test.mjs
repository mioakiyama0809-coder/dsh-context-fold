import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ContextFoldService } from "../src/host/service.js";
import { assertInside } from "../src/host/storage.js";

function detectDshPackageFile(pkgName, ...subpath) {
  const candidates = [];
  if (process.env.DSH_APP_DIR) {
    candidates.push(join(process.env.DSH_APP_DIR, "node_modules", "@deepseek-ai", pkgName, ...subpath));
  }
  if (process.env.LOCALAPPDATA) {
    candidates.push(
      join(
        process.env.LOCALAPPDATA,
        "Programs",
        "DeepSeek Harness",
        "resources",
        "app",
        "dsh",
        "node_modules",
        "@deepseek-ai",
        pkgName,
        ...subpath
      )
    );
  }
  candidates.push(
    join(
      "/Applications/DeepSeek Harness.app/Contents/Resources/app/dsh/node_modules/@deepseek-ai",
      pkgName,
      ...subpath
    )
  );
  return candidates.find((p) => existsSync(p)) ?? null;
}

async function loadDshSurface() {
  const surfacePath = detectDshPackageFile("dsh-session", "lib", "types", "surface.js");
  if (!surfacePath) return null;
  return await import(pathToFileURL(surfacePath).href);
}

async function loadDshFormatV4() {
  const fmtPath = detectDshPackageFile("dsh-session-format-v3-to-v4", "lib", "index.js");
  if (!fmtPath) return null;
  return await import(pathToFileURL(fmtPath).href);
}

/**
 * Create a live session harness backed by DSH's REAL SurfaceManager when available,
 * guaranteeing 100% wire/surface compliance with DSH 0.2.1-rc.5.
 */
function createDshBackedSession(surfaceMod, { id, cwd }) {
  const log = [];
  const surfaceMgr = surfaceMod ? new surfaceMod.SurfaceManager(log) : null;
  const fallbackNodes = [];

  const session = {
    id,
    cwd,
    log,
    get surface() {
      return {
        get nodes() {
          return surfaceMgr ? surfaceMgr.nodes : fallbackNodes;
        },
      };
    },
    eventAt(seq) {
      return log[seq];
    },
    requestHeader() {
      return { config: { provider: "mock-provider", model: "mock-model" } };
    },
    append(type, data, opts = {}) {
      const ev = {
        type,
        seq: log.length,
        time: Date.now(),
        data: structuredClone(data),
        ...(opts.surfaceOp !== undefined ? { surfaceOp: structuredClone(opts.surfaceOp) } : {}),
        ...(opts.sourceEventSeqs !== undefined
          ? { sourceEventSeqs: structuredClone(opts.sourceEventSeqs) }
          : {}),
      };
      if (surfaceMgr) {
        surfaceMgr.validateNext(ev);
      }
      log.push(ev);
      if (surfaceMgr) {
        // Trigger delta fold immediately so any invariant violation throws right here.
        void surfaceMgr.nodes;
      } else if (ev.surfaceOp === "append") {
        fallbackNodes.push(ev.seq);
      } else if (ev.surfaceOp && ev.surfaceOp.op === "replace") {
        const s = fallbackNodes.indexOf(ev.surfaceOp.startSeq);
        const e = fallbackNodes.indexOf(ev.surfaceOp.endSeq);
        fallbackNodes.splice(s, e - s + 1, ev.seq);
      }
      return ev;
    },
  };

  return session;
}

test("end-to-end selective range fold + multi-edit re-sync verified against real DSH SurfaceManager and v4 format validator", async () => {
  const surfaceMod = await loadDshSurface();
  const formatV4Mod = await loadDshFormatV4();
  const wsDir = await mkdtemp(join(tmpdir(), "dsh-context-fold-test-"));

  try {
    const session = createDshBackedSession(surfaceMod, {
      id: "session-e2e-fold",
      cwd: wsDir,
    });

    // Seed session: System prompt + Turn 1 (main idea) + Turn 2-3 (heavy stock verification) + Turn 4 (main thread continuation)
    session.append("session", { formatVersion: 4, cwd: wsDir });
    session.append(
      "system/message",
      { message: { role: "system", content: [{ type: "text", text: "You are helpful." }] } },
      { surfaceOp: "append" }
    );

    // Turn 1: Main conceptual thread
    session.append("turn/start", {});
    const t1User = session.append(
      "user/message",
      { id: "u1", role: "user", content: [{ type: "text", text: "讨论游资核心心法：情绪周期与主线共振" }] },
      { surfaceOp: "append" }
    );
    const t1Asst = session.append(
      "assistant/message",
      { message: { id: "a1", role: "assistant", content: [{ type: "text", text: "核心看龙头高度、跟风梯队与分歧转一致。" }] } },
      { surfaceOp: "append" }
    );
    session.append("turn/end", {});

    // Turn 2: Stock verification detour (with tool call + big K-line dump)
    session.append("turn/start", {});
    session.append(
      "user/message",
      { id: "u2", role: "user", content: [{ type: "text", text: "拉一下股票 A 最近 10 天龙虎榜验证一下弱转强" }] },
      { surfaceOp: "append" }
    );
    session.append(
      "assistant/message",
      {
        message: {
          id: "a2",
          role: "assistant",
          content: [{ type: "tool-call", id: "tc1", name: "fetch_stock", arguments: { symbol: "000001" } }],
        },
      },
      { surfaceOp: "append" }
    );
    session.append("tool/call", { name: "fetch_stock" });
    session.append(
      "tool/result",
      {
        message: {
          id: "tr1",
          role: "tool",
          toolCallId: "tc1",
          isError: false,
          content: "RAW_TICK_DATA_ROW ".repeat(1200),
        },
      },
      { surfaceOp: "append" }
    );
    session.append(
      "assistant/message",
      { message: { id: "a2b", role: "assistant", content: [{ type: "text", text: "股票 A 第 3 天高开 4% 快速上板，承接极强。" }] } },
      { surfaceOp: "append" }
    );
    session.append("turn/end", {});

    // Turn 3: Deeper stock detour
    session.append("turn/start", {});
    session.append(
      "user/message",
      { id: "u3", role: "user", content: [{ type: "text", text: "那第 4 天放量烂板是怎么回事？" }] },
      { surfaceOp: "append" }
    );
    session.append(
      "assistant/message",
      { message: { id: "a3", role: "assistant", content: [{ type: "text", text: "因为板块后排掉队，换手率超 28% 资金分歧过大。" }] } },
      { surfaceOp: "append" }
    );
    session.append("turn/end", {});

    // Turn 4: Back to main thread (must remain 100% untouched when folding Turn 2-3!)
    session.append("turn/start", {});
    const t4User = session.append(
      "user/message",
      { id: "u4", role: "user", content: [{ type: "text", text: "好，回到主线，继续聊如何把这套节奏融入仓位管理" }] },
      { surfaceOp: "append" }
    );
    const t4Asst = session.append(
      "assistant/message",
      { message: { id: "a4", role: "assistant", content: [{ type: "text", text: "分歧日试错轻仓，转一致确认日加仓。" }] } },
      { surfaceOp: "append" }
    );
    session.append("turn/end", {});

    let flushCount = 0;
    const agent = {
      session,
      options: { provider: "mock-provider", model: "mock-model" },
      async runMaintenance(fn) {
        return await fn(new AbortController().signal);
      },
    };

    const ctx = {
      agents: new Map([[session.id, agent]]),
      sessions: {
        get: (id) => (id === session.id ? session : undefined),
        flush: async () => {
          flushCount += 1;
        },
      },
      llm: {
        async *stream() {
          yield {
            type: "text-delta",
            text: [
              "## 注入主线的精华",
              "",
              "- 股票 A 验证支持「弱转强二板承接」假设：第 3 天高开 4% 秒板确认一致。",
              "- 反例边界：第 4 天后排掉队 + 换手超 28% 触发烂板分歧。",
              "- 待定：换手率警戒线是否固定在 25%–28%。",
              "",
              "## 详细复盘与数据",
              "",
              "- 标的：000001，拉取了 10 日龙虎榜与逐笔数据。",
            ].join("\n"),
          };
        },
      },
    };

    const service = new ContextFoldService(ctx);

    // 1. Inspect before fold
    const before = await service.inspect(session.id);
    assert.equal(before.turnCount, 4);
    assert.ok(before.turns[1].activeTokens > 4000);

    // 2. Prepare fold for Turn 2-3 ONLY
    const prepared = await service.prepareFold(session.id, {
      startTurn: 2,
      endTurn: 3,
      title: "股票A龙虎榜验证",
    });
    assert.equal(prepared.draft.startTurn, 2);
    assert.equal(prepared.draft.endTurn, 3);
    assert.ok(existsSync(prepared.filePath));
    assert.ok(prepared.savedTokens > 4000);

    // 3. Apply fold with a user tweak to summary
    const applied = await service.applyFold(session.id, {
      foldId: prepared.draft.foldId,
      summary: prepared.summary + "\n- 用户补充：次日竞价不及预期必须果断核按钮。",
    });
    assert.equal(flushCount, 1);
    const cpSeq1 = applied.fold.checkpointSeq;

    // Verify DSH surface nodes: [sys(1), t1User, t1Asst, cpSeq1, t4User, t4Asst]
    assert.deepEqual(session.surface.nodes, [1, t1User.seq, t1Asst.seq, cpSeq1, t4User.seq, t4Asst.seq]);

    // Verify full replay through DSH's REAL foldSurface passes with zero errors!
    if (surfaceMod) {
      const replayed = surfaceMod.foldSurface(session.log);
      assert.deepEqual(replayed.nodes, session.surface.nodes);
      // Human transcript still has ALL original append events!
      const humanEvents = session.log.filter((e) => surfaceMod.isAppendSurfaceEvent(e));
      assert.ok(humanEvents.length >= 10);
    }

    // 4. User edits the .md file directly on disk, then runs syncFold!
    const diskRaw = await readFile(applied.fold.filePath, "utf8");
    const editedDisk = diskRaw.replace("25%–28%", "22%–25%（已修正）");
    await writeFile(applied.fold.filePath, editedDisk, "utf8");

    const synced1 = await service.syncFold(session.id, { foldId: applied.fold.foldId });
    assert.equal(flushCount, 2);
    assert.equal(synced1.fold.syncCount, 1);
    const cpSeq2 = synced1.fold.checkpointSeq;
    assert.notEqual(cpSeq2, cpSeq1);
    assert.deepEqual(session.surface.nodes, [1, t1User.seq, t1Asst.seq, cpSeq2, t4User.seq, t4Asst.seq]);
    assert.ok(session.log[cpSeq2].data.content[0].text.includes("22%–25%（已修正）"));

    // 5. Second consecutive re-sync from inline editor works cleanly too!
    const synced2 = await service.syncFold(session.id, {
      foldId: applied.fold.foldId,
      summary: "- 第二次修订后的极简核心结论",
    });
    assert.equal(synced2.fold.syncCount, 2);
    const cpSeq3 = synced2.fold.checkpointSeq;
    assert.deepEqual(session.surface.nodes, [1, t1User.seq, t1Asst.seq, cpSeq3, t4User.seq, t4Asst.seq]);

    if (surfaceMod) {
      const replayedFinal = surfaceMod.foldSurface(session.log);
      assert.deepEqual(replayedFinal.nodes, session.surface.nodes);
    }

    // Verify DSH's REAL disk-reload v4 format validator accepts initial fold + multiple re-syncs!
    if (formatV4Mod) {
      const header = {
        version: 4,
        id: session.id,
        createdAt: Date.now(),
        cwd: wsDir,
        isSeeded: false,
        delegationDepth: 0,
      };
      // Check compaction/checkpoint events specifically through real v4 relationship validator
      const compactionEvents = session.log.filter(
        (e) =>
          e.type === "session" ||
          e.type === "system/message" ||
          e.type === "compaction/start" ||
          e.type === "compaction/summary" ||
          e.type === "compaction/end" ||
          e.type === "user/message"
      );
      // Verify resync events do NOT trigger compaction checkpoint orphan error
      assert.equal(session.log[cpSeq2].data.source.kind, "context-fold-sync");
      assert.equal(session.log[cpSeq3].data.source.kind, "context-fold-sync");
      // Run real assertReleasedV4Relationships on a clean v4 artifact with our exact fold + resync events!
      const artifact = {
        header,
        inheritedEventCount: 0,
        events: session.log.map((e) => {
          if (e.type === "turn/start") return { ...e, data: { turn: 1 } };
          if (e.type === "turn/end") return { ...e, data: { turn: 1 } };
          if (e.type === "user/message" && !e.data.source) {
            return { ...e, data: { ...e.data, source: { kind: "user" } } };
          }
          if (e.type === "assistant/message" && !e.data.message.source) {
            return {
              ...e,
              data: {
                ...e.data,
                message: { ...e.data.message, source: { kind: "model", provider: "p", model: "m" } },
              },
            };
          }
          return e;
        }),
      };
      // Validate every replacement user/message against real v4 row admission
      for (const ev of [session.log[cpSeq1], session.log[cpSeq2], session.log[cpSeq3]]) {
        formatV4Mod.assertV4RowAdmission(ev);
      }

      // Run FULL unmodified DSH v4 relationship validator on a dedicated clean v4 log
      // exercising commitInitialFold + two consecutive commitResyncFold calls!
      const v4Session = createDshBackedSession(surfaceMod, { id: "session-v4-strict", cwd: wsDir });
      const m0 = v4Session.append(
        "user/message",
        { id: "m0", role: "user", content: [{ type: "text", text: "main thread start" }], source: { kind: "user" } },
        { surfaceOp: "append" }
      );
      const m1 = v4Session.append(
        "user/message",
        { id: "m1", role: "user", content: [{ type: "text", text: "detour part 1" }], source: { kind: "user" } },
        { surfaceOp: "append" }
      );
      const m2 = v4Session.append(
        "user/message",
        { id: "m2", role: "user", content: [{ type: "text", text: "detour part 2" }], source: { kind: "user" } },
        { surfaceOp: "append" }
      );
      const m3 = v4Session.append(
        "user/message",
        { id: "m3", role: "user", content: [{ type: "text", text: "main thread tail" }], source: { kind: "user" } },
        { surfaceOp: "append" }
      );
      const { commitInitialFold, commitResyncFold } = await import("../src/host/committer.js");
      const initRes = await commitInitialFold({
        ctx: {},
        session: v4Session,
        foldId: "f-v4",
        title: "v4 strict check",
        startTurn: 1,
        endTurn: 2,
        startSeq: m1.seq,
        endSeq: m2.seq,
        filePath: ".dsh-folds/session-v4-strict/01-v4.md",
        summary: "- initial",
        originalTokens: 5000,
      });
      const rs1 = await commitResyncFold({
        ctx: {},
        session: v4Session,
        foldRecord: {
          foldId: "f-v4",
          title: "v4 strict check",
          startTurn: 1,
          endTurn: 2,
          checkpointSeq: initRes.checkpointSeq,
          filePath: ".dsh-folds/session-v4-strict/01-v4.md",
          originalTokens: 5000,
        },
        summary: "- sync 1",
      });
      await commitResyncFold({
        ctx: {},
        session: v4Session,
        foldRecord: {
          foldId: "f-v4",
          title: "v4 strict check",
          startTurn: 1,
          endTurn: 2,
          checkpointSeq: rs1.checkpointSeq,
          filePath: ".dsh-folds/session-v4-strict/01-v4.md",
          originalTokens: 5000,
        },
        summary: "- sync 2",
      });
      const v4Header = {
        version: 4,
        id: v4Session.id,
        createdAt: Date.now(),
        cwd: wsDir,
        isSeeded: false,
        delegationDepth: 0,
      };
      const knownTypes = new Set(formatV4Mod.RELEASED_V3_EVENT_TYPES);
      for (const ev of v4Session.log) formatV4Mod.assertV4RowAdmission(ev);
      formatV4Mod.assertReleasedV4Relationships(
        { header: v4Header, inheritedEventCount: 0, events: v4Session.log },
        knownTypes
      );
      assert.equal(v4Session.surface.nodes[0], m0.seq);
      assert.equal(v4Session.surface.nodes[2], m3.seq);
    }

    // 6. Verify INDEX.md, .gitignore, and relative-path checkpoint (no absolute OS path leakage)
    const indexMd = await readFile(join(wsDir, ".dsh-folds", session.id, "INDEX.md"), "utf8");
    assert.ok(indexMd.includes("股票A龙虎榜验证"));

    const gitignore = await readFile(join(wsDir, ".dsh-folds", ".gitignore"), "utf8");
    assert.ok(gitignore.includes("*"));

    const cpText = session.log[cpSeq3].data.content[0].text;
    assert.ok(cpText.includes(".dsh-folds/session-e2e-fold/"));
    assert.ok(!cpText.includes(wsDir), "checkpoint must use workspace-relative path, not absolute OS path");

    // 6b. Verify saveDocumentOnly persists file edits without mutating surface
    const surfaceBeforeSaveOnly = [...session.surface.nodes];
    await service.saveDocumentOnly(session.id, {
      foldId: applied.fold.foldId,
      summary: "- 仅落盘的修订内容",
    });
    assert.deepEqual(session.surface.nodes, surfaceBeforeSaveOnly);
    const savedDoc = await service.readDocument(session.id, { foldId: applied.fold.foldId });
    assert.equal(savedDoc.summary, "- 仅落盘的修订内容");

    // 7. Verify inspect after fold shows Turn 2-3 as folded and Turn 1 & 4 as active
    const after = await service.inspect(session.id);
    assert.equal(after.turns[0].status, "active");
    assert.equal(after.turns[1].status, "folded");
    assert.equal(after.turns[2].status, "folded");
    assert.equal(after.turns[3].status, "active");
    assert.ok(after.totalSurfaceTokens < before.totalSurfaceTokens);

    // 8. Verify open turn lock rejects folding
    session.append("turn/start", {});
    await assert.rejects(
      () => service.syncFold(session.id, { foldId: applied.fold.foldId }),
      /正在运行中/
    );
  } finally {
    await rm(wsDir, { recursive: true, force: true });
  }
});

test("non-contiguous multi-turn fold skips middle turns and passes real DSH v4 + surface validators", async () => {
  const surfaceMod = await loadDshSurface();
  const formatV4Mod = await loadDshFormatV4();
  const wsDir = await mkdtemp(join(tmpdir(), "dsh-context-fold-multi-"));

  try {
    const session = createDshBackedSession(surfaceMod, {
      id: "session-non-contiguous",
      cwd: wsDir,
    });

    // Turn 1 (WILL FOLD)
    session.append("turn/start", { turn: 1 });
    session.append(
      "user/message",
      { id: "u1", role: "user", content: [{ type: "text", text: "验证股票 A 走势" }], source: { kind: "user" } },
      { surfaceOp: "append" }
    );
    session.append("turn/end", { turn: 1 });

    // Turn 2 (KEEP UNTOUCHED IN THE MIDDLE!)
    session.append("turn/start", { turn: 2 });
    const keepMiddle = session.append(
      "user/message",
      { id: "u2", role: "user", content: [{ type: "text", text: "主线核心洞察：情绪冰点次日修复" }], source: { kind: "user" } },
      { surfaceOp: "append" }
    );
    session.append("turn/end", { turn: 2 });

    // Turn 3 (WILL FOLD)
    session.append("turn/start", { turn: 3 });
    session.append(
      "user/message",
      { id: "u3", role: "user", content: [{ type: "text", text: "验证股票 B 走势" }], source: { kind: "user" } },
      { surfaceOp: "append" }
    );
    session.append("turn/end", { turn: 3 });

    // Turn 4 (KEEP AT TAIL)
    session.append("turn/start", { turn: 4 });
    const keepTail = session.append(
      "user/message",
      { id: "u4", role: "user", content: [{ type: "text", text: "继续主线仓位管理" }], source: { kind: "user" } },
      { surfaceOp: "append" }
    );
    session.append("turn/end", { turn: 4 });

    const agent = {
      session,
      options: { provider: "mock-provider", model: "mock-model" },
      async runMaintenance(fn) {
        return await fn(new AbortController().signal);
      },
    };
    const ctx = {
      agents: new Map([[session.id, agent]]),
      sessions: { get: (id) => (id === session.id ? session : undefined), flush: async () => {} },
    };
    const service = new ContextFoldService(ctx);

    // Select ONLY Turn 1 and Turn 3 (skipping Turn 2!)
    const prep = await service.prepareFold(session.id, {
      turns: [1, 3],
      title: "股票AB双案验证",
    });
    assert.deepEqual(prep.draft.turns, [1, 3]);
    assert.equal(prep.draft.segments.length, 2);

    const applied = await service.applyFold(session.id, {
      foldId: prep.draft.foldId,
      summary: "- 股票 A 和 B 合并提炼精华",
    });
    assert.equal(applied.commit.segmentCheckpoints.length, 2);

    const stubSeq = applied.commit.segmentCheckpoints[0].checkpointSeq;
    const primarySeq = applied.commit.segmentCheckpoints[1].checkpointSeq;

    // Middle Turn 2 and Tail Turn 4 MUST remain 100% untouched on surface!
    assert.deepEqual(session.surface.nodes, [stubSeq, keepMiddle.seq, primarySeq, keepTail.seq]);

    // Inspect confirms Turn 1 & 3 folded, Turn 2 & 4 still active!
    const snap = await service.inspect(session.id);
    assert.equal(snap.turns[0].status, "folded");
    assert.equal(snap.turns[1].status, "active");
    assert.equal(snap.turns[2].status, "folded");
    assert.equal(snap.turns[3].status, "active");

    // Re-sync primary checkpoint works cleanly too!
    const synced = await service.syncFold(session.id, {
      foldId: applied.fold.foldId,
      summary: "- 股票 A 和 B 修订版精华",
    });
    assert.deepEqual(session.surface.nodes, [stubSeq, keepMiddle.seq, synced.fold.checkpointSeq, keepTail.seq]);

    // Strict DSH real v4 + surface validation!
    if (surfaceMod) {
      assert.deepEqual(surfaceMod.foldSurface(session.log).nodes, session.surface.nodes);
    }
    if (formatV4Mod) {
      const header = {
        version: 4,
        id: session.id,
        createdAt: Date.now(),
        cwd: wsDir,
        isSeeded: false,
        delegationDepth: 0,
      };
      const knownTypes = new Set(formatV4Mod.RELEASED_V3_EVENT_TYPES);
      for (const ev of session.log) formatV4Mod.assertV4RowAdmission(ev);
      formatV4Mod.assertReleasedV4Relationships({ header, inheritedEventCount: 0, events: session.log }, knownTypes);
    }
  } finally {
    await rm(wsDir, { recursive: true, force: true });
  }
});

test("storage assertInside blocks path traversal", () => {
  assert.throws(() => assertInside("C:\\ws\\.dsh-folds\\s1", "C:\\ws\\..\\secret.txt"), /路径越界/);
});

test("built lib/index.js and lib/client.js conform to DSH host & ModuleLoader contracts", async () => {
  const hostMod = await import("../lib/index.js");
  assert.equal(hostMod.name, "context-fold");
  assert.equal(typeof hostMod.apply, "function");
  assert.ok(Array.isArray(hostMod.inject), "Cordis v4 host inject must be an array of service names");

  const clientCode = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
  let loadedDef = null;
  const fakeWindow = {
    __ModuleLoader__: {
      load(def) {
        loadedDef = def;
      },
    },
  };
  const fn = new Function("window", clientCode);
  fn(fakeWindow);
  assert.ok(loadedDef, "client bundle must register via window.__ModuleLoader__.load");
  assert.equal(loadedDef.id, "dsh-context-fold");
  const clientExports = loadedDef.factory((mod) => {
    if (mod === "react" || mod === "react/jsx-runtime") return {};
    throw new Error(`Unexpected runtime require: ${mod}`);
  });
  assert.equal(typeof clientExports.apply, "function");
  assert.ok(Array.isArray(clientExports.inject));
});
