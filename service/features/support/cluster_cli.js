import { spawn } from "node:child_process";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (c) => (output += c));
    child.stderr.on("data", (c) => (output += c));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}:\n${output}`));
    });
  });
}

export function runHelm(args) {
  return run("helm", args);
}

export function runKubectl(args) {
  return run("kubectl", args);
}
