const vscode = require('vscode');
const { PRESET_COLORS, hashStringToColor, buildColorCustomizations } = require('./colorUtils');
const { normalizePath, findMatchingRule } = require('./ruleMatcher');
const { getInstalledThemes, getDeterministicThemeForSeed, promptSelectTheme, RECOMMENDED_THEMES } = require('./themeManager');

let statusBarItem = null;

/**
 * Extension entry point.
 * @param {vscode.ExtensionContext} context 
 */
function activate(context) {
    // 1. Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'workspaceChameleon.menu';
    context.subscriptions.push(statusBarItem);

    // 2. Register all commands
    context.subscriptions.push(
        vscode.commands.registerCommand('workspaceChameleon.refresh', () => applyThemeForCurrentWorkspace(true)),
        vscode.commands.registerCommand('workspaceChameleon.menu', showQuickMenu),
        vscode.commands.registerCommand('workspaceChameleon.setThemeForCurrentFolder', setThemeForCurrentFolder),
        vscode.commands.registerCommand('workspaceChameleon.setAccentColorForCurrentFolder', setAccentColorForCurrentFolder),
        vscode.commands.registerCommand('workspaceChameleon.autoAssignTheme', autoAssignThemeForCurrentFolder),
        vscode.commands.registerCommand('workspaceChameleon.generateUniqueColor', generateUniqueColorForCurrentFolder),
        vscode.commands.registerCommand('workspaceChameleon.browsePopularThemes', browsePopularThemes),
        vscode.commands.registerCommand('workspaceChameleon.clearFolderRule', clearFolderRule),
        vscode.commands.registerCommand('workspaceChameleon.openSettings', openSettings)
    );

    // 3. Listen for workspace changes & configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => applyThemeForCurrentWorkspace()),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('workspaceChameleon')) {
                applyThemeForCurrentWorkspace();
            }
        })
    );

    // 4. Initial check
    applyThemeForCurrentWorkspace();
}

/**
 * Gets current active workspace folder info.
 */
function getCurrentWorkspaceInfo() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return null;
    }
    const folder = folders[0];
    return {
        name: folder.name,
        uri: folder.uri,
        path: folder.uri.fsPath
    };
}

/**
 * Main logic to evaluate rules and apply theme/colors.
 * @param {boolean} showNotification 
 */
async function applyThemeForCurrentWorkspace(showNotification = false) {
    const config = vscode.workspace.getConfiguration('workspaceChameleon');
    const enabled = config.get('enabled', true);
    if (!enabled) {
        updateStatusBar(null);
        return;
    }

    const ws = getCurrentWorkspaceInfo();
    if (!ws) {
        updateStatusBar(null);
        return;
    }

    const rules = config.get('rules', []);
    const autoPalette = config.get('autoGeneratePalette', true);
    const autoThemeFromInstalled = config.get('autoAssignFromInstalledThemes', false);
    const mode = config.get('mode', 'both'); // 'theme', 'accent', 'both'
    const matchingRule = findMatchingRule(ws.path, ws.name, rules);

    const workbenchConfig = vscode.workspace.getConfiguration('workbench');
    let activeTheme = null;
    let activeColor = null;

    if (matchingRule) {
        // 1. Apply Theme from Rule
        if ((mode === 'theme' || mode === 'both') && matchingRule.theme) {
            const currentTheme = workbenchConfig.get('colorTheme');
            if (currentTheme !== matchingRule.theme) {
                await workbenchConfig.update('colorTheme', matchingRule.theme, vscode.ConfigurationTarget.Global);
            }
            activeTheme = matchingRule.theme;
        }

        // 2. Apply Icon Theme from Rule
        if (matchingRule.iconTheme) {
            const currentIconTheme = workbenchConfig.get('iconTheme');
            if (currentIconTheme !== matchingRule.iconTheme) {
                await workbenchConfig.update('iconTheme', matchingRule.iconTheme, vscode.ConfigurationTarget.Global);
            }
        }

        // 3. Apply Accent Color from Rule
        if (mode === 'accent' || mode === 'both') {
            if (matchingRule.accentColor) {
                const customColors = buildColorCustomizations(matchingRule.accentColor);
                await workbenchConfig.update('colorCustomizations', customColors, vscode.ConfigurationTarget.Global);
                activeColor = matchingRule.accentColor;
            } else if (matchingRule.colorCustomizations) {
                await workbenchConfig.update('colorCustomizations', matchingRule.colorCustomizations, vscode.ConfigurationTarget.Global);
            }
        }
    } else {
        // Unmapped folder: Check automatic assignment options
        if (autoThemeFromInstalled && (mode === 'theme' || mode === 'both')) {
            const chosenTheme = getDeterministicThemeForSeed(ws.path);
            if (chosenTheme) {
                const currentTheme = workbenchConfig.get('colorTheme');
                if (currentTheme !== chosenTheme.label) {
                    await workbenchConfig.update('colorTheme', chosenTheme.label, vscode.ConfigurationTarget.Global);
                }
                activeTheme = chosenTheme.label;
            }
        }

        if (autoPalette && (mode === 'accent' || mode === 'both')) {
            const generatedHex = hashStringToColor(ws.path);
            const customColors = buildColorCustomizations(generatedHex);
            await workbenchConfig.update('colorCustomizations', customColors, vscode.ConfigurationTarget.Global);
            activeColor = generatedHex;
        }
    }

    updateStatusBar({
        folderName: ws.name,
        theme: activeTheme || workbenchConfig.get('colorTheme'),
        accentColor: activeColor,
        isRuleMatched: !!matchingRule
    });

    if (showNotification) {
        const msg = matchingRule
            ? `Chameleon: Adapted to "${ws.name}" (${activeTheme || activeColor})`
            : `Chameleon: Auto-adapted habitat colors for "${ws.name}"`;
        vscode.window.showInformationMessage(msg);
    }
}

/**
 * Updates status bar with current folder theme info.
 */
function updateStatusBar(status) {
    const config = vscode.workspace.getConfiguration('workspaceChameleon');
    if (!config.get('showStatusBarItem', true) || !status) {
        statusBarItem.hide();
        return;
    }

    const indicator = status.isRuleMatched ? '⚡' : '🦎';
    statusBarItem.text = `${indicator} ${status.folderName} (${status.theme || status.accentColor || 'Chameleon'})`;
    statusBarItem.tooltip = `Workspace: ${status.folderName}\nTheme: ${status.theme || 'Default'}\nAccent: ${status.accentColor || 'None'}\nClick to open Workspace Chameleon Menu`;
    statusBarItem.show();
}

/**
 * Quick Pick Interactive Menu
 */
async function showQuickMenu() {
    const ws = getCurrentWorkspaceInfo();
    if (!ws) {
        vscode.window.showInformationMessage('Workspace Chameleon: Open a folder or workspace first.');
        return;
    }

    const items = [
        { label: '$(paintcan) Select Theme for this Folder', action: setThemeForCurrentFolder, description: 'Pick from installed themes or download new ones' },
        { label: '$(symbol-color) Set Accent Color for this Folder', action: setAccentColorForCurrentFolder, description: 'Customize Titlebar & Statusbar colors' },
        { label: '$(symbol-event) Auto-Assign Theme from Installed Library', action: autoAssignThemeForCurrentFolder, description: 'Pick a distinct installed theme for this folder' },
        { label: '$(sparkle) Auto-Generate Unique Color Palette', action: generateUniqueColorForCurrentFolder, description: 'Generate unique harmonic colors based on folder name' },
        { label: '$(cloud-download) Discover Popular Themes (Marketplace)', action: browsePopularThemes, description: 'One-click install recommended themes' },
        { label: '$(trash) Clear Rule for this Folder', action: clearFolderRule, description: 'Remove custom rule and restore defaults' },
        { label: '$(gear) Open Extension Settings', action: openSettings, description: 'View & edit workspaceChameleon configuration' }
    ];

    const pick = await vscode.window.showQuickPick(items, {
        placeHolder: `🦎 Workspace Chameleon Actions for: ${ws.name}`
    });

    if (pick && pick.action) {
        await pick.action();
    }
}

/**
 * Prompts user to pick from installed themes (or download) and associates with current folder.
 */
async function setThemeForCurrentFolder() {
    const ws = getCurrentWorkspaceInfo();
    if (!ws) return;

    const selectedTheme = await promptSelectTheme(ws.name);
    if (!selectedTheme) return;

    await upsertRuleForCurrentFolder({ theme: selectedTheme });
    vscode.window.showInformationMessage(`Workspace Chameleon: Adapted theme "${selectedTheme}" for "${ws.name}"!`);
    await applyThemeForCurrentWorkspace();
}

/**
 * Automatically assigns a theme from the user's installed extensions based on folder hash.
 */
async function autoAssignThemeForCurrentFolder() {
    const ws = getCurrentWorkspaceInfo();
    if (!ws) return;

    const chosenTheme = getDeterministicThemeForSeed(ws.path);
    if (!chosenTheme) {
        vscode.window.showWarningMessage('No installed color themes found.');
        return;
    }

    await upsertRuleForCurrentFolder({ theme: chosenTheme.label });
    vscode.window.showInformationMessage(`Workspace Chameleon: Assigned theme "${chosenTheme.label}" to "${ws.name}"!`);
    await applyThemeForCurrentWorkspace();
}

/**
 * Set an accent color for the current workspace folder.
 */
async function setAccentColorForCurrentFolder() {
    const ws = getCurrentWorkspaceInfo();
    if (!ws) return;

    const quickPickItems = PRESET_COLORS.map(c => ({
        label: `${c.name}`,
        description: c.hex,
        hex: c.hex
    }));

    quickPickItems.push({
        label: '$(color-mode) Custom HEX Color...',
        description: 'Enter a custom #RRGGBB hex code',
        hex: 'custom'
    });

    const selected = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: `Choose an accent color for "${ws.name}"`
    });

    if (!selected) return;

    let finalHex = selected.hex;
    if (finalHex === 'custom') {
        const inputHex = await vscode.window.showInputBox({
            prompt: 'Enter HEX color code (e.g. #7952d6, #0ea5e9, #10b981)',
            validateInput: val => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(val) ? null : 'Please enter a valid HEX color (e.g. #7952d6)'
        });
        if (!inputHex) return;
        finalHex = inputHex.trim();
    }

    await upsertRuleForCurrentFolder({ accentColor: finalHex });
    vscode.window.showInformationMessage(`Workspace Chameleon: Saved accent color ${finalHex} for "${ws.name}"!`);
    await applyThemeForCurrentWorkspace();
}

/**
 * Generate a unique color and save rule.
 */
async function generateUniqueColorForCurrentFolder() {
    const ws = getCurrentWorkspaceInfo();
    if (!ws) return;

    const hex = hashStringToColor(ws.path + Date.now().toString());
    await upsertRuleForCurrentFolder({ accentColor: hex });
    vscode.window.showInformationMessage(`Workspace Chameleon: Generated unique accent color ${hex} for "${ws.name}"!`);
    await applyThemeForCurrentWorkspace();
}

/**
 * Opens quick pick with recommended marketplace themes for 1-click install.
 */
async function browsePopularThemes() {
    const items = RECOMMENDED_THEMES.map(rec => {
        const isInstalled = vscode.extensions.getExtension(rec.id);
        return {
            label: `${isInstalled ? '$(check) ' : '$(cloud-download) '}${rec.name}`,
            description: isInstalled ? 'Installed' : rec.id,
            detail: rec.description,
            extensionId: rec.id,
            isInstalled: !!isInstalled
        };
    });

    items.push({
        label: '$(search) Search all themes on Marketplace...',
        description: '@category:"themes"',
        action: 'search_all'
    });

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a theme to install or search marketplace'
    });

    if (!selected) return;

    if (selected.action === 'search_all') {
        vscode.commands.executeCommand('workbench.extensions.search', '@category:"themes"');
        return;
    }

    if (selected.extensionId) {
        if (selected.isInstalled) {
            vscode.window.showInformationMessage(`${selected.label} is already installed!`);
        } else {
            vscode.window.showInformationMessage(`Installing ${selected.extensionId}...`);
            await vscode.commands.executeCommand('workbench.extensions.installExtension', selected.extensionId);
            vscode.window.showInformationMessage(`Installed! You can now assign it to any folder.`);
        }
    }
}

/**
 * Helper to update or insert a rule for current folder in settings.
 */
async function upsertRuleForCurrentFolder(updates) {
    const ws = getCurrentWorkspaceInfo();
    if (!ws) return;

    const config = vscode.workspace.getConfiguration('workspaceChameleon');
    const rules = [...config.get('rules', [])];
    const normWsPath = normalizePath(ws.path);

    const existingIndex = rules.findIndex(r => r.path && normalizePath(r.path) === normWsPath);

    if (existingIndex >= 0) {
        rules[existingIndex] = { ...rules[existingIndex], ...updates };
    } else {
        rules.push({
            path: ws.path.replace(/\\/g, '/'),
            folderName: ws.name,
            ...updates
        });
    }

    await config.update('rules', rules, vscode.ConfigurationTarget.Global);
}

/**
 * Clear the rule for current workspace folder.
 */
async function clearFolderRule() {
    const ws = getCurrentWorkspaceInfo();
    if (!ws) return;

    const config = vscode.workspace.getConfiguration('workspaceChameleon');
    const rules = config.get('rules', []);
    const normWsPath = normalizePath(ws.path);

    const filtered = rules.filter(r => {
        if (r.path && normalizePath(r.path) === normWsPath) return false;
        if (r.folderName && r.folderName.toLowerCase() === ws.name.toLowerCase()) return false;
        return true;
    });

    await config.update('rules', filtered, vscode.ConfigurationTarget.Global);
    
    // Clear color customizations
    const workbenchConfig = vscode.workspace.getConfiguration('workbench');
    await workbenchConfig.update('colorCustomizations', undefined, vscode.ConfigurationTarget.Global);

    vscode.window.showInformationMessage(`Workspace Chameleon: Cleared rule for "${ws.name}".`);
    await applyThemeForCurrentWorkspace();
}

/**
 * Opens settings UI / JSON for workspaceChameleon
 */
function openSettings() {
    vscode.commands.executeCommand('workbench.action.openSettings', 'workspaceChameleon');
}

function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}

module.exports = {
    activate,
    deactivate
};
