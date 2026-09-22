import { createServer } from "node:net";

/** Probe the same wildcard interface used by Forge's dev servers. */
export async function findAvailablePort(start: number): Promise<number> {
  for (let port = start; port <= 65535; port += 1) {
    const available = await new Promise<boolean>((resolve, reject) => {
      const server = createServer();
      server.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") resolve(false);
        else reject(error);
      });
      server.listen(port, () => {
        server.close((error) => {
          if (error) reject(error);
          else resolve(true);
        });
      });
    });
    if (available) return port;
  }
  throw new Error(`No available development port at or above ${start}`);
}
