import fs from 'fs';
import path from 'path';

const statePath = path.join(process.env.USERPROFILE || process.env.HOME, '.expo', 'state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const sessionSecret = state.auth?.sessionSecret;
const accessToken = process.env.EXPO_TOKEN || state.accessToken;
const appId = '05cfe6ff-0777-4879-baf1-8d836c51fd2f';

async function gql(query, variables) {
  const headers = { 'Content-Type': 'application/json' };
  if (sessionSecret) headers['expo-session'] = sessionSecret;
  else if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  else throw new Error('No Expo auth session found');

  const res = await fetch('https://api.expo.dev/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(JSON.stringify(json.errors, null, 2));
  }
  return json.data;
}

const action = process.argv[2] || 'list';

if (action === 'list') {
  const data = await gql(`
    query AppCredentials($appId: String!) {
      app {
        byId(appId: $appId) {
          id
          slug
          iosAppCredentials {
            id
            appleAppIdentifier { bundleIdentifier }
            appStoreConnectApiKeyForSubmissions { id keyIdentifier }
            iosAppBuildCredentialsList {
              id
              iosDistributionType
              provisioningProfile {
                id
                developerPortalIdentifier
                status
                updatedAt
              }
            }
          }
        }
      }
    }
  `, { appId });
  console.log(JSON.stringify(data, null, 2));
}

if (action === 'delete-profile') {
  const profileId = process.argv[3];
  if (!profileId) throw new Error('Usage: node eas-ios-credentials.mjs delete-profile <profileId>');
  const data = await gql(`
    mutation DeleteProfile($ids: [ID!]!) {
      appleProvisioningProfile {
        deleteAppleProvisioningProfiles(ids: $ids) {
          id
        }
      }
    }
  `, { ids: [profileId] });
  console.log(JSON.stringify(data, null, 2));
}

if (action === 'list-push-keys') {
  const data = await gql(`
    query AccountPushKeys {
      meActor {
        ... on UserActor {
          accounts {
            name
            applePushKeys {
              id
              keyIdentifier
              updatedAt
            }
          }
        }
      }
    }
  `, {});
  console.log(JSON.stringify(data, null, 2));
}

if (action === 'assign-push-key') {
  const pushKeyId = process.argv[3];
  const iosAppCredentialsId = process.argv[4] || '99bad523-f549-46fb-89ce-73c7b14e9fc8';
  if (!pushKeyId) throw new Error('Usage: node eas-ios-credentials.mjs assign-push-key <pushKeyId> [iosAppCredentialsId]');
  const data = await gql(`
    mutation SetPushKey($id: ID!, $pushKeyId: ID!) {
      iosAppCredentials {
        setPushKey(id: $id, pushKeyId: $pushKeyId) {
          id
          pushKey { id keyIdentifier }
        }
      }
    }
  `, { id: iosAppCredentialsId, pushKeyId });
  console.log(JSON.stringify(data, null, 2));
}

if (action === 'upload-asc-key') {
  const keyPath = process.argv[3] || path.join(process.cwd(), 'AuthKey_CADG3C6255.p8');
  const keyP8 = fs.readFileSync(keyPath, 'utf8');
  const accountId = '67edece1-0cad-4304-b986-62a1d33f5732';
  const create = await gql(`
    mutation CreateAscKey($accountId: ID!, $input: AppStoreConnectApiKeyInput!) {
      appStoreConnectApiKey {
        createAppStoreConnectApiKey(accountId: $accountId, appStoreConnectApiKeyInput: $input) {
          id
          keyIdentifier
          issuerIdentifier
        }
      }
    }
  `, {
    accountId,
    input: {
      keyIdentifier: 'CADG3C6255',
      issuerIdentifier: 'f508c5d0-a1b3-4aac-b661-3abb4886744d',
      keyP8,
    },
  });
  console.log('Created ASC key:', JSON.stringify(create, null, 2));
}

if (action === 'sync-capabilities') {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const easRoot = process.env.EAS_CLI_ROOT ||
    'C:/Users/essab/AppData/Local/npm-cache/_npx/6bc7bae5c2059953/node_modules/eas-cli/build';
  const { authenticateAsync } = require(path.join(easRoot, 'credentials/ios/appstore/authenticate.js'));
  const { AuthenticationMode } = require(path.join(easRoot, 'credentials/ios/appstore/authenticateTypes.js'));
  const { ensureBundleIdExistsWithNameAsync } = require(path.join(easRoot, 'credentials/ios/appstore/ensureAppExists.js'));

  process.env.EXPO_ASC_API_KEY_PATH = process.env.EXPO_ASC_API_KEY_PATH ||
    path.join(process.cwd(), 'AuthKey_CADG3C6255.p8');
  process.env.EXPO_ASC_KEY_ID = process.env.EXPO_ASC_KEY_ID || 'CADG3C6255';
  process.env.EXPO_ASC_ISSUER_ID = process.env.EXPO_ASC_ISSUER_ID || 'f508c5d0-a1b3-4aac-b661-3abb4886744d';
  process.env.EXPO_APPLE_TEAM_ID = process.env.EXPO_APPLE_TEAM_ID || 'PA266475ZW';
  process.env.EXPO_APPLE_TEAM_TYPE = process.env.EXPO_APPLE_TEAM_TYPE || 'COMPANY_OR_ORGANIZATION';

  const authCtx = await authenticateAsync({
    mode: AuthenticationMode.API_KEY,
  });

  const entitlements = {
    'com.apple.developer.in-app-payments': ['merchant.com.xpass.app'],
    'com.apple.developer.associated-domains': [
      'applinks:xpass-rork-1e6ad.web.app',
      'applinks:xpass.app',
    ],
    'com.apple.developer.applesignin': ['Default'],
  };

  await ensureBundleIdExistsWithNameAsync(
    authCtx,
    { name: '@essa989/xpass-subscription-app', bundleIdentifier: 'com.xpass.app' },
    { entitlements, merchantIdentifiers: ['merchant.com.xpass.app'] },
  );

  console.log('Capabilities synced for com.xpass.app');
}

if (action === 'inspect-bundle') {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const easRoot = process.env.EAS_CLI_ROOT ||
    'C:/Users/essab/AppData/Local/npm-cache/_npx/6bc7bae5c2059953/node_modules/eas-cli/build';
  const { authenticateAsync } = require(path.join(easRoot, 'credentials/ios/appstore/authenticate.js'));
  const { AuthenticationMode } = require(path.join(easRoot, 'credentials/ios/appstore/authenticateTypes.js'));
  const { getRequestContext } = require(path.join(easRoot, 'credentials/ios/appstore/authenticate.js'));
  const { BundleId } = require(path.join(easRoot, '../../@expo/apple-utils/build/index.js'));

  process.env.EXPO_ASC_API_KEY_PATH = process.env.EXPO_ASC_API_KEY_PATH ||
    path.join(process.cwd(), 'AuthKey_CADG3C6255.p8');
  process.env.EXPO_ASC_KEY_ID = process.env.EXPO_ASC_KEY_ID || 'CADG3C6255';
  process.env.EXPO_ASC_ISSUER_ID = process.env.EXPO_ASC_ISSUER_ID || 'f508c5d0-a1b3-4aac-b661-3abb4886744d';
  process.env.EXPO_APPLE_TEAM_ID = process.env.EXPO_APPLE_TEAM_ID || 'PA266475ZW';
  process.env.EXPO_APPLE_TEAM_TYPE = process.env.EXPO_APPLE_TEAM_TYPE || 'COMPANY_OR_ORGANIZATION';

  const authCtx = await authenticateAsync({ mode: AuthenticationMode.API_KEY });
  const context = getRequestContext(authCtx);
  const bundleId = await BundleId.findAsync(context, { identifier: 'com.xpass.app' });
  const caps = await bundleId.getBundleIdCapabilitiesAsync();
  console.log(JSON.stringify(caps.map(c => ({ type: c.attributes?.capabilityType, settings: c.attributes?.settings })), null, 2));
}
