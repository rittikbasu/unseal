import createQpdfModule, { type QpdfInstance } from "@neslinesli93/qpdf-wasm";
import wasmUrl from "@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url";

type QpdfFileSystem = QpdfInstance["FS"] & {
  writeFile(path: string, data: Uint8Array): void;
  unlink(path: string): void;
};

type DecryptRequest = {
  id: number;
  input: ArrayBuffer;
  password: string;
};

type DecryptReply =
  | { id: number; ok: true; output: ArrayBuffer }
  | { id: number; ok: false; message: string };

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
      return {
        id: request.id,
        ok: false,
        message: "Wrong password. Try again.",
      };
    }

    const output = fs.readFile(outputPath);
    const transferable = new Uint8Array(output).buffer;
    return { id: request.id, ok: true, output: transferable };
  } catch {
    return {
      id: request.id,
      ok: false,
      message: "This PDF could not be opened. Try another copy of the file.",
    };
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
      workerScope.postMessage({
        id: event.data.id,
        ok: false,
        message: "The PDF engine could not start. Reload and try again.",
      } satisfies DecryptReply);
    });
});
