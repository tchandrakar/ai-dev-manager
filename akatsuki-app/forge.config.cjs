const { VitePlugin } = require("@electron-forge/plugin-vite");
const { AutoUnpackNativesPlugin } = require("@electron-forge/plugin-auto-unpack-natives");
const path = require("path");
const fs = require("fs");

/** Recursively copy a directory */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Collect a module and ALL of its production dependencies (recursively).
 * Returns a Set of module names to copy.
 */
function collectDepsRecursive(moduleName, srcNodeModules, visited = new Set()) {
  if (visited.has(moduleName)) return visited;
  // Handle scoped packages: check both top-level and nested
  const modPath = path.join(srcNodeModules, moduleName);
  if (!fs.existsSync(modPath)) return visited;
  visited.add(moduleName);
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(modPath, "package.json"), "utf8"));
    const deps = Object.keys(pkg.dependencies || {});
    for (const dep of deps) {
      collectDepsRecursive(dep, srcNodeModules, visited);
    }
  } catch (e) {
    // If no package.json, just copy the module itself
  }
  return visited;
}

module.exports = {
  packagerConfig: {
    name: "Akatsuki",
    executableName: "Akatsuki",
    // Unpack .node binaries outside the asar so Electron can load them
    asar: { unpack: "**/*.node" },
    icon: path.join(__dirname, "icons", "icon"),
  },
  hooks: {
    /**
     * After the app directory is copied, inject native modules that Vite
     * cannot bundle, then rebuild them for the target Electron ABI.
     */
    packageAfterCopy: async (forgeConfig, buildPath, electronVersion, platform, arch) => {
      const srcNodeModules = path.join(__dirname, "node_modules");
      const destNodeModules = path.join(buildPath, "node_modules");

      // Top-level modules that must ship with the app.
      // All their transitive dependencies are resolved automatically.
      const topLevelDeps = [
        "better-sqlite3",  // SQLite (native)
        "pg",              // PostgreSQL
        "mysql2",          // MySQL / MariaDB
        "mongodb",         // MongoDB
        "ioredis",         // Redis
        "mssql",           // SQL Server
        "ssh2",            // SSH tunneling
      ];

      // Collect all transitive dependencies
      const allDeps = new Set();
      for (const dep of topLevelDeps) {
        collectDepsRecursive(dep, srcNodeModules, allDeps);
      }
      // Also include these commonly needed helpers that may not be in the tree
      for (const extra of ["bindings", "file-uri-to-path", "node-addon-api", "prebuild-install"]) {
        if (fs.existsSync(path.join(srcNodeModules, extra))) allDeps.add(extra);
      }

      for (const dep of allDeps) {
        const src = path.join(srcNodeModules, dep);
        const dest = path.join(destNodeModules, dep);
        if (fs.existsSync(src)) {
          copyDirSync(src, dest);
          console.log(`[forge] Copied dep: ${dep}`);
        } else {
          console.warn(`[forge] WARNING: dep not found: ${dep}`);
        }
      }

      console.log(`[forge] ${allDeps.size} deps copied (including transitive). Binaries pre-built via electron-rebuild.`);
    },
  },
  makers: [
    { name: "@electron-forge/maker-zip", platforms: ["darwin"] },
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        { entry: "src/main/main.js", config: "vite.main.config.mjs" },
        { entry: "src/preload/preload.js", config: "vite.preload.config.mjs" },
      ],
      renderer: [
        { name: "main_window", config: "vite.renderer.config.mjs" },
      ],
    }),
  ],
};
