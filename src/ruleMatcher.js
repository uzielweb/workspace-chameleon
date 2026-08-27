/**
 * Rule matcher for folder paths and workspace names.
 */
const path = require('path');

/**
 * Normalizes path for consistent cross-platform comparison.
 * @param {string} p 
 * @returns {string}
 */
function normalizePath(p) {
    if (!p) return '';
    let normalized = p.replace(/\\/g, '/').toLowerCase();
    // Remove trailing slash if present (except root)
    if (normalized.length > 1 && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
    }
    return normalized;
}

/**
 * Converts a simple glob pattern (*, **) into a RegExp.
 * @param {string} pattern 
 * @returns {RegExp}
 */
function globToRegex(pattern) {
    const normalized = normalizePath(pattern);
    
    // If pattern does not contain slashes (e.g. "*my-theme*"), let it match anywhere in the path or just filename
    const isBasenameOnly = !pattern.includes('/');

    let regexStr = normalized
        .replace(/[.+^${}()|[\]]/g, '\\$&') // escape regex special chars
        .replace(/\*\*/g, '§DOUBLESTAR§')
        .replace(/\*/g, isBasenameOnly ? '.*' : '[^/]*')
        .replace(/§DOUBLESTAR§/g, '.*')
        .replace(/\?/g, '.');

    regexStr = '^' + regexStr + '$';
    return new RegExp(regexStr, 'i');
}

/**
 * Checks if a candidate path matches a pattern rule.
 * @param {string} candidatePath Absolute workspace folder path
 * @param {string} pattern Rule path pattern
 * @returns {boolean}
 */
function matchPath(candidatePath, pattern) {
    if (!candidatePath || !pattern) return false;
    
    const normCandidate = normalizePath(candidatePath);
    const normPattern = normalizePath(pattern);

    // Exact match
    if (normCandidate === normPattern) {
        return true;
    }

    // Direct subdirectory match if pattern doesn't contain wildcards
    if (!pattern.includes('*') && !pattern.includes('?') && !pattern.startsWith('^')) {
        if (normCandidate.startsWith(normPattern + '/') || normCandidate === normPattern) {
            return true;
        }
    }

    // Regex check if starts with ^ or /
    if (pattern.startsWith('^') || (pattern.startsWith('/') && pattern.endsWith('/'))) {
        try {
            const cleanPattern = pattern.replace(/^\/|\/$/g, '');
            const re = new RegExp(cleanPattern, 'i');
            return re.test(candidatePath) || re.test(normCandidate);
        } catch (e) {
            return false;
        }
    }

    // If pattern doesn't start with **/ or a drive letter and has no slash, allow matching the end/segment
    if (!pattern.includes('/') && (pattern.includes('*') || pattern.includes('?'))) {
        const globRe = globToRegex(pattern);
        if (globRe.test(normCandidate) || globRe.test(path.basename(normCandidate))) {
            return true;
        }
    }

    // Glob pattern matching
    const globRe = globToRegex(pattern);
    return globRe.test(normCandidate);
}

/**
 * Checks if a folder name matches a rule.
 * @param {string} folderName 
 * @param {string} pattern 
 * @returns {boolean}
 */
function matchFolderName(folderName, pattern) {
    if (!folderName || !pattern) return false;
    const normName = folderName.toLowerCase();
    const normPattern = pattern.toLowerCase();

    if (normName === normPattern) return true;

    if (normPattern.includes('*') || normPattern.includes('?')) {
        const re = globToRegex(pattern);
        return re.test(normName);
    }

    return false;
}

/**
 * Evaluates rules list against workspace path and name. Returns first matching rule.
 * @param {string} workspacePath 
 * @param {string} workspaceName 
 * @param {Array} rules 
 * @returns {object|null}
 */
function findMatchingRule(workspacePath, workspaceName, rules) {
    if (!rules || !Array.isArray(rules) || rules.length === 0) {
        return null;
    }

    for (const rule of rules) {
        if (!rule || typeof rule !== 'object') continue;

        // Check path rule
        if (rule.path && workspacePath && matchPath(workspacePath, rule.path)) {
            return rule;
        }

        // Check folder name rule
        if (rule.folderName && workspaceName && matchFolderName(workspaceName, rule.folderName)) {
            return rule;
        }
    }

    return null;
}

module.exports = {
    normalizePath,
    matchPath,
    matchFolderName,
    findMatchingRule
};
