import { fork, type ChildProcess } from "child_process"

// Starts one of the plain-ESM scripts under workers/ as its own Node process.
// Processes rather than worker threads so that ending one hands all of its
// memory back to the OS; a thread's native allocations stayed with the server.
// Structured-clone IPC, like a worker's postMessage. The parent's flags and
// NODE_OPTIONS (dev loaders, inspector, heap sizes) are not passed on, so the
// child runs with exactly the flags given here.
export function forkScript(script: string, opts: { args?: string[]; execArgv?: string[]; pipeStderr?: boolean } = {}): ChildProcess {
  return fork(script, opts.args ?? [], {
    execArgv: opts.execArgv ?? [],
    env: { ...process.env, NODE_OPTIONS: undefined },
    serialization: "advanced",
    stdio: ["ignore", "inherit", opts.pipeStderr ? "pipe" : "inherit", "ipc"],
  })
}

/** Ends the process whatever it is doing. Safe to call on one that already exited. */
export function killProcess(child: ChildProcess): void {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
}
