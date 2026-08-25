export type DecryptRequest = {
  id: number;
  input: ArrayBuffer;
  password: string;
};

export type DecryptReply =
  | { id: number; ok: true; output: ArrayBuffer }
  | { id: number; ok: false };
