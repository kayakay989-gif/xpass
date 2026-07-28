import fs from 'fs';
import jwt from 'jsonwebtoken';

const KEY_ID = 'CADG3C6255';
const ISSUER_ID = 'f508c5d0-a1b3-4aac-b661-3abb4886744d';
const APP_ID = '6760907449';
const privateKey = fs.readFileSync(new URL('../AuthKey_CADG3C6255.p8', import.meta.url), 'utf8');

function token() {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: ISSUER_ID, iat: now, exp: now + 300, aud: 'appstoreconnect-v1' },
    privateKey,
    { algorithm: 'ES256', header: { alg: 'ES256', kid: KEY_ID, typ: 'JWT' } }
  );
}

async function ascGet(path) {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}\n${text}`);
  return JSON.parse(text);
}

const builds = await ascGet(
  `/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=10&include=preReleaseVersion`
);

console.log('Recent builds in App Store Connect:\n');
for (const b of builds.data ?? []) {
  const versionRel = builds.included?.find(
    (i) => i.type === 'preReleaseVersions' && i.id === b.relationships?.preReleaseVersion?.data?.id
  );
  const version = versionRel?.attributes?.version ?? '?';
  const state = b.attributes.processingState;
  const uploaded = b.attributes.uploadedDate;
  const buildNum = b.attributes.version;
  console.log(`  build ${buildNum} | version ${version} | ${state} | uploaded ${uploaded}`);
}
