import { EventEmitter } from "node:events";

// Process-wide wake-up bus: lets the SSE stream deliver a signal the moment it is
// written, instead of waiting for the next DB poll tick.
const g = globalThis as unknown as { __signalBus?: EventEmitter };
const bus = g.__signalBus ?? new EventEmitter();
bus.setMaxListeners(0);
g.__signalBus = bus;

export function notifyUser(userId: string) {
  bus.emit(`u:${userId}`);
}

export function onUserSignal(userId: string, fn: () => void): () => void {
  bus.on(`u:${userId}`, fn);
  return () => bus.off(`u:${userId}`, fn);
}
