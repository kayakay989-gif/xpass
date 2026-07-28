import fs from 'fs';
import path from 'path';

const statePath = path.join(process.env.USERPROFILE || process.env.HOME, '.expo', 'state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const sessionSecret = state.auth?.sessionSecret;
const appId = '05cfe6ff-0777-4879-baf1-8d836c51fd2f';

const query = `
  query GetAllSubmissionsForApp($appId: String!, $offset: Int!, $limit: Int!) {
    app {
      byId(appId: $appId) {
        id
        submissions(offset: $offset, limit: $limit) {
          id
          status
          platform
          error {
            errorCode
            message
          }
          logFiles
        }
      }
    }
  }
`;

const res = await fetch('https://api.expo.dev/graphql', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'expo-session': sessionSecret,
  },
  body: JSON.stringify({ query, variables: { appId, offset: 0, limit: 10 } }),
});

console.log(JSON.stringify(await res.json(), null, 2));
