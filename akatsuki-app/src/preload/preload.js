const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("akatsuki", {
  platform: process.platform,

  config: {
    load: () => ipcRenderer.invoke("config:load"),
    save: (cfg) => ipcRenderer.invoke("config:save", cfg),
  },

  workdir: {
    select: () => ipcRenderer.invoke("workdir:select"),
    init: (dirPath) => ipcRenderer.invoke("workdir:init", dirPath),
    open: (dirPath) => ipcRenderer.invoke("workdir:open", dirPath),
    stats: (dirPath) => ipcRenderer.invoke("workdir:stats", dirPath),
    clear: (dirPath) => ipcRenderer.invoke("workdir:clear", dirPath),
  },

  memory: {
    saveReview: (payload) => ipcRenderer.invoke("memory:save-review", payload),
    updateOutcome: (reviewId, outcome) => ipcRenderer.invoke("memory:update-outcome", reviewId, outcome),
    queryContext: (payload) => ipcRenderer.invoke("memory:query-context", payload),
    buildContextBlock: (memCtx) => ipcRenderer.invoke("memory:build-context-block", memCtx),
    listReviews: (opts) => ipcRenderer.invoke("memory:list-reviews", opts),
    getReviewDetail: (id) => ipcRenderer.invoke("memory:get-review-detail", id),
    archiveReviews: (ids) => ipcRenderer.invoke("memory:archive-reviews", ids),
  },

  review: {
    saveFile: (payload) => ipcRenderer.invoke("review:save-file", payload),
    deleteFile: (payload) => ipcRenderer.invoke("review:delete-file", payload),
  },

  ai: {
    review: (payload) => ipcRenderer.invoke("ai:review", payload),
    chat: (payload) => ipcRenderer.invoke("ai:chat", payload),
  },

  git: {
    fetchPR: (payload) => ipcRenderer.invoke("git:fetch-pr", payload),
    fetchDiff: (payload) => ipcRenderer.invoke("git:fetch-diff", payload),
    postReview: (payload) => ipcRenderer.invoke("git:post-review", payload),
    testAuth: (payload) => ipcRenderer.invoke("git:test-auth", payload),
    bitbucketWorkspaces: (payload) => ipcRenderer.invoke("git:bitbucket-workspaces", payload),
  },

  shell: {
    openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),
  },

  kawaiidb: {
    testConnection: (opts) => ipcRenderer.invoke("kawaiidb:test-connection", opts),
    connect: (opts) => ipcRenderer.invoke("kawaiidb:connect", opts),
    disconnect: (opts) => ipcRenderer.invoke("kawaiidb:disconnect", opts),
    executeQuery: (opts) => ipcRenderer.invoke("kawaiidb:execute-query", opts),
    fetchSchema: (opts) => ipcRenderer.invoke("kawaiidb:fetch-schema", opts),
    fetchTableData: (opts) => ipcRenderer.invoke("kawaiidb:fetch-table-data", opts),
    getServerInfo: (opts) => ipcRenderer.invoke("kawaiidb:get-server-info", opts),
    getActiveQueries: (opts) => ipcRenderer.invoke("kawaiidb:get-active-queries", opts),
    getQueryStats: (opts) => ipcRenderer.invoke("kawaiidb:get-query-stats", opts),
    explainQuery: (opts) => ipcRenderer.invoke("kawaiidb:explain-query", opts),
  },

  shinra: {
    readDir: (dir) => ipcRenderer.invoke("shinra:read-dir", dir),
    readFile: (fp) => ipcRenderer.invoke("shinra:read-file", fp),
    writeFile: (fp, content) => ipcRenderer.invoke("shinra:write-file", fp, content),
    fileStat: (fp) => ipcRenderer.invoke("shinra:file-stat", fp),
    searchFiles: (opts) => ipcRenderer.invoke("shinra:search-files", opts),
    runCommand: (opts) => ipcRenderer.invoke("shinra:run-command", opts),
    selectFolder: () => ipcRenderer.invoke("shinra:select-folder"),
    shellCreate: (opts) => ipcRenderer.invoke("shinra:shell-create", opts),
    shellWrite: (data) => ipcRenderer.invoke("shinra:shell-write", data),
    shellDestroy: () => ipcRenderer.invoke("shinra:shell-destroy"),
    onShellStdout: (cb) => { ipcRenderer.on("shinra:shell-stdout", (_, d) => cb(d)); },
    onShellStderr: (cb) => { ipcRenderer.on("shinra:shell-stderr", (_, d) => cb(d)); },
    onShellExit: (cb) => { ipcRenderer.on("shinra:shell-exit", (_, c) => cb(c)); },
    removeShellListeners: () => {
      ipcRenderer.removeAllListeners("shinra:shell-stdout");
      ipcRenderer.removeAllListeners("shinra:shell-stderr");
      ipcRenderer.removeAllListeners("shinra:shell-exit");
    },
    watchStart: (opts) => ipcRenderer.invoke("shinra:watch-start", opts),
    watchStop: () => ipcRenderer.invoke("shinra:watch-stop"),
    onFsChanged: (cb) => { ipcRenderer.on("shinra:fs-changed-batch", (_, data) => cb(data)); },
    removeFsListeners: () => { ipcRenderer.removeAllListeners("shinra:fs-changed-batch"); },
  },
});
