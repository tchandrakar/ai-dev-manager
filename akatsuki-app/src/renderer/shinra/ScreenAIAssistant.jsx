import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { T } from "../tokens";
import { Btn, PanelHeader, Spinner } from "../components";
import { useShinra, highlightTS } from "./ShinraApp";

// ── Action tab definitions ──────────────────────────────────────────────────
const ACTIONS = [
  { key: "chat",     label: "Chat",     icon: "\u2726" },
  { key: "explain",  label: "Explain",  icon: "\uD83D\uDCA1" },
  { key: "fix",      label: "Fix",      icon: "\uD83D\uDD27" },
  { key: "refactor", label: "Refactor", icon: "\u267B" },
  { key: "test",     label: "Test",     icon: "\uD83E\uDDEA" },
];

const ACTION_PROMPTS = {
  explain:  "Explain this code in detail. Break down what each section does, the overall architecture, and any patterns used.",
  fix:      "Find and fix bugs in this code. Identify potential issues, edge cases, and suggest corrections with corrected code.",
  refactor: "Suggest refactoring improvements for this code. Focus on readability, maintainability, performance, and best practices. Provide the refactored code.",
  test:     "Generate comprehensive unit tests for this code. Cover edge cases, error handling, and the main functionality.",
};

// ── CodeBlock sub-component ─────────────────────────────────────────────────
function CodeBlock({ code, language }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

  const lines = code.split("\n");

  return (
    <div style={{
      background: T.bg0,
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      margin: "8px 0",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "4px 10px",
        background: T.bg2,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <span style={{ fontSize: 10, color: T.txt3, fontFamily: T.fontMono }}>
          {language || "code"}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <Btn variant="subtle" onClick={handleCopy} style={{ height: 22, fontSize: 10, padding: "0 8px" }}>
            {copied ? "Copied!" : "Apply"}
          </Btn>
        </div>
      </div>
      {/* Code content */}
      <div style={{
        padding: "8px 12px",
        overflowX: "auto",
        fontFamily: T.fontMono,
        fontSize: 11,
        lineHeight: "18px",
      }}>
        {lines.map((line, i) => {
          const tokens = highlightTS(line);
          return (
            <div key={i} style={{ display: "flex", minHeight: 18 }}>
              <span style={{
                width: 32,
                flexShrink: 0,
                textAlign: "right",
                paddingRight: 12,
                color: T.txt3,
                userSelect: "none",
                fontSize: 10,
              }}>
                {i + 1}
              </span>
              <span style={{ whiteSpace: "pre" }}>
                {tokens.map((tok, j) => (
                  <span key={j} style={{ color: tok.color || T.txt, fontWeight: tok.bold ? 700 : 400 }}>
                    {tok.text}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Render markdown-like assistant text ─────────────────────────────────────
function renderMessageContent(text) {
  const parts = [];
  let remaining = text;
  let idx = 0;

  while (remaining.length > 0) {
    const codeStart = remaining.indexOf("```");
    if (codeStart === -1) {
      // No more code blocks — render rest as text
      parts.push(<TextBlock key={idx++} text={remaining} />);
      break;
    }

    // Text before code block
    if (codeStart > 0) {
      parts.push(<TextBlock key={idx++} text={remaining.slice(0, codeStart)} />);
    }

    // Find end of code block
    const afterLang = remaining.indexOf("\n", codeStart);
    if (afterLang === -1) {
      parts.push(<TextBlock key={idx++} text={remaining} />);
      break;
    }

    const lang = remaining.slice(codeStart + 3, afterLang).trim();
    const codeEnd = remaining.indexOf("```", afterLang + 1);
    if (codeEnd === -1) {
      // Unclosed code block — render the rest as code
      const code = remaining.slice(afterLang + 1);
      parts.push(<CodeBlock key={idx++} code={code} language={lang} />);
      break;
    }

    const code = remaining.slice(afterLang + 1, codeEnd);
    parts.push(<CodeBlock key={idx++} code={code} language={lang} />);
    remaining = remaining.slice(codeEnd + 3);
  }

  return parts;
}

// ── TextBlock (renders inline markdown formatting) ──────────────────────────
function TextBlock({ text }) {
  // Split into lines and render with basic formatting
  const lines = text.split("\n");

  return (
    <div style={{ whiteSpace: "pre-wrap", lineHeight: "20px" }}>
      {lines.map((line, i) => (
        <TextLine key={i} line={line} />
      ))}
    </div>
  );
}

function TextLine({ line }) {
  // Headings
  if (line.startsWith("### ")) {
    return <div style={{ fontWeight: 700, fontSize: 13, color: T.txt, margin: "8px 0 4px" }}>{line.slice(4)}</div>;
  }
  if (line.startsWith("## ")) {
    return <div style={{ fontWeight: 700, fontSize: 14, color: T.txt, margin: "10px 0 4px" }}>{line.slice(3)}</div>;
  }
  if (line.startsWith("# ")) {
    return <div style={{ fontWeight: 700, fontSize: 15, color: T.txt, margin: "12px 0 4px" }}>{line.slice(2)}</div>;
  }
  // Bullet points
  if (line.match(/^[\s]*[-*]\s/)) {
    const indent = line.match(/^(\s*)/)[1].length;
    return (
      <div style={{ paddingLeft: indent * 4 + 8, display: "flex", gap: 6 }}>
        <span style={{ color: T.blue, flexShrink: 0 }}>{"\u2022"}</span>
        <span>{renderInlineFormatting(line.replace(/^[\s]*[-*]\s/, ""))}</span>
      </div>
    );
  }

  return <div>{renderInlineFormatting(line)}</div>;
}

function renderInlineFormatting(text) {
  // Process inline code, bold, italic
  const parts = [];
  let remaining = text;
  let idx = 0;

  while (remaining.length > 0) {
    // Inline code `...`
    const codeMatch = remaining.match(/`([^`]+)`/);
    // Bold **...**
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);

    let firstMatch = null;
    let firstPos = remaining.length;

    if (codeMatch && codeMatch.index < firstPos) {
      firstMatch = { type: "code", match: codeMatch };
      firstPos = codeMatch.index;
    }
    if (boldMatch && boldMatch.index < firstPos) {
      firstMatch = { type: "bold", match: boldMatch };
      firstPos = boldMatch.index;
    }

    if (!firstMatch) {
      parts.push(<span key={idx++}>{remaining}</span>);
      break;
    }

    // Text before match
    if (firstPos > 0) {
      parts.push(<span key={idx++}>{remaining.slice(0, firstPos)}</span>);
    }

    const m = firstMatch.match;
    if (firstMatch.type === "code") {
      parts.push(
        <code key={idx++} style={{
          background: T.bg3,
          padding: "1px 5px",
          borderRadius: 3,
          fontFamily: T.fontMono,
          fontSize: 11,
          color: T.cyan,
        }}>
          {m[1]}
        </code>
      );
    } else if (firstMatch.type === "bold") {
      parts.push(<strong key={idx++} style={{ color: T.txt, fontWeight: 700 }}>{m[1]}</strong>);
    }

    remaining = remaining.slice(firstPos + m[0].length);
  }

  return parts;
}

// ── ChatMessage sub-component ───────────────────────────────────────────────
function ChatMessage({ message, onCopy }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [message.content]);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 4,
      padding: "10px 14px",
      animation: "fadeIn 0.2s ease-out",
    }}>
      {/* Role label + actions */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: isUser ? T.blue : T.purple,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            color: "#fff",
            flexShrink: 0,
          }}>
            {isUser ? "U" : "A"}
          </div>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: isUser ? T.blue : T.purple,
            fontFamily: T.fontUI,
          }}>
            {isUser ? "You" : "Assistant"}
          </span>
          {message.tokens && (
            <span style={{ fontSize: 9, color: T.txt3, fontFamily: T.fontMono }}>
              {message.tokens.input + message.tokens.output} tokens
            </span>
          )}
        </div>
        {!isUser && (
          <Btn
            variant="subtle"
            onClick={handleCopy}
            style={{ height: 20, fontSize: 9, padding: "0 6px" }}
          >
            {copied ? "Copied!" : "Copy"}
          </Btn>
        )}
      </div>
      {/* Message body */}
      <div style={{
        fontSize: 12,
        lineHeight: "20px",
        color: T.txt,
        fontFamily: T.fontUI,
        paddingLeft: 26,
      }}>
        {isUser ? (
          <span style={{ whiteSpace: "pre-wrap" }}>{message.content}</span>
        ) : (
          renderMessageContent(message.content)
        )}
      </div>
    </div>
  );
}

// ── ActionTab sub-component ─────────────────────────────────────────────────
function ActionTab({ action, active, onClick }) {
  const [hov, setHov] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "0 12px",
        height: 30,
        border: "none",
        borderBottom: active ? `2px solid ${T.blue}` : "2px solid transparent",
        background: hov && !active ? T.bg3 : "transparent",
        color: active ? T.blue : T.txt2,
        fontSize: 11,
        fontWeight: active ? 600 : 500,
        fontFamily: T.fontUI,
        cursor: "pointer",
        transition: "color 0.15s, border-color 0.15s, background 0.15s",
        outline: "none",
      }}
    >
      <span style={{ fontSize: 12 }}>{action.icon}</span>
      {action.label}
    </button>
  );
}

// ── ModelOption sub-component ───────────────────────────────────────────────
function ModelOption({ agent, selected, onClick }) {
  const [hov, setHov] = useState(false);
  const providerColors = { anthropic: T.purple, openai: T.green, google: T.blue, gemini: T.blue };
  const accent = providerColors[agent.provider] || T.cyan;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        cursor: "pointer",
        background: selected ? `${accent}18` : hov ? T.bg3 : "transparent",
        borderRadius: 4,
        transition: "background 0.15s",
      }}
    >
      <div style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: accent,
        flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11,
          fontWeight: selected ? 600 : 400,
          color: selected ? accent : T.txt,
          fontFamily: T.fontUI,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {agent.model}
        </div>
        <div style={{ fontSize: 9, color: T.txt3, fontFamily: T.fontUI }}>
          {agent.provider}
        </div>
      </div>
      {selected && (
        <span style={{ fontSize: 10, color: accent }}>{"\u2713"}</span>
      )}
    </div>
  );
}

// ── ScreenAIAssistant (default export) ──────────────────────────────────────
function ScreenAIAssistant() {
  const { activeFile, openFiles, workingDir, aiHistory, setAiHistory } = useShinra();

  // State
  const [activeAction, setActiveAction] = useState("chat");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [agents, setAgents] = useState([]);
  const [selectedAgentIdx, setSelectedAgentIdx] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [fileContent, setFileContent] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Load AI agents from config
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await window.akatsuki.config.load();
        if (!cancelled && cfg && Array.isArray(cfg.aiAgents) && cfg.aiAgents.length > 0) {
          setAgents(cfg.aiAgents);
        }
      } catch (e) {
        console.error("Failed to load AI config:", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load active file content
  useEffect(() => {
    if (!activeFile) {
      setFileContent(null);
      return;
    }
    let cancelled = false;
    setFileLoading(true);
    (async () => {
      try {
        const r = await window.akatsuki.shinra.readFile(activeFile);
        if (!cancelled) {
          setFileContent(r?.content ?? null);
        }
      } catch (e) {
        if (!cancelled) setFileContent(null);
        console.error("Failed to read file:", e);
      } finally {
        if (!cancelled) setFileLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeFile]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiHistory, sending]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [dropdownOpen]);

  // Selected agent
  const selectedAgent = agents[selectedAgentIdx] || null;

  // Build system prompt
  const buildSystemPrompt = useCallback(() => {
    let sys = "You are an expert AI programming assistant embedded in the Shinra Tensei IDE. Provide clear, concise, and accurate responses. Use markdown formatting with code blocks (```language) when showing code.";
    if (activeFile && fileContent) {
      sys += `\n\nThe user is currently viewing the file: ${activeFile}\n\nFile contents:\n\`\`\`\n${fileContent}\n\`\`\``;
    }
    return sys;
  }, [activeFile, fileContent]);

  // Send message
  const sendMessage = useCallback(async (userMessage) => {
    if (sending || !userMessage.trim()) return;
    if (!selectedAgent) {
      setAiHistory(prev => [
        ...prev,
        { role: "user", content: userMessage, ts: Date.now() },
        { role: "assistant", content: "No AI agent configured. Please add an API key in the main app Settings screen.", ts: Date.now() },
      ]);
      return;
    }

    setSending(true);
    const userMsg = { role: "user", content: userMessage, ts: Date.now() };
    setAiHistory(prev => [...prev, userMsg]);

    try {
      // Build messages array from recent history for context
      const recentHistory = [...aiHistory.slice(-20), userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const r = await window.akatsuki.ai.chat({
        provider: selectedAgent.provider,
        apiKey: selectedAgent.apiKey,
        model: selectedAgent.model,
        system: buildSystemPrompt(),
        messages: recentHistory,
      });

      const assistantMsg = {
        role: "assistant",
        content: r.error ? `Error: ${r.error}` : r.text,
        ts: Date.now(),
        tokens: r.error ? null : { input: r.inputTokens || 0, output: r.outputTokens || 0 },
      };
      setAiHistory(prev => [...prev, assistantMsg]);
    } catch (e) {
      setAiHistory(prev => [
        ...prev,
        { role: "assistant", content: `Error: ${e.message || "Unknown error occurred"}`, ts: Date.now() },
      ]);
    } finally {
      setSending(false);
    }
  }, [sending, selectedAgent, aiHistory, setAiHistory, buildSystemPrompt]);

  // Handle action tab click — keep active tab, show spinner inline
  const handleActionClick = useCallback((key) => {
    if (key === "chat") {
      setActiveAction("chat");
      return;
    }
    if (!activeFile || !fileContent) {
      setAiHistory(prev => [
        ...prev,
        { role: "assistant", content: "No file is currently open. Please open a file first to use this action.", ts: Date.now() },
      ]);
      return;
    }
    setActiveAction(key);
    const prompt = ACTION_PROMPTS[key];
    sendMessage(prompt).finally(() => setActiveAction("chat"));
  }, [activeFile, fileContent, sendMessage, setAiHistory, setActiveAction]);

  // Handle chat submit
  const handleSubmit = useCallback((e) => {
    if (e) e.preventDefault();
    if (!input.trim() || sending) return;
    const msg = input.trim();
    setInput("");
    sendMessage(msg);
  }, [input, sending, sendMessage]);

  // Handle keydown in textarea — ⌘/Ctrl+Enter sends, Shift+Enter = newline, Enter = send
  const handleKeyDown = useCallback((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    // Shift+Enter: allow natural newline (no prevention needed)
  }, [handleSubmit]);

  // Auto-grow textarea on input change
  const handleInputChange = useCallback((e) => {
    setInput(e.target.value);
    // Auto-grow height
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, []);

  // Clear chat
  const handleClear = useCallback(() => {
    setAiHistory([]);
  }, [setAiHistory]);

  // File name from path
  const fileName = activeFile ? activeFile.split("/").pop() : null;

  // File lines for code panel
  const fileLines = useMemo(() => {
    if (!fileContent) return [];
    return fileContent.split("\n");
  }, [fileContent]);

  return (
    <div
      className="screen-enter"
      style={{
        display: "flex",
        flex: 1,
        overflow: "hidden",
        fontFamily: T.fontUI,
      }}
    >
      {/* ── Left: Code Panel (60%) ──────────────────────────────────── */}
      <div style={{
        width: "60%",
        display: "flex",
        flexDirection: "column",
        borderRight: `1px solid ${T.border}`,
        overflow: "hidden",
      }}>
        {/* Action tabs */}
        <div style={{
          display: "flex",
          alignItems: "center",
          background: T.bg1,
          borderBottom: `1px solid ${T.border}`,
          flexShrink: 0,
        }}>
          {ACTIONS.map(a => (
            <ActionTab
              key={a.key}
              action={a}
              active={activeAction === a.key}
              onClick={() => handleActionClick(a.key)}
            />
          ))}
          <div style={{ flex: 1 }} />
          {activeFile && (
            <span style={{
              fontSize: 10,
              color: T.txt2,
              paddingRight: 12,
              fontFamily: T.fontMono,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 200,
            }}>
              {fileName}
            </span>
          )}
        </div>

        {/* Code area */}
        <div style={{
          flex: 1,
          overflow: "auto",
          background: T.bg0,
        }}>
          {fileLoading ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 8,
            }}>
              <Spinner size={16} />
              <span style={{ fontSize: 12, color: T.txt2 }}>Loading file...</span>
            </div>
          ) : !activeFile ? (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 12,
              color: T.txt3,
            }}>
              <span style={{ fontSize: 36, opacity: 0.3 }}>{"\u2726"}</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>No file open</span>
              <span style={{ fontSize: 11 }}>
                Open a file in the Editor to use AI assistance
              </span>
            </div>
          ) : !fileContent ? (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 8,
              color: T.txt3,
            }}>
              <span style={{ fontSize: 13 }}>Unable to load file content</span>
            </div>
          ) : (
            <div style={{
              padding: "8px 0",
              fontFamily: T.fontMono,
              fontSize: 12,
              lineHeight: "20px",
            }}>
              {fileLines.map((line, i) => {
                const tokens = highlightTS(line);
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      minHeight: 20,
                      paddingRight: 12,
                    }}
                  >
                    <span style={{
                      width: 48,
                      flexShrink: 0,
                      textAlign: "right",
                      paddingRight: 16,
                      color: T.txt3,
                      userSelect: "none",
                      fontSize: 11,
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ whiteSpace: "pre" }}>
                      {tokens.map((tok, j) => (
                        <span
                          key={j}
                          style={{
                            color: tok.color || T.txt,
                            fontWeight: tok.bold ? 700 : 400,
                          }}
                        >
                          {tok.text}
                        </span>
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: AI Panel (40%) ───────────────────────────────────── */}
      <div style={{
        width: "40%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: T.bg1,
      }}>
        {/* Header with model selector */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          height: 36,
          borderBottom: `1px solid ${T.border}`,
          background: T.bg1,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 3, height: 18, background: T.purple, borderRadius: 2 }} />
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              color: T.txt,
              fontFamily: T.fontUI,
              textTransform: "uppercase",
            }}>
              AI Assistant
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* Model dropdown */}
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <button
                onClick={() => setDropdownOpen(p => !p)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "0 8px",
                  height: 24,
                  border: `1px solid ${T.border2}`,
                  borderRadius: 4,
                  background: T.bg3,
                  color: T.txt2,
                  fontSize: 10,
                  fontFamily: T.fontUI,
                  cursor: "pointer",
                  outline: "none",
                  maxWidth: 160,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: selectedAgent ? (
                    { anthropic: T.purple, openai: T.green, google: T.blue, gemini: T.blue }[selectedAgent.provider] || T.cyan
                  ) : T.txt3,
                  flexShrink: 0,
                }} />
                <span style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {selectedAgent ? selectedAgent.model : "No model"}
                </span>
                <span style={{ fontSize: 8, marginLeft: 2 }}>{"\u25BC"}</span>
              </button>

              {/* Dropdown menu */}
              {dropdownOpen && (
                <div style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  right: 0,
                  minWidth: 200,
                  background: T.bg2,
                  border: `1px solid ${T.border2}`,
                  borderRadius: 6,
                  padding: 4,
                  zIndex: 100,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  animation: "fadeIn 0.1s ease-out",
                }}>
                  {agents.length === 0 ? (
                    <div style={{
                      padding: "12px 10px",
                      fontSize: 11,
                      color: T.txt3,
                      textAlign: "center",
                    }}>
                      No AI agents configured
                    </div>
                  ) : (
                    agents.map((agent, i) => (
                      <ModelOption
                        key={`${agent.provider}-${agent.model}-${i}`}
                        agent={agent}
                        selected={i === selectedAgentIdx}
                        onClick={() => {
                          setSelectedAgentIdx(i);
                          setDropdownOpen(false);
                        }}
                      />
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Clear button */}
            <Btn
              variant="subtle"
              onClick={handleClear}
              style={{ height: 24, fontSize: 10, padding: "0 8px" }}
              title="Clear chat history"
            >
              Clear
            </Btn>
          </div>
        </div>

        {/* Chat messages */}
        <div style={{
          flex: 1,
          overflow: "auto",
          padding: "4px 0",
        }}>
          {aiHistory.length === 0 && !sending ? (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 12,
              color: T.txt3,
              padding: 24,
              textAlign: "center",
            }}>
              <span style={{ fontSize: 28, opacity: 0.3 }}>{"\u2726"}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: T.txt2 }}>
                AI Assistant
              </span>
              <span style={{ fontSize: 11, lineHeight: "18px" }}>
                Ask questions about your code, request explanations, find bugs, or generate tests.
                {activeFile ? "" : " Open a file to get started with context-aware assistance."}
              </span>
              {activeFile && (
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 8,
                  justifyContent: "center",
                }}>
                  {ACTIONS.filter(a => a.key !== "chat").map(a => (
                    <Btn
                      key={a.key}
                      variant="ghost"
                      onClick={() => handleActionClick(a.key)}
                      style={{ fontSize: 10, height: 26 }}
                    >
                      {a.icon} {a.label}
                    </Btn>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {aiHistory.map((msg, i) => (
                <ChatMessage key={`${msg.ts || i}-${i}`} message={msg} />
              ))}
              {sending && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  animation: "fadeIn 0.2s ease-out",
                }}>
                  <div style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: T.purple,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#fff",
                    flexShrink: 0,
                  }}>
                    A
                  </div>
                  <Spinner size={14} color={T.purple} />
                  <span style={{ fontSize: 11, color: T.txt3, animation: "pulse 1.5s infinite" }}>
                    Thinking...
                  </span>
                </div>
              )}
              <div ref={chatEndRef} />
            </>
          )}
        </div>

        {/* Input area */}
        <div style={{
          flexShrink: 0,
          padding: "8px 12px 10px",
          borderTop: `1px solid ${T.border}`,
          background: T.bg2,
        }}>
          <form
            onSubmit={handleSubmit}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                activeFile
                  ? `Ask about ${fileName}... (⌘Enter to send)`
                  : "Ask anything... (⌘Enter to send)"
              }
              rows={1}
              disabled={sending}
              style={{
                flex: 1,
                background: T.bg3,
                border: `1px solid ${T.border2}`,
                borderRadius: 6,
                color: T.txt,
                fontSize: 12,
                fontFamily: T.fontUI,
                padding: "8px 10px",
                outline: "none",
                resize: "none",
                lineHeight: "18px",
                minHeight: 36,
                maxHeight: 160,
                overflow: "auto",
                opacity: sending ? 0.5 : 1,
              }}
            />
            <Btn
              variant="primary"
              onClick={handleSubmit}
              disabled={sending || !input.trim()}
              style={{ height: 36, padding: "0 16px", flexShrink: 0 }}
            >
              {sending ? (
                <Spinner size={12} color="#fff" />
              ) : (
                <span style={{ fontSize: 14 }}>{"\u2191"}</span>
              )}
              Send
            </Btn>
          </form>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 4,
          }}>
            <span style={{ fontSize: 9, color: T.txt3 }}>
              ⌘Enter to send · Shift+Enter for new line
            </span>
            {selectedAgent && (
              <span style={{ fontSize: 9, color: T.txt3 }}>
                {selectedAgent.provider} / {selectedAgent.model}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScreenAIAssistant;
