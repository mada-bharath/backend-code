const { execFileSync } = require("child_process");
const path = require("path");

const port = Number(process.argv[2] || process.env.PORT || 5000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`[dev] Invalid port: ${process.argv[2]}`);
  process.exit(1);
}

const currentPid = String(process.pid);
const projectRoot = path.resolve(__dirname, "..").replace(/\\/g, "/").toLowerCase();

const findWindowsListeners = () => {
  const output = execFileSync("netstat", ["-ano", "-p", "tcp"], {
    encoding: "utf8",
  });

  return [
    ...new Set(
      output
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/))
        .filter((parts) => parts[0] === "TCP")
        .filter((parts) => parts[3] === "LISTENING")
        .filter((parts) => {
          const localAddress = parts[1] || "";
          return localAddress.slice(localAddress.lastIndexOf(":") + 1) === String(port);
        })
        .map((parts) => parts[4])
        .filter((pid) => pid && pid !== "0" && pid !== currentPid)
    ),
  ];
};

const getWindowsProcesses = () => {
  try {
    const output = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress",
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }
    ).trim();

    if (!output) {
      return new Map();
    }

    const rows = JSON.parse(output);
    const processes = Array.isArray(rows) ? rows : [rows];

    return new Map(
      processes.map((processInfo) => [
        String(processInfo.ProcessId),
        {
          pid: String(processInfo.ProcessId),
          parentPid: String(processInfo.ParentProcessId || ""),
          name: String(processInfo.Name || "").toLowerCase(),
          commandLine: String(processInfo.CommandLine || "")
            .replace(/\\/g, "/")
            .toLowerCase(),
        },
      ])
    );
  } catch {
    return new Map();
  }
};

const isBackendDevProcess = (processInfo) => {
  if (!processInfo || processInfo.pid === currentPid) {
    return false;
  }

  const { name, commandLine } = processInfo;

  if (name !== "node.exe" && name !== "cmd.exe") {
    return false;
  }

  return (
    commandLine.includes("core/server.js") ||
    (commandLine.includes("nodemon") &&
      (commandLine.includes(projectRoot) || commandLine.includes("core/server.js")))
  );
};

const getRootTargets = (pids, processMap) => {
  const targets = new Set(pids);

  for (const pid of pids) {
    let cursor = processMap.get(pid);

    while (cursor) {
      const parent = processMap.get(cursor.parentPid);

      if (!isBackendDevProcess(parent)) {
        break;
      }

      targets.add(parent.pid);
      cursor = parent;
    }
  }

  return [...targets].filter((pid) => {
    const parentPid = processMap.get(pid)?.parentPid;
    return !targets.has(parentPid);
  });
};

const stopWindowsProcessTree = (pid) => {
  execFileSync("taskkill", ["/PID", pid, "/T", "/F"], {
    stdio: "ignore",
  });
};

if (process.platform !== "win32") {
  process.exit(0);
}

const processMap = getWindowsProcesses();
const listenerPids = findWindowsListeners();
const backendDevPids = [...processMap.values()]
  .filter(isBackendDevProcess)
  .map((processInfo) => processInfo.pid);
const targetPids = getRootTargets([...new Set([...listenerPids, ...backendDevPids])], processMap);

for (const pid of targetPids) {
  try {
    stopWindowsProcessTree(pid);
    console.log(`[dev] Stopped old backend dev process PID ${pid}`);
  } catch (error) {
    console.warn(`[dev] Could not stop old backend dev process PID ${pid}: ${error.message}`);
  }
}
