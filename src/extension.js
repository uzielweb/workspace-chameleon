const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { PRESET_COLORS, hashStringToColor, buildColorCustomizations } = require('./colorUtils');
const { normalizePath, findMatchingRule } = require('./ruleMatcher');
const { getInstalledThemes, getDeterministicThemeForSeed, getRandomInstalledTheme, promptSelectTheme, RECOMMENDED_THEMES } = require('./themeManager');

let statusBarItem = null;
let isApplying = false;
let isInternalChange = false;

/**
 * Ensures .vscode/ is ignored locally in .git/info/exclude without modifying tracked files.
 */
function ensureGitExclude(workspacePath) {
    if (!workspacePath) return;
    try {
        const gitDir = path.join(workspacePath, '.git');
        if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
            const infoDir = path.join(gitDir, 'info');
            if (!fs.existsSync(infoDir)) {
                fs.mkdirSync(infoDir, { recursive: true });
            }
            const excludeFile = path.join(infoDir, 'exclude');
            let content = '';
            if (fs.existsSync(excludeFile)) {
                content = fs.readFileSync(excludeFile, 'utf8');
            }
            if (!content.includes('.vscode') && !content.includes('.vscode/')) {
                fs.appendFileSync(excludeFile, '\n# Workspace Chameleon auto-isolation\n.vscode/\n', 'utf8');
            }
        }
    } catch (e) {
        // Silent ignore
    }
}

const CHAMELEON_CUSTOMIZATION_KEYS = [
    "titleBar.activeBackground",
    "titleBar.activeForeground",
    "titleBar.inactiveBackground",
    "titleBar.inactiveForeground",
    "activityBar.background",
    "activityBar.foreground",
    "activityBar.inactiveForeground",
    "activityBarBadge.background",
    "activityBarBadge.foreground",
    "statusBar.background",
    "statusBar.foreground",
    "statusBarItem.hoverBackground",
    "statusBarItem.remoteBackground",
    "statusBarItem.remoteForeground",
    "tab.activeBorderTop",
    "tab.activeBorder"
];

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
        vscode.commands.registerCommand('workspaceChameleon.randomTheme', randomThemeForCurrentFolder),
        vscode.commands.registerCommand('workspaceChameleon.generateUniqueColor', generateUniqueColorForCurrentFolder),
        vscode.commands.registerCommand('workspaceChameleon.browsePopularThemes', browsePopularThemes),
        vscode.commands.registerCommand('workspaceChameleon.clearFolderRule', clearFolderRule),
        vscode.commands.registerCommand('workspaceChameleon.resetAllAccentColors', resetAllAccentColors),
        vscode.commands.registerCommand('workspaceChameleon.openSettings', openSettings)
    );

    // 3. Listen for workspace changes & configuration changes (with loop prevention)
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => applyThemeForCurrentWorkspace()),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (isInternalChange) return;
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
 * Safely removes only Chameleon-generated colorCustomizations from workbench config.
 */
async function clearChameleonColorCustomizations() {
    try {
        const workbenchConfig = vscode.workspace.getConfiguration('workbench');
        const inspect = workbenchConfig.inspect('colorCustomizations');
        
        if (inspect && inspect.globalValue && typeof inspect.globalValue === 'object') {
            const updated = { ...inspect.globalValue };
            let modified = false;
            for (const key of CHAMELEON_CUSTOMIZATION_KEYS) {
                if (key in updated) {
                    delete updated[key];
                    modified = true;
                }
            }
            if (modified) {
                const remaining = Object.keys(updated);
                await workbenchConfig.update(
                    'colorCustomizations',
                    remaining.length > 0 ? updated : undefined,
                    vscode.ConfigurationTarget.Global
                );
            }
        }

        if (inspect && inspect.workspaceValue && typeof inspect.workspaceValue === 'object') {
            const updated = { ...inspect.workspaceValue };
            let modified = false;
            for (const key of CHAMELEON_CUSTOMIZATION_KEYS) {
                if (key in updated) {
                    delete updated[key];
                    modified = true;
                }
            }
            if (modified) {
                const remaining = Object.keys(updated);
                await workbenchConfig.update(
                    'colorCustomizations',
                    remaining.length > 0 ? updated : undefined,
                    vscode.ConfigurationTarget.Workspace
                );
            }
        }
    } catch (e) {
        console.error('Workspace Chameleon: Error clearing color customizations', e);
    }
}

/**
 * Main logic to evaluate rules and apply theme/colors in a single clean pass.
 * @param {boolean} showNotification 
 */
async function applyThemeForCurrentWorkspace(showNotification = false) {
    if (isApplying) return;

    try {
        isApplying = true;
        isInternalChange = true;

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

        const workbenchConfig = vscode.workspace.getConfiguration('workbench');
        const currentWsTheme = workbenchConfig.inspect('colorTheme')?.workspaceValue;
        const currentWsColors = workbenchConfig.inspect('colorCustomizations')?.workspaceValue;

        const rules = config.get('rules', []) || [];
        const autoPalette = config.get('autoGeneratePalette', false);
        const autoThemeFromInstalled = config.get('autoAssignFromInstalledThemes', true);
        const mode = config.get('mode', 'theme'); // 'theme', 'accent', 'both'
        let matchingRule = findMatchingRule(ws.path, ws.name, rules);

        let activeTheme = null;
        let activeColor = null;

        // If local workspace settings already has a theme and no explicit rule exists, adopt it!
        if (currentWsTheme && !matchingRule) {
            matchingRule = {
                path: ws.path.replace(/\\/g, '/'),
                folderName: ws.name,
                theme: currentWsTheme
            };
            await upsertRuleForCurrentFolder({ theme: currentWsTheme });
        }

        // If still no rule and autoThemeFromInstalled is true, compute once and save
        if ((!matchingRule || !matchingRule.theme) && autoThemeFromInstalled) {
            const chosenTheme = getDeterministicThemeForSeed(ws.name || ws.path);
            if (chosenTheme) {
                matchingRule = {
                    ...(matchingRule || {}),
                    path: ws.path.replace(/\\/g, '/'),
                    folderName: ws.name,
                    theme: chosenTheme.label
                };
                await upsertRuleForCurrentFolder({ theme: chosenTheme.label });
            }
        }

        if (matchingRule) {
            ensureGitExclude(ws.path);

            // 1. Apply Theme to Workspace target in one single shot (no-op if already set)
            if ((mode === 'theme' || mode === 'both') && matchingRule.theme) {
                if (currentWsTheme !== matchingRule.theme) {
                    await workbenchConfig.update('colorTheme', matchingRule.theme, vscode.ConfigurationTarget.Workspace);
                }
                activeTheme = matchingRule.theme;
            }

            // 2. Apply Icon Theme if defined
            if (matchingRule.iconTheme) {
                const currentWsIcon = workbenchConfig.inspect('iconTheme')?.workspaceValue;
                if (currentWsIcon !== matchingRule.iconTheme) {
                    await workbenchConfig.update('iconTheme', matchingRule.iconTheme, vscode.ConfigurationTarget.Workspace);
                }
            }

            // 3. Apply Accent Color if defined
            if ((mode === 'accent' || mode === 'both') && matchingRule.accentColor) {
                const customColors = buildColorCustomizations(matchingRule.accentColor);
                await workbenchConfig.update('colorCustomizations', customColors, vscode.ConfigurationTarget.Workspace);
                activeColor = matchingRule.accentColor;
            } else if ((mode === 'accent' || mode === 'both') && matchingRule.colorCustomizations) {
                await workbenchConfig.update('colorCustomizations', matchingRule.colorCustomizations, vscode.ConfigurationTarget.Workspace);
            } else if (mode === 'theme') {
                if (currentWsColors) {
                    await clearChameleonColorCustomizations();
                }
            }
        } else {
            if (autoPalette && (mode === 'accent' || mode === 'both')) {
                ensureGitExclude(ws.path);
                const generatedHex = hashStringToColor(ws.name || ws.path);
                const customColors = buildColorCustomizations(generatedHex);
                await workbenchConfig.update('colorCustomizations', customColors, vscode.ConfigurationTarget.Workspace);
                activeColor = generatedHex;
            } else {
                if (currentWsColors) {
                    await clearChameleonColorCustomizations();
                }
            }
        }

        updateStatusBar({
            folderName: ws.name,
            theme: activeTheme || currentWsTheme || workbenchConfig.get('colorTheme'),
            accentColor: activeColor,
            isRuleMatched: !!matchingRule
        });

        if (showNotification) {
            const msg = `Chameleon: Adapted to "${ws.name}" (${activeTheme || activeColor || 'Default'})`;
            vscode.window.showInformationMessage(msg);
        }
    } finally {
        isApplying = false;
        setTimeout(() => {
            isInternalChange = false;
        }, 600);
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
        { label: '$(symbol-event) Auto-Assign Theme from Installed Library', action: autoAssignThemeForCurrentFolder, description: 'Pick a distinct installed theme for this folder' },
        { label: '$(sync) 🎲 Pick Random Theme from Library (Shuffle)', action: randomThemeForCurrentFolder, description: 'Roll and apply a random installed dark theme' },
        { label: '$(clear-all) Reset Accent Colors & Purge Customizations', action: resetAllAccentColors, description: 'Clean purple/custom accent bars and restore authentic theme' },
        { label: '$(symbol-color) Set Accent Color for this Folder', action: setAccentColorForCurrentFolder, description: 'Customize Titlebar & Statusbar colors' },
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
    if (!ws) {
        vscode.window.showWarningMessage('Workspace Chameleon: Please open a folder or workspace first.');
        return;
    }

    const selectedTheme = await promptSelectTheme(ws.name);
    if (!selectedTheme) return;

    // Apply immediately to the active workspace window
    ensureGitExclude(ws.path);
    const workbenchConfig = vscode.workspace.getConfiguration('workbench');
    await workbenchConfig.update('colorTheme', selectedTheme, vscode.ConfigurationTarget.Workspace);
    await clearChameleonColorCustomizations();

    // Persist rule and refresh status
    await upsertRuleForCurrentFolder({ theme: selectedTheme });
    await applyThemeForCurrentWorkspace(false);
    vscode.window.showInformationMessage(`Workspace Chameleon: Adapted theme "${selectedTheme}" for "${ws.name}"!`);
}

/**
 * Automatically assigns a theme from the user's installed extensions based on folder name hash.
 */
async function autoAssignThemeForCurrentFolder() {
    const ws = getCurrentWorkspaceInfo();
    if (!ws) {
        vscode.window.showWarningMessage('Workspace Chameleon: Please open a folder or workspace first.');
        return;
    }

    const chosenTheme = getDeterministicThemeForSeed(ws.name || ws.path);
    if (!chosenTheme) {
        vscode.window.showWarningMessage('No installed color themes found.');
        return;
    }

    // Apply immediately to the active workspace window
    ensureGitExclude(ws.path);
    const workbenchConfig = vscode.workspace.getConfiguration('workbench');
    await workbenchConfig.update('colorTheme', chosenTheme.label, vscode.ConfigurationTarget.Workspace);
    await clearChameleonColorCustomizations();

    // Persist rule and refresh status
    await upsertRuleForCurrentFolder({ theme: chosenTheme.label });
    await applyThemeForCurrentWorkspace(false);
    vscode.window.showInformationMessage(`Workspace Chameleon: Assigned & saved theme "${chosenTheme.label}" for "${ws.name}"!`);
}

/**
 * Randomly picks and assigns an installed theme for the current workspace folder.
 */
async function randomThemeForCurrentFolder() {
    const ws = getCurrentWorkspaceInfo();
    if (!ws) {
        vscode.window.showWarningMessage('Workspace Chameleon: Please open a folder or workspace first.');
        return;
    }

    const chosenTheme = getRandomInstalledTheme();
    if (!chosenTheme) {
        vscode.window.showWarningMessage('No installed color themes found.');
        return;
    }

    // Apply immediately to the active workspace window
    ensureGitExclude(ws.path);
    const workbenchConfig = vscode.workspace.getConfiguration('workbench');
    await workbenchConfig.update('colorTheme', chosenTheme.label, vscode.ConfigurationTarget.Workspace);
    await clearChameleonColorCustomizations();

    // Persist rule and refresh status
    await upsertRuleForCurrentFolder({ theme: chosenTheme.label });
    await applyThemeForCurrentWorkspace(false);
    vscode.window.showInformationMessage(`Workspace Chameleon: 🎲 Randomly assigned theme "${chosenTheme.label}" for "${ws.name}"!`);
}

/**
 * Set an accent color for the current workspace folder.
 */
async function setAccentColorForCurrentFolder() {
    const ws = getCurrentWorkspaceInfo();
    if (!ws) {
        vscode.window.showWarningMessage('Workspace Chameleon: Please open a folder or workspace first.');
        return;
    }

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

    // Apply immediately to the active workspace window
    ensureGitExclude(ws.path);
    const workbenchConfig = vscode.workspace.getConfiguration('workbench');
    const customColors = buildColorCustomizations(finalHex);
    await workbenchConfig.update('colorCustomizations', customColors, vscode.ConfigurationTarget.Workspace);

    // Persist rule and refresh status
    await upsertRuleForCurrentFolder({ accentColor: finalHex });
    await applyThemeForCurrentWorkspace(false);
    vscode.window.showInformationMessage(`Workspace Chameleon: Saved accent color ${finalHex} for "${ws.name}"!`);
}

/**
 * Generate a unique color and save rule.
 */
async function generateUniqueColorForCurrentFolder() {
    const ws = getCurrentWorkspaceInfo();
    if (!ws) {
        vscode.window.showWarningMessage('Workspace Chameleon: Please open a folder or workspace first.');
        return;
    }

    const hex = hashStringToColor(ws.name || ws.path);
    ensureGitExclude(ws.path);
    const workbenchConfig = vscode.workspace.getConfiguration('workbench');
    const customColors = buildColorCustomizations(hex);
    await workbenchConfig.update('colorCustomizations', customColors, vscode.ConfigurationTarget.Workspace);

    await upsertRuleForCurrentFolder({ accentColor: hex });
    await applyThemeForCurrentWorkspace(false);
    vscode.window.showInformationMessage(`Workspace Chameleon: Generated accent color ${hex} for "${ws.name}"!`);
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
    const rules = [...(config.get('rules', []) || [])];
    const normWsPath = normalizePath(ws.path);
    const wsNameLower = (ws.name || '').toLowerCase();

    const existingIndex = rules.findIndex(r => 
        (r.path && normalizePath(r.path) === normWsPath) ||
        (r.folderName && r.folderName.toLowerCase() === wsNameLower)
    );

    let needsUpdate = false;
    if (existingIndex >= 0) {
        const existing = rules[existingIndex];
        for (const [k, v] of Object.entries(updates)) {
            if (existing[k] !== v) {
                needsUpdate = true;
                break;
            }
        }
        if (needsUpdate) {
            rules[existingIndex] = { ...existing, ...updates };
        }
    } else {
        needsUpdate = true;
        rules.push({
            path: ws.path.replace(/\\/g, '/'),
            folderName: ws.name,
            ...updates
        });
    }

    if (needsUpdate) {
        await config.update('rules', rules, vscode.ConfigurationTarget.Global);
    }
}

/**
 * Clear the rule for current workspace folder.
 */
async function clearFolderRule() {
    const ws = getCurrentWorkspaceInfo();
    if (!ws) return;

    const config = vscode.workspace.getConfiguration('workspaceChameleon');
    const rules = config.get('rules', []) || [];
    const normWsPath = normalizePath(ws.path);
    const wsNameLower = (ws.name || '').toLowerCase();

    const filtered = rules.filter(r => {
        if (r.path && normalizePath(r.path) === normWsPath) return false;
        if (r.folderName && r.folderName.toLowerCase() === wsNameLower) return false;
        return true;
    });

    await config.update('rules', filtered, vscode.ConfigurationTarget.Global);
    
    // Clear Workspace target theme and customizations
    const workbenchConfig = vscode.workspace.getConfiguration('workbench');
    await workbenchConfig.update('colorTheme', undefined, vscode.ConfigurationTarget.Workspace);
    await workbenchConfig.update('colorCustomizations', undefined, vscode.ConfigurationTarget.Workspace);
    await clearChameleonColorCustomizations();

    vscode.window.showInformationMessage(`Workspace Chameleon: Cleared rule for "${ws.name}".`);
    await applyThemeForCurrentWorkspace();
}

/**
 * Resets all custom accent colors and restores authentic installed themes without purple/accent bars.
 */
async function resetAllAccentColors() {
    await clearChameleonColorCustomizations();

    const config = vscode.workspace.getConfiguration('workspaceChameleon');
    const rules = config.get('rules', []) || [];
    let modified = false;
    const cleaned = rules.map(r => {
        if (r.accentColor || r.colorCustomizations) {
            modified = true;
            const copy = { ...r };
            delete copy.accentColor;
            delete copy.colorCustomizations;
            return copy;
        }
        return r;
    });

    if (modified) {
        await config.update('rules', cleaned, vscode.ConfigurationTarget.Global);
    }

    await applyThemeForCurrentWorkspace(true);
    vscode.window.showInformationMessage('Workspace Chameleon: Reset all custom accent colors and restored authentic theme colors!');
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
