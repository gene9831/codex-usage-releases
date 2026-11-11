// This standalone Node22 file is also deployed to the PUBLIC release repository.
// It consumes public keys and release assets only; no private-source dependency.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const REPOSITORY = 'gene9831/codex-usage-releases';
const PLATFORM_ASSETS = {
  'darwin-arm64': 'codex-usage-client-macos-arm64.zip',
  'darwin-x64': 'codex-usage-client-macos-x64.zip',
  'win32-x64': 'codex-usage-client-windows-x64.zip',
};
function version(value) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/.exec(value);
  if (
    !match ||
    ![match[1], match[2], match[3], match[5] ?? '0'].every((part) =>
      Number.isSafeInteger(Number(part)),
    )
  )
    throw new Error('Invalid channel version');
  return {
    value,
    channel: match[4] ?? 'stable',
    parts: [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[5] ?? 0)],
  };
}
function verified(bytes, signature, keys) {
  if (bytes.length > 256 * 1024 || !Object.hasOwn(keys, signature.keyId))
    throw new Error('Untrusted manifest or signing key');
  const key = createPublicKey(keys[signature.keyId]);
  const decoded = Buffer.from(signature.signatureBase64, 'base64');
  if (
    key.asymmetricKeyType !== 'ed25519' ||
    decoded.length !== 64 ||
    decoded.toString('base64') !== signature.signatureBase64 ||
    !verify(null, bytes, key, decoded)
  )
    throw new Error('Invalid manifest signature');
  const manifest = JSON.parse(bytes.toString('utf8'));
  const parsed = version(manifest.version);
  const channel = manifest.channel ?? 'stable';
  if (
    parsed.channel !== channel ||
    manifest.schemaVersion !== 1 ||
    !Number.isSafeInteger(manifest.sequence) ||
    manifest.sequence < 1 ||
    !/^[a-f0-9]{40}$/.test(manifest.sourceCommit) ||
    !/^[a-f0-9]{40}$/.test(manifest.ccusageRevision) ||
    !/^\d+\.\d+\.\d+$/.test(manifest.ccusageVersion) ||
    !Number.isSafeInteger(manifest.protocolVersion) ||
    manifest.protocolVersion < 1 ||
    !Number.isSafeInteger(manifest.minNodeMajor) ||
    manifest.minNodeMajor < 22 ||
    !Number.isSafeInteger(manifest.bootstrapVersion) ||
    manifest.bootstrapVersion < 1
  )
    throw new Error('Invalid signed release identity');
  if (
    Object.keys(manifest.assets ?? {})
      .sort()
      .join() !== Object.keys(PLATFORM_ASSETS).sort().join()
  )
    throw new Error('Incomplete signed platform set');
  for (const [platform, name] of Object.entries(PLATFORM_ASSETS)) {
    const asset = manifest.assets[platform];
    if (
      asset.name !== name ||
      !Number.isSafeInteger(asset.bytes) ||
      asset.bytes < 1 ||
      asset.bytes > 128 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(asset.sha256)
    )
      throw new Error('Invalid signed platform asset');
  }
  return { manifest, parsed };
}
export function verifyChannelPromotion(bytes, signature, { keys, tag, previous = null }) {
  const current = verified(bytes, signature, keys);
  const { manifest, parsed } = current;
  if (tag !== `client-v${manifest.version}` || parsed.channel === 'stable')
    throw new Error('Only the matching immutable prerelease tag can advance a test channel');
  if (previous) {
    const old = verified(previous.bytes, previous.signature, keys);
    if (old.parsed.channel !== parsed.channel)
      throw new Error('Cannot replace a different channel');
    if (
      createHash('sha256').update(previous.bytes).digest('hex') ===
      createHash('sha256').update(bytes).digest('hex')
    )
      return { channel: parsed.channel, version: manifest.version, changed: false };
    const differing = parsed.parts.findIndex((part, i) => part !== old.parsed.parts[i]);
    if (
      manifest.sequence <= old.manifest.sequence ||
      differing === -1 ||
      parsed.parts[differing] < old.parsed.parts[differing]
    )
      throw new Error('Cannot replay, replace or downgrade a published channel');
  }
  return { channel: parsed.channel, version: manifest.version, changed: true };
}
const gh = (args) =>
  execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
async function main() {
  const tag = process.env.RELEASE_TAG ?? process.argv[2];
  const parsed = version(tag?.startsWith('client-v') ? tag.slice(8) : '');
  if (parsed.channel === 'stable') {
    console.log('Stable release uses GitHub latest; no test channel changed.');
    return;
  }
  const keys = JSON.parse(
    await readFile(resolve(process.env.RELEASE_KEYS_FILE ?? 'release-public-keys.json'), 'utf8'),
  );
  const releaseView = (selected) =>
    JSON.parse(
      gh([
        'release',
        'view',
        selected,
        '--repo',
        REPOSITORY,
        '--json',
        'isDraft,isPrerelease,assets',
      ]),
    );
  const currentView = releaseView(tag);
  if (currentView.isDraft || !currentView.isPrerelease)
    throw new Error('Publish the version as a prerelease before promotion');
  const temporary = await mkdtemp(join(tmpdir(), 'promote-client-channel-'));
  let counter = 0;
  try {
    const download = async (selected) => {
      const directory = join(temporary, `immutable-${counter++}`);
      gh([
        'release',
        'download',
        selected,
        '--repo',
        REPOSITORY,
        '--pattern',
        'release-*.json',
        '--dir',
        directory,
      ]);
      const bytes = await readFile(join(directory, 'release-manifest.json'));
      const signature = JSON.parse(
        await readFile(join(directory, 'release-signature.json'), 'utf8'),
      );
      verifyChannelPromotion(bytes, signature, { keys, tag: selected });
      return { bytes, signature, tag: selected };
    };
    const current = await download(tag);
    const feedTag = `channel-${parsed.channel}`;
    let existing;
    try {
      const found = releaseView(feedTag);
      existing = { draft: found.isDraft, prerelease: found.isPrerelease, assets: found.assets };
    } catch (cause) {
      if (!/HTTP 404|release not found|no release found/i.test(String(cause.stderr ?? '')))
        throw cause;
    }
    if (existing && !existing.prerelease) throw new Error('Channel pointer must be a prerelease');
    let canonical = null;
    if (existing?.assets.some((asset) => asset.name === 'release-manifest.json')) {
      const directory = join(temporary, 'canonical');
      gh([
        'release',
        'download',
        feedTag,
        '--repo',
        REPOSITORY,
        '--pattern',
        'release-manifest.json',
        '--dir',
        directory,
      ]);
      const bytes = await readFile(join(directory, 'release-manifest.json'));
      const oldVersion = version(JSON.parse(bytes.toString('utf8')).version);
      if (oldVersion.channel !== parsed.channel) throw new Error('Existing channel mismatch');
      gh([
        'release',
        'download',
        `client-v${oldVersion.value}`,
        '--repo',
        REPOSITORY,
        '--pattern',
        'release-signature.json',
        '--dir',
        directory,
      ]);
      const signature = JSON.parse(
        await readFile(join(directory, 'release-signature.json'), 'utf8'),
      );
      verifyChannelPromotion(bytes, signature, { keys, tag: `client-v${oldVersion.value}` });
      canonical = { bytes, signature, tag: `client-v${oldVersion.value}` };
    }
    const history = [current, ...(canonical ? [canonical] : [])];
    if (!canonical) {
      // An interrupted --clobber can remove the canonical asset. Reconstruct the
      // high-water mark from immutable signed published releases, never reset it.
      const published = JSON.parse(
        gh([
          'release',
          'list',
          '--repo',
          REPOSITORY,
          '--limit',
          '1000',
          '--json',
          'tagName,isDraft,isPrerelease',
        ]),
      );
      for (const entry of published) {
        if (
          entry.isDraft ||
          !entry.isPrerelease ||
          entry.tagName === tag ||
          !entry.tagName.startsWith('client-v')
        )
          continue;
        let candidate;
        try {
          candidate = version(entry.tagName.slice(8));
        } catch {
          continue;
        }
        if (candidate.channel === parsed.channel) history.push(await download(entry.tagName));
      }
    }
    history.sort(
      (left, right) =>
        verified(left.bytes, left.signature, keys).manifest.sequence -
        verified(right.bytes, right.signature, keys).manifest.sequence,
    );
    let selected = null;
    for (const candidate of history) {
      const result = verifyChannelPromotion(candidate.bytes, candidate.signature, {
        keys,
        tag: candidate.tag,
        previous: selected,
      });
      if (result.changed) selected = candidate;
    }
    const authenticated = verified(selected.bytes, selected.signature, keys).manifest;
    const view = selected.tag === tag ? currentView : releaseView(selected.tag);
    if (view.isDraft || !view.isPrerelease)
      throw new Error('Selected channel version is not published');
    for (const [platform, name] of Object.entries(PLATFORM_ASSETS)) {
      const asset = view.assets.find((entry) => entry.name === name);
      if (!asset || asset.size !== authenticated.assets[platform].bytes)
        throw new Error('Published platform assets incomplete');
    }
    if (canonical?.bytes.equals(selected.bytes) && !existing.draft) {
      console.log(`${feedTag} already selects ${authenticated.version}`);
      return;
    }
    if (!existing)
      gh([
        'release',
        'create',
        feedTag,
        '--repo',
        REPOSITORY,
        '--target',
        'main',
        '--draft',
        '--prerelease',
        '--latest=false',
        '--title',
        `${parsed.channel} update channel`,
        '--notes',
        'Mutable signed manifest pointer. Immutable client-vVERSION releases are the recovery history.',
      ]);
    const manifestPath = join(temporary, 'release-manifest.json');
    await writeFile(manifestPath, selected.bytes);
    gh(['release', 'upload', feedTag, manifestPath, '--repo', REPOSITORY, '--clobber']);
    gh([
      'release',
      'edit',
      feedTag,
      '--repo',
      REPOSITORY,
      '--draft=false',
      '--prerelease',
      '--latest=false',
    ]);
    const confirmed = join(temporary, 'confirmed');
    gh([
      'release',
      'download',
      feedTag,
      '--repo',
      REPOSITORY,
      '--pattern',
      'release-manifest.json',
      '--dir',
      confirmed,
    ]);
    if (!(await readFile(join(confirmed, 'release-manifest.json'))).equals(selected.bytes))
      throw new Error('Channel pointer verification failed');
    console.log(`${feedTag} now selects ${authenticated.version}`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
