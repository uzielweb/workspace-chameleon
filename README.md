# 🦎 Workspace Chameleon (Auto Theme & Color Switcher)

[![Version](https://img.shields.io/badge/version-1.5.0-6366f1.svg)](https://github.com/uzielweb/workspace-chameleon/releases)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.75.0-007ACC.svg)](https://code.visualstudio.com/)
[![Antigravity IDE](https://img.shields.io/badge/Antigravity%20IDE-Compatible-10b981.svg)](https://github.com/uzielweb/workspace-chameleon)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<p align="center">
  <img src="icon.png" width="140" alt="Workspace Chameleon Icon" />
</p>

<p align="center">
  <em>Assim como um camaleão adapta suas cores ao ambiente, o seu editor adapta automaticamente o tema e as cores visuais a cada projeto ou pasta aberta!</em>
</p>

---

## 🎯 Por que o Workspace Chameleon?

Ao trabalhar em múltiplos projetos ou repositórios simultaneamente, é comum confundir janelas abertas e cometer alterações no projeto errado. 

O **Workspace Chameleon** resolve isso transformando visualmente cada janela do seu **VS Code** ou **Antigravity IDE** de acordo com a pasta aberta:
- Troca o **Tema de Cores completo** (editor e sintaxe).
- **Escolha Aleatória (Shuffle / Sorteio)**: Permite sortear instantaneamente um tema escuro instalado para a pasta ativa com 1 clique.
- Troca as **Cores de Destaque** (Barra de Título, Barra de Status, Abas e Barra de Atividades).
- **Escaneia automaticamente todos os temas já instalados** na sua IDE para seleção rápida.
- Sugere e permite **baixar novos temas populares** com 1 clique.
- Gera **paletas harmônicas automáticas (Zero Config)** para pastas novas sem necessidade de configuração manual.
- **Totalmente isolado por janela**: Cada pasta aberta mantém seu próprio tema sem afetar outras janelas.
- **Git limpo**: Adiciona automaticamente `.vscode/` ao `.git/info/exclude` local para não poluir o repositório Git.

---

## ✨ Recursos

- 🚀 **Adaptação Instantânea**: Ao abrir qualquer pasta ou alternar workspaces, o camaleão ajusta a interface imediatamente.
- 🎲 **Sorteio de Temas (Shuffle)**: Sorteia temas escuros elegantes instalados aleatoriamente a qualquer momento.
- 🎨 **Mapeamento Flexível por Regras**:
  - Caminhos absolutos (ex: `d:/laragon/www/github/meu-projeto`)
  - Glob Patterns e Coringas (ex: `**/joomla-*`, `d:/laragon/www/api*`, `*client-a*`)
  - Nome da Pasta / Workspace (ex: `minimalista`, `copa-*`)
- 🔍 **Auto-Detecção de Temas Instalados**: Reconhece dinamicamente todos os temas das extensões instaladas na sua máquina.
- 📥 **Catálogo Integrado de Temas Populares**: Sugere e instala com um clique temas consagrados como *Tokyo Night*, *Catppuccin*, *Dracula*, *One Dark Pro*, *GitHub Theme*, *Nord* e *SynthWave '84*.
- 💎 **Modo Camaleão Automático (Zero Config)**: Gera uma cor harmônica exclusiva para cada pasta baseado no nome/caminho, calculando contraste automático de texto para máxima legibilidade (WCAG).
- 🏷️ **Indicador na Barra de Status**: Botão interativo `🦎 [Projeto]` para acessar o menu rápido de ações a qualquer momento.

---

## ⚡ Instalação Rápida (.VSIX)

1. Baixe o pacote `.vsix` na aba [Releases](https://github.com/uzielweb/workspace-chameleon/releases).
2. No VS Code ou Antigravity IDE:
   - Pressione `Ctrl+Shift+P` (ou `Cmd+Shift+P` no macOS).
   - Digite `Extensions: Install from VSIX...` (ou `Instalar a partir de VSIX...`).
   - Selecione o arquivo `workspace-chameleon-1.5.0.vsix`.

---

## 🚀 Como Usar

### Menu Rápido Interativo
Abra qualquer pasta no editor e clique no ícone `🦎` na Barra de Status (ou pressione `Ctrl+Shift+P` e digite `Workspace Chameleon: Open Quick Menu`):

1. **Select Theme for this Folder**: Exibe a lista completa de temas instalados na sua IDE para associar à pasta.
2. **Set Accent Color for this Folder**: Escolha uma cor pré-definida vibrante ou digite um código `#HEX`.
3. **Auto-Assign Theme from Installed Library**: Associa um tema instalado automaticamente por hash.
4. **Auto-Generate Unique Palette**: Gera uma paleta harmônica exclusiva para a janela atual.
5. **Discover Popular Themes**: Explora e instala temas famosos do Marketplace com 1 clique.
6. **Clear Rule for this Folder**: Remove personalizações e restaura os padrões da IDE.

---

## ⚙️ Configurações Globais (`settings.json`)

As regras são salvas centralmente nas configurações de Usuário:

```json
{
  "workspaceChameleon.enabled": true,
  "workspaceChameleon.mode": "theme",
  "workspaceChameleon.autoAssignFromInstalledThemes": true,
  "workspaceChameleon.autoGeneratePalette": false,
  "workspaceChameleon.showStatusBarItem": true,
  "workspaceChameleon.rules": [
    {
      "path": "d:/laragon/www/github/joomla-*",
      "theme": "Tokyo Night"
    },
    {
      "folderName": "copa-do-mundo-2026",
      "theme": "Catppuccin Mocha"
    },
    {
      "path": "d:/laragon/www/github/minimalista",
      "theme": "One Dark Pro"
    }
  ]
}
```

### Parâmetros

| Opção | Tipo | Padrão | Descrição |
|---|---|---|---|
| `workspaceChameleon.enabled` | `boolean` | `true` | Ativa ou desativa o Workspace Chameleon. |
| `workspaceChameleon.mode` | `string` | `"theme"` | `"theme"` (somente tema de código/editor), `"both"` (tema + cores de destaque), ou `"accent"` (somente barras e abas). |
| `workspaceChameleon.autoAssignFromInstalledThemes` | `boolean` | `true` | Calcula deterministamente um tema já instalado na IDE com base no nome do projeto e salva a regra automaticamente. |
| `workspaceChameleon.autoGeneratePalette` | `boolean` | `false` | Gera paleta harmônica de cores de destaque para pastas sem regras manuais (quando em modo accent/both). |
| `workspaceChameleon.showStatusBarItem` | `boolean` | `true` | Exibe o indicador interativo na barra de status. |
| `workspaceChameleon.rules` | `array` | `[]` | Mapeamento customizado de pastas para temas e cores. |

---

## ⌨️ Comandos Disponíveis

| Comando | Descrição |
|---|---|
| `workspaceChameleon.menu` | Abre o menu rápido de ações do Chameleon. |
| `workspaceChameleon.setThemeForCurrentFolder` | Lista e vincula um tema instalado à pasta atual. |
| `workspaceChameleon.setAccentColorForCurrentFolder` | Define uma cor de destaque personalizada para a pasta. |
| `workspaceChameleon.autoAssignTheme` | Associa um tema instalado por algoritmo determinístico. |
| `workspaceChameleon.generateUniqueColor` | Gera uma cor de destaque única para a pasta. |
| `workspaceChameleon.browsePopularThemes` | Explora e instala temas populares da comunidade. |
| `workspaceChameleon.clearFolderRule` | Remove as regras e limpa as customizações da pasta. |
| `workspaceChameleon.refresh` | Recarrega e reaplica as regras do workspace ativo. |
| `workspaceChameleon.openSettings` | Abre as configurações do Workspace Chameleon. |

---

## 📄 Licença

Distribuído sob a licença [MIT](LICENSE).

Desenvolvido por **[Uziel](https://github.com/uzielweb)**.
