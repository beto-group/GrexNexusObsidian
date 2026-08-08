import { 
    Plugin, 
    ItemView, 
    WorkspaceLeaf, 
    Notice, 
    FuzzySuggestModal, 
    App, 
    TFolder,
    TFile,
    MarkdownPostProcessorContext,
    Modal,
    PluginSettingTab,
    Setting,
    ButtonComponent,
    requestUrl,
    setIcon
} from 'obsidian';
import * as preact from 'preact';
import AdmZip from 'adm-zip';

const VIEW_TYPE_GREX = "grex-component-view";
const VIEW_TYPE_GREX_DASHBOARD = "grex-dashboard-view";

interface GrexNexusSettings {
    githubToken: string;
    targetFolder: string;
    componentPermissions: Record<string, Record<string, boolean>>;
}

const DEFAULT_SETTINGS: GrexNexusSettings = {
    githubToken: '',
    targetFolder: 'GrexNexus/components/',
    componentPermissions: {}
}

interface GrexManifest {
    name: string;
    description?: string;
    entrypoint: string;
    icon?: string;
    dependencies?: {
        mac?: string[];
        windows?: string[];
        linux?: string[];
        npm?: string[];
        python?: string[];
        custom?: string[];
    };
}

class ProvisioningModal extends Modal {
    logContainer: HTMLElement;
    manifestCache: Map<string, ComponentData>;

    constructor(app: App, manifestCache: Map<string, ComponentData>) {
        super(app);
        this.manifestCache = manifestCache;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl("h2", { text: "Grex Provisioning Engine" });
        contentEl.createEl("p", { text: "Installing dependencies across all components...", attr: { style: "color: var(--text-muted); font-size: 13px;" } });

        this.logContainer = contentEl.createDiv({ 
            attr: { 
                style: "background: #0d1117; color: #e5e5e5; font-family: monospace; font-size: 12px; padding: 12px; height: 300px; overflow-y: auto; border-radius: 6px; margin-top: 10px; word-break: break-all;"
            } 
        });

        this.log("Gathering dependencies...");
        void this.runProvisioning();
    }

    log(msg: string, color: string = "#e5e5e5") {
        const line = this.logContainer.createDiv({ text: msg });
        line.style.color = color;
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }

    async runProvisioning() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cp = (window as any).require ? (window as any).require('child_process') : null;
        if (!cp) {
            this.log("Node.js child_process not available in this environment.", "#f85149");
            return;
        }

        const deps = { mac: new Set<string>(), windows: new Set<string>(), linux: new Set<string>(), npm: new Set<string>(), python: new Set<string>(), custom: new Set<string>() };
        
        this.manifestCache.forEach(comp => {
            if (comp.manifest.dependencies) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if ((comp.manifest.dependencies as any).brew) (comp.manifest.dependencies as any).brew.forEach((d: string) => deps.mac.add(d));
                if (comp.manifest.dependencies.mac) comp.manifest.dependencies.mac.forEach(d => deps.mac.add(d));
                if (comp.manifest.dependencies.windows) comp.manifest.dependencies.windows.forEach(d => deps.windows.add(d));
                if (comp.manifest.dependencies.linux) comp.manifest.dependencies.linux.forEach(d => deps.linux.add(d));
                if (comp.manifest.dependencies.npm) comp.manifest.dependencies.npm.forEach(d => deps.npm.add(d));
                if (comp.manifest.dependencies.python) comp.manifest.dependencies.python.forEach(d => deps.python.add(d));
                if (comp.manifest.dependencies.custom) comp.manifest.dependencies.custom.forEach(d => deps.custom.add(d));
            }
        });

        const execCommand = (cmd: string): Promise<number> => {
            return new Promise((resolve) => {
                this.log(`> ${cmd}`, "#3b82f6");
                 
                const child = (cp).spawn(cmd, { shell: true, env: { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ''}` } });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                child.stdout.on('data', (data: any) => this.log(data.toString()));
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                child.stderr.on('data', (data: any) => this.log(data.toString(), "#e3b341"));
                 
                child.on('close', (code: number) => {
                    if (code !== 0) this.log(`Command returned code ${code}`, "#e3b341");
                    else this.log(`Command successful`, "#56d364");
                    resolve(code);
                });
            });
        };

        // 1. Core Tooling Provisioning (grex-cli & podman)
        this.log("=== Checking Core Workstation Tools (grex-cli, podman) ===", "#3b82f6");
        const hasGrexCli = await execCommand("which grex-cli") === 0;
        if (!hasGrexCli) {
            this.log("grex-cli not detected. Auto-provisioning @beto-group/grex-cli...", "#e3b341");
            await execCommand("npm install -g @beto-group/grex-cli");
        } else {
            this.log("[✅ INSTALLED] grex-cli detected", "#56d364");
        }

        const hasPodman = await execCommand("which podman") === 0;
        if (!hasPodman) {
            this.log("podman not detected. Auto-provisioning podman via Homebrew...", "#e3b341");
            if (process.platform === "darwin") await execCommand("brew install podman");
            else if (process.platform === "linux") await execCommand("sudo apt-get install -y podman");
        } else {
            this.log("[✅ INSTALLED] podman detected", "#56d364");
        }

        // 2. Component Dependencies Provisioning
        this.log("=== Provisioning Component Dependencies ===", "#3b82f6");
        const platform = process.platform;
        let platformDeps = new Set<string>();
        let installCmd = "";

        if (platform === "darwin") {
            platformDeps = deps.mac;
            installCmd = "brew install";
        } else if (platform === "win32") {
            platformDeps = deps.windows;
            installCmd = "winget install -e --id";
        } else if (platform === "linux") {
            platformDeps = deps.linux;
            installCmd = "sudo apt-get install -y";
        }

        if (platformDeps.size > 0) {
            for (const pkg of Array.from(platformDeps)) {
                if (pkg && pkg.trim()) {
                    await execCommand(`${installCmd} ${pkg.trim()}`);
                }
            }
        }

        if (deps.custom.size > 0) {
            for (const cmd of Array.from(deps.custom)) {
                await execCommand(cmd);
            }
        }

        this.log("--- PROVISIONING COMPLETE ---", "#56d364");
    }

    async runUnprovisioning() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cp = (window as any).require ? (window as any).require('child_process') : null;
        if (!cp) {
            this.log("Node.js child_process not available in this environment.", "#f85149");
            return;
        }

        const execCommand = (cmd: string): Promise<number> => {
            return new Promise((resolve) => {
                this.log(`> ${cmd}`, "#f85149");
                 
                const child = (cp).spawn(cmd, { shell: true, env: { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ''}` } });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                child.stdout.on('data', (data: any) => this.log(data.toString()));
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                child.stderr.on('data', (data: any) => this.log(data.toString(), "#e3b341"));
                 
                child.on('close', (code: number) => {
                    resolve(code);
                });
            });
        };

        this.log("=== UNPROVISIONING ENGINE DEPENDENCIES ===", "#f85149");
        await execCommand("npm uninstall -g @beto-group/grex-cli");
        this.log("--- UNPROVISIONING COMPLETE ---", "#56d364");
    }

    onClose() {
        this.contentEl.empty();
    }
}

interface ComponentData {
    folder: TFolder;
    manifest: GrexManifest;
}

class ComponentSelectorModal extends FuzzySuggestModal<ComponentData> {
    components: ComponentData[];
    onChoose: (comp: ComponentData) => void;

    constructor(app: App, components: ComponentData[], onChoose: (comp: ComponentData) => void) {
        super(app);
        this.components = components;
        this.onChoose = onChoose;
    }

    getItems(): ComponentData[] {
        return this.components;
    }

    getItemText(comp: ComponentData): string {
        return comp.manifest.name;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderSuggestion(match: any, el: HTMLElement) {
        el.empty();
        const comp = match.item as ComponentData;
        
        const container = el.createDiv({ attr: { style: 'display: flex; flex-direction: column; gap: 4px;' } });
        
        const titleEl = container.createDiv({ attr: { style: 'font-weight: 500;' } });
        super.renderSuggestion(match, titleEl);
        
        container.createDiv({ 
            text: comp.folder.path, 
            attr: { style: 'font-size: 11px; color: var(--text-muted); font-family: var(--font-monospace); opacity: 0.7;' } 
        });
    }

    onChooseItem(comp: ComponentData, evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(comp);
    }
}

async function loadComponentBundle(container: HTMLElement, componentData: ComponentData, app: App, plugin: GrexNexusPlugin): Promise<() => void> {
    const entrypointPath = `${componentData.folder.path}/${componentData.manifest.entrypoint}`;
    const bundleFile = app.vault.getAbstractFileByPath(entrypointPath);

    if (!bundleFile || !(bundleFile instanceof TFile)) {
        throw new Error(`Entrypoint not found: ${entrypointPath}`);
    }

    const bundleUrl = `${app.vault.getResourcePath(bundleFile)}?t=${Date.now()}`;

    // 1. Inject Datacore Context (Backwards Compatibility)
    (window as unknown).dc = {
        app: app,
        require: () => {}, // mock
        useCurrentPath: () => componentData.folder.path,
        resolvePath: () => componentData.folder.path,
        preact: preact // Legacy preact compat
    };

    const checkPermission = (type: string) => {
        const id = componentData.manifest.name;
        const perms = plugin.settings.componentPermissions?.[id];
        console.log(`[Protocol Aegis] Checking permission '${type}' for component '${id}'. Perms:`, perms);
        console.log(`[Protocol Aegis] Full settings.componentPermissions:`, plugin.settings.componentPermissions);
        if (!perms || perms[type] !== true) {
            new Notice(`[Protocol Aegis] Access Denied: ${id} attempted to access ${type}. Permission must be granted in Settings.`);
            throw new Error(`Permission Denied: ${type} is locked for ${id}.`);
        }
    };

    // Track background processes spawned by this specific component instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backgroundProcesses = new Map<string, any>();
    
    // 2. Define the Sovereign Platform API
    const platformAPI = {
        env: { type: 'obsidian' },
        cli: {
            exec: async (cmd: string) => { checkPermission('cli'); return await plugin.execCommand(cmd); },
            spawnBackground: async (cmd: string, name: string) => { checkPermission('cli'); return await plugin.spawnBackgroundProcess(cmd, name); }
        },
        hermes: {
            ensureServer: async (port: number = 7777) => {
                checkPermission('cli');
                const check = await plugin.execCommand(`lsof -i :${port} -t 2>/dev/null || echo "offline"`);
                if (check.stdout && check.stdout.includes('offline')) {
                    const basePath = (app.vault.adapter as unknown).getBasePath ? (app.vault.adapter as unknown).getBasePath() : process.cwd();
                    const serverPath = `${basePath}/GREX.datacore/components/HermesOrchestratorEngine/backend/sidecar/hermes_server.py`;
                    const cmd = `export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"; python3 "${serverPath}"`;
                    console.log("[Protocol Sovereign] Spawning sidecar server:", cmd);
                    await plugin.spawnBackgroundProcess(cmd, 'hermes-sidecar-daemon');
                }
                return true;
            }
        },
        workspace: {
            popoutLeaf: () => {
                const targetLeaf = app.workspace.getLeavesOfType(VIEW_TYPE_GREX).find(l => {
                    return l.view instanceof GrexComponentView && l.view.componentData?.manifest.name === componentData.manifest.name;
                }) || app.workspace.getActiveViewOfType(GrexComponentView)?.leaf;
                if (targetLeaf) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (app.workspace as any).moveLeafToPopout(targetLeaf);
                    new Notice(`Detached ${componentData.manifest.name} into native pop-out panel!`);
                }
            }
        },
        fs: {
            read: async (path: string) => { checkPermission('fs'); return await app.vault.adapter.read(path); },
            write: async (path: string, data: string) => { checkPermission('fs'); return await app.vault.adapter.write(path, data); },
            exists: async (path: string) => { checkPermission('fs'); return await app.vault.adapter.exists(path); },
            list: async (path: string) => { checkPermission('fs'); return (await app.vault.adapter.list(path)).files; },
            mkdir: async (path: string) => {
                checkPermission('fs');
                if (!(await app.vault.adapter.exists(path))) {
                    await app.vault.adapter.mkdir(path);
                }
            },
            delete: async (path: string) => {
                checkPermission('fs');
                if (await app.vault.adapter.exists(path)) {
                    await app.vault.adapter.remove(path);
                }
            },
            rename: async (oldPath: string, newPath: string) => {
                checkPermission('fs');
                if (await app.vault.adapter.exists(oldPath)) {
                    await app.vault.adapter.rename(oldPath, newPath);
                }
            },
            getResourceUrl: (path: string) => {
                checkPermission('fs');
                const file = app.vault.getAbstractFileByPath(path);
                return file ? app.vault.getResourcePath(file) : null;
            },
            readDirRecursive: async (basePath: string) => {
                checkPermission('fs');
                const results: { path: string; content: string }[] = [];
                
                const traverse = async (currentPath: string) => {
                    const list = await app.vault.adapter.list(currentPath);
                    for (const file of list.files) {
                        const content = await app.vault.adapter.read(file);
                        results.push({ path: file, content });
                    }
                    for (const folder of list.folders) {
                        await traverse(folder);
                    }
                };
                
                if (await app.vault.adapter.exists(basePath)) {
                    const stat = await app.vault.adapter.stat(basePath);
                    if (stat && stat.type === 'folder') {
                        await traverse(basePath);
                    } else if (stat && stat.type === 'file') {
                        const content = await app.vault.adapter.read(basePath);
                        results.push({ path: basePath, content });
                    }
                }
                
                return results;
            }
        },
        os: {
            write: async (filePath: string, data: string) => {
                checkPermission('fs');
                await app.vault.adapter.write(filePath, data);
            },
            rename: async (oldPath: string, newPath: string) => {
                checkPermission('fs');
                await app.vault.adapter.rename(oldPath, newPath);
            }
        },
        keychain: {
            list: async () => {
                checkPermission('keychain');

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const storage = (app as any).secretStorage;
                 
                if (storage && typeof storage.listSecrets === 'function') {
                     
                    return await storage.listSecrets();
                 
                } else if (storage && storage.secrets) {
                     
                    return Object.keys(storage.secrets);
                }
                const keys = [];
                 
                for (let i = 0; i < localStorage.length; i++) {
                     
                    const key = localStorage.key(i);
                    if (key && key.startsWith("sovereign_")) keys.push(key.replace("sovereign_", ""));
                }
                return keys;
            },
            get: async (key: string) => {
                checkPermission('keychain');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const storage = (app as any).secretStorage;
                 
                if (storage && typeof storage.getSecret === 'function') {
                     
                    return await storage.getSecret(key);
                }
                 
                return localStorage.getItem("sovereign_" + key);
            },
            set: async (key: string, val: string) => {
                checkPermission('keychain');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const storage = (app as any).secretStorage;
                 
                if (storage && typeof storage.setSecret === 'function') {
                     
                    await storage.setSecret(key, val);
                } else {
                     
                    localStorage.setItem("sovereign_" + key, val);
                }
            },
            delete: async (key: string) => {
                checkPermission('keychain');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const storage = (app as any).secretStorage;
                 
                if (storage && typeof storage.deleteSecret === 'function') {
                     
                    await storage.deleteSecret(key);
                } else {
                     
                    localStorage.removeItem("sovereign_" + key);
                }
            }
        },
        ui: {
            toast: (msg: string, type: string = 'info') => new Notice(msg)
        },
        cli: {
            exec: async (command: string) => {
                checkPermission('cli');
                return new Promise((resolve) => {
                     
                    const { exec } = require('child_process');
                    const shell = process.env.SHELL || '/bin/zsh';
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const basePath = (app.vault.adapter as any).getBasePath ? (app.vault.adapter as any).getBasePath() : process.cwd();
                    const env = Object.assign({}, process.env);
                    env.GREX_VAULT_PATH = basePath;
                    
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    exec(command, { shell, env, cwd: basePath }, (error: any, stdout: any, stderr: any) => {
                        resolve({
                             
                            stdout: stdout ? stdout.toString() : '',
                             
                            stderr: stderr ? stderr.toString() : '',
                             
                            code: error ? error.code || 1 : 0
                        });
                    });
                });
            },
            spawnBackground: async (command: string, id: string) => {
                checkPermission('cli');
                return new Promise((resolve, reject) => {
                    if (backgroundProcesses.has(id)) {
                        return reject(new Error(`Process with id ${id} already exists`));
                    }
                     
                    const { spawn } = require('child_process');
                    const shell = process.env.SHELL || '/bin/zsh';
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const basePath = (app.vault.adapter as any).getBasePath ? (app.vault.adapter as any).getBasePath() : process.cwd();
                    const env = Object.assign({}, process.env);
                    env.GREX_VAULT_PATH = basePath;
                    
                     
                    const child = spawn(command, { shell, env, cwd: basePath, detached: false });
                    backgroundProcesses.set(id, child);
                    
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    child.on('error', (err: any) => console.error(`[Protocol Aegis] Background process ${id} error:`, err));
                     
                    child.on('exit', () => backgroundProcesses.delete(id));
                    
                    resolve(true);
                });
            },
            killBackground: async (id: string) => {
                checkPermission('cli');
                const child = backgroundProcesses.get(id);
                if (child) {
                    try {
                         
                        child.kill('SIGKILL');
                    } catch (e) {
                        console.error(`Failed to kill process ${id}:`, e);
                    }
                    backgroundProcesses.delete(id);
                }
            }
        },
        mcp: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            call: async (serverName: string, toolName: string, args: any) => {
                checkPermission('mcp');
                const argsStr = typeof args === 'string' ? args : JSON.stringify(args);
                const cmd = `grex mcp call ${serverName} ${toolName} '${argsStr.replace(/'/g, "'\\''")}'`;
                return await platformAPI.cli.exec(cmd);
            }
        },
        podman: {
            version: async () => {
                checkPermission('cli');
                return await platformAPI.cli.exec('podman --version');
            },
            ps: async () => {
                checkPermission('cli');
                return await platformAPI.cli.exec('podman ps -a --format json');
            },
            spawnWorker: async (cmdStr: string = '') => {
                checkPermission('cli');
                const scriptPath = '/Volumes/BackUp_WB-1TB/APPLICATIONS/BETO_BACKEND/app-repos/production-contabo/DATACORE/_RESOURCES/SKILL/scripts/host-ops/rebuild-hermes-agent-env.sh';
                return await platformAPI.cli.exec(`bash "${scriptPath}"`);
            }
        },
        daemon: {
            status: async () => {
                checkPermission('cli');
                return await platformAPI.cli.exec('grex status 2>/dev/null || echo "standalone"');
            },
            sidecarRunning: async (port: number = 3892) => {
                checkPermission('cli');
                return await platformAPI.cli.exec(`lsof -i :${port} -t 2>/dev/null || echo "offline"`);
            },
            ensureSidecar: async (port: number = 3892) => {
                checkPermission('cli');
                const check = await platformAPI.cli.exec(`lsof -i :${port} -t 2>/dev/null || echo "offline"`);
                if (check.stdout && check.stdout.includes('offline')) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const basePath = (app.vault.adapter as any).getBasePath ? (app.vault.adapter as any).getBasePath() : process.cwd();
                    const serverPath = `${basePath}/GREX.datacore/components/HyperViewerEngine/backend/sidecar/server.py`;
                    await platformAPI.cli.spawnBackground(`python3 "${serverPath}"`, 'hyperviewer-sidecar-daemon');
                }
                return true;
            }
        },
        hermes: {
            ensureServer: async (port: number = 7777) => {
                checkPermission('cli');
                const check = await platformAPI.cli.exec(`lsof -i :${port} -t 2>/dev/null || echo "offline"`);
                if (check.stdout && check.stdout.includes('offline')) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const basePath = (app.vault.adapter as any).getBasePath ? (app.vault.adapter as any).getBasePath() : process.cwd();
                    const serverPath = `${basePath}/GREX.datacore/components/HermesOrchestratorEngine/backend/sidecar/hermes_server.py`;
                    const cmd = `export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"; python3 "${serverPath}"`;
                    await platformAPI.cli.spawnBackground(cmd, 'hermes-sidecar-daemon');
                }
                return true;
            }
        }
    };

    // 3. Dynamically import the bundle
    // eslint-disable-next-line no-unsanitized/method, @typescript-eslint/no-explicit-any
    const module = (await import(bundleUrl)) as Record<string, any>;

    // 4. Mount the App
    let cleanupFn = null;
    container.empty(); // Clear the loading element so Preact doesn't hydrate and reuse it!
    const options = {
        folderPath: componentData.folder.path
    };
    if (typeof module.mount_app === 'function') {
         
        cleanupFn = await module.mount_app(container, platformAPI, options);
    } else if (
         
        module.default && typeof module.default.mount_app === 'function'
    ) {
         
        cleanupFn = await module.default.mount_app(container, platformAPI, options);
    } else {
        throw new Error("Bundle does not export a mount_app function.");
    }
    
     
    return () => {
        if (cleanupFn) {
            try {
                if (typeof cleanupFn === 'function') {
                     
                    cleanupFn();
                } else if (typeof (cleanupFn).unmount === 'function') {
                     
                    (cleanupFn).unmount();
                } else if (typeof (cleanupFn).destroy === 'function') {
                     
                    (cleanupFn).destroy();
                }
            } catch (e) {
                console.error("Component cleanup failed:", e);
            }
        }
        // Force kill any rogue background processes spawned by this instance
        backgroundProcesses.forEach((child, id) => {
            console.log(`[Protocol Aegis] Force killing orphaned background process: ${id}`);
            try {
                 
                child.kill('SIGKILL');
            } catch (e) {
                console.error(`Failed to kill orphaned process ${id}:`, e);
            }
        });
        backgroundProcesses.clear();
    };
}

class GrexComponentView extends ItemView {
    componentData: ComponentData | null = null;
    cleanupFn: (() => void) | null = null;
    plugin: GrexNexusPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: GrexNexusPlugin) {
        super(leaf);
        this.plugin = plugin;
        
        // Add a Pop-out Detached Window button to the view header
        this.addAction('external-link', 'Open Detached Window', () => {
            if (this.leaf) {
                // Move workspace leaf into a detached native Electron pop-out window
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (this.app.workspace as any).moveLeafToPopout(this.leaf);
                new Notice(`Detached ${this.componentData?.manifest.name || 'Component'} into native pop-out window!`);
            }
        });

        // Add a debug button to the view header
        this.addAction('bug', 'Debug component', () => {
            console.log("=== GREX COMPONENT DEBUG INFO ===");
            console.log("Component Data:", this.componentData);
            console.log("Container Element:", this.contentEl);
            console.log("Cleanup Function:", this.cleanupFn);
            new Notice(`Debug info printed to console for ${this.componentData?.manifest.name || 'unknown component'}`);
        });
    }

    getViewType(): string {
        return VIEW_TYPE_GREX;
    }

    getDisplayText() {
        return this.componentData ? this.componentData.manifest.name : "Grex Component";
    }

    getIcon() {
        return this.componentData?.manifest.icon || "box";
    }

    setComponentData(data: ComponentData) {
        this.componentData = data;
    }

    getState(): unknown {
        if (!this.componentData) return {};
        return {
            folderPath: this.componentData.folder.path,
            manifest: this.componentData.manifest,
            linkedMarkdownFile: this.linkedMarkdownFile?.path
        };
    }

    async setState(state: unknown, result: unknown): Promise<void> {
        if (state && state.folderPath && state.manifest) {
            const folder = this.app.vault.getAbstractFileByPath(state.folderPath);
            if (folder) { 
                // Always prioritize fresh data from manifestCache over stale saved workspace state
                const freshComponentData = this.plugin.manifestCache.get(state.folderPath);
                
                this.componentData = {
                    folder: folder as unknown,
                    manifest: freshComponentData ? freshComponentData.manifest : state.manifest
                };
            }
        }
        if (state && state.linkedMarkdownFile) {
            const file = this.app.vault.getAbstractFileByPath(state.linkedMarkdownFile);
            if (file) {
                this.linkedMarkdownFile = file as unknown;
            }
        }
        await super.setState(state, result);
        
        // Re-render if state was restored after onOpen was already called, 
        // but avoid concurrent loads if it's already loading
        if (this.contentEl && this.componentData && !this.isLoaded) {
            await this.onOpen();
        }
    }

    private loadId = 0;
    private isLoaded = false;
    private fileWatchRef: unknown = null;

    async onOpen() {
        const currentLoadId = ++this.loadId;
        const container = this.contentEl;

        if (!this.componentData) {
            this.isLoaded = false;
            container.empty();
            container.createEl("h4", { text: "No component selected." });
            return;
        }

        this.isLoaded = true;

        if (!this.fileWatchRef) {
            this.fileWatchRef = this.app.vault.on('modify', (file) => {
                if (this.componentData && file.path === `${this.componentData.folder.path}/${this.componentData.manifest.entrypoint}`) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    if ((this as any)._reloadTimeout) window.clearTimeout((this as any)._reloadTimeout);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (this as any)._reloadTimeout = window.setTimeout(() => {
                        new Notice(`Hot reloading ${this.componentData!.manifest.name}...`);
                        void this.onOpen();
                    }, 150);
                }
            });
            this.registerEvent(this.fileWatchRef);
        }

        // IMPORTANT: Clean up any existing Preact/React roots before emptying the container!
        // Otherwise, Preact's internal `_children` pointer will point to detached DOM nodes,
        // resulting in a completely blank screen on subsequent renders.
        if (this.cleanupFn) {
            try {
                if (typeof this.cleanupFn === 'function') {
                    this.cleanupFn();
                } else if (typeof (this.cleanupFn as unknown).unmount === 'function') {
                     
                    (this.cleanupFn as unknown).unmount();
                }
            } catch (e) {
                console.error("Error during previous component cleanup:", e);
            }
            this.cleanupFn = null;
        }

        container.empty();

        // Force Obsidian to update the tab title and icon
        if (this.leaf) {
            // @ts-ignore
            if (this.leaf.updateHeader) this.leaf.updateHeader();
        }
        
        // Manually update the center title since updateHeader sometimes misses it
        const headerTitle = container.parentElement?.querySelector('.view-header-title');
        if (headerTitle) {
            headerTitle.textContent = this.componentData?.manifest.name || "Grex Component";
        }

        container.setCssStyles({
            padding: "0",
            overflow: "hidden",
            position: "relative",
            display: "flex",
            flexDirection: "column",
            height: "100%",
            width: "100%"
        });

        const loadingEl = container.createEl("div", { 
            text: `Loading ${this.componentData.manifest.name}...`, 
            attr: { style: "padding: 20px; color: var(--text-muted);" } 
        });

        try {
            const cleanup = await loadComponentBundle(container, this.componentData, this.app, this.plugin);
            // If another load started while we were waiting, abort and let the newer one take over
            if (this.loadId !== currentLoadId) {
                cleanup();
                return;
            }
            this.cleanupFn = cleanup;
        } catch (err: unknown) {
            if (this.loadId !== currentLoadId) return;
            console.error("Grex Component Load Error:", err);
            container.empty(); // Make sure container is empty before showing error
            const errorEl = container.createEl("div", {
                text: `Error: ${String(err)}`,
                attr: { style: "padding: 20px; color: var(--text-error);" }
            });
        }
    }

    async onClose() {
        if (this.cleanupFn) {
            try {
                if (typeof this.cleanupFn === 'function') {
                    this.cleanupFn();
                } else if (typeof (this.cleanupFn as unknown).unmount === 'function') {
                     
                    (this.cleanupFn as unknown).unmount();
                }
            } catch (e) {
                console.error("Error during component cleanup:", e);
            }
        }
        this.contentEl.empty();
    }
}

class GrexDashboardView extends ItemView {
    plugin: GrexNexusPlugin;
    podmanStatusContainer: HTMLElement;
    pollInterval: number | null = null;
    isInstalling: boolean = false;

    constructor(leaf: WorkspaceLeaf, plugin: GrexNexusPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_GREX_DASHBOARD;
    }

    getDisplayText(): string {
        return "Grex Nexus Control Center";
    }

    getIcon(): string {
        return "box";
    }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();

        const headerContainer = container.createDiv({ attr: { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid var(--background-modifier-border);' } });
        
        headerContainer.createEl('h2', { text: 'Grex Nexus Control Center', attr: { style: 'margin: 0;' } });

        const actionsDiv = headerContainer.createDiv({ attr: { style: 'display: flex; gap: 8px;' } });
        
        const launchBtn = actionsDiv.createEl('button', { text: 'Launch', attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent); cursor: pointer; padding: 4px 14px; font-size: 12px; font-weight: 600;' } });
        launchBtn.onclick = () => {
            void this.plugin.openComponentSelector();
        };

        const settingsBtn = actionsDiv.createEl('button', { text: 'Settings', attr: { style: 'cursor: pointer; padding: 4px 14px; font-size: 12px; font-weight: 600;' } });
        settingsBtn.onclick = () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this.app as any).setting.open();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this.app as any).setting.openTabById(this.plugin.manifest.id);
        };

        const dashboardGrid = container.createDiv({ attr: { style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px;' } });

        const telemetryCard = dashboardGrid.createDiv({ attr: { style: 'background: rgba(255, 255, 255, 0.02); border: 1px solid var(--background-modifier-border); border-radius: 12px; padding: 16px; display: flex; flex-direction: column;' } });
        const telemetryHeader = telemetryCard.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 8px; margin-bottom: 12px;' } });
        const telemetryIconBox = telemetryHeader.createDiv({ attr: { style: 'color: var(--interactive-accent); display: flex;' } });
        try { setIcon(telemetryIconBox, 'activity'); } catch(e) {}
        telemetryHeader.createEl('h3', { text: 'Engine Telemetry', attr: { style: 'margin: 0; font-size: 15px;' } });
        
        this.podmanStatusContainer = telemetryCard.createDiv({ 
            attr: { style: 'background: var(--background-modifier-form-field); border: 1px solid rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; font-family: var(--font-monospace); font-size: 11px; white-space: pre-wrap; overflow-x: auto; flex-grow: 1;' } 
        });
        
        this.podmanStatusContainer.setText("Polling engine status...");

        const networkCard = dashboardGrid.createDiv({ attr: { style: 'background: rgba(255, 255, 255, 0.02); border: 1px solid var(--background-modifier-border); border-radius: 12px; padding: 16px; display: flex; flex-direction: column;' } });
        const networkHeader = networkCard.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 8px; margin-bottom: 12px;' } });
        const networkTitleContainer = networkHeader.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 8px; flex-grow: 1;' } });
        const networkIconBox = networkTitleContainer.createDiv({ attr: { style: 'color: var(--text-muted); display: flex;' } });
        try { setIcon(networkIconBox, 'network'); } catch(e) {}
        networkTitleContainer.createEl('h3', { text: 'Orchestration Network', attr: { style: 'margin: 0; font-size: 15px;' } });
        
        const restartBridgeBtn = networkHeader.createEl('button', { attr: { title: 'Restart Bridge Daemon', style: 'background: transparent; color: var(--text-muted); border: 1px solid var(--background-modifier-border); padding: 4px 8px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;' } });
        try { setIcon(restartBridgeBtn, 'refresh-cw'); } catch(e) {}
        restartBridgeBtn.onclick = () => {
            try { setIcon(restartBridgeBtn, 'loader'); } catch(e) {}
            const { spawn } = require('child_process');
            const shell = process.env.SHELL || '/bin/zsh';
            const env = Object.assign({}, process.env);
            const cmd = spawn(shell, ['-l', '-c', 'grex shutdown && sleep 1 && grex start'], { env });
            cmd.on('close', () => {
                try { setIcon(restartBridgeBtn, 'refresh-cw'); } catch(e) {}
                this.networkStatusContainer.empty();
                this.networkStatusContainer.createDiv({ text: 'Bridge restarted gracefully.', attr: { style: 'color: #56d364;' } });
                this.initYjsNetwork();
            });
        };
        
        this.networkStatusContainer = networkCard.createDiv({ text: 'Awaiting container mesh configuration...', attr: { style: 'color: var(--text-muted); font-size: 12px; font-style: italic; display: flex; align-items: center; justify-content: center; flex-grow: 1; border: 1px dashed var(--background-modifier-border); border-radius: 8px; padding: 20px; text-align: center;' } });

        const volumeCard = dashboardGrid.createDiv({ attr: { style: 'background: rgba(255, 255, 255, 0.02); border: 1px solid var(--background-modifier-border); border-radius: 12px; padding: 16px; display: flex; flex-direction: column;' } });
        const volumeHeader = volumeCard.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 8px; margin-bottom: 12px;' } });
        const volumeIconBox = volumeHeader.createDiv({ attr: { style: 'color: var(--text-muted); display: flex;' } });
        try { setIcon(volumeIconBox, 'database'); } catch(e) {}
        volumeHeader.createEl('h3', { text: 'Persistent Volumes', attr: { style: 'margin: 0; font-size: 15px;' } });
        volumeCard.createDiv({ text: 'No active volumes detected.', attr: { style: 'color: var(--text-muted); font-size: 12px; font-style: italic; display: flex; align-items: center; justify-content: center; flex-grow: 1; border: 1px dashed var(--background-modifier-border); border-radius: 8px; padding: 20px; text-align: center;' } });

        // ACTIVE COMPONENTS CARD
        const activeCard = dashboardGrid.createDiv({ attr: { style: 'background: rgba(255, 255, 255, 0.02); border: 1px solid var(--background-modifier-border); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; grid-column: 1 / -1;' } });
        const activeHeader = activeCard.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 8px; margin-bottom: 12px;' } });
        const activeIconBox = activeHeader.createDiv({ attr: { style: 'color: var(--interactive-accent); display: flex;' } });
        try { setIcon(activeIconBox, 'cpu'); } catch(e) {}
        activeHeader.createEl('h3', { text: 'Active Spatial Components', attr: { style: 'margin: 0; font-size: 15px;' } });
        
        const activeContainer = activeCard.createDiv({ attr: { style: 'display: flex; flex-direction: column; gap: 8px; flex-grow: 1;' } });
        
        const renderActiveComponents = () => {
            activeContainer.empty();
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GREX);
            if (leaves.length === 0) {
                activeContainer.createDiv({ text: 'No components currently running in the spatial architecture.', attr: { style: 'color: var(--text-muted); font-size: 12px; font-style: italic; display: flex; align-items: center; justify-content: center; flex-grow: 1; border: 1px dashed var(--background-modifier-border); border-radius: 8px; padding: 20px; text-align: center;' } });
            } else {
                leaves.forEach(leaf => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const view = leaf.view as any;
                    const compDiv = activeContainer.createDiv({ attr: { style: 'display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid var(--background-modifier-border); border-radius: 8px; background: rgba(0,0,0,0.2);' } });
                    
                    const infoDiv = compDiv.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 12px;' } });
                    const compIconBox = infoDiv.createDiv({ attr: { style: 'color: var(--text-muted); display: flex;' } });
                     
                    try { setIcon(compIconBox, view.getIcon() || 'box'); } catch(e) {}
                    
                     
                    infoDiv.createDiv({ text: view.getDisplayText(), attr: { style: 'font-weight: 600; font-size: 14px;' } });
                    
                    const stopBtn = compDiv.createEl('button', { text: 'Stop Component', attr: { style: 'background: transparent; color: #f85149; border: 1px solid rgba(248, 81, 73, 0.4); padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;' } });
                    stopBtn.onclick = () => {
                        leaf.detach();
                        renderActiveComponents();
                    };
                });
            }
        };
        renderActiveComponents();

        // Register event listener to update active components when layout changes
        this.registerEvent(this.app.workspace.on('layout-change', () => {
            renderActiveComponents();
        }));

        const provisionerCard = dashboardGrid.createDiv({ attr: { style: 'background: rgba(255, 255, 255, 0.02); border: 1px solid var(--background-modifier-border); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; grid-column: 1 / -1;' } });
        const provisionerHeader = provisionerCard.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 8px; margin-bottom: 12px;' } });
        const provisionerIconBox = provisionerHeader.createDiv({ attr: { style: 'color: var(--text-muted); display: flex;' } });
        try { setIcon(provisionerIconBox, 'terminal'); } catch(e) {}
        provisionerHeader.createEl('h3', { text: 'Engine Provisioner', attr: { style: 'margin: 0; font-size: 15px;' } });
        
        const provisionerActions = provisionerCard.createDiv({ attr: { style: 'display: flex; gap: 8px; margin-bottom: 12px;' } });
        
        const installBtn = provisionerActions.createEl('button', { attr: { title: 'Install Engine', style: 'background: transparent; color: #56d364; border: 1px solid rgba(86, 211, 100, 0.4); padding: 6px 10px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;' } });
        try { setIcon(installBtn, 'download-cloud'); } catch(e) {}
        
        const uninstallBtn = provisionerActions.createEl('button', { attr: { title: 'Uninstall Engine', style: 'background: transparent; color: #f85149; border: 1px solid rgba(248, 81, 73, 0.4); padding: 6px 10px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;' } });
        try { setIcon(uninstallBtn, 'trash-2'); } catch(e) {}
        
        const copyBtn = provisionerActions.createEl('button', { attr: { title: 'Copy Logs', style: 'background: transparent; color: var(--text-muted); border: 1px solid var(--background-modifier-border); padding: 6px 10px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; margin-left: auto;' } });
        try { setIcon(copyBtn, 'copy'); } catch(e) {}
        
        const logBox = provisionerCard.createDiv({ attr: { style: 'background: #0d1117; padding: 10px; border-radius: 6px; width: 100%; border: 1px solid #30363d; height: 150px; overflow-y: auto; text-align: left; font-family: monospace; font-size: 11px;' } });
        const writeLog = (msg: string, color: string = '#8b949e') => {
            const line = logBox.createDiv({ text: msg });
            line.style.color = color;
            logBox.scrollTop = logBox.scrollHeight;
        };
        writeLog("Awaiting native execution...");

        copyBtn.onclick = () => {
            navigator.clipboard.writeText(logBox.innerText).catch(() => {});
            try { setIcon(copyBtn, 'check'); } catch(e) {}
            window.setTimeout(() => { try { setIcon(copyBtn, 'copy'); } catch(e) {} }, 2000);
        };

        installBtn.onclick = () => {
            this.isInstalling = true;
            logBox.empty();
            writeLog("Initializing headless terminal session...", "#56d364");
            
            // Helper to mathematically guarantee full PATH resolution (NVM, Homebrew) by forcing a login shell
            const spawnCmd = (cmdStr: string) => {
                 
                const { spawn } = require('child_process');
                const shell = process.env.SHELL || '/bin/zsh';
                 
                const basePath = (this.app.vault.adapter as unknown).getBasePath ? (this.app.vault.adapter as unknown).getBasePath() : process.cwd();
                const env = Object.assign({}, process.env);
                env.GREX_VAULT_PATH = basePath;
                return spawn(shell, ['-l', '-c', cmdStr], { env });
            };
            
            writeLog("> npm install -g @beto-group/grex-cli", "#e5e5e5");
            const installer = spawnCmd('npm install -g @beto-group/grex-cli');
            
             
            installer.stdout.on('data', (data: unknown) => writeLog(data.toString()));
             
            installer.stderr.on('data', (data: unknown) => writeLog(data.toString(), "#f85149"));
             
            installer.on('close', (code: number) => {
                if (code !== 0) {
                    writeLog(`[FATAL] NPM installation physically crashed with code ${code}.`, "#f85149");
                    this.isInstalling = false;
                    return;
                }
                writeLog("[SUCCESS] @beto-group/grex-cli package bound to system.", "#56d364");
                writeLog("> grex start", "#e5e5e5");
                const boot = spawnCmd('grex start');
                 
                boot.stdout.on('data', (data: unknown) => writeLog(data.toString()));
                 
                boot.stderr.on('data', (data: unknown) => writeLog(data.toString(), "#f85149"));
                writeLog("Awaiting gateway heartbeat...", "#58a6ff");
                window.setTimeout(() => { this.isInstalling = false; }, 15000);
            });
        };

        uninstallBtn.onclick = () => {
            this.isInstalling = true;
            logBox.empty();
            writeLog("Initiating physical engine eradication...", "#f85149");
            
            const spawnCmd = (cmdStr: string) => {
                 
                const { spawn } = require('child_process');
                const shell = process.env.SHELL || '/bin/zsh';
                 
                const basePath = (this.app.vault.adapter as unknown).getBasePath ? (this.app.vault.adapter as unknown).getBasePath() : process.cwd();
                const env = Object.assign({}, process.env);
                env.GREX_VAULT_PATH = basePath;
                return spawn(shell, ['-l', '-c', cmdStr], { env });
            };
            
            writeLog("> grex shutdown", "#e5e5e5");
            const stop = spawnCmd('grex shutdown');
             
            stop.stdout.on('data', (data: unknown) => writeLog(data.toString()));
             
            stop.stderr.on('data', (data: unknown) => writeLog(data.toString(), "#f85149"));
             
            stop.on('close', () => {
                writeLog("> npm uninstall -g @beto-group/grex-cli", "#e5e5e5");
                const uninstaller = spawnCmd('npm uninstall -g @beto-group/grex-cli');
                 
                uninstaller.stdout.on('data', (data: unknown) => writeLog(data.toString()));
                 
                uninstaller.stderr.on('data', (data: unknown) => writeLog(data.toString(), "#f85149"));
                 
                uninstaller.on('close', () => {
                    writeLog("[SUCCESS] Sovereign Engine eradicated from host system.", "#56d364");
                    this.isInstalling = false;
                });
            });
        };

        // CDP AUTOMATION DEBUGGER CARD
        const cdpCard = dashboardGrid.createDiv({ attr: { style: 'background: rgba(255, 255, 255, 0.02); border: 1px solid var(--background-modifier-border); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; grid-column: 1 / -1;' } });
        const cdpHeader = cdpCard.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 8px; margin-bottom: 12px;' } });
        const cdpIconBox = cdpHeader.createDiv({ attr: { style: 'color: var(--text-muted); display: flex;' } });
        try { setIcon(cdpIconBox, 'bug'); } catch(e) {}
        cdpHeader.createEl('h3', { text: 'CDP Automation Debugger', attr: { style: 'margin: 0; font-size: 15px;' } });
        
        const cdpActions = cdpCard.createDiv({ attr: { style: 'display: flex; gap: 8px; margin-bottom: 12px;' } });
        const cdpInput = cdpActions.createEl('input', { type: 'text', placeholder: 'Component Name (e.g. Remotion)', attr: { style: 'flex-grow: 1; background: var(--background-modifier-form-field); border: 1px solid var(--background-modifier-border); padding: 6px 12px; border-radius: 6px; color: var(--text-normal); font-family: var(--font-monospace); font-size: 13px;' } });
        cdpInput.value = 'Remotion';
        
        const cdpMountBtn = cdpActions.createEl('button', { text: 'Execute CDP Mount', attr: { title: 'Mount via CDP', style: 'background: transparent; color: #58a6ff; border: 1px solid rgba(88, 166, 255, 0.4); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600;' } });
        
        const cdpLogBox = cdpCard.createDiv({ attr: { style: 'background: #0d1117; padding: 10px; border-radius: 6px; width: 100%; border: 1px solid #30363d; height: 100px; overflow-y: auto; text-align: left; font-family: monospace; font-size: 11px;' } });
        const writeCdpLog = (msg: string, color: string = '#8b949e') => {
            const line = cdpLogBox.createDiv({ text: msg });
            line.style.color = color;
            cdpLogBox.scrollTop = cdpLogBox.scrollHeight;
        };
        writeCdpLog("Ready for CDP injection loop...");

        cdpMountBtn.onclick = () => {
            const target = cdpInput.value.trim();
            if (!target) return;
            cdpLogBox.empty();
            writeCdpLog(`> grex cdp mount "${target}"`, "#e5e5e5");
            
            const spawnCmd = (cmdStr: string) => {
                const { spawn } = require('child_process');
                const shell = process.env.SHELL || '/bin/zsh';
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const basePath = (this.app.vault.adapter as any).getBasePath ? (this.app.vault.adapter as any).getBasePath() : process.cwd();
                const env = Object.assign({}, process.env);
                env.GREX_VAULT_PATH = basePath;
                return spawn(shell, ['-l', '-c', cmdStr], { env });
            };
            
            const cdpExec = spawnCmd(`grex cdp mount "${target}"`);
             
            cdpExec.stdout.on('data', (data: unknown) => writeCdpLog(data.toString()));
             
            cdpExec.stderr.on('data', (data: unknown) => writeCdpLog(data.toString(), "#f85149"));
             
            cdpExec.on('close', (code: number) => {
                if (code !== 0) writeCdpLog(`[FATAL] CDP automation failed with exit code ${code}.`, "#f85149");
                else writeCdpLog(`[INFO] CDP loop closed.`, "#8b949e");
            });
        };

        await this.pollPodmanStatus();
        this.initYjsNetwork();
        
        // Poll mathematically every 5 seconds
        this.pollInterval = window.setInterval(() => {
            void this.pollPodmanStatus();
        }, 5000);
    }

    yjsProvider: unknown = null;
    yjsDoc: unknown = null;
    networkStatusContainer: HTMLElement;
    isBootingDaemon: boolean = false;

    async pollPodmanStatus() {
        try {
            let token = '';
            try {
                const tokenPath = '.grex-engine/.grex-token';
                if (await this.plugin.app.vault.adapter.exists(tokenPath)) {
                    token = await this.plugin.app.vault.adapter.read(tokenPath);
                    token = token.trim();
                }
            } catch(e) {}

            const res = await requestUrl({
                url: 'http://localhost:3000/api/manage/status',
                method: 'GET',
                headers: token ? { 'Authorization': `Bearer ${token}` } : undefined,
                throw: false
            });
            if (res.status === 200) {
                this.isInstalling = false; // mathematically unlock UI
                const data = res.json;
                if (this.podmanStatusContainer) {
                    this.podmanStatusContainer.empty();
                    let text = 'ONLINE: Sovereign Orchestrator API Gateway\n\n';
                     
                    for (const [id, info] of Object.entries(data)) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const typedInfo = info as any;
                        text += `[${String(typedInfo.status).toUpperCase()}] ${String(typedInfo.name)} (PID: ${typedInfo.processTree ? typedInfo.processTree.pid : 'N/A'})\n`;
                    }
                    this.podmanStatusContainer.setText(text);
                    this.podmanStatusContainer.style.color = 'var(--text-normal)';
                    this.podmanStatusContainer.style.border = '1px solid var(--interactive-accent)';
                    this.podmanStatusContainer.style.background = 'var(--background-modifier-form-field)';
                }
            } else {
                throw new Error('API Offline');
            }
        } catch (err: unknown) {
            if (this.isInstalling) return; // Freeze UI during background installation
            
            // Auto-boot orchestrator if offline
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cp = (window as any).require ? (window as any).require('child_process') : null;
            if (cp && !this.isBootingDaemon) {
                this.isBootingDaemon = true;
                if (this.podmanStatusContainer) {
                    this.podmanStatusContainer.empty();
                    this.podmanStatusContainer.style.border = '1px solid #3b82f6';
                    this.podmanStatusContainer.style.background = '#0d1117';
                    const bootingDiv = this.podmanStatusContainer.createDiv({ attr: { style: 'display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20px;' } });
                    bootingDiv.createEl('h3', { text: 'AUTO-BOOTING ORCHESTRATOR...', attr: { style: 'color: #3b82f6; margin-top: 0;' } });
                    bootingDiv.createEl('p', { text: 'The Orchestrator API is offline. Automatically mathematically spawning the daemon in the background...', attr: { style: 'color: #e5e5e5; font-size: 13px;' } });
                }
                
                // Spawn the orchestrator using global grex command
                 
                cp.exec('grex start', { env: { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ''}` } }, () => {
                    setTimeout(() => {
                        this.isBootingDaemon = false;
                    }, 5000); // 5 second mathematical debounce before another auto-boot attempt is allowed
                });
                return;
            }

            if (this.podmanStatusContainer && !this.isBootingDaemon) {
                this.podmanStatusContainer.empty();
                this.podmanStatusContainer.style.border = '2px solid #f85149';
                this.podmanStatusContainer.style.background = '#2e1215';
                
                const warningDiv = this.podmanStatusContainer.createDiv({ attr: { style: 'display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20px;' } });
                
                warningDiv.createEl('h3', { text: 'SOVEREIGN ORCHESTRATOR OFFLINE', attr: { style: 'color: #f85149; margin-top: 0;' } });
                warningDiv.createEl('p', { text: 'The backend gateway is physically disconnected. To maintain zero-trust environment parity, the orchestration engine has been mathematically decoupled into a standalone CLI.', attr: { style: 'color: #e5e5e5; font-size: 13px; max-width: 400px; line-height: 1.5;' } });
                warningDiv.createEl('p', { text: 'Use the Engine Provisioner below to structurally re-install or boot the CLI.', attr: { style: 'color: #8b949e; font-size: 12px; font-style: italic; margin-top: 10px;' } });
            }
        }
    }

    initYjsNetwork() {
        try {
            // Import Yjs dynamically so it doesn't break startup if absent
            const Y = require('yjs');
            const { WebsocketProvider } = require('y-websocket');
            
            this.yjsDoc = new Y.Doc();
            this.yjsProvider = new WebsocketProvider('ws://localhost:3000', 'grex-system-room', this.yjsDoc, { connect: true });
            
            this.yjsProvider.awareness.setLocalStateField('user', {
                name: `Obsidian Host ${Math.floor(Math.random() * 1000)}`,
                type: 'dashboard'
            });

            const updateNetworkUI = () => {
                if (!this.networkStatusContainer) return;
                
                const states = Array.from(this.yjsProvider.awareness.getStates().entries());
                const dashboards = states.filter(([_id, state]: unknown) => state.user?.type === 'dashboard');
                
                this.networkStatusContainer.empty();
                this.networkStatusContainer.setCssStyles({
                    display: 'flex', flexDirection: 'column', gap: '8px', 
                    border: 'none', padding: '0', background: 'transparent'
                });

                const wsRow = this.networkStatusContainer.createDiv({ attr: { style: 'display: flex; justify-content: space-between; padding: 8px; background: var(--background-primary); border-radius: 6px; border: 1px solid var(--background-modifier-border);' } });
                wsRow.createSpan({ text: 'Orchestrator WS' });
                wsRow.createSpan({ text: 'CONNECTED', attr: { style: 'color: #2ecc71; font-weight: 600;' } });

                const peersRow = this.networkStatusContainer.createDiv({ attr: { style: 'display: flex; justify-content: space-between; padding: 8px; background: var(--background-primary); border-radius: 6px; border: 1px solid var(--background-modifier-border);' } });
                peersRow.createSpan({ text: 'Active Dashboards' });
                peersRow.createSpan({ text: `${dashboards.length} Nodes`, attr: { style: 'color: #3498db; font-weight: 600;' } });
            };

            this.yjsProvider.awareness.on('change', updateNetworkUI);
            this.yjsProvider.on('status', (event: unknown) => {
                if (event.status === 'connected') {
                    updateNetworkUI();
                } else if (this.networkStatusContainer) {
                    this.networkStatusContainer.empty();
                    this.networkStatusContainer.setText('WebSocket Disconnected...');
                }
            });
        } catch (e) {
            console.error("Yjs not available natively in host plugin:", e);
        }
    }

    async onClose() {
        if (this.yjsProvider) {
            this.yjsProvider.disconnect();
        }
        if (this.pollInterval !== null) {
            window.clearInterval(this.pollInterval);
        }
        this.contentEl.empty();
    }
}

export default class GrexNexusPlugin extends Plugin {
    manifestCache: Map<string, ComponentData> = new Map();
    registeredComponentCommands: Set<string> = new Set();
    settings: GrexNexusSettings;

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        
        // Mathematically purge stale legacy state
        if (this.settings.targetFolder === 'components' || this.settings.targetFolder === 'components/') {
            this.settings.targetFolder = 'GrexNexus/components/';
            await this.saveSettings();
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    showNexusActiveOverlay(actionText: string = 'CLI Action Executing...', durationMs: number = 3000) {
        let overlay = document.getElementById('grex-nexus-active-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'grex-nexus-active-overlay';
            overlay.setCssStyles({
                position: 'fixed',
                top: '12px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: '999999',
                background: 'linear-gradient(135deg, rgba(18, 19, 26, 0.95), rgba(26, 27, 38, 0.95))',
                border: '1px solid #ff5722',
                boxShadow: '0 8px 32px rgba(255, 87, 34, 0.4)',
                color: '#ffffff',
                padding: '8px 18px',
                borderRadius: '24px',
                fontSize: '12px',
                fontWeight: '700',
                fontFamily: 'Inter, sans-serif',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backdropFilter: 'blur(12px)',
                transition: 'opacity 0.3s ease, transform 0.3s ease'
            });
            document.body.appendChild(overlay);
        }

        overlay.empty();
        overlay.createEl('span', { attr: { style: 'width: 8px; height: 8px; border-radius: 50%; background: #ff5722; display: inline-block;' } });
        overlay.createSpan({ text: ` 🛸 GREX NEXUS IS ACTIVE: ${actionText}` });
        overlay.style.opacity = '1';

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((window as any)._grexOverlayTimer) clearTimeout((window as any)._grexOverlayTimer);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any)._grexOverlayTimer = setTimeout(() => {
            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(() => { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 300);
            }
        }, durationMs);
    }

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new GrexNexusSettingTab(this.app, this));

        this.registerView(
            VIEW_TYPE_GREX,
            (leaf) => new GrexComponentView(leaf, this)
        );

        this.registerView(
            VIEW_TYPE_GREX_DASHBOARD,
            (leaf) => new GrexDashboardView(leaf, this)
        );

        // FLIP SIDE LOGIC: Aggressively intercept file-open for Grex Components
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (file && file.extension === "md") {
                    const leaf = this.app.workspace.getMostRecentLeaf();
                    // @ts-ignore
                    if (leaf && leaf.grexFlipBypass) {
                        // @ts-ignore
                        leaf.grexFlipBypass = false;
                        return; // Let it open as markdown!
                    }

                    const cache = this.app.metadataCache.getFileCache(file);
                    if (cache?.frontmatter?.type === "GrexComponent") {
                        if (leaf && leaf.view.getViewType() === "markdown") {
                            const folder = file.parent;
                            let component = folder ? this.manifestCache.get(folder.path) : null;
                            
                            // If not in cache yet, try to build it quickly
                            if (!component && folder) {
                                component = {
                                    folder,
                                    manifest: {
                                        name: cache.frontmatter.name || file.basename,
                                        entrypoint: cache.frontmatter.entry || cache.frontmatter.entrypoint || `dist/${file.basename.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.es.js`,
                                        icon: cache.frontmatter.icon || "box"
                                    }
                                };
                            }

                            if (component) {
                                void leaf.setViewState({ type: VIEW_TYPE_GREX, active: true }).then(() => {
                                    if (leaf.view instanceof GrexComponentView) {
                                        leaf.view.setComponentData(component);
                                        leaf.view.linkedMarkdownFile = file;
                                        leaf.view.onOpen();
                                    }
                                });
                            }
                        }
                    }
                }
            })
        );

        this.addCommand({
            id: 'flip-active-file-grex',
            name: 'Flip active file to Grex Component',
            checkCallback: (checking: boolean) => {
                const leaf = this.app.workspace.getMostRecentLeaf();
                if (leaf && leaf.view.getViewType() === "markdown") {
                    // @ts-ignore
                    const file = leaf.view.file as TFile;
                    if (file && file.extension === "md") {
                        const cache = this.app.metadataCache.getFileCache(file);
                        if (cache?.frontmatter?.type === "GrexComponent") {
                            if (!checking) {
                                const folder = file.parent;
                                const component = folder ? this.manifestCache.get(folder.path) : null;
                                if (component) {
                                    void leaf.setViewState({ type: VIEW_TYPE_GREX, active: true }).then(() => {
                                        if (leaf.view instanceof GrexComponentView) {
                                            leaf.view.setComponentData(component);
                                            leaf.view.linkedMarkdownFile = file;
                                            leaf.view.onOpen();
                                        }
                                    });
                                } else {
                                    new Notice("Component cache not ready. Try refreshing cache.");
                                }
                            }
                            return true;
                        }
                    }
                }
                return false;
            }
        });

        this.addRibbonIcon('package-open', 'Grex Control Center', () => {
            void this.activateDashboard();
        });

        this.addCommand({
            id: 'open-grex-component',
            name: 'Launch grex component',
            callback: () => {
                void this.openComponentSelector();
            }
        });

        this.addCommand({
            id: 'refresh-grex-cache',
            name: 'Refresh component cache',
            callback: () => {
                void this.refreshCache();
                new Notice("Grex component cache refreshed");
            }
        });

        this.addCommand({
            id: 'debug-active-grex-component',
            name: 'Debug active grex component',
            callback: () => {
                const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GREX);
                if (leaves.length === 0) {
                    new Notice("No grex components are currently open.");
                    return;
                }
                leaves.forEach(leaf => {
                    const view = leaf.view as GrexComponentView;
                    console.log("=== GREX COMPONENT DEBUG INFO ===");
                    console.log("Component Data:", view.componentData);
                    console.log("Container Element:", view.contentEl);
                    new Notice(`Debug info printed to console for ${view.componentData?.manifest.name || 'unknown component'}`);
                });
            }
        });

        this.addCommand({
            id: 'provision-grex-environment',
            name: 'Provision Grex Environment',
            callback: () => {
                void this.refreshCache().then(() => {
                    new ProvisioningModal(this.app, this.manifestCache).open();
                });
            }
        });

        // Intercept [[Component Name]] clicks
        this.registerDomEvent(activeDocument, 'click', (evt: MouseEvent) => {
            const target = evt.target as HTMLElement;
            const linkEl = target.closest("a.internal-link");
            if (linkEl) {
                const href = linkEl.getAttribute("data-href");
                if (href) {
                    const folderName = href.replace(/(\.md)$/i, '');
                    // Search by manifest name or exact folder name
                    let component = Array.from(this.manifestCache.values()).find(c => c.manifest.name === folderName || c.folder.name === folderName);
                    if (component) {
                        evt.preventDefault();
                        void this.activateComponentView(component);
                    }
                }
            }
        }, { capture: true });

        // Render ![[Component Name]] inline
        this.registerMarkdownPostProcessor((el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
            const embeds = el.querySelectorAll('.internal-embed');
            embeds.forEach((embed) => {
                void (async () => {
                    const src = embed.getAttribute("src");
                    if (src) {
                        const folderName = src.replace(/(\.md)$/i, '');
                        // Search by manifest name or exact folder name
                        let component = Array.from(this.manifestCache.values()).find(c => c.manifest.name === folderName || c.folder.name === folderName);
                        if (component) {
                            embed.empty();
                            embed.addClass("grex-inline-embed");
                            
                            const container = embed.createDiv();
                            container.setCssStyles({
                                position: "relative",
                                width: "100%",
                                minHeight: "200px",
                                border: "1px solid var(--background-modifier-border)",
                                borderRadius: "8px",
                                overflow: "hidden"
                            });

                            try {
                                await loadComponentBundle(container, component, this.app, this.plugin);
                            } catch (e: unknown) {
                                container.setText(`Failed to load grex component: ${String(e)}`);
                            }
                        }
                    }
                })();
            });
        });

        // Expose global window helper for live Nexus active overlay
        (window as unknown as Record<string, unknown>).showNexusActiveOverlay = (text: string, duration?: number) => {
            this.showNexusActiveOverlay(text, duration);
        };

        // Expose global window helper for opening components natively without a markdown file
        (window as unknown as Record<string, unknown>).openGrexComponent = (name: string) => {
            return this.activateComponentViewByName(name);
        };

        // Render ```datacorejsx or ```grexjsx codeblocks natively without requiring external Datacore plugin!
        const processGrexCodeblock = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
            void (async () => {
                const currentFilePath = ctx.sourcePath;
                const fileFolder = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
                
                // Find matching component in manifestCache by folder path or file path
                let component = this.manifestCache.get(fileFolder);
                if (!component) {
                    // Try match by parent directory name
                    const folderName = fileFolder.split('/').pop() || '';
                    component = Array.from(this.manifestCache.values()).find(c => c.manifest.name === folderName || c.folder.name === folderName);
                }

                el.empty();
                const container = el.createDiv();
                container.setCssStyles({
                    position: "relative",
                    width: "100%",
                    minHeight: "350px",
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: "8px",
                    overflow: "hidden",
                    margin: "12px 0"
                });

                if (component) {
                    try {
                        await loadComponentBundle(container, component, this.app, this.plugin);
                    } catch (e: unknown) {
                        container.setText(`[GrexNexus] Failed to mount component: ${String(e)}`);
                    }
                } else {
                    container.setText(`[GrexNexus] No matching Grex Component found for path '${currentFilePath}'.`);
                }
            })();
        };

        this.registerMarkdownCodeblockProcessor('datacorejsx', (source, el, ctx) => processGrexCodeblock(source, el, ctx));
        this.registerMarkdownCodeblockProcessor('grexjsx', (source, el, ctx) => processGrexCodeblock(source, el, ctx));
        this.registerMarkdownCodeblockProcessor('grex', (source, el, ctx) => processGrexCodeblock(source, el, ctx));

        // Initial cache build
        this.app.workspace.onLayoutReady(() => {
            void this.refreshCache();
        });
    }

    async refreshCache() {
        this.manifestCache.clear();
        
        // Scan folders using Obsidian native vault adapter
        const allFolders = this.app.vault.getAllLoadedFiles().filter(f => f instanceof TFolder);
        
        // Include component directories via native vault adapter list
        for (const compsDir of ['components', 'GREX.datacore/components']) {
            try {
                if (await this.app.vault.adapter.exists(compsDir)) {
                    const listResult = await this.app.vault.adapter.list(compsDir);
                    for (const folderPath of listResult.folders) {
                        const folderName = folderPath.split('/').pop() || '';
                        if (!folderName.startsWith('.')) {
                            if (!allFolders.some(f => f.path === folderPath)) {
                                const folderObj = this.app.vault.getAbstractFileByPath(folderPath) || { path: folderPath, name: folderName };
                                allFolders.push(folderObj as TFolder);
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn('[GrexNexus] Component directory scan warning:', e);
            }
        }
        
        for (const folder of allFolders) {
            if (folder.path.includes(this.app.vault.configDir) || folder.path.includes("node_modules") || folder.path.includes(".git")) {
                continue;
            }

            const grexJsonPath = `${folder.path}/grex.json`;
            const manifestJsonPath = `${folder.path}/manifest.json`;
            
            let manifest: GrexManifest | null = null;

            // 1. Check for grex.json or manifest.json using native vault adapter
            const targetJsonPath = (await this.app.vault.adapter.exists(grexJsonPath)) 
                ? grexJsonPath 
                : (await this.app.vault.adapter.exists(manifestJsonPath)) 
                    ? manifestJsonPath 
                    : null;

            if (targetJsonPath) {
                try {
                    const content = await this.app.vault.adapter.read(targetJsonPath);
                    manifest = JSON.parse(content) as GrexManifest;
                    if (!manifest.entrypoint && (manifest as unknown as Record<string, string>).entry) {
                        manifest.entrypoint = (manifest as unknown as Record<string, string>).entry;
                    }
                    if (!manifest.entrypoint) {
                        manifest.entrypoint = "dist/bundle.es.js";
                    }
                } catch (e) {
                    console.error(`Failed to parse manifest at ${targetJsonPath}`, e);
                }
            }  
            // 2. Fallback to Markdown frontmatter if no grex.json exists
            else if (folder.children && Array.isArray(folder.children)) {
                const mdFiles = folder.children.filter(c => c instanceof TFile && c.extension === "md") as TFile[];
                for (const file of mdFiles) {
                    const cache = this.app.metadataCache.getFileCache(file);
                    const frontmatter = cache?.frontmatter;
                    
                    if (frontmatter?.type === "GrexComponent") {
                        manifest = {
                            name: frontmatter.name || file.basename,
                            entrypoint: frontmatter.entry || frontmatter.entrypoint || `dist/${file.basename.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.es.js`,
                            icon: frontmatter.icon || "box"
                        };
                        break; // Stop after finding the first valid component file in this folder
                    }
                }
            }

            if (manifest) {
                const data: ComponentData = { folder, manifest };
                // Mathematically index by absolute physical path to guarantee zero collision
                this.manifestCache.set(folder.path, data);
            }
        }
    }

    async openComponentSelector() {
        await this.refreshCache(); // Always refresh before opening
        
        const uniqueComponents = new Set<ComponentData>();
        this.manifestCache.forEach(comp => uniqueComponents.add(comp));

        if (uniqueComponents.size === 0) {
            new Notice("No grex components (grex.json) found in the vault.");
            return;
        }

        new ComponentSelectorModal(this.app, Array.from(uniqueComponents), (comp: ComponentData) => {
            void this.activateComponentView(comp);
        }).open();
    }

    async activateComponentViewByName(name: string) {
        await this.refreshCache();
        let compData: ComponentData | null = null;
        this.manifestCache.forEach(comp => {
            if (comp.manifest.name.toLowerCase() === name.toLowerCase() || comp.folder.name.toLowerCase() === name.toLowerCase()) {
                compData = comp;
            }
        });
        if (!compData) {
            new Notice(`Grex Component '${name}' not found.`);
            return;
        }
        await this.activateComponentView(compData);
    }

    async activateComponentView(componentData: ComponentData) {
        // Aegis Permissions Check
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const requiredPerms: string[] = (componentData.manifest as any).permissions || [];
        const grantedPerms = this.settings.componentPermissions[componentData.manifest.name] || {};
        
        const missingPerms = requiredPerms.filter(p => !grantedPerms[p]);
        
        if (missingPerms.length > 0) {
            new AegisPermissionModal(this.app, this, componentData, missingPerms, () => {
                // Callback on grant
                void this.activateComponentView(componentData);
            }).open();
            return; // Abort activation until granted
        }

        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_GREX);

        // Find if this exact component is already open
        leaf = leaves.find(l => (l.view as GrexComponentView).componentData?.manifest.name === componentData.manifest.name) || null;

        if (!leaf) {
            // Open in a new tab if not already open
            leaf = workspace.getLeaf('tab');
            await leaf.setViewState({ type: VIEW_TYPE_GREX, active: true });
        }

        if (leaf) {
            // Check if the view is actually an instance of our class.
            // If it's a stale leaf from a previous plugin reload or a fallback view, it won't be.
            if (!(leaf.view instanceof GrexComponentView)) {
                await leaf.setViewState({ type: VIEW_TYPE_GREX, active: true });
            }

            if (leaf.view instanceof GrexComponentView) {
                const view = leaf.view;
                // Only re-open if the component is different or not loaded
                if (view.componentData?.manifest.name !== componentData.manifest.name) {
                    view.setComponentData(componentData);
                    await view.onOpen();
                }
            }
            
             
            workspace.revealLeaf(leaf);
        }
    }

    async activateDashboard() {
        const { workspace } = this.app;
        
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_GREX_DASHBOARD);
        
        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getLeaf('tab');
            if (leaf) {
                await leaf.setViewState({ type: VIEW_TYPE_GREX_DASHBOARD, active: true });
            }
        }
        
        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    onunload() {
        // Cleanup any active views to prevent stale references on reload
        
        
    }
}

class AegisPermissionModal extends Modal {
    constructor(app: App, private plugin: GrexNexusPlugin, private comp: ComponentData, private missing: string[], private onGrant: () => void) {
        super(app);
    }
    
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: 'Aegis Security Gateway', attr: { style: 'color: var(--text-error); margin-bottom: 12px;' } });
        contentEl.createEl('p', { text: `The component "${this.comp.manifest.name}" requires elevated permissions to mount into the spatial environment.` });
        
        const list = contentEl.createEl('ul');
        this.missing.forEach(p => {
            const name = p === 'fs' ? 'Filesystem Storage' : p === 'keychain' ? 'Keychain & Security' : p === 'network' ? 'Network Access' : p;
            list.createEl('li', { text: name, attr: { style: 'font-weight: bold; color: var(--text-accent);' } });
        });
        
        const btnBox = contentEl.createDiv({ attr: { style: 'display: flex; gap: 10px; margin-top: 24px; justify-content: flex-end;' } });
        
        const cancelBtn = btnBox.createEl('button', { text: 'Deny' });
        cancelBtn.onclick = () => this.close();
        
        const grantBtn = btnBox.createEl('button', { text: 'Grant & Mount', attr: { style: 'background: var(--interactive-accent); color: var(--text-on-accent);' } });
        grantBtn.onclick = async () => {
            if (!this.plugin.settings.componentPermissions[this.comp.manifest.name]) {
                this.plugin.settings.componentPermissions[this.comp.manifest.name] = {};
            }
            this.missing.forEach(p => {
                this.plugin.settings.componentPermissions[this.comp.manifest.name][p] = true;
            });
            await this.plugin.saveSettings();
            this.close();
            this.onGrant();
        };
    }
    
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class GrexNexusSettingTab extends PluginSettingTab {
    plugin: GrexNexusPlugin;

    constructor(app: App, plugin: GrexNexusPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('p', { text: 'Syncing mathematical state with native vault...', attr: { style: 'color: var(--text-muted);' } });
        
        void this.plugin.refreshCache().then(() => {
            void this.renderUI();
        });
    }

    async pullComponent(rawUrl: string, btn: ButtonComponent | null): Promise<void> {
        rawUrl = rawUrl.trim();
        if (!rawUrl) {
            new Notice('Please paste a GitHub URL first.');
            return;
        }

        const urlMatch = rawUrl.match(/github\.com\/([^/]+)\/([^/]+)/i);
        let repo = rawUrl; // fallback
        if (urlMatch && urlMatch.length >= 3) {
            repo = `${urlMatch[1]}/${urlMatch[2].replace(/\.git$/, '')}`;
        } else if (rawUrl.split('/').length === 2 && !rawUrl.includes('http')) {
            repo = rawUrl; // support legacy user/repo format
        } else {
            new Notice('Invalid GitHub URL structure.');
            return;
        }
        
        const repoName = repo.split('/')[1] || repo;
        
        if (btn) {
            btn.setButtonText('Pulling...');
            btn.setDisabled(true);
        }
        
        try {
            const headers: Record<string, string> = {
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "Grex-Nexus-Obsidian"
            };
            if (this.plugin.settings.githubToken) {
                headers["Authorization"] = `token ${this.plugin.settings.githubToken}`;
            }
            
            const releaseRes = await requestUrl({
                url: `https://api.github.com/repos/${repo}/releases/latest`,
                method: "GET",
                headers: headers
            });
            
            if (releaseRes.status !== 200) {
                throw new Error(`Failed to fetch release metadata: HTTP ${releaseRes.status}`);
            }
            
             
            const releaseInfo = releaseRes.json;
            // Mathematically enforce the .zip release asset logic
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const zipAsset = releaseInfo.assets?.find((a: any) => a.name.endsWith('.zip'));
            
            let downloadUrl = "";
            if (zipAsset) {
                 
                downloadUrl = zipAsset.url;
                headers["Accept"] = "application/octet-stream"; // Required by GitHub API for downloading explicit assets
            } else {
                // Fallback to source zipball if the user failed to upload a specific .zip asset
                 
                downloadUrl = releaseInfo.zipball_url;
                headers["Accept"] = "application/vnd.github.v3+json"; 
                new Notice(`Warning: No compiled .zip asset attached to release. Falling back to pulling the raw source code zipball.`, 5000);
            }
            
            const downloadRes = await requestUrl({
                url: downloadUrl,
                method: "GET",
                headers: headers
            });
            
            if (downloadRes.status !== 200 && downloadRes.status !== 302) {
                throw new Error(`Failed to download payload bytes: HTTP ${downloadRes.status}`);
            }
            
            const buffer = Buffer.from(downloadRes.arrayBuffer);
            
            const zip = new AdmZip(buffer);
            
            const finalRelativePath = this.plugin.settings.targetFolder.trim();
            if (!finalRelativePath) {
                new Notice('Error: Target Extraction Path is empty.');
                return;
            }
            
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const basePath = (this.plugin.app.vault.adapter as any).getBasePath();
            const cleanRelativePath = finalRelativePath.endsWith('/') ? finalRelativePath.slice(0, -1) : finalRelativePath;
            const targetPath = `${basePath}/${cleanRelativePath}/${repoName}`;
            
            if (zipAsset) {
                // Perfect extraction: It's a pre-packaged asset
                zip.extractAllTo(targetPath, true);
            } else {
                // Flawed extraction: Source code zipballs from GitHub include a top-level hash folder
                const entries = zip.getEntries();
                if (entries.length === 0) throw new Error("Downloaded zip is mathematically empty.");
                for (const entry of entries) {
                    if (!entry.isDirectory) {
                        const relativeEntryPath = entry.entryName.replace(rootFolderName, '');
                        if (relativeEntryPath) {
                            const fullTargetPath = `${targetRelPath}/${relativeEntryPath}`;
                            const folderOnly = fullTargetPath.substring(0, fullTargetPath.lastIndexOf('/'));
                            if (folderOnly && !(await this.app.vault.adapter.exists(folderOnly))) {
                                await this.app.vault.adapter.mkdir(folderOnly);
                            }
                            await this.app.vault.adapter.write(fullTargetPath, entry.getData().toString('utf8'));
                        }
                    }
                }
            }
            
            // Wait for Obsidian's asynchronous file watcher to mathematically index the raw Node.js fs writes
            await new Promise(resolve => window.setTimeout(resolve, 1500));
            
            await this.plugin.refreshCache();
            void this.renderUI();
            new Notice(`Success! Payload integrated into ${cleanRelativePath}/${repoName}.`);
            
        } catch (err) {
            console.error(err);
            new Notice(`Deployment Failed: ${String(err)}`);
        } finally {
            if (btn) {
                btn.setButtonText('Pull Component from Release');
                btn.setDisabled(false);
            }
        }
    }

    async renderUI(): Promise<void> {
        const { containerEl } = this;
        containerEl.empty();

        let currentUrl = '';

        // 1. Provisioning Warning Banner & Management Panel
        const provBannerCard = containerEl.createDiv({ attr: { style: 'background: rgba(255, 171, 0, 0.1); border: 1px solid rgba(255, 171, 0, 0.3); border-radius: 12px; padding: 16px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 10px;' } });
        const provBannerHeader = provBannerCard.createDiv({ attr: { style: 'display: flex; align-items: center; justify-content: space-between;' } });
        new Setting(provBannerHeader).setName("⚙️ Grex Engine Provisioning & Management").setHeading();

        const provBannerStatus = provBannerCard.createDiv({ text: 'Checking system dependencies (grex-cli, podman, component packages)...', attr: { style: 'font-size: 12px; color: var(--text-muted);' } });
        
        const provLogBox = provBannerCard.createDiv({ attr: { style: 'background: #0d1117; color: #e5e5e5; font-family: monospace; font-size: 11px; padding: 10px; height: 140px; overflow-y: auto; border-radius: 6px; display: none;' } });
        const writeProvLog = (msg: string, color: string = '#e5e5e5') => {
            provLogBox.style.display = 'block';
            const line = provLogBox.createDiv({ text: msg });
            line.style.color = color;
            provLogBox.scrollTop = provLogBox.scrollHeight;
        };

        const provActions = provBannerCard.createDiv({ attr: { style: 'display: flex; gap: 10px; flex-wrap: wrap;' } });
        
        const runProvBtn = provActions.createEl('button', { text: '⚡ Run System Provisioning', attr: { style: 'background: #56d364; color: #0d1117; font-weight: 700; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer;' } });
        const runUnprovBtn = provActions.createEl('button', { text: '🔴 Remove / Uninstall Provisioned Dependencies', attr: { style: 'background: rgba(248, 81, 73, 0.15); color: #f85149; border: 1px solid rgba(248, 81, 73, 0.3); font-weight: 600; padding: 8px 14px; border-radius: 6px; cursor: pointer;' } });

        runProvBtn.onclick = () => {
            const modal = new ProvisioningModal(this.app, this.plugin.manifestCache);
            modal.open();
        };

        runUnprovBtn.onclick = async () => {
            provLogBox.empty();
            const modal = new ProvisioningModal(this.app, this.plugin.manifestCache);
            modal.open();
            await modal.runUnprovisioning();
        };

        // Quick async status check for grex-cli and podman
        void (async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cp = (window as any).require ? (window as any).require('child_process') : null;
            if (cp) {
                const execSync = cp.execSync;
                let hasGrex = false;
                let hasPodman = false;
                try { execSync('which grex-cli', { env: { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ''}` } }); hasGrex = true; } catch(e){}
                try { execSync('which podman', { env: { ...process.env, PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ''}` } }); hasPodman = true; } catch(e){}

                if (hasGrex && hasPodman) {
                    provBannerCard.style.background = 'rgba(86, 211, 100, 0.08)';
                    provBannerCard.style.borderColor = 'rgba(86, 211, 100, 0.3)';
                    provBannerHeader.querySelector('h3')!.textContent = '✅ System Workstation Fully Provisioned';
                    provBannerHeader.querySelector('h3')!.style.color = '#56d364';
                    provBannerStatus.setText('grex-cli (Installed) | podman (Installed) | All Component Tools Active.');
                } else {
                    provBannerStatus.setText(`System tools pending: grex-cli (${hasGrex ? 'Installed' : 'Missing'}) | podman (${hasPodman ? 'Installed' : 'Missing'})`);
                }
            }
        })();

        const tokenSetting = new Setting(containerEl)
            .setName('GitHub Personal Access Token')
            .setDesc('Required to pull from private repositories or to bypass severe rate limits.');
        
        const statusEl = tokenSetting.descEl.createDiv({ attr: { style: 'margin-top: 6px; font-weight: bold; font-size: 11px;' } });

        const validateToken = async (val: string) => {
            if (!val || !val.trim()) {
                statusEl.setText('');
                return;
            }
            statusEl.setText('⏳ Validating token...');
            statusEl.style.color = 'var(--text-muted)';
            try {
                const res = await requestUrl({
                    url: 'https://api.github.com/user',
                    method: 'GET',
                    headers: {
                        'Authorization': `token ${val.trim()}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'Grex-Nexus-Obsidian'
                    },
                    throw: false
                });
                if (res.status === 200 && res.json && res.json.login) {
                    statusEl.setText(`✓ VALID (Authenticated as @${res.json.login})`);
                    statusEl.style.color = '#56d364';
                } else {
                    statusEl.setText(res.status === 401 ? '✕ INVALID TOKEN (401 Unauthorized)' : `✕ FAILED (${res.status})`);
                    statusEl.style.color = '#f85149';
                }
            } catch (e) {
                statusEl.setText('✕ Network Error Validating Token');
                statusEl.style.color = '#f85149';
            }
        };

        tokenSetting.addText(text => text
            .setPlaceholder('ghp_...')
            .setValue(this.plugin.settings.githubToken)
            .onChange(async (value) => {
                this.plugin.settings.githubToken = value;
                await this.plugin.saveSettings();
                void validateToken(value);
            }));

        if (this.plugin.settings.githubToken) {
            void validateToken(this.plugin.settings.githubToken);
        }

        new Setting(containerEl).setName("Component Provisioner").setHeading();

        new Setting(containerEl)
            .setName('Component URL')
            .setDesc('Paste the full GitHub URL to the component repository.')
            .addText(text => text
                .setPlaceholder('https://github.com/username/repo')
                .onChange((value) => {
                    currentUrl = value;
                }));

        new Setting(containerEl)
            .setName('Target Extraction Path')
            .setDesc('Path relative to your vault root where the component will be unzipped.')
            .addText(text => {
                if (!this.plugin.settings.targetFolder) {
                    this.plugin.settings.targetFolder = 'GrexNexus/components/';
                }
                text.setValue(this.plugin.settings.targetFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.targetFolder = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Provision Component')
            .setDesc('Pulls the latest .zip release asset from GitHub, unzips it exactly into the specified path, and automatically registers it into the runtime cache.')
            .addButton(btn => btn
                .setButtonText('Pull Component from Release')
                .setCta()
                .onClick(async () => {
                    await this.pullComponent(currentUrl, btn);
                }));

        new Setting(containerEl).setName("Component Store").setHeading();
        const storeContainer = containerEl.createDiv();
        storeContainer.createEl('p', { text: 'Loading community components...', attr: { style: 'color: var(--text-muted); padding: 10px; font-style: italic;' } });
        
        // Fetch asynchronously without blocking UI render
        void (async () => {
            try {
                const headers: Record<string, string> = {
                    "Accept": "application/vnd.github.v3+json",
                    "User-Agent": "Grex-Nexus-Obsidian"
                };
                if (this.plugin.settings.githubToken) {
                    headers["Authorization"] = `token ${this.plugin.settings.githubToken}`;
                }
                
                let items: unknown[] = [];
                try {
                    const res = await requestUrl({
                        url: 'https://api.github.com/search/repositories?q=topic:grex-component',
                        method: 'GET',
                        headers,
                        throw: false
                    });
                    if (res.status === 200 && res.json?.items) {
                        items = res.json.items;
                    }
                } catch (e) {}

                // Also fetch user & organization private repos if token exists
                if (this.plugin.settings.githubToken) {
                    try {
                        const userRes = await requestUrl({
                            url: 'https://api.github.com/user/repos?per_page=100&type=all',
                            method: 'GET',
                            headers,
                            throw: false
                        });
                        if (userRes.status === 200 && Array.isArray(userRes.json)) {
                            const existingIds = new Set(items.map(i => i.id));
                            userRes.json.forEach((r: unknown) => {
                                const hasTopic = r.topics && r.topics.includes('grex-component');
                                const isBetoGroup = r.owner && r.owner.login === 'beto-group';
                                if ((hasTopic || isBetoGroup) && !existingIds.has(r.id)) {
                                    items.push(r);
                                    existingIds.add(r.id);
                                }
                            });
                        }
                    } catch (e) {}
                }
                
                storeContainer.empty();
                
                if (items.length === 0) {
                    storeContainer.createEl('p', { text: 'No community components found.', attr: { style: 'color: var(--text-muted); padding: 10px;' } });
                    return;
                }
                
                const grid = storeContainer.createDiv({ attr: { style: 'display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; padding: 10px 0;' } });
                
                for (const item of items) {
                    const card = grid.createDiv({ attr: { style: 'border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; background: var(--background-secondary);' } });
                    
                     
                    new Setting(card).setName("").setHeading();
                     
                    card.createEl('p', { text: item.description || 'No description provided.', attr: { style: 'margin: 0 0 12px 0; font-size: 0.9em; color: var(--text-muted); flex-grow: 1;' } });
                    
                    const btn = card.createEl('button', { text: 'Install', attr: { style: 'align-self: flex-start; background: var(--interactive-accent); color: var(--text-on-accent); cursor: pointer;' } });
                    btn.onclick = async () => {
                        const originalText = btn.textContent;
                        btn.textContent = 'Pulling...';
                        btn.disabled = true;
                        try {
                             
                            await this.pullComponent(item.html_url, null);
                            btn.textContent = 'Installed';
                        } catch (e) {
                            btn.textContent = originalText;
                            btn.disabled = false;
                        }
                    };
                }
            } catch (err) {
                storeContainer.empty();
                storeContainer.createEl('p', { text: 'Failed to fetch component store.', attr: { style: 'color: var(--text-error); padding: 10px;' } });
                console.error("Store Fetch Error", err);
            }
        })();

        new Setting(containerEl).setName("Installed Components").setHeading();

        const uniqueComponents = new Map<string, ComponentData>();
        this.plugin.manifestCache.forEach(comp => uniqueComponents.set(comp.folder.path, comp));

        if (uniqueComponents.size === 0) {
            containerEl.createEl('p', { text: 'No native components installed in the spatial architecture.', attr: { style: 'color: var(--text-muted); padding: 20px; text-align: center; border: 1px dashed var(--background-modifier-border); border-radius: 8px;' } });
        } else {
            const libraryContainer = containerEl.createDiv({ attr: { style: 'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; padding: 10px 0;' } });

            const componentList = Array.from(uniqueComponents.values());
            
            // Mathematically sort components chronologically by modification time so new components mount at the top
            for (const comp of componentList) {
                const entryFile = this.plugin.app.vault.getAbstractFileByPath(`${comp.folder.path}/${comp.manifest.entrypoint}`);
                if (entryFile instanceof TFile) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (comp as any)._mtime = entryFile.stat.mtime;
                } else {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (comp as any)._mtime = 0;
                }
            }
            
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            componentList.sort((a, b) => ((b as any)._mtime || 0) - ((a as any)._mtime || 0));

            componentList.forEach(comp => {
                const card = libraryContainer.createDiv({ 
                    attr: { 
                        style: 'display: flex; flex-direction: column; justify-content: space-between; padding: 16px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--background-modifier-border); border-radius: 12px; transition: transform 0.2s ease, border-color 0.2s ease;' 
                    } 
                });
                
                card.addEventListener('mouseenter', () => {
                    card.style.borderColor = 'var(--interactive-accent)';
                    card.style.transform = 'translateY(-2px)';
                });
                card.addEventListener('mouseleave', () => {
                    card.style.borderColor = 'var(--background-modifier-border)';
                    card.style.transform = 'translateY(0)';
                });

                const header = card.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 12px; margin-bottom: 12px;' } });
                
                const iconBox = header.createDiv({ attr: { style: 'width: 36px; height: 36px; border-radius: 8px; background: var(--background-modifier-form-field); border: 1px solid var(--background-modifier-border); display: flex; align-items: center; justify-content: center; font-size: 18px; color: var(--text-normal);' } });
                if (comp.manifest.icon) {
                    try {
                        setIcon(iconBox, comp.manifest.icon);
                    } catch (e) {
                        setIcon(iconBox, 'package');
                    }
                } else {
                    setIcon(iconBox, 'package');
                }

                const titleBox = header.createDiv({ attr: { style: 'display: flex; flex-direction: column; overflow: hidden;' } });
                titleBox.createDiv({ text: comp.manifest.name, attr: { style: 'font-weight: 600; font-size: 15px; color: var(--text-normal); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' } });
                
                card.createDiv({ text: comp.folder.path, attr: { style: 'font-size: 11px; color: var(--text-muted); font-family: var(--font-monospace); padding: 6px 8px; background: var(--background-modifier-form-field); border-radius: 6px; margin-bottom: 16px; word-break: break-all; border: 1px solid var(--background-modifier-border);' } });
                

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const requestedPerms: string[] = (comp.manifest as any).permissions || [];
                
                if (requestedPerms.length > 0) {
                    const privacyBox = card.createDiv({ attr: { style: 'display: flex; flex-direction: column; margin-top: 12px; border-top: 1px solid var(--background-modifier-border); padding-top: 12px;' } });
                    privacyBox.createDiv({ text: 'Privacy & Security (Aegis)', attr: { style: 'font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px;' } });
                    
                    if (!this.plugin.settings.componentPermissions) {
                        this.plugin.settings.componentPermissions = {};
                    }
                    const perms = this.plugin.settings.componentPermissions[comp.manifest.name] || {};
                    
                    requestedPerms.forEach(permType => {
                        let name = permType;
                        let desc = '';
                        if (permType === 'fs') { name = 'Filesystem Storage'; desc = 'Allow access to Vault'; }
                        else if (permType === 'keychain') { name = 'Keychain & Security'; desc = 'Allow access to Credentials'; }
                        else if (permType === 'network') { name = 'Network Access'; desc = 'Allow outbound connections'; }
                        
                        new Setting(privacyBox)
                            .setName(name)
                            .setDesc(desc)
                            .addToggle(toggle => toggle
                                .setValue(perms[permType] === true)
                                .onChange(async (val) => {
                                    if (!this.plugin.settings.componentPermissions[comp.manifest.name]) {
                                        this.plugin.settings.componentPermissions[comp.manifest.name] = {};
                                    }
                                    this.plugin.settings.componentPermissions[comp.manifest.name][permType] = val;
                                    await this.plugin.saveSettings();
                                }));
                    });
                }

                const footer = card.createDiv({ attr: { style: 'display: flex; justify-content: flex-end; margin-top: 16px;' } });

                const reloadBtn = footer.createEl('button', { text: 'Reload', attr: { style: 'background: transparent; color: var(--text-accent); border: 1px solid var(--text-accent); padding: 4px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; margin-right: 8px;' } });
                
                reloadBtn.addEventListener('mouseenter', () => {
                    reloadBtn.style.background = 'var(--text-accent)';
                    reloadBtn.style.color = 'var(--text-on-accent)';
                });
                reloadBtn.addEventListener('mouseleave', () => {
                    reloadBtn.style.background = 'transparent';
                    reloadBtn.style.color = 'var(--text-accent)';
                });

                reloadBtn.onclick = async () => {
                    reloadBtn.setText('Reloading...');
                    reloadBtn.style.opacity = '0.5';
                    reloadBtn.disabled = true;
                    try {
                        await this.plugin.refreshCache();
                        void this.renderUI();
                        new Notice(`Reloaded ${comp.manifest.name}! Re-open the view to see changes.`);
                    } catch (e) {
                        console.error(e);
                        new Notice(`Failed to reload component: ${String(e)}`);
                        reloadBtn.setText('Reload');
                        reloadBtn.style.opacity = '1';
                        reloadBtn.disabled = false;
                    }
                };

                const delBtn = footer.createEl('button', { text: 'Purge', attr: { style: 'background: transparent; color: var(--text-error); border: 1px solid var(--text-error); padding: 4px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;' } });
                
                delBtn.addEventListener('mouseenter', () => {
                    delBtn.style.background = 'var(--text-error)';
                    delBtn.style.color = 'var(--text-on-accent)';
                });
                delBtn.addEventListener('mouseleave', () => {
                    delBtn.style.background = 'transparent';
                    delBtn.style.color = 'var(--text-error)';
                });

                delBtn.onclick = async () => {
                    delBtn.setText('Purging...');
                    delBtn.style.opacity = '0.5';
                    delBtn.disabled = true;
                    try {
                        await this.plugin.app.vault.trash(comp.folder, true);
                        new Notice(`Mathematically annihilated ${comp.manifest.name}`);
                        await this.plugin.refreshCache();
                        void this.renderUI();
                    } catch (e) {
                        console.error(e);
                        new Notice(`Failed to purge component: ${String(e)}`);
                        delBtn.setText('Purge');
                        delBtn.style.opacity = '1';
                        delBtn.disabled = false;
                    }
                };
            });
        }
    }
}
