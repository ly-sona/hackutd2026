import type { Ctx } from "./index";
// Persisted rows outlive publishes/restarts. Check the target table before any write.
export function moduleId(ctx: Ctx, exists: (id: string) => boolean) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = ctx.newUuidV7().toString();
    if (!exists(id)) return id;
  }
  throw new Error("Unable to allocate a unique application identifier.");
}
