# Codex Usage Client Releases

Client distribution and signed update feeds for macOS ARM64, macOS Intel and Windows x64. Node.js22+ is required. This repository contains release assets, public verification keys and the small channel-promotion workflow; it does not contain the private application repository or its history.

| Channel | Version examples | Selection                                       |
| ------- | ---------------- | ----------------------------------------------- |
| stable  | `0.2.0`          | Default; GitHub latest stable release           |
| alpha   | `0.2.0-alpha.1`  | Explicit opt-in; `channel-alpha` signed pointer |
| beta    | `0.2.0-beta.1`   | Explicit opt-in; `channel-beta` signed pointer  |
| rc      | `0.2.0-rc.1`     | Explicit opt-in; `channel-rc` signed pointer    |

`client-vVERSION` releases hold immutable complete platform ZIPs, an Ed25519-signed manifest, signature and a reviewable Node installer. ZIPs without `-portable` are installer/update payloads; portable ZIPs include a complete root launcher. `channel-*` releases hold only a mutable manifest pointer; the client obtains the signature and ZIP from the verified immutable version tag. Stable clients never automatically join a test channel.

Publish an existing alpha/beta/rc draft through GitHub Releases to trigger **Promote signed test channel**. It verifies the project signature, exact tag/channel, platform set and forward-only sequence/version, then advances only the matching channel. Identical repeated events are harmless; older or modified releases are refused. The workflow can also be dispatched with an existing published tag. Never overwrite assets of `client-vVERSION` releases. Keep all currently distributed signing public keys during key rotation.

New releases include version-pinned `install.sh` and `install.ps1` entrypoints. These commands become available after a release containing the scripts is published; older releases are immutable and are not retrofitted. Node.js22+ must already be installed. Default locations are `~/Applications/Codex Usage` on macOS and `%LOCALAPPDATA%\Programs\Codex Usage` on Windows, without administrator elevation.

macOS:

```bash
curl -fsSL 'https://github.com/gene9831/codex-usage-releases/releases/latest/download/install.sh' | bash
# Reuse the existing installation and its configuration:
curl -fsSL 'https://github.com/gene9831/codex-usage-releases/releases/latest/download/install.sh' | bash -s -- --root "$HOME/Applications/codex-usage-client-darwin-arm64"
```

Windows PowerShell5.1/7:

```powershell
irm 'https://github.com/gene9831/codex-usage-releases/releases/latest/download/install.ps1' | iex
& ([scriptblock]::Create((irm 'https://github.com/gene9831/codex-usage-releases/releases/latest/download/install.ps1'))) -Root 'D:\Tools\Codex Usage'
```

For prereleases, use the immutable `releases/download/client-vVERSION/install.sh` or `install.ps1` URL and explicitly select `--channel alpha` or `-Channel alpha`; GitHub latest excludes prereleases. Omit the channel on repeated installations to retain the current selection. You can download and review either entry script or the Node installer before executing it:

```bash
node install-client.mjs --root "$HOME/Applications/Codex Usage" --channel stable
```

For a separate test install use `--channel alpha` and a separate directory, for example `~/Applications/Codex Usage Alpha`. At the installed root:

```bash
./codex-usage --version
./codex-usage update --channel alpha
./codex-usage update --check
./codex-usage update
./codex-usage --version
```

Legacy installations retain configuration, device credentials and logs; configured clients rebind their background task without requesting credentials again. Reinstalling an already-managed root runs the signed update path and preserves replay history and the automatic-update preference. Only an unconfigured first installation requires `setup`.

The macOS manual installer automatically removes quarantine from enumerated client program paths after payload verification (or explicit trusted local `--from`), before the native keeper/scheduler runs. It does not recursively clear the entire directory or modify configuration/log attributes; `--no-xattr` disables this installer step. Ordinary automatic updates still create new verified files without invoking `xattr`.

Updates activate on the next invocation. Channel selection preserves replay protection and cannot force a version downgrade. Normal scheduled sync checks updates after the sync attempt; manual sync does not. Configuration and logs stay at the root; don't execute version directories directly. Controlled attribute testing is not a substitute for clean-VM Gatekeeper acceptance.

Distributed client JavaScript is readable. Server/web sources, user configuration, keys and logs are excluded from the packages. Client updates do not require an Apple developer account or a GitHub token.
