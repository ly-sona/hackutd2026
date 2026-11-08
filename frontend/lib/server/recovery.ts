import { withGateway, unwrap } from "./gateway";
export function recoveryQuery<T>(hash: string, payload: object) {
  return withGateway(async (c) =>
    unwrap<T>(
      await c.procedures.recoveryRead({
        sessionHash: hash,
        payload: JSON.stringify(payload),
      }),
    ),
  );
}
