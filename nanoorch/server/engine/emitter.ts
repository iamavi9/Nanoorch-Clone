import { EventEmitter } from "events";

export const taskLogEmitter = new EventEmitter();
taskLogEmitter.setMaxListeners(200);
