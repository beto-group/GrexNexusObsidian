const m = require('module');
const originalRequire = m.prototype.require;
m.prototype.require = function (path) {
  if (path === 'obsidian') {
    return {
      Plugin: class {
        constructor() { this.app = { workspace: { onLayoutReady: () => {}, on: () => {} } }; }
        loadData() { return Promise.resolve(null); }
        addSettingTab(tab) { console.log('Added tab'); }
        registerView() {}
        registerEvent() {}
        addCommand() {}
        addRibbonIcon() {}
        registerDomEvent() {}
        registerMarkdownPostProcessor() {}
      },
      PluginSettingTab: class {
        constructor(app, plugin) { this.app = app; this.plugin = plugin; }
      },
      Setting: class {}, Modal: class {}, FuzzySuggestModal: class {}, ItemView: class {}, Notice: class {}
    };
  }
  return originalRequire.apply(this, arguments);
};

global.activeDocument = {};

try {
  const PluginClass = require('./main.js').default;
  const plugin = new PluginClass();
  plugin.onload().then(() => {
    console.log("onload Success!");
  }).catch(e => {
    console.error("onload Crash:", e);
  });
} catch (e) {
  console.error("Top-level Crash:", e);
}
