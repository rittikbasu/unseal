import type { DecryptReply } from "./pdf-protocol";

type Pending = {
  resolve: (output: Uint8Array) => void;
  reject: (error: Error) => void;
};

const pending = new Map<number, Pending>();
let nextId = 1;
let worker: Worker | undefined;

function transferableBuffer(input: Uint8Array): ArrayBuffer {
  if (input.byteOffset === 0 && input.byteLength === input.buffer.byteLength) {
    return input.buffer as ArrayBuffer;
  }

  return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;
}

function handleWorkerMessage(event: MessageEvent<DecryptReply>): void {
  const request = pending.get(event.data.id);
  if (!request) return;

  pending.delete(event.data.id);
  if (event.data.ok) {
    request.resolve(new Uint8Array(event.data.output));
  } else {
    request.reject(new Error("The PDF worker rejected the request."));
  }
}

function recycleWorker(): void {
  worker?.terminate();
  worker = undefined;
}

function handleWorkerError(): void {
  for (const request of pending.values()) {
    request.reject(new Error("The PDF worker failed."));
  }
  pending.clear();
  recycleWorker();
}

function createWorker(): Worker {
  const instance = new Worker(new URL("./pdf-worker.ts", import.meta.url), {
    type: "module",
  });
  instance.addEventListener("message", handleWorkerMessage);
  instance.addEventListener("error", handleWorkerError);
  return instance;
}

function ensureWorker(): Worker {
  return worker ??= createWorker();
}

export function releasePdfWorker(): void {
  if (pending.size > 0) return;
  recycleWorker();
}

export function decryptPdf(input: Uint8Array, password: string): Promise<Uint8Array> {
  const id = nextId++;
  const buffer = transferableBuffer(input);

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      ensureWorker().postMessage({ id, input: buffer, password }, [buffer]);
    } catch (error) {
      pending.delete(id);
      reject(error instanceof Error ? error : new Error("The PDF worker could not accept the request."));
    }
  });
}
