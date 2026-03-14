import { useState, useCallback, useRef } from "react";
import { T } from "../tokens";
import { Btn, PanelHeader, Badge, Input } from "../components";
import { useShinra } from "./ShinraApp";

// ── Unique ID generator ─────────────────────────────────────────────────────
let _idCounter = 0;
function uid() {
  return `cfg_${Date.now()}_${++_idCounter}`;
}

// ── Config type definitions ─────────────────────────────────────────────────
const CONFIG_TYPES = [
  { id: "nodejs", label: "Node.js", color: T.green, cmd: "node" },
  { id: "python", label: "Python", color: T.blue, cmd: "python3" },
  { id: "docker", label: "Docker", color: T.cyan, cmd: "docker run" },
  { id: "go", label: "Go", color: T.teal, cmd: "go run" },
  { id: "custom", label: "Custom", color: T.purple, cmd: "" },
];

const TYPE_MAP = Object.fromEntries(CONFIG_TYPES.map((t) => [t.id, t]));

function defaultConfig(type = "nodejs") {
  const t = TYPE_MAP[type] || TYPE_MAP.nodejs;
  return {
    id: uid(),
    name: `New ${t.label} Config`,
    type,
    entryFile: "",
    args: "",
    cwd: "",
    envVars: [],
    preLaunchTasks: [],
  };
}

// ── ConfigTypeIcon ──────────────────────────────────────────────────────────
function ConfigTypeIcon({ type, size = 20 }) {
  const t = TYPE_MAP[type] || TYPE_MAP.custom;
  const icons = {
    nodejs: "JS",
    python: "Py",
    docker: "\uD83D\uDC33",
    go: "Go",
    custom: "\u2726",
  };
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        background: `${t.color}18`,
        border: `1px solid ${t.color}30`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.5,
        fontWeight: 700,
        color: t.color,
        fontFamily: T.fontMono,
        flexShrink: 0,
      }}
    >
      {icons[type] || "\u2726"}
    </div>
  );
}

// ── FormSection ─────────────────────────────────────────────────────────────
function FormSection({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: T.txt2,
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

// ── EnvVarRow ───────────────────────────────────────────────────────────────
function EnvVarRow({ envKey, envValue, onChange, onRemove }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        marginBottom: 6,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <Input
        value={envKey}
        onChange={(e) => onChange("key", e.target.value)}
        placeholder="KEY"
        style={{ flex: 1, fontFamily: T.fontMono, fontSize: 11 }}
      />
      <span style={{ color: T.txt3, fontSize: 12, flexShrink: 0 }}>=</span>
      <Input
        value={envValue}
        onChange={(e) => onChange("value", e.target.value)}
        placeholder="value"
        style={{ flex: 2, fontFamily: T.fontMono, fontSize: 11 }}
      />
      <button
        onClick={onRemove}
        style={{
          width: 24,
          height: 24,
          borderRadius: 4,
          border: `1px solid ${T.border}`,
          background: hov ? `${T.red}18` : "transparent",
          color: hov ? T.red : T.txt3,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 600,
          flexShrink: 0,
          transition: "all 0.15s",
        }}
        title="Remove variable"
      >
        \u00D7
      </button>
    </div>
  );
}

// ── PreLaunchTask ───────────────────────────────────────────────────────────
const TASK_TYPES = [
  { id: "build", label: "Build", color: T.blue },
  { id: "lint", label: "Lint", color: T.amber },
  { id: "test", label: "Test", color: T.green },
  { id: "custom", label: "Custom Command", color: T.purple },
];

function PreLaunchTask({ task, onChange, onRemove }) {
  const [hov, setHov] = useState(false);
  const taskDef = TASK_TYPES.find((t) => t.id === task.type) || TASK_TYPES[3];
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        marginBottom: 6,
        padding: "6px 10px",
        background: T.bg2,
        borderRadius: 6,
        border: `1px solid ${T.border}`,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <Badge
        style={{
          background: `${taskDef.color}18`,
          border: `1px solid ${taskDef.color}40`,
          color: taskDef.color,
          fontSize: 9,
          fontWeight: 700,
        }}
      >
        {taskDef.label}
      </Badge>
      <Input
        value={task.command}
        onChange={(e) => onChange({ ...task, command: e.target.value })}
        placeholder={
          task.type === "build"
            ? "npm run build"
            : task.type === "lint"
              ? "npm run lint"
              : task.type === "test"
                ? "npm test"
                : "command..."
        }
        style={{ flex: 1, fontSize: 11, fontFamily: T.fontMono }}
      />
      <button
        onClick={onRemove}
        style={{
          width: 24,
          height: 24,
          borderRadius: 4,
          border: `1px solid ${T.border}`,
          background: hov ? `${T.red}18` : "transparent",
          color: hov ? T.red : T.txt3,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 600,
          flexShrink: 0,
          transition: "all 0.15s",
        }}
        title="Remove task"
      >
        \u00D7
      </button>
    </div>
  );
}

// ── ConfigTreeItem ──────────────────────────────────────────────────────────
function ConfigTreeItem({ config, isSelected, isActive, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        cursor: "pointer",
        borderRadius: 6,
        background: isSelected ? `${T.blue}18` : hov ? T.bg3 : "transparent",
        border: isSelected
          ? `1px solid ${T.blue}30`
          : "1px solid transparent",
        transition: "all 0.15s",
        margin: "0 6px 2px",
      }}
    >
      <ConfigTypeIcon type={config.type} size={18} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: isSelected ? 600 : 400,
            color: isSelected ? T.txt : T.txt2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {config.name}
        </div>
      </div>
      {isActive && (
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: T.green,
            flexShrink: 0,
          }}
          title="Active configuration"
        />
      )}
    </div>
  );
}

// ── Main ScreenRunConfig ────────────────────────────────────────────────────
export default function ScreenRunConfig() {
  const { runConfigs, setRunConfigs, activeConfig, setActiveConfig, workingDir } =
    useShinra();

  const [selectedId, setSelectedId] = useState(
    () => runConfigs[0]?.id || null
  );
  const [formTab, setFormTab] = useState("general");
  const [runOutput, setRunOutput] = useState(null);
  const [running, setRunning] = useState(false);
  const [addTaskType, setAddTaskType] = useState("build");
  const outputRef = useRef(null);

  const selected = runConfigs.find((c) => c.id === selectedId) || null;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const updateConfig = useCallback(
    (id, patch) => {
      setRunConfigs((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
      );
    },
    [setRunConfigs]
  );

  const addConfig = useCallback(
    (type = "nodejs") => {
      const cfg = defaultConfig(type);
      if (workingDir) cfg.cwd = workingDir;
      setRunConfigs((prev) => [...prev, cfg]);
      setSelectedId(cfg.id);
      setFormTab("general");
      setRunOutput(null);
    },
    [setRunConfigs, workingDir]
  );

  const deleteConfig = useCallback(
    (id) => {
      setRunConfigs((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (selectedId === id) {
          setSelectedId(next[0]?.id || null);
        }
        return next;
      });
      if (activeConfig === id) setActiveConfig(null);
      setRunOutput(null);
    },
    [setRunConfigs, selectedId, activeConfig, setActiveConfig]
  );

  const duplicateConfig = useCallback(
    (id) => {
      const orig = runConfigs.find((c) => c.id === id);
      if (!orig) return;
      const copy = {
        ...orig,
        id: uid(),
        name: `${orig.name} (copy)`,
        envVars: orig.envVars.map((v) => ({ ...v })),
        preLaunchTasks: orig.preLaunchTasks.map((t) => ({ ...t })),
      };
      setRunConfigs((prev) => [...prev, copy]);
      setSelectedId(copy.id);
    },
    [runConfigs, setRunConfigs]
  );

  // ── Build command from config ─────────────────────────────────────────────
  const buildCommand = useCallback((cfg) => {
    const t = TYPE_MAP[cfg.type] || TYPE_MAP.custom;
    const parts = [];

    // Env vars prefix
    if (cfg.envVars.length > 0) {
      const envStr = cfg.envVars
        .filter((v) => v.key && v.key.trim())
        .map((v) => `${v.key.trim()}=${v.value || ""}`)
        .join(" ");
      if (envStr) parts.push(envStr);
    }

    if (cfg.type === "custom") {
      // For custom, entryFile is the full command
      parts.push(cfg.entryFile || "echo 'No command specified'");
    } else {
      parts.push(t.cmd);
      if (cfg.entryFile) parts.push(cfg.entryFile);
    }

    if (cfg.args && cfg.args.trim()) {
      parts.push(cfg.args.trim());
    }

    return parts.join(" ");
  }, []);

  // ── Run config — with live streaming output ───────────────────────────────
  const runConfig = useCallback(
    async (cfg) => {
      if (!cfg) return;
      setRunning(true);
      setRunOutput({ stdout: "", stderr: "", exitCode: null, running: true });
      setActiveConfig(cfg.id);

      const cwd = cfg.cwd || workingDir || undefined;

      try {
        // Execute pre-launch tasks sequentially (quick, no stream needed)
        for (const task of cfg.preLaunchTasks) {
          if (!task.command || !task.command.trim()) continue;
          const taskResult = await window.akatsuki.shinra.runCommand({
            cmd: task.command,
            cwd,
          });
          setRunOutput((prev) => ({
            ...prev,
            stdout: prev.stdout + `[pre-launch] ${task.command}\n${taskResult.stdout || ""}`,
            stderr: prev.stderr + (taskResult.stderr || ""),
          }));
          if (taskResult.exitCode !== 0) {
            setRunOutput((prev) => ({
              ...prev,
              stderr: prev.stderr + `\nPre-launch task "${task.command}" failed (exit ${taskResult.exitCode})\n`,
              exitCode: taskResult.exitCode,
              running: false,
            }));
            setRunning(false);
            return;
          }
        }

        // Destroy any previous shell, register streaming listeners
        try {
          await window.akatsuki.shinra.shellDestroy();
          window.akatsuki.shinra.removeShellListeners();
        } catch {}

        window.akatsuki.shinra.onShellStdout((data) => {
          setRunOutput((prev) => ({ ...prev, stdout: prev.stdout + data }));
        });
        window.akatsuki.shinra.onShellStderr((data) => {
          setRunOutput((prev) => ({ ...prev, stderr: prev.stderr + data }));
        });
        window.akatsuki.shinra.onShellExit((code) => {
          setRunOutput((prev) => ({ ...prev, exitCode: code, running: false }));
          setRunning(false);
          window.akatsuki.shinra.removeShellListeners();
        });

        // Start shell and send command
        const shellRes = await window.akatsuki.shinra.shellCreate({ cwd });
        if (!shellRes.ok) throw new Error("Shell failed to start");

        const cmd = buildCommand(cfg);
        setRunOutput((prev) => ({ ...prev, stdout: prev.stdout + `$ ${cmd}\n` }));
        window.akatsuki.shinra.shellWrite(cmd + "\n");

        // Shell exits will fire onShellExit; timeout safety fallback (30s)
        setTimeout(() => {
          setRunning((r) => {
            if (r) {
              window.akatsuki.shinra.shellDestroy();
              window.akatsuki.shinra.removeShellListeners();
              setRunOutput((prev) => ({ ...prev, running: false, stderr: prev.stderr + "\n[Timeout: process killed after 30s]\n" }));
            }
            return false;
          });
        }, 30000);

      } catch (err) {
        setRunOutput((prev) => ({
          ...prev,
          stderr: prev.stderr + `\nError: ${err.message || "Unknown error"}\n`,
          exitCode: 1,
          running: false,
        }));
        setRunning(false);
      }
    },
    [buildCommand, workingDir, setActiveConfig]
  );

  // ── ⌘R — run selected config ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "r" && !e.shiftKey) {
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        if (selected && !running) runConfig(selected);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, running, runConfig]);

  // ── Group configs by type ─────────────────────────────────────────────────
  const grouped = CONFIG_TYPES.map((typeDef) => ({
    ...typeDef,
    configs: runConfigs.filter((c) => c.type === typeDef.id),
  })).filter((g) => g.configs.length > 0);

  // ── EnvVar handlers (selected config) ─────────────────────────────────────
  const addEnvVar = useCallback(() => {
    if (!selected) return;
    updateConfig(selected.id, {
      envVars: [...(selected.envVars || []), { key: "", value: "" }],
    });
  }, [selected, updateConfig]);

  const updateEnvVar = useCallback(
    (index, field, value) => {
      if (!selected) return;
      const next = (selected.envVars || []).map((v, i) =>
        i === index ? { ...v, [field]: value } : v
      );
      updateConfig(selected.id, { envVars: next });
    },
    [selected, updateConfig]
  );

  const removeEnvVar = useCallback(
    (index) => {
      if (!selected) return;
      updateConfig(selected.id, {
        envVars: (selected.envVars || []).filter((_, i) => i !== index),
      });
    },
    [selected, updateConfig]
  );

  // ── PreLaunchTask handlers ────────────────────────────────────────────────
  const addPreLaunchTask = useCallback(
    (type) => {
      if (!selected) return;
      const defaults = {
        build: "npm run build",
        lint: "npm run lint",
        test: "npm test",
        custom: "",
      };
      updateConfig(selected.id, {
        preLaunchTasks: [
          ...(selected.preLaunchTasks || []),
          { type, command: defaults[type] || "" },
        ],
      });
    },
    [selected, updateConfig]
  );

  const updatePreLaunchTask = useCallback(
    (index, task) => {
      if (!selected) return;
      const next = (selected.preLaunchTasks || []).map((t, i) =>
        i === index ? task : t
      );
      updateConfig(selected.id, { preLaunchTasks: next });
    },
    [selected, updateConfig]
  );

  const removePreLaunchTask = useCallback(
    (index) => {
      if (!selected) return;
      updateConfig(selected.id, {
        preLaunchTasks: (selected.preLaunchTasks || []).filter(
          (_, i) => i !== index
        ),
      });
    },
    [selected, updateConfig]
  );

  // Scroll output into view when it changes
  const prevOutputRef = useRef(runOutput);
  if (runOutput !== prevOutputRef.current) {
    prevOutputRef.current = runOutput;
    if (outputRef.current) {
      setTimeout(() => {
        outputRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 50);
    }
  }

  // ── Tabs for right panel ──────────────────────────────────────────────────
  const TABS = [
    { id: "general", label: "General" },
    { id: "environment", label: "Environment" },
    { id: "beforelaunch", label: "Before Launch" },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="screen-enter"
      style={{
        display: "flex",
        flex: 1,
        height: "100%",
        overflow: "hidden",
        fontFamily: T.fontUI,
      }}
    >
      {/* ── Left panel: Config Tree ──────────────────────────────────────── */}
      <div
        style={{
          width: 260,
          minWidth: 260,
          display: "flex",
          flexDirection: "column",
          borderRight: `1px solid ${T.border}`,
          background: T.bg1,
        }}
      >
        <PanelHeader
          title="Configurations"
          accent={T.purple}
          count={runConfigs.length}
        />

        {/* Add Configuration button */}
        <div style={{ padding: "8px 8px 4px" }}>
          <Btn
            variant="primary"
            onClick={() => addConfig("nodejs")}
            style={{
              width: "100%",
              justifyContent: "center",
              height: 28,
              fontSize: 11,
            }}
          >
            + Add Configuration
          </Btn>
        </div>

        {/* Config tree */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "4px 0",
          }}
        >
          {runConfigs.length === 0 && (
            <div
              style={{
                padding: "40px 20px",
                textAlign: "center",
                color: T.txt3,
                fontSize: 12,
              }}
            >
              <div
                style={{
                  fontSize: 28,
                  marginBottom: 8,
                  opacity: 0.4,
                }}
              >
                \u2699
              </div>
              No configurations yet
            </div>
          )}

          {grouped.map((group) => (
            <ConfigGroup
              key={group.id}
              group={group}
              selectedId={selectedId}
              activeConfigId={activeConfig}
              onSelect={(id) => {
                setSelectedId(id);
                setFormTab("general");
                setRunOutput(null);
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Right panel: Config Form ─────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: T.bg0,
        }}
      >
        {!selected ? (
          /* ── Empty state ─────────────────────────────────────────────── */
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              color: T.txt3,
            }}
          >
            <div style={{ fontSize: 48, opacity: 0.3 }}>\u25B6</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: T.txt2 }}>
              Create your first run configuration
            </div>
            <div style={{ fontSize: 12, maxWidth: 320, textAlign: "center" }}>
              Run configurations let you define how to execute your code. Set up
              entry files, arguments, environment variables, and pre-launch tasks.
            </div>
            <Btn
              variant="primary"
              onClick={() => addConfig("nodejs")}
              style={{ marginTop: 8 }}
            >
              + New Configuration
            </Btn>
          </div>
        ) : (
          <>
            {/* ── Header with config name ──────────────────────────────── */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 16px",
                borderBottom: `1px solid ${T.border}`,
                background: T.bg1,
                flexShrink: 0,
              }}
            >
              <ConfigTypeIcon type={selected.type} size={24} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: T.txt,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {selected.name}
                </div>
                <div style={{ fontSize: 10, color: T.txt2, marginTop: 1 }}>
                  {(TYPE_MAP[selected.type] || TYPE_MAP.custom).label}
                  {selected.entryFile ? ` \u2014 ${selected.entryFile}` : ""}
                </div>
              </div>
              {activeConfig === selected.id && (
                <Badge
                  style={{
                    background: `${T.green}18`,
                    border: `1px solid ${T.green}40`,
                    color: T.green,
                    fontSize: 9,
                  }}
                >
                  \u25CF Active
                </Badge>
              )}
            </div>

            {/* ── Tabs ─────────────────────────────────────────────────── */}
            <div
              style={{
                display: "flex",
                borderBottom: `1px solid ${T.border}`,
                background: T.bg1,
                flexShrink: 0,
              }}
            >
              {TABS.map((tab) => (
                <TabButton
                  key={tab.id}
                  label={tab.label}
                  isActive={formTab === tab.id}
                  onClick={() => setFormTab(tab.id)}
                />
              ))}
            </div>

            {/* ── Form content ─────────────────────────────────────────── */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: 16,
              }}
            >
              {formTab === "general" && (
                <GeneralTab
                  config={selected}
                  onUpdate={(patch) => updateConfig(selected.id, patch)}
                  workingDir={workingDir}
                />
              )}

              {formTab === "environment" && (
                <div>
                  <FormSection label="Environment Variables">
                    {(selected.envVars || []).length === 0 && (
                      <div
                        style={{
                          color: T.txt3,
                          fontSize: 12,
                          padding: "12px 0",
                        }}
                      >
                        No environment variables defined. Add one below.
                      </div>
                    )}
                    {(selected.envVars || []).map((v, i) => (
                      <EnvVarRow
                        key={`env-${selected.id}-${i}`}
                        envKey={v.key}
                        envValue={v.value}
                        onChange={(field, val) => updateEnvVar(i, field, val)}
                        onRemove={() => removeEnvVar(i)}
                      />
                    ))}
                    <Btn
                      variant="ghost"
                      onClick={addEnvVar}
                      style={{ marginTop: 8, fontSize: 11 }}
                    >
                      + Add Variable
                    </Btn>
                  </FormSection>
                </div>
              )}

              {formTab === "beforelaunch" && (
                <div>
                  <FormSection label="Pre-Launch Tasks">
                    <div
                      style={{
                        fontSize: 11,
                        color: T.txt3,
                        marginBottom: 10,
                      }}
                    >
                      Tasks run sequentially before the main command. If any task
                      fails, execution stops.
                    </div>
                    {(selected.preLaunchTasks || []).length === 0 && (
                      <div
                        style={{
                          color: T.txt3,
                          fontSize: 12,
                          padding: "12px 0",
                          textAlign: "center",
                          background: T.bg2,
                          borderRadius: 6,
                          border: `1px dashed ${T.border}`,
                        }}
                      >
                        No pre-launch tasks. Add one below.
                      </div>
                    )}
                    {(selected.preLaunchTasks || []).map((task, i) => (
                      <PreLaunchTask
                        key={`task-${selected.id}-${i}`}
                        task={task}
                        onChange={(t) => updatePreLaunchTask(i, t)}
                        onRemove={() => removePreLaunchTask(i)}
                      />
                    ))}
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        marginTop: 10,
                      }}
                    >
                      <div style={{ position: "relative" }}>
                        <select
                          value={addTaskType}
                          onChange={(e) => setAddTaskType(e.target.value)}
                          style={{
                            background: T.bg3,
                            border: `1px solid ${T.border2}`,
                            borderRadius: 6,
                            color: T.txt,
                            fontSize: 11,
                            padding: "5px 28px 5px 10px",
                            fontFamily: T.fontUI,
                            outline: "none",
                            cursor: "pointer",
                            appearance: "none",
                          }}
                        >
                          {TASK_TYPES.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <span
                          style={{
                            position: "absolute",
                            right: 8,
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: T.txt2,
                            pointerEvents: "none",
                            fontSize: 10,
                          }}
                        >
                          \u25BE
                        </span>
                      </div>
                      <Btn
                        variant="ghost"
                        onClick={() => addPreLaunchTask(addTaskType)}
                        style={{ fontSize: 11 }}
                      >
                        + Add Task
                      </Btn>
                    </div>
                  </FormSection>
                </div>
              )}
            </div>

            {/* ── Action bar ───────────────────────────────────────────── */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 16px",
                borderTop: `1px solid ${T.border}`,
                background: T.bg1,
                flexShrink: 0,
              }}
            >
              <Btn
                variant="primary"
                onClick={() => runConfig(selected)}
                disabled={running}
                style={{ gap: 4 }}
              >
                {running ? (
                  <>
                    <span
                      style={{
                        display: "inline-block",
                        width: 12,
                        height: 12,
                        border: `2px solid ${T.txt}30`,
                        borderTop: `2px solid #fff`,
                        borderRadius: "50%",
                        animation: "spin 0.7s linear infinite",
                      }}
                    />
                    Running...
                  </>
                ) : (
                  <>
                    \u25B6 Run
                  </>
                )}
              </Btn>
              <Btn
                variant="ghost"
                onClick={() => duplicateConfig(selected.id)}
              >
                Duplicate
              </Btn>
              <div style={{ flex: 1 }} />
              <Btn
                variant="danger"
                onClick={() => deleteConfig(selected.id)}
              >
                Delete
              </Btn>
            </div>

            {/* ── Output panel ─────────────────────────────────────────── */}
            {runOutput && (
              <div
                ref={outputRef}
                style={{
                  borderTop: `1px solid ${T.border}`,
                  background: T.bg2,
                  flexShrink: 0,
                  maxHeight: 200,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 12px",
                    borderBottom: `1px solid ${T.border}`,
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        width: 3,
                        height: 14,
                        borderRadius: 2,
                        background: runOutput.running
                          ? T.amber
                          : runOutput.exitCode === 0
                            ? T.green
                            : T.red,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: T.txt2,
                        textTransform: "uppercase",
                        letterSpacing: 1,
                      }}
                    >
                      Output
                    </span>
                    {!runOutput.running && runOutput.exitCode !== null && (
                      <Badge
                        style={{
                          background:
                            runOutput.exitCode === 0
                              ? `${T.green}18`
                              : `${T.red}18`,
                          border: `1px solid ${
                            runOutput.exitCode === 0
                              ? `${T.green}40`
                              : `${T.red}40`
                          }`,
                          color:
                            runOutput.exitCode === 0 ? T.green : T.red,
                          fontSize: 9,
                        }}
                      >
                        Exit: {runOutput.exitCode}
                      </Badge>
                    )}
                    {runOutput.running && (
                      <Badge
                        style={{
                          background: `${T.amber}18`,
                          border: `1px solid ${T.amber}40`,
                          color: T.amber,
                          fontSize: 9,
                        }}
                      >
                        Running...
                      </Badge>
                    )}
                  </div>
                  <button
                    onClick={() => setRunOutput(null)}
                    style={{
                      background: "none",
                      border: "none",
                      color: T.txt3,
                      cursor: "pointer",
                      fontSize: 14,
                      padding: 2,
                    }}
                    title="Close output"
                  >
                    \u00D7
                  </button>
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: "8px 12px",
                    fontSize: 11,
                    fontFamily: T.fontMono,
                    color: T.txt,
                    overflowY: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    flex: 1,
                  }}
                >
                  {runOutput.stdout}
                  {runOutput.stderr && (
                    <span style={{ color: T.red }}>{runOutput.stderr}</span>
                  )}
                  {!runOutput.running &&
                    !runOutput.stdout &&
                    !runOutput.stderr && (
                      <span style={{ color: T.txt3 }}>
                        (no output)
                      </span>
                    )}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── ConfigGroup (tree group header + items) ─────────────────────────────────
function ConfigGroup({ group, selectedId, activeConfigId, onSelect }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        onClick={() => setExpanded((p) => !p)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 12px",
          cursor: "pointer",
          fontSize: 10,
          fontWeight: 700,
          color: T.txt3,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          userSelect: "none",
        }}
      >
        <span
          style={{
            fontSize: 8,
            transition: "transform 0.15s",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          \u25B6
        </span>
        <ConfigTypeIcon type={group.id} size={14} />
        {group.label}
        <span
          style={{
            fontSize: 9,
            color: T.txt3,
            background: T.bg3,
            padding: "0 5px",
            borderRadius: 8,
            marginLeft: "auto",
          }}
        >
          {group.configs.length}
        </span>
      </div>
      {expanded &&
        group.configs.map((cfg) => (
          <ConfigTreeItem
            key={cfg.id}
            config={cfg}
            isSelected={cfg.id === selectedId}
            isActive={cfg.id === activeConfigId}
            onClick={() => onSelect(cfg.id)}
          />
        ))}
    </div>
  );
}

// ── TabButton ───────────────────────────────────────────────────────────────
function TabButton({ label, isActive, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "8px 16px",
        fontSize: 11,
        fontWeight: isActive ? 700 : 500,
        fontFamily: T.fontUI,
        color: isActive ? T.blue : T.txt2,
        background: hov && !isActive ? `${T.bg3}60` : "transparent",
        border: "none",
        borderBottom: isActive ? `2px solid ${T.blue}` : "2px solid transparent",
        cursor: "pointer",
        transition: "all 0.15s",
        outline: "none",
      }}
    >
      {label}
    </button>
  );
}

// ── GeneralTab ──────────────────────────────────────────────────────────────
function GeneralTab({ config, onUpdate, workingDir }) {
  return (
    <div>
      <FormSection label="Configuration Name">
        <Input
          value={config.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="My Configuration"
        />
      </FormSection>

      <FormSection label="Type">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {CONFIG_TYPES.map((t) => (
            <TypeChip
              key={t.id}
              typeDef={t}
              isSelected={config.type === t.id}
              onClick={() => onUpdate({ type: t.id })}
            />
          ))}
        </div>
      </FormSection>

      <FormSection
        label={config.type === "custom" ? "Command" : "Entry File"}
      >
        <Input
          value={config.entryFile}
          onChange={(e) => onUpdate({ entryFile: e.target.value })}
          placeholder={
            config.type === "nodejs"
              ? "index.js"
              : config.type === "python"
                ? "main.py"
                : config.type === "docker"
                  ? "my-image:latest"
                  : config.type === "go"
                    ? "main.go"
                    : "echo hello"
          }
          style={{ fontFamily: T.fontMono, fontSize: 12 }}
        />
      </FormSection>

      {config.type !== "custom" && (
        <FormSection label="Arguments">
          <Input
            value={config.args}
            onChange={(e) => onUpdate({ args: e.target.value })}
            placeholder="--port 3000"
            style={{ fontFamily: T.fontMono, fontSize: 12 }}
          />
        </FormSection>
      )}

      <FormSection label="Working Directory">
        <Input
          value={config.cwd}
          onChange={(e) => onUpdate({ cwd: e.target.value })}
          placeholder={workingDir || "/path/to/project"}
          style={{ fontFamily: T.fontMono, fontSize: 12 }}
        />
        {workingDir && !config.cwd && (
          <div style={{ fontSize: 10, color: T.txt3, marginTop: 4 }}>
            Defaults to workspace directory: {workingDir}
          </div>
        )}
      </FormSection>

      {/* Command preview */}
      <FormSection label="Command Preview">
        <div
          style={{
            background: T.bg2,
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            padding: "8px 12px",
            fontFamily: T.fontMono,
            fontSize: 11,
            color: T.cyan,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {buildCommandPreview(config)}
        </div>
      </FormSection>
    </div>
  );
}

// ── Build command preview (pure function) ───────────────────────────────────
function buildCommandPreview(cfg) {
  const t = TYPE_MAP[cfg.type] || TYPE_MAP.custom;
  const parts = [];

  if (cfg.envVars && cfg.envVars.length > 0) {
    const envStr = cfg.envVars
      .filter((v) => v.key && v.key.trim())
      .map((v) => `${v.key.trim()}=${v.value || ""}`)
      .join(" ");
    if (envStr) parts.push(envStr);
  }

  if (cfg.type === "custom") {
    parts.push(cfg.entryFile || "<command>");
  } else {
    parts.push(t.cmd);
    parts.push(cfg.entryFile || `<${cfg.type === "docker" ? "image" : "file"}>`);
  }

  if (cfg.args && cfg.args.trim()) {
    parts.push(cfg.args.trim());
  }

  return parts.join(" ");
}

// ── TypeChip ────────────────────────────────────────────────────────────────
function TypeChip({ typeDef, isSelected, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: isSelected ? 700 : 500,
        fontFamily: T.fontUI,
        cursor: "pointer",
        border: isSelected
          ? `1px solid ${typeDef.color}50`
          : `1px solid ${T.border}`,
        background: isSelected
          ? `${typeDef.color}18`
          : hov
            ? T.bg3
            : T.bg2,
        color: isSelected ? typeDef.color : T.txt2,
        outline: "none",
        transition: "all 0.15s",
      }}
    >
      <ConfigTypeIcon type={typeDef.id} size={16} />
      {typeDef.label}
    </button>
  );
}
