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
    setIcon,
    requestUrl
} from 'obsidian';
import * as preact from 'preact';

function applyStyles(el: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
    Object.assign(el.style, styles);
}

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
};

interface GrexManifest {
    name: string;
    description?: string;
    entrypoint: string;
    icon?: string;
    permissions?: string[];
    dependencies?: {
        mac?: string[];
        windows?: string[];
        linux?: string[];
        npm?: string[];
        python?: string[];
        custom?: string[];
        brew?: string[];
    };
}

interface ComponentData {
    folder: TFolder;
    manifest: GrexManifest;
    _mtime?: number;
}

interface SecretStorageInterface {
    listSecrets?: () => Promise<string[]>;
    secrets?: Record<string, string>;
    getSecret?: (key: string) => Promise<string | null>;
    setSecret?: (key: string, val: string) => Promise<void>;
    deleteSecret?: (key: string) => Promise<void>;
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
        
        contentEl.createEl("h2", { text: "Component Dependencies & Environment" });
        const subtitle = contentEl.createEl("p", { text: "Active component requirements indexed in this vault." });
        subtitle.addClass("grex-text-muted");

        this.logContainer = contentEl.createDiv();
        this.logContainer.addClass("grex-log-container");

        this.log("Auditing installed component dependencies...");
        this.displaySummary();
    }

    log(msg: string, colorClass: string = "") {
        const line = this.logContainer.createDiv({ text: msg });
        line.addClass("grex-log-line");
        if (colorClass) {
            line.addClass(colorClass);
        }
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }

    displaySummary() {
        let totalDeps = 0;
        this.manifestCache.forEach(comp => {
            const deps = comp.manifest.dependencies;
            if (deps) {
                this.log(`\n📦 ${comp.manifest.name} (${comp.folder.path})`, "grex-log-blue");
                if (deps.npm && deps.npm.length > 0) {
                    this.log(`  • NPM: ${deps.npm.join(", ")}`);
                    totalDeps += deps.npm.length;
                }
                if (deps.python && deps.python.length > 0) {
                    this.log(`  • Python: ${deps.python.join(", ")}`);
                    totalDeps += deps.python.length;
                }
                if (deps.mac && deps.mac.length > 0) {
                    this.log(`  • macOS: ${deps.mac.join(", ")}`);
                    totalDeps += deps.mac.length;
                }
                if (deps.windows && deps.windows.length > 0) {
                    this.log(`  • Windows: ${deps.windows.join(", ")}`);
                    totalDeps += deps.windows.length;
                }
            }
        });

        if (totalDeps === 0) {
            this.log("\nAll installed components run directly inside Obsidian without external packages.", "grex-log-green");
        } else {
            this.log(`\nAudit complete: ${totalDeps} dependencies cataloged.`, "grex-log-green");
        }
    }

    onClose() {
        this.contentEl.empty();
    }
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

    renderSuggestion(match: { item: ComponentData }, el: HTMLElement) {
        el.empty();
        const comp = match.item;
        const container = el.createDiv();
        applyStyles(container, { display: 'flex', flexDirection: 'column', gap: '4px' });
        
        const titleEl = container.createDiv();
        applyStyles(titleEl, { fontWeight: '500' });
        super.renderSuggestion(match, titleEl);
        
        const pathEl = container.createDiv({ text: comp.folder.path });
        applyStyles(pathEl, { fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-monospace)', opacity: '0.7' });
    }

    onChooseItem(comp: ComponentData): void {
        this.onChoose(comp);
    }
}

async function loadComponentBundle(container: HTMLElement, componentData: ComponentData, app: App, plugin: GrexNexusPlugin): Promise<() => void> {
    const entrypointPath = `${componentData.folder.path}/${componentData.manifest.entrypoint}`;
    const bundleExists = await app.vault.adapter.exists(entrypointPath);

    if (!bundleExists) {
        throw new Error(`Entrypoint not found: ${entrypointPath}`);
    }

    const checkPermission = (type: string) => {
        const id = componentData.manifest.name;
        const perms = plugin.settings.componentPermissions?.[id];
        if (!perms || perms[type] !== true) {
            new Notice(`[Access Control] Access Denied: ${id} attempted to access ${type}. Permission must be granted in Settings.`);
            throw new Error(`Permission Denied: ${type} is locked for ${id}.`);
        }
    };

    const platformAPI = {
        env: { type: 'obsidian' },
        cli: {
            exec: async (endpoint: string) => {
                checkPermission('cli');
                try {
                    const res = await requestUrl({ url: `http://127.0.0.1:7777/exec?cmd=${encodeURIComponent(endpoint)}` });
                    return { stdout: res.text, stderr: "", code: 0 };
                } catch (e: unknown) {
                    return { stdout: "", stderr: String(e), code: 1 };
                }
            }
        },
        hermes: {
            ensureServer: async (port: number = 7777) => {
                checkPermission('cli');
                try {
                    const res = await requestUrl({ url: `http://127.0.0.1:${port}/health` });
                    return res.status === 200;
                } catch {
                    return false;
                }
            }
        },
        workspace: {
            popoutLeaf: () => {
                const targetLeaf = app.workspace.getLeavesOfType(VIEW_TYPE_GREX).find(l => {
                    return l.view instanceof GrexComponentView && l.view.componentData?.manifest.name === componentData.manifest.name;
                }) || app.workspace.getActiveViewOfType(GrexComponentView)?.leaf;
                if (targetLeaf) {
                    const workspaceExtended = app.workspace as unknown as { moveLeafToPopout?: (leaf: WorkspaceLeaf) => void };
                    if (typeof workspaceExtended.moveLeafToPopout === 'function') {
                        workspaceExtended.moveLeafToPopout(targetLeaf);
                        new Notice(`Detached ${componentData.manifest.name} into native pop-out panel!`);
                    }
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
                return file instanceof TFile ? app.vault.getResourcePath(file) : null;
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
                const storage = (app as unknown as { secretStorage?: SecretStorageInterface }).secretStorage;
                if (storage && typeof storage.listSecrets === 'function') {
                    return await storage.listSecrets();
                } else if (storage && storage.secrets) {
                    return Object.keys(storage.secrets);
                }
                return [];
            },
            get: async (key: string) => {
                checkPermission('keychain');
                const storage = (app as unknown as { secretStorage?: SecretStorageInterface }).secretStorage;
                if (storage && typeof storage.getSecret === 'function') {
                    return await storage.getSecret(key);
                }
                const saved = app.loadLocalStorage("grex_" + key);
                return typeof saved === 'string' ? saved : null;
            },
            set: async (key: string, val: string) => {
                checkPermission('keychain');
                const storage = (app as unknown as { secretStorage?: SecretStorageInterface }).secretStorage;
                if (storage && typeof storage.setSecret === 'function') {
                    await storage.setSecret(key, val);
                } else {
                    app.saveLocalStorage("grex_" + key, val);
                }
            },
            delete: async (key: string) => {
                checkPermission('keychain');
                const storage = (app as unknown as { secretStorage?: SecretStorageInterface }).secretStorage;
                if (storage && typeof storage.deleteSecret === 'function') {
                    await storage.deleteSecret(key);
                } else {
                    app.saveLocalStorage("grex_" + key, "");
                }
            }
        }
    };

    const winExtended = window as unknown as { grexPlatformAPI?: typeof platformAPI };
    winExtended.grexPlatformAPI = platformAPI;

    const bundleFile = app.vault.getAbstractFileByPath(entrypointPath);
    if (!(bundleFile instanceof TFile)) {
        throw new Error(`Entrypoint not found: ${entrypointPath}`);
    }
    const bundleUrl = `${app.vault.getResourcePath(bundleFile)}?t=${Date.now()}`;

    const importUrl = bundleUrl;

    interface ComponentModule {
        mount_app?: (container: HTMLElement, props: Record<string, unknown>) => (() => void) | void;
        default?: (container: HTMLElement, props: Record<string, unknown>) => (() => void) | void;
    }

    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- Required for dynamic ESM bundle loading inside Obsidian tab host
    const dynamicImport = new Function('url', 'return import(url);') as (url: string) => Promise<ComponentModule>;
    const module = await dynamicImport(importUrl);
    const mountFn = module.mount_app || module.default;

    if (typeof mountFn !== 'function') {
        throw new Error(`Bundle at ${entrypointPath} does not export a mount_app function.`);
    }

    const unmountResult = mountFn(container, {
        app,
        plugin,
        componentData,
        platformAPI,
        preact
    });

    return typeof unmountResult === 'function' ? unmountResult : () => {};
}

class GrexComponentView extends ItemView {
    componentData: ComponentData | null = null;
    plugin: GrexNexusPlugin;
    unmountFn: (() => void) | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: GrexNexusPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_GREX;
    }

    getDisplayText(): string {
        return this.componentData ? this.componentData.manifest.name : "GREX Component";
    }

    getIcon(): string {
        return this.componentData?.manifest.icon || "box";
    }

    setComponentData(data: ComponentData) {
        this.componentData = data;
    }

    async onOpen() {
        const container = this.contentEl;
        container.empty();
        container.addClass("grex-nexus-view-container");

        if (!this.componentData) {
            const emptyEl = container.createDiv({ text: "No component loaded." });
            applyStyles(emptyEl, { padding: "20px", color: "var(--text-muted)" });
            return;
        }

        try {
            if (this.unmountFn) {
                this.unmountFn();
                this.unmountFn = null;
            }
            this.unmountFn = await loadComponentBundle(container, this.componentData, this.app, this.plugin);
        } catch (err: unknown) {
            container.empty();
            const errBox = container.createDiv();
            applyStyles(errBox, { padding: "20px", color: "var(--text-error)" });
            errBox.createEl("h3", { text: "Component Load Error" });
            errBox.createEl("pre", { text: String(err) });
        }
    }

    async onClose() {
        if (this.unmountFn) {
            this.unmountFn();
            this.unmountFn = null;
        }
        this.contentEl.empty();
    }
}

class GrexDashboardView extends ItemView {
    plugin: GrexNexusPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: GrexNexusPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_GREX_DASHBOARD;
    }

    getDisplayText(): string {
        return "GREX Dashboard";
    }

    getIcon(): string {
        return "layout-dashboard";
    }

    async onOpen() {
        const container = this.contentEl;
        container.empty();
        container.addClass("grex-nexus-view-container");

        const header = container.createDiv();
        applyStyles(header, { padding: "16px", borderBottom: "1px solid var(--background-modifier-border)" });
        header.createEl("h2", { text: "GREX Dashboard" });
        const sub = header.createEl("p", { text: "Manage and launch active vault micro-applications." });
        sub.addClass("grex-text-muted");

        const grid = container.createDiv();
        applyStyles(grid, { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px", padding: "16px" });

        this.plugin.manifestCache.forEach(comp => {
            const card = grid.createDiv();
            card.addClass("grex-nexus-component-card");
            
            const cardHeader = card.createDiv();
            applyStyles(cardHeader, { display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" });
            
            const iconSpan = cardHeader.createDiv();
            setIcon(iconSpan, comp.manifest.icon || "package");
            cardHeader.createEl("strong", { text: comp.manifest.name });

            if (comp.manifest.description) {
                const desc = card.createEl("p", { text: comp.manifest.description });
                desc.addClass("grex-text-muted");
            }

            const btn = card.createEl("button", { text: "Open Component" });
            btn.onclick = () => {
                void this.plugin.activateComponentView(comp);
            };
        });
    }
}

export default class GrexNexusPlugin extends Plugin {
    settings: GrexNexusSettings;
    manifestCache: Map<string, ComponentData> = new Map();

    async onload() {
        await this.loadSettings();

        this.registerView(VIEW_TYPE_GREX, (leaf) => new GrexComponentView(leaf, this));
        this.registerView(VIEW_TYPE_GREX_DASHBOARD, (leaf) => new GrexDashboardView(leaf, this));

        this.addRibbonIcon("boxes", "Launch Component", () => {
            this.openComponentSelector();
        });

        this.addCommand({
            id: "open-component-selector",
            name: "Launch Component",
            callback: () => {
                this.openComponentSelector();
            }
        });

        this.addCommand({
            id: "open-grex-dashboard",
            name: "Open Dashboard",
            callback: () => {
                void this.activateDashboard();
            }
        });

        this.addCommand({
            id: "provision-dependencies",
            name: "Component Dependencies",
            callback: () => {
                new ProvisioningModal(this.app, this.manifestCache).open();
            }
        });

        this.registerMarkdownCodeBlockProcessor("grex-component", (source, el, ctx) => {
            this.renderComponentCodeBlock(source, el, ctx);
        });

        this.addSettingTab(new GrexNexusSettingTab(this.app, this));

        await this.refreshCache();
    }

    async loadSettings() {
        const loadedData = await this.loadData() as Partial<GrexNexusSettings> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async refreshCache() {
        this.manifestCache.clear();
        
        for (const compsDir of ['components', 'GREX.datacore/components']) {
            try {
                if (await this.app.vault.adapter.exists(compsDir)) {
                    const listResult = await this.app.vault.adapter.list(compsDir);
                    for (const folderPath of listResult.folders) {
                        const grexJsonPath = `${folderPath}/grex.json`;
                        const manifestJsonPath = `${folderPath}/manifest.json`;
                        
                        let manifest: GrexManifest | null = null;
                        const targetJsonPath = (await this.app.vault.adapter.exists(grexJsonPath)) 
                            ? grexJsonPath 
                            : (await this.app.vault.adapter.exists(manifestJsonPath)) 
                                ? manifestJsonPath 
                                : null;

                        if (targetJsonPath) {
                            try {
                                const content = await this.app.vault.adapter.read(targetJsonPath);
                                manifest = JSON.parse(content) as GrexManifest;
                                if (!manifest.entrypoint) {
                                    manifest.entrypoint = "dist/bundle.es.js";
                                }
                            } catch {
                                // Silent fallback on parse error
                            }
                        }

                        if (manifest && manifest.name) {
                            const folderObj = this.app.vault.getAbstractFileByPath(folderPath);
                            if (folderObj instanceof TFolder) {
                                this.manifestCache.set(folderPath, {
                                    folder: folderObj,
                                    manifest
                                });
                            }
                        }
                    }
                }
            } catch {
                // Directory scan fallback
            }
        }
    }

    openComponentSelector() {
        const components = Array.from(this.manifestCache.values());
        if (components.length === 0) {
            new Notice("No GREX components found in vault. Place components inside components/ or GREX.datacore/components/.");
            return;
        }

        new ComponentSelectorModal(this.app, components, (comp) => {
            void this.activateComponentView(comp);
        }).open();
    }

    async activateComponentView(componentData: ComponentData) {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_GREX);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getLeaf('tab');
            if (leaf) {
                await leaf.setViewState({ type: VIEW_TYPE_GREX, active: true });
            }
        }

        if (leaf && leaf.view instanceof GrexComponentView) {
            leaf.view.setComponentData(componentData);
            await leaf.view.onOpen();
            workspace.setActiveLeaf(leaf, { focus: true });
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
            workspace.setActiveLeaf(leaf, { focus: true });
        }
    }

    renderComponentCodeBlock(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext) {
        el.empty();
        const trimmed = source.trim();
        let targetComponent: ComponentData | null = null;

        for (const comp of this.manifestCache.values()) {
            if (comp.manifest.name.toLowerCase() === trimmed.toLowerCase() || comp.folder.path === trimmed) {
                targetComponent = comp;
                break;
            }
        }

        if (!targetComponent) {
            const errDiv = el.createDiv({ text: `GREX Component not found: "${trimmed}"` });
            applyStyles(errDiv, { padding: "10px", color: "var(--text-error)" });
            return;
        }

        const container = el.createDiv();
        container.addClass("grex-nexus-view-container");
        applyStyles(container, { minHeight: "350px", position: "relative" });

        void loadComponentBundle(container, targetComponent, this.app, this);
    }
}

class GrexNexusSettingTab extends PluginSettingTab {
    plugin: GrexNexusPlugin;

    constructor(app: App, plugin: GrexNexusPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    getSettingDefinitions() {
        return [
            {
                id: 'githubToken',
                name: 'GitHub Personal Access Token',
                description: 'Used for downloading components from private or rate-limited repositories.'
            },
            {
                id: 'targetFolder',
                name: 'Component Installation Folder',
                description: 'Vault directory where remote components are indexed.'
            }
        ];
    }

    display(): void {
        this.renderSettings();
    }

    renderSettings(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName("Configuration")
            .setHeading();

        new Setting(containerEl)
            .setName("GitHub Personal Access Token")
            .setDesc("Used for pulling release assets.")
            .addText(text => text
                .setPlaceholder("ghp_...")
                .setValue(this.plugin.settings.githubToken)
                .onChange(async (value) => {
                    this.plugin.settings.githubToken = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Component Installation Folder")
            .setDesc("Directory path where components are indexed.")
            .addText(text => text
                .setValue(this.plugin.settings.targetFolder)
                .onChange(async (value) => {
                    this.plugin.settings.targetFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Installed Components")
            .setHeading();

        const uniqueComponents = Array.from(this.plugin.manifestCache.values());

        if (uniqueComponents.length === 0) {
            const noComps = containerEl.createEl('p', { text: 'No native components installed.' });
            applyStyles(noComps, { color: 'var(--text-muted)', padding: '20px', textAlign: 'center' });
        } else {
            const libraryContainer = containerEl.createDiv();
            applyStyles(libraryContainer, { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', padding: '10px 0' });

            uniqueComponents.forEach(comp => {
                const card = libraryContainer.createDiv();
                card.addClass("grex-nexus-component-card");

                const header = card.createDiv();
                applyStyles(header, { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' });
                
                const iconBox = header.createDiv();
                applyStyles(iconBox, { width: '36px', height: '36px', borderRadius: '8px', background: 'var(--background-modifier-form-field)', display: 'flex', alignItems: 'center', justifyContent: 'center' });
                setIcon(iconBox, comp.manifest.icon || 'package');

                const titleBox = header.createDiv();
                titleBox.createDiv({ text: comp.manifest.name });

                const pathBox = card.createDiv({ text: comp.folder.path });
                pathBox.addClass("grex-text-muted");

                const requestedPerms: string[] = comp.manifest.permissions || [];
                if (requestedPerms.length > 0) {
                    const privacyBox = card.createDiv();
                    applyStyles(privacyBox, { marginTop: '12px', borderTop: '1px solid var(--background-modifier-border)', paddingTop: '12px' });
                    privacyBox.createDiv({ text: 'Privacy & Security' });
                    
                    const perms = this.plugin.settings.componentPermissions[comp.manifest.name] || {};
                    
                    requestedPerms.forEach(permType => {
                        let name = permType;
                        let desc = '';
                        if (permType === 'fs') { name = 'Filesystem Storage'; desc = 'Allow access to Vault'; }
                        else if (permType === 'keychain') { name = 'Keychain & Security'; desc = 'Allow access to Credentials'; }
                        else if (permType === 'cli') { name = 'Terminal & CLI'; desc = 'Allow command execution'; }
                        
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

                const footer = card.createDiv();
                applyStyles(footer, { display: 'flex', justifyContent: 'flex-end', marginTop: '16px', gap: '8px' });

                new ButtonComponent(footer)
                    .setButtonText("Purge")
                    .setDestructive()
                    .onClick(async () => {
                        await this.app.fileManager.trashFile(comp.folder);
                        new Notice(`Removed ${comp.manifest.name}`);
                        await this.plugin.refreshCache();
                        this.renderSettings();
                    });
            });
        }
    }
}
