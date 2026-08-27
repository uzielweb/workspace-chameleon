let vscode;
try {
    vscode = require('vscode');
} catch (e) {
    vscode = null;
}

// Popular recommended themes for instant discovery and one-click installation
const RECOMMENDED_THEMES = [
    { id: 'enkia.tokyo-night', name: 'Tokyo Night', description: 'A clean, dark Visual Studio Code theme that celebrates the lights of Tokyo at night.' },
    { id: 'catppuccin.catppuccin-vsc', name: 'Catppuccin for VS Code', description: 'Soothing pastel theme for the high-spirited (Mocha, Macchiato, Frappé, Latte).' },
    { id: 'dracula-theme.theme-dracula', name: 'Dracula Official', description: 'Famous dark theme for Visual Studio Code and 300+ apps.' },
    { id: 'zhuangtongfa.material-theme', name: 'One Dark Pro', description: 'Atom\'s iconic One Dark theme, one of the most installed themes in VS Code.' },
    { id: 'github.github-vscode-theme', name: 'GitHub Theme', description: 'Official GitHub theme (Dark default, Dark dimmed, Light, etc.).' },
    { id: 'arcticicestudio.nord-visual-studio-code', name: 'Nord', description: 'An arctic, north-bluish clean and elegant visual theme.' },
    { id: 'robbowen.synthwave-decades', name: 'SynthWave \'84', description: 'Neon 80s synthwave glow aesthetic.' }
];

/**
 * Scans all installed extensions and returns a complete list of installed color themes.
 * @returns {Array<{label: string, id: string, extensionName: string, uiTheme: string}>}
 */
function getInstalledThemes(mockExtensions = null) {
    const themes = [];
    const seen = new Set();
    const extensions = mockExtensions || (vscode && vscode.extensions && vscode.extensions.all) || [];

    for (const extension of extensions) {
        const pkg = extension.packageJSON;
        if (pkg && pkg.contributes && Array.isArray(pkg.contributes.themes)) {
            for (const t of pkg.contributes.themes) {
                const label = t.label || t.id;
                if (label && !seen.has(label)) {
                    seen.add(label);
                    themes.push({
                        label: label,
                        id: t.id || label,
                        uiTheme: t.uiTheme || 'vs-dark',
                        extensionName: pkg.displayName || pkg.name || extension.id
                    });
                }
            }
        }
    }

    // Sort alphabetically by theme label
    return themes.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Deterministically picks one of the installed themes based on a string hash (e.g. folder path).
 * @param {string} seed 
 * @param {string} [preferredUiTheme] 'vs-dark', 'vs', 'hc-black'
 * @returns {object|null}
 */
function getDeterministicThemeForSeed(seed, preferredUiTheme = 'vs-dark') {
    const themes = getInstalledThemes();
    if (themes.length === 0) return null;

    let filtered = themes;
    if (preferredUiTheme) {
        const match = themes.filter(t => t.uiTheme === preferredUiTheme);
        if (match.length > 0) filtered = match;
    }

    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash << 5) - hash + seed.charCodeAt(i);
        hash |= 0;
    }

    const index = Math.abs(hash) % filtered.length;
    return filtered[index];
}

/**
 * Prompts user to pick from currently installed themes or explore/download new themes.
 * @param {string} folderName 
 * @returns {Promise<string|null>} Selected theme label or null
 */
async function promptSelectTheme(folderName) {
    const installed = getInstalledThemes();
    const items = [];

    // 1. Group / list installed themes
    items.push({
        label: '--- INSTALLED THEMES ---',
        kind: vscode.QuickPickItemKind.Separator
    });

    for (const t of installed) {
        items.push({
            label: `$(paintcan) ${t.label}`,
            description: t.extensionName,
            detail: `Type: ${t.uiTheme}`,
            themeLabel: t.label
        });
    }

    // 2. Action to download / browse themes from Marketplace
    items.push({
        label: '--- DISCOVER & DOWNLOAD THEMES ---',
        kind: vscode.QuickPickItemKind.Separator
    });

    for (const rec of RECOMMENDED_THEMES) {
        const isInstalled = vscode.extensions.getExtension(rec.id);
        if (!isInstalled) {
            items.push({
                label: `$(cloud-download) Install ${rec.name}`,
                description: rec.id,
                detail: rec.description,
                extensionToInstall: rec.id
            });
        }
    }

    items.push({
        label: '$(search) Browse All Themes in Marketplace...',
        description: 'Opens extension marketplace search for @category:"themes"',
        action: 'browse_marketplace'
    });

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `Select an installed theme for "${folderName}" or download a new one`,
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (!selected) return null;

    if (selected.themeLabel) {
        return selected.themeLabel;
    }

    if (selected.extensionToInstall) {
        vscode.window.showInformationMessage(`Installing ${selected.label}...`);
        await vscode.commands.executeCommand('workbench.extensions.installExtension', selected.extensionToInstall);
        vscode.window.showInformationMessage(`Extension installed! Please re-open the theme selector.`);
        return null;
    }

    if (selected.action === 'browse_marketplace') {
        vscode.commands.executeCommand('workbench.extensions.search', '@category:"themes"');
        return null;
    }

    return null;
}

module.exports = {
    RECOMMENDED_THEMES,
    getInstalledThemes,
    getDeterministicThemeForSeed,
    promptSelectTheme
};
