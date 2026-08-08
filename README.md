
# 🛸 GREX Nexus for Obsidian

**GREX Nexus** is a modular component host and micro-application launcher for [Obsidian](https://obsidian.md). It enables users to dynamically load, render, and manage modular workspace components and interactive widgets directly within native Obsidian tabs.

---

## 🌟 Key Features

- **Modular Component Launcher**: Scan and launch workspace components (`grex.json` / `METADATA.md`) directly from your vault.
- **Cross-Platform Compatibility**: Full support for **Windows**, **macOS**, **Linux**, and **Mobile (iOS / Android)** Obsidian clients.
- **Host Bridge API (`window.grexPlatformAPI`)**: Provides secure access to the vault filesystem, active note workspace derivation, and local daemon hooks.
- **Settings & Provisioner**: Manage GitHub Personal Access Tokens, pull component updates from GitHub, and inspect active memory caches.
- **BRAT & Community Ready**: Single-click installation via BRAT or direct release installation.

---

## 📦 Installation

### Option 1: Via Obsidian BRAT (Recommended for Beta Releases)
1. Install the **BRAT** plugin from Obsidian Community Plugins.
2. Open BRAT settings -> **Add Beta Plugin**.
3. Enter repository URL: `https://github.com/beto-group/GrexNexusObsidian`.
4. Click **Add Plugin** and enable **GREX Nexus** in Community Plugins settings.

### Option 2: Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [GitHub Release](https://github.com/beto-group/GrexNexusObsidian/releases).
2. Create folder: `<your-vault>/.obsidian/plugins/grex-nexus/`.
3. Copy `main.js`, `manifest.json`, and `styles.css` into that folder.
4. Reload Obsidian and enable **GREX Nexus** in **Settings -> Community Plugins**.

---

## 🚀 Usage Guide

1. **Launch Component Selector**:
   - Click the **GREX Nexus** ribbon icon in the left sidebar, or press `⌘P` / `Ctrl+P` and select **GREX: Open Component Selector**.
2. **Select Component**:
   - Choose from installed components (e.g. `PDF Plus Engine`, `Ordo Tiling WM`, `Universal Media Player`, `Hermes Console Engine`).
3. **Manage Settings & Provisioner**:
   - Open **GREX: Open Dashboard & Settings** to configure GitHub Personal Access Tokens, provision new components from release URLs, or clear memory caches.

---

## 📄 Manifest & Build Specifications
- [manifest.json](manifest.json) - Obsidian plugin manifest.
- [versions.json](versions.json) - Version mapping compatibility index.
- [LICENSE](LICENSE) - MIT Open Source License.
