// The ecosystem server-action/API envelope (witus/docs/shared-ui-ux-dx.md):
// never throw to the client; return {ok:true,data} | {ok:false,error,code}.

export type Ok<T> = { ok: true; data: T };
export type Err = { ok: false; error: string; code: string };
export type Result<T> = Ok<T> | Err;

export function ok<T>(data: T): Ok<T> {
  return { ok: true, data };
}

export function err(code: string, error: string): Err {
  return { ok: false, error, code };
}
