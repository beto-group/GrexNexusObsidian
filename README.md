
<div align="center">
  <a name="readme-top"></a>
  <img src="https://raw.githubusercontent.com/beto-group/beto.assets/main/BETO.logo.animated.svg?raw=true" alt="LOGO" width="160">
  <h1 align="center">GREX NEXUS FOR OBSIDIAN</h1>
  <h3 align="center">Modular Micro-App Hypervisor, Component Host, & Vault Runtime Engine</h3>
</div>

<div align="center">
  <!-- TOP COMMUNITY LINKS -->
  <a href="https://beto.group"><img src="https://img.shields.io/badge/WEBSITE-7A46F1?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgY2xhc3M9Imx1Y2lkZSBsdWNpZGUtZXh0ZXJuYWwtbGluayI+PHBhdGggZD0iTTE4IDEzdjZhMiAyIDAgMCAxLTIgMkg1YTIgMiAwIDAgMS0yLTJWOGEyIDIgMCAwIDEgMi0yaGYiLz48cG9seWxpbmUgcG9pbnRzPSIxNSAzIDIxIDMgMjEgOSIvPjxsaW5lIHgxPSIxMCIgeDI9IjIxIiB5MT0iMTQiIHkyPSIzIi8+PC9zdmc+" alt="WEBSITE"></a>
  <a href="https://discord.com/invite/6rDp4q4Y2B"><img src="https://img.shields.io/badge/DISCORD-7A46F1?style=for-the-badge&logo=discord&logoColor=white" alt="JOIN OUR DISCORD"></a>
  <a href="https://github.com/sponsors/beto-group"><img src="https://img.shields.io/badge/Sponsor-7A46F1?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="SUPPORT US ON GITHUB"></a>
  <br/>
  <!-- HOST CYAN/EMERALD/PURPLE TAXONOMY BADGES -->
  <img src="https://img.shields.io/badge/TYPE-HOST_HYPERVISOR-000?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMzOEJERjgiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cmVjdCB4PSIyIiB5PSIyIiB3aWR0aD0iMjAiIGhlaWdodD0iOCIgcng9IjIiIHJ5PSIyIi8+PHJlY3QgeD0iMiIgeT0iMTQiIHdpZHRoPSIyMCIgaGVpZ2h0PSI4IiByeD0iMiIgeXk9IjIiLz48bGluZSB4MT0iNiIgeTE9IjYiIHgyPSI2IiB5Mj0iNiIvPjxsaW5lIHgxPSI2IiB5MT0iMTgiIHgyPSI2IiB5Mj0iMTgiLz48L3N2Zz4=" alt="TYPE">
  <img src="https://img.shields.io/badge/TARGET-OBSIDIAN_VAULT-000?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMzNEQzOTkiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48ZWxsaXBzZSBjeD0iMTIiIGN5PSI1IiByeD0iOSIgcnk9IjMiLz48cGF0aCBkPSJNIDMgNXYxNGE5IDMgMCAwIDAgMTggMHYtMTQiLz48cGF0aCBkPSJNIDMgMTJhOSAzIDAgMCAwIDE4IDAiLz48L3N2Zz4=" alt="TARGET">
  <img src="https://img.shields.io/badge/OS-WIN_MAC_LINUX_MOBILE-000?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNGNDcyQjYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMjAgMjF2LTIgYTIgMiAwIDAgMC0yLTJIMThhMiAyIDAgMCAwLTItMnYtMmEyIDIgMCAwIDAgMi0yaDFhMiAyIDAgMCAwIDItMlY2YTIgMiAwIDAgMC0yLTJINmEyIDIgMCAwIDAtMiAydjdhMiAyIDAgMCAwIDIgMmgyYTIgMiAwIDAgMCAyIDJ2MmEyIDIgMCAwIDAtMiAyaC0xYTIgMiAwIDAgMC0yIDJ2MmEyIDIgMCAwIDAgMiAyaDEyYTIgMiAwIDAgMCAyLTJ6Ii8+PC9zdmc+" alt="OS">
  <img src="https://img.shields.io/badge/RUNTIME-ELECTRON_ESM-000?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNBNzhCRkEiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cG9seWdvbiBwb2ludHM9IjEyIDIgMiA3IDEyIDEyIDIyIDcgMTIgMiIvPjxwYXRoIGQ9Ik0yIDE3TDEyIDIyIDIyIDE3Ii8+PHBhdGggZD0iTTIgMTJMMTIgMTcgMjIgMTIiLz48L3N2Zz4=" alt="RUNTIME">
  <hr>
</div>

<div align="center">
  <p>
    <i>A high-performance Obsidian component hypervisor that dynamically executes, sandboxes, and orchestrates modular micro-applications directly inside native workspace tabs.</i>
  </p>
  <hr style="width:30%;">
</div>

Welcome to **GREX Nexus for Obsidian**, a unified component hypervisor and micro-app launcher engine. It bridges compiled ESM bundles, interactive tools, and system daemons into native Obsidian tab views with automatic vault normalization, live permission controls, and zero external runtime friction.

---

## ✨ Features & Architecture

### 🛸 Dynamic Component Launcher
* 📑 **1-to-1 Vault Manifest Discovery**: Automatically indexes installed components (`grex.json` / `METADATA.md`) across your vault.
* ⚡ **Zero-Latency Tab Mounting**: Renders standalone compiled ESM/WASM bundles inside isolated DOM sandboxes.
* 🔍 **Fuzzy Command Selector**: Search, filter, and switch active workspace components directly via Command Palette (`⌘P`).

### 🌉 Native Host Bridge API (`window.grexPlatformAPI`)
* 🗄️ **Vault File System Bridge**: Safe, normalized file read/write operations using Obsidian's native `app.vault.adapter`.
* 🔒 **Permission Controls**: Granular per-component security policies for file system access, terminal execution, and local daemon hooks.
* 🛠️ **Daemon & CLI Integration**: Native REST bridge to local daemons (Port 7777) for external processing workflows.

### 🌐 Cross-Platform Parity
* 🪟 **Windows Native**: Full compatibility with Windows backslashes, drive letters, and WSL2 daemons.
* 🍎 **macOS & Linux**: Native POSIX path mapping and smooth hardware-accelerated rendering.
* 📱 **Mobile Ready (iOS & Android)**: Seamless execution across Obsidian mobile tablet and phone views (`isDesktopOnly: false`).

---

## 📦 Directory Index & Structure

| File | Description |
| :--- | :--- |
| **[manifest.json](manifest.json)** | Official Obsidian plugin manifest (`id: "grex-nexus"`, `v1.0.0`). |
| **[versions.json](versions.json)** | Release version mapping and minimum app compatibility index. |
| **[main.ts](main.ts)** | TypeScript hypervisor source code, vault indexer, and component view router. |
| **[main.js](main.js)** | Standalone compiled plugin bundle for production Obsidian execution. |
| **[styles.css](styles.css)** | Scoped native Obsidian styles for view containers, ribbon buttons, and modals. |
| **[esbuild.config.mjs](esbuild.config.mjs)** | Fast esbuild production bundler configuration. |
| **[package.json](package.json)** | NPM metadata, scripts (`build`, `dev`, `lint`), and repository specifications. |
| **[LICENSE](LICENSE)** | Standard open-source MIT License. |

---

## 💻 Installation & Setup

### Option 1: Obsidian BRAT (Recommended)
1. Install **Obsidian42 - BRAT** from Community Plugins.
2. Open BRAT settings ➔ click **Add Beta Plugin**.
3. Enter repository URL: `https://github.com/beto-group/GrexNexusObsidian`.
4. Click **Add Plugin** and enable **GREX Nexus** under **Settings ➔ Community Plugins**.

### Option 2: Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [GitHub Release](https://github.com/beto-group/GrexNexusObsidian/releases).
2. Create folder: `<your-vault>/.obsidian/plugins/grex-nexus/`.
3. Copy `main.js`, `manifest.json`, and `styles.css` into that directory.
4. Reload Obsidian and enable **GREX Nexus** in Settings.
