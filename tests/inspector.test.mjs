import test from "node:test";
import assert from "node:assert/strict";
import { parseFoldCommandArgs } from "../src/host/commands.js";
import { inspectSessionTurns, resolveSafeSurfaceRange } from "../src/host/inspector.js";

function makeMockSession(events, surfaceNodes) {
  return {
    id: "session-mock-1",
    cwd: "C:\\workspace",
    log: events,
    surface: { nodes: surfaceNodes },
    eventAt(seq) {
      return events[seq];
    },
  };
}

test("parseFoldCommandArgs handles explicit range, comma multi-select, last N, and mark fallback", () => {
  assert.deepEqual(parseFoldCommandArgs("18-32 某股验证", { turnCount: 40, marks: [] }), {
    turns: Array.from({ length: 15 }, (_, i) => 18 + i),
    startTurn: 18,
    endTurn: 32,
    title: "某股验证",
  });

  assert.deepEqual(parseFoldCommandArgs("2,4-5,8 多段验证", { turnCount: 20, marks: [] }), {
    turns: [2, 4, 5, 8],
    startTurn: 2,
    endTurn: 8,
    title: "多段验证",
  });

  assert.deepEqual(parseFoldCommandArgs("last 5 尾段清理", { turnCount: 12, marks: [] }), {
    turns: [8, 9, 10, 11, 12],
    startTurn: 8,
    endTurn: 12,
    title: "尾段清理",
  });

  assert.deepEqual(
    parseFoldCommandArgs("", {
      turnCount: 20,
      marks: [{ markId: "m1", turn: 14, label: "龙虎榜验证" }],
    }),
    {
      turns: [14, 15, 16, 17, 18, 19, 20],
      startTurn: 14,
      endTurn: 20,
      title: "龙虎榜验证",
    }
  );
});

test("inspector skips synthetic user wrappers and protects system head at node 0", () => {
  const events = [
    { type: "session", seq: 0, data: {} },
    { type: "system/message", seq: 1, surfaceOp: "append", data: { message: { role: "system", content: [{ type: "text", text: "sys" }] } } },
    { type: "turn/start", seq: 2, data: {} },
    { type: "user/message", seq: 3, surfaceOp: "append", data: { role: "user", content: [{ type: "text", text: "<system-reminder>internal</system-reminder>" }] } },
    { type: "user/message", seq: 4, surfaceOp: "append", data: { role: "user", content: [{ type: "text", text: "我们来聊聊游资打板手法的核心逻辑" }] } },
    { type: "assistant/message", seq: 5, surfaceOp: "append", data: { message: { role: "assistant", content: [{ type: "text", text: "核心在于情绪周期与资金接力。" }] } } },
    { type: "turn/end", seq: 6, data: {} },
    { type: "turn/start", seq: 7, data: {} },
    { type: "user/message", seq: 8, surfaceOp: "append", data: { role: "user", content: [{ type: "text", text: "拉一下股票 A 的分时数据验证" }] } },
    { type: "assistant/message", seq: 9, surfaceOp: "append", data: { message: { role: "assistant", content: [{ type: "tool-call", name: "fetch_kline", arguments: { symbol: "000001" } }] } } },
    { type: "tool/call", seq: 10, data: { name: "fetch_kline" } },
    { type: "tool/result", seq: 11, surfaceOp: "append", data: { message: { role: "tool", content: "KLINE_DATA ".repeat(500), isError: false } } },
    { type: "assistant/message", seq: 12, surfaceOp: "append", data: { message: { role: "assistant", content: [{ type: "text", text: "验证完成，确实符合弱转强。" }] } } },
    { type: "turn/end", seq: 13, data: {} },
  ];

  const surfaceNodes = [1, 3, 4, 5, 8, 9, 11, 12];
  const session = makeMockSession(events, surfaceNodes);

  const snap = inspectSessionTurns(session);
  assert.equal(snap.turnCount, 2);
  assert.equal(snap.isIdle, true);
  assert.equal(snap.turns[0].promptPreview, "我们来聊聊游资打板手法的核心逻辑");
  assert.equal(snap.turns[1].toolCallCount, 1);
  assert.ok(snap.turns[1].activeTokens > snap.turns[0].activeTokens);

  // Folding Turn 1 must NEVER include system/message at surface node 0 (seq=1)
  const r1 = resolveSafeSurfaceRange(session, 1, 1);
  assert.equal(r1.startSeq, 3);
  assert.equal(r1.endSeq, 5);
  assert.ok(!r1.shadowedSeqs.includes(1));

  // Folding Turn 2 must cover seq 8..12 cleanly with balanced tool calls
  const r2 = resolveSafeSurfaceRange(session, 2, 2);
  assert.equal(r2.startSeq, 8);
  assert.equal(r2.endSeq, 12);
  assert.deepEqual(r2.shadowedSeqs, [8, 9, 11, 12]);
});
