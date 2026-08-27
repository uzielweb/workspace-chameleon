const assert = require('assert');
const path = require('path');
const { hashStringToColor, isLightColor, buildColorCustomizations } = require('../src/colorUtils');
const { normalizePath, matchPath, matchFolderName, findMatchingRule } = require('../src/ruleMatcher');
const { RECOMMENDED_THEMES } = require('../src/themeManager');

console.log('--- Running Folder Theme Tests ---');

// 1. Test Color Utils
console.log('Testing Color Utils...');
const color1 = hashStringToColor('d:/laragon/www/github/my-project');
const color2 = hashStringToColor('d:/laragon/www/github/my-project');
const color3 = hashStringToColor('d:/laragon/www/github/another-project');

assert.strictEqual(color1, color2, 'Hash must be deterministic for the same path');
assert.ok(/^#[0-9a-fA-F]{6}$/.test(color1), 'Generated color must be valid 6-character hex');
assert.notStrictEqual(color1, color3, 'Different paths should generate different colors');

// Test isLightColor
assert.strictEqual(isLightColor('#ffffff'), true, 'White is light');
assert.strictEqual(isLightColor('#000000'), false, 'Black is dark');
assert.strictEqual(isLightColor('#1e1e1e'), false, 'VS Code dark background is dark');

// Test buildColorCustomizations
const cust = buildColorCustomizations('#7952d6');
assert.ok(cust['titleBar.activeBackground'], 'Must set titleBar.activeBackground');
assert.ok(cust['statusBar.background'], 'Must set statusBar.background');
assert.ok(cust['activityBar.background'], 'Must set activityBar.background');

// 2. Test Rule Matcher
console.log('Testing Rule Matcher...');

assert.strictEqual(normalizePath('D:\\Laragon\\WWW\\Project\\'), 'd:/laragon/www/project');

// Exact & Subdirectory matching
assert.strictEqual(matchPath('d:/laragon/www/project', 'd:/laragon/www/project'), true);
assert.strictEqual(matchPath('D:\\laragon\\www\\project', 'd:/laragon/www/project'), true);
assert.strictEqual(matchPath('d:/laragon/www/project/sub', 'd:/laragon/www/project'), true);

// Glob matching
assert.strictEqual(matchPath('d:/laragon/www/joomla-site-1', '**/joomla-*'), true);
assert.strictEqual(matchPath('d:/laragon/www/laravel-app', '**/joomla-*'), false);
assert.strictEqual(matchPath('d:/laragon/www/github/my-theme', '*my-theme*'), true);

// Folder Name matching
assert.strictEqual(matchFolderName('copa-do-mundo-2026', 'copa-*'), true);
assert.strictEqual(matchFolderName('joomla-modernizer-cli', 'joomla-*'), true);
assert.strictEqual(matchFolderName('test-repo', 'joomla-*'), false);

// Find Matching Rule
const testRules = [
    { path: '**/joomla-*', theme: 'Tokyo Night' },
    { folderName: 'minimalista', theme: 'Catppuccin Mocha', accentColor: '#10b981' },
    { path: 'd:/laragon/www/special', accentColor: '#f59e0b' }
];

const match1 = findMatchingRule('d:/laragon/www/joomla-news', 'joomla-news', testRules);
assert.ok(match1, 'Should find rule for joomla-news');
assert.strictEqual(match1.theme, 'Tokyo Night');

const match2 = findMatchingRule('d:/laragon/www/other/minimalista', 'minimalista', testRules);
assert.ok(match2, 'Should match minimalista by folderName');
assert.strictEqual(match2.accentColor, '#10b981');

// 3. Test Theme Manager Data
console.log('Testing Theme Manager recommendations...');
assert.ok(Array.isArray(RECOMMENDED_THEMES), 'Recommended themes must be an array');
assert.ok(RECOMMENDED_THEMES.length > 0, 'Recommended themes must not be empty');
assert.ok(RECOMMENDED_THEMES.some(t => t.id === 'enkia.tokyo-night'), 'Should contain Tokyo Night');

console.log('✓ All 15 test assertions passed successfully!');
