const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { PROJECT_ROOT } = require("./fixture-loader");

function loadScripts(scriptPaths, contextValues) {
  const context = vm.createContext({
    console,
    URL,
    setTimeout,
    clearTimeout,
    ...contextValues
  });

  context.globalThis = context;
  context.self = context;
  context.window = context.window || context;

  for (const scriptPath of scriptPaths) {
    const source = fs.readFileSync(path.join(PROJECT_ROOT, scriptPath), "utf8");
    vm.runInContext(source, context, { filename: scriptPath });
  }

  return context;
}

module.exports = {
  loadScripts
};
