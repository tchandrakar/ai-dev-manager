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

module.exports = {
  packagerConfig: {
    name: "Akatsuki",
    executableName: "Akatsuki",
    // Unpack .node binaries outside the asar so Electron can load them
    asar: { unpack: "**/*.node" },
    icon: "./icons/icon",
  },
  hooks: {
    /**
     * After the app directory is copied, inject native modules that Vite
     * cannot bundle, then rebuild them for the target Electron ABI.
     */
    packageAfterCopy: async (forgeConfig, buildPath, electronVersion, platform, arch) => {
      const srcNodeModules = path.join(__dirname, "node_modules");
      const destNodeModules = path.join(buildPath, "node_modules");

      // Modules that must ship with the app (native or required by native)
      const nativeDeps = ["better-sqlite3", "bindings", "file-uri-to-path"];

      for (const dep of nativeDeps) {
        const src = path.join(srcNodeModules, dep);
        const dest = path.join(destNodeModules, dep);
        if (fs.existsSync(src)) {
          copyDirSync(src, dest);
          console.log(`[forge] Copied native dep: ${dep}`);
        } else {
          console.warn(`[forge] WARNING: native dep not found: ${dep}`);
        }
      }

      console.log("[forge] Native deps copied. Binaries pre-built via electron-rebuild.");
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
