import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCheckpointText,
  estimateTokens,
  parseFoldMarkdown,
  serializeFoldMarkdown,
} from "../src/shared/markdown.js";
import { SECTION_DETAIL_HEADING, SECTION_SUMMARY_HEADING } from "../src/shared/constants.js";

test("dual-layer markdown serialize and parse round-trip", () => {
  const md = serializeFoldMarkdown({
    foldId: "fold-abc123",
    title: "某股龙虎榜: 游资接力验证",
    sessionId: "session-test-1",
    startTurn: 5,
    endTurn: 12,
    startSeq: 40,
    endSeq: 120,
    checkpointSeq: null,
    originalTokens: 18500,
    foldedTokens: 320,
    generatedBy: "llm",
    summary: "- 验证结论：弱转强二板承接成立\n- 反例：尾盘偷袭板次日溢价不足\n- 待定：放量换手阈值是否以 18% 为界",
    details: "### 数据记录\n- 标的：示例股\n- 龙虎榜买一净买入 6800 万",
  });

  assert.ok(md.includes(SECTION_SUMMARY_HEADING));
  assert.ok(md.includes(SECTION_DETAIL_HEADING));

  const parsed = parseFoldMarkdown(md);
  assert.equal(parsed.meta.foldId, "fold-abc123");
  assert.equal(parsed.meta.startTurn, 5);
  assert.equal(parsed.meta.endTurn, 12);
  assert.equal(parsed.meta.checkpointSeq, null);
  assert.equal(parsed.title, "某股龙虎榜: 游资接力验证");
  assert.ok(parsed.summary.includes("弱转强二板承接成立"));
  assert.ok(parsed.summary.includes("待定"));
  assert.ok(parsed.details.includes("龙虎榜买一净买入"));
  assert.ok(!parsed.summary.includes("龙虎榜买一净买入"));
});

test("buildCheckpointText injects concise summary and archive path without leaking details", () => {
  const text = buildCheckpointText({
    foldId: "f1",
    title: "示例验证",
    startTurn: 2,
    endTurn: 6,
    filePath: "C:/ws/.dsh-folds/s1/01-demo.md",
    summary: "- 结论 A\n- 结论 B",
    originalTokens: 25000,
  });

  assert.ok(text.includes("第 2–6 轮"));
  assert.ok(text.includes("25,000 tokens"));
  assert.ok(text.includes("C:/ws/.dsh-folds/s1/01-demo.md"));
  assert.ok(text.includes("- 结论 A"));
  assert.ok(estimateTokens(text) < 250);
});
