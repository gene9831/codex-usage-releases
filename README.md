# Codex Usage 客户端安装

需要先安装 Node.js 22 或更高版本。

## macOS

默认安装到 `~/Applications/Codex Usage`：

```bash
curl -fsSL 'https://github.com/gene9831/codex-usage-releases/releases/latest/download/install.sh' | bash
```

首次安装后运行配置，按提示输入服务器地址和设备 API Key：

```bash
"$HOME/Applications/Codex Usage/codex-usage" setup
```

指定目录安装或覆盖旧版：

```bash
curl -fsSL 'https://github.com/gene9831/codex-usage-releases/releases/latest/download/install.sh' | bash -s -- --root "$HOME/Applications/codex-usage-client-darwin-arm64"
```

## Windows

使用 PowerShell 5.1 或 7，默认安装到 `%LOCALAPPDATA%\Programs\Codex Usage`：

```powershell
irm 'https://github.com/gene9831/codex-usage-releases/releases/latest/download/install.ps1' | iex
```

首次安装后运行配置，按提示输入服务器地址和设备 API Key：

```powershell
& "$env:LOCALAPPDATA\Programs\Codex Usage\codex-usage.cmd" setup
```

指定目录安装或覆盖旧版：

```powershell
& ([scriptblock]::Create((irm 'https://github.com/gene9831/codex-usage-releases/releases/latest/download/install.ps1'))) -Root 'D:\Tools\Codex Usage'
```

覆盖旧版时指定原安装目录，即可保留配置、设备密钥和日志，无需重新配置。使用自定义目录首次安装时，请在该目录运行 `./codex-usage setup`（Windows 为 `.\codex-usage.cmd setup`）。
