import createQpdfModule, { type QpdfInstance } from "@neslinesli93/qpdf-wasm";
import wasmUrl from "@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url";
import type { DecryptReply, DecryptRequest } from "./pdf-protocol";

type QpdfFileSystem = QpdfInstance["FS"] & {
  writeFile(path: string, data: Uint8Array): void;
  unlink(path: string): void;
};

type WorkerScope = {
  addEventListener(type: "message", listener: (event: MessageEvent<DecryptRequest>) => void): void;
  postMessage(message: DecryptReply, transfer?: Transferable[]): void;
};

const workerScope = self as unknown as WorkerScope;
let modulePromise: Promise<QpdfInstance> | undefined;
let queue = Promise.resolve();

function getQpdf(): Promise<QpdfInstance> {
  modulePromise ??= createQpdfModule({ locateFile: () => wasmUrl });
  return modulePromise;
}

function transferableBuffer(input: Uint8Array): ArrayBuffer {
  if (input.byteOffset === 0 && input.byteLength === input.buffer.byteLength) {
    return input.buffer as ArrayBuffer;
  }

  return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;
}

async function decrypt(request: DecryptRequest): Promise<DecryptReply> {
  const qpdf = await getQpdf();
  const fs = qpdf.FS as QpdfFileSystem;
  const inputPath = `/input-${request.id}.pdf`;
  const outputPath = `/output-${request.id}.pdf`;

  try {
    fs.writeFile(inputPath, new Uint8Array(request.input));
    const exitCode = qpdf.callMain([
      `--password=${request.password}`,
      "--decrypt",
      inputPath,
      outputPath,
    ]);

    if (exitCode !== 0) {
      return { id: request.id, ok: false };
    }

    const output = fs.readFile(outputPath);
    return { id: request.id, ok: true, output: transferableBuffer(output) };
  } catch {
    return { id: request.id, ok: false };
  } finally {
    for (const path of [inputPath, outputPath]) {
      try {
        fs.unlink(path);
      } catch {
        // qpdf may not create the output when the password is wrong.
      }
    }
  }
}

workerScope.addEventListener("message", (event: MessageEvent<DecryptRequest>) => {
  queue = queue
    .then(async () => {
      const reply = await decrypt(event.data);
      const transfer = reply.ok ? [reply.output] : [];
      workerScope.postMessage(reply, transfer);
    })
    .catch(() => {
      workerScope.postMessage({ id: event.data.id, ok: false } satisfies DecryptReply);
    });
});
