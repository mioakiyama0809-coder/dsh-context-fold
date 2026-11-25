import React from "react";
import { PLUGIN_ID, SIDEBAR_TAB_KIND } from "../shared/constants.js";
import { FoldPanel } from "./FoldPanel.jsx";
import { ensureStyles } from "./styles.js";

export const inject = ["slots", "sidebarRightTabs", "sidebarRight"];

function FoldTabTitle({ useTabInfo }) {
  const { tab } = useTabInfo();
  return <span>{tab.title || "上下文折出"}</span>;
}

function FoldIcon({ size = 15 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M4 17h16" />
      <path d="m9 11 3 3 3-3" />
    </svg>
  );
}

export function apply(ctx) {
  // 1. Register right-sidebar tab type ("上下文折出")
  ctx.effect(
    () =>
      ctx.sidebarRightTabs.register({
        id: PLUGIN_ID,
        kind: SIDEBAR_TAB_KIND,
        priority: "extension",
        title: () => "上下文折出",
        guide: [
          {
            id: SIDEBAR_TAB_KIND,
            order: 35,
            title: () => "上下文折出",
            description: () => "查看每轮 Token 占比、局部折出为可编辑档案并同步回上下文",
          },
        ],
      }),
    "dsh-context-fold: sidebar tab type"
  );

  // 2. Register right-sidebar tab body
  ctx.effect(
    () =>
      ctx.slots.inject("sidebar.right.pane.tab", () =>
        ctx.slots.register(
          {
            name: "sidebar.right.pane.tab",
            key: PLUGIN_ID,
          },
          FoldPanel
        )
      ),
    "dsh-context-fold: sidebar tab body"
  );

  // 3. Register tab chip title
  ctx.effect(
    () =>
      ctx.slots.inject("sidebar.right.pane.tab.title", () =>
        ctx.slots.register(
          {
            name: "sidebar.right.pane.tab.title",
            key: PLUGIN_ID,
          },
          FoldTabTitle
        )
      ),
    "dsh-context-fold: sidebar tab title"
  );

  // 4. Add a one-click trigger button in conversation header utilities (optional seat)
  try {
    const HeaderButton = () => {
      ensureStyles();
      return (
        <button
          type="button"
          className="dcf-header-trigger"
          title="打开上下文局部折出面板"
          onClick={() => {
            try {
              ctx.sidebarRight.openTab(SIDEBAR_TAB_KIND);
            } catch {
              // No active session yet.
            }
          }}
        >
          <FoldIcon size={14} />
          <span>折出</span>
        </button>
      );
    };

    ctx.effect(
      () =>
        ctx.slots.inject("conversation.session.header.utilities", () =>
          ctx.slots.register(
            {
              name: "conversation.session.header.utilities",
              id: PLUGIN_ID,
              order: 60,
            },
            HeaderButton
          )
        ),
      "dsh-context-fold: header button"
    );
  } catch {
    // Gracefully skip if host composition omits this seat.
  }
}
