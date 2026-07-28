import fs from 'fs';
import path from 'path';

const statePath = path.join(process.env.USERPROFILE || process.env.HOME, '.expo', 'state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const sessionSecret = state.auth?.sessionSecret;
const submissionIds = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['c1505e23-b307-40ee-8687-83bf0abcb0af'];

const query = `
  query SubmissionsByIdQuery($submissionId: ID!) {
    submissions {
      byId(submissionId: $submissionId) {
        id
        status
        platform
        error {
          errorCode
          message
        }
        logFiles
        iosConfig {
          ascAppIdentifier
        }
      }
    }
  }
`;

for (const submissionId of submissionIds) {
  const res = await fetch('https://api.expo.dev/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'expo-session': sessionSecret,
    },
    body: JSON.stringify({ query, variables: { submissionId } }),
  });
  const data = await res.json();
  console.log(`\n=== ${submissionId} ===`);
  console.log(JSON.stringify(data, null, 2));
}
