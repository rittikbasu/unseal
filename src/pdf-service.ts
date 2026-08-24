type WorkerReply =
  | { id: number; ok: true; output: ArrayBuffer }
  | { id: number; ok: false; message: string };

type Pending = {
  resolve: (output: Uint8Array) => void;
  reject: (error: Error) => void;
};

const pending = new Map<number, Pending>();
let nextId = 1;

function handleWorkerMessage(event: MessageEvent<WorkerReply>): void {
  const request = pending.get(event.data.id);
  if (!request) return;

  pending.delete(event.data.id);
  if (event.data.ok) {
    request.resolve(new Uint8Array(event.data.output));
  } else {
    request.reject(new Error(event.data.message));
  }
}

function handleWorkerError(): void {
  for (const request of pending.values()) {
    request.reject(new Error("The PDF engine could not start. Reload and try again."));
  }
  pending.clear();
  worker.terminate();
  worker = createWorker();
}

function createWorker(): Worker {
  const instance = new Worker(new URL("./pdf-worker.ts", import.meta.url), {
    type: "module",
  });
  instance.addEventListener("message", handleWorkerMessage);
  instance.addEventListener("error", handleWorkerError);
  return instance;
}

let worker = createWorker();


export function decryptPdf(input: Uint8Array, password: string): Promise<Uint8Array> {
  const id = nextId++;
  const copy = input.slice();

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, input: copy.buffer, password }, [copy.buffer]);
  });
}
