const fs = require('fs');
const path = require('path');

function getExpoSessionSecret() {
  const statePath = path.join(process.env.USERPROFILE, '.expo', 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const sessionSecret = state?.auth?.sessionSecret;
  if (!sessionSecret) {
    throw new Error(`No sessionSecret found in ${statePath}. Run "eas login" first.`);
  }
  return sessionSecret;
}

async function graphql({ query, variables }) {
  const sessionSecret = getExpoSessionSecret();
  const res = await fetch('https://api.expo.dev/graphql', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'expo-session': sessionSecret,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json?.errors?.length) {
    const msg = json.errors.map((e) => e.message).join('\n');
    throw new Error(msg);
  }
  return json.data;
}

async function main() {
  const submissionId = process.argv[2];
  if (!submissionId) {
    throw new Error('Usage: node scripts/expo-submission-debug.js <submissionId>');
  }

  const introspection = await graphql({
    query: `query Introspect {
      __schema {
        queryType {
          fields {
            name
            args { name type { kind name ofType { kind name ofType { kind name } } } }
            type { kind name ofType { kind name ofType { kind name } } }
          }
        }
      }
    }`,
    variables: {},
  });

  const submissionFields = introspection.__schema.queryType.fields.filter((f) =>
    f.name.toLowerCase().includes('submission')
  );

  console.log(
    JSON.stringify(
      {
        submissionFields: submissionFields.map((f) => ({
          name: f.name,
          args: f.args.map((a) => ({ name: a.name, type: a.type })),
          type: f.type,
        })),
      },
      null,
      2
    )
  );

  const submissionsField = submissionFields.find((f) => f.name === 'submissions');
  if (!submissionsField) return;

  // The root `submissions` has no args; it returns a `SubmissionQuery` object.
  const submissionQueryType = submissionsField.type?.ofType?.name;
  if (!submissionQueryType) return;

  const typeInfo = await graphql({
    query: `query TypeInfo($name: String!) {
      __type(name: $name) {
        name
        fields {
          name
          args { name type { kind name ofType { kind name ofType { kind name } } } }
          type { kind name ofType { kind name ofType { kind name } } }
        }
      }
    }`,
    variables: { name: submissionQueryType },
  });

  console.log(JSON.stringify({ submissionQueryType: typeInfo.__type }, null, 2));

  const fieldsByName = new Map(typeInfo.__type.fields.map((f) => [f.name, f]));
  const candidateFields = ['byId', 'submission', 'view', 'getById', 'one', 'submissionById'];
  const chosen = candidateFields.find((n) => fieldsByName.has(n));
  if (!chosen) return;

  const chosenField = fieldsByName.get(chosen);
  const arg0 = chosenField.args?.[0]?.name;
  if (!arg0) return;

  const q = `query GetSubmission($submissionId: ID!) {
    submissions {
      ${chosen}(submissionId: $submissionId) {
        id
        platform
        status
        createdAt
        updatedAt
        error { message }
      }
    }
  }`;

  try {
    const data = await graphql({ query: q, variables: { submissionId } });
    console.log(JSON.stringify({ fetchedWith: chosen, result: data.submissions[chosen] }, null, 2));

    const submissionType = await graphql({
      query: `query SubmissionType {
        __type(name: "Submission") {
          name
          fields { name type { kind name ofType { kind name ofType { kind name } } } }
        }
      }`,
      variables: {},
    });
    console.log(JSON.stringify({ submissionType: submissionType.__type }, null, 2));

    const extraTypes = await graphql({
      query: `query ExtraTypes {
        logFile: __type(name: "LogFile") { name fields { name } }
        submissionError: __type(name: "SubmissionError") { name fields { name } }
        jobRun: __type(name: "JobRun") { name fields { name } }
        workflowJob: __type(name: "WorkflowJob") { name fields { name } }
        iosConfig: __type(name: "IosSubmissionConfig") { name fields { name } }
        jobRunError: __type(name: "JobRunError") { name fields { name } }
        workflowJobError: __type(name: "WorkflowJobError") { name fields { name } }
      }`,
      variables: {},
    });
    console.log(JSON.stringify(extraTypes, null, 2));

    // Fetch again with likely useful fields
    const rich = await graphql({
      query: `query Rich($submissionId: ID!) {
        submissions {
          byId(submissionId: $submissionId) {
            id
            platform
            status
            canRetry
            createdAt
            updatedAt
            completedAt
            archiveUrl
            logFiles
            error {
              message
              errorCode
            }
            iosConfig {
              ascAppIdentifier
              appleIdUsername
              ascApiKeyId
            }
            jobRun {
              id
              status
              logFileUrls
              errors {
                errorCode
                message
              }
              startedAt
              endedAt
            }
            workflowJob {
              id
              status
              errors {
                title
                message
              }
              outputs
              createdAt
              updatedAt
            }
          }
        }
      }`,
      variables: { submissionId },
    });
    console.log(JSON.stringify({ rich: rich.submissions.byId }, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ fetchedWith: chosen, error: String(e?.message || e) }, null, 2));
  }
}

main().catch((e) => {
  console.error(String(e?.message || e));
  process.exit(1);
});
