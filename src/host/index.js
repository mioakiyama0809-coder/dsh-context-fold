import { PLUGIN_NAME } from "../shared/constants.js";
import { registerFoldCommands } from "./commands.js";
import { registerFoldRoutes } from "./routes.js";
import { ContextFoldService } from "./service.js";

export const name = PLUGIN_NAME;
export const inject = ["sessions"];

export function apply(ctx, config = {}) {
  const service = new ContextFoldService(ctx, config);

  ctx.inject(["commands"], (owner) => {
    registerFoldCommands(owner, service);
  });

  ctx.inject(["webServer"], (owner) => {
    registerFoldRoutes(owner, service);
  });
}
