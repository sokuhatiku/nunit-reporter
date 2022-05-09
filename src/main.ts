import { setFailed, getInput } from "@actions/core";
import { GitHub, context } from "@actions/github";
import { readResults, Annotation } from "./nunit";

function generateSummary(annotation: Annotation): string {
  return `* ${annotation.title}\n   ${annotation.message}`;
}

async function run(): Promise<void> {
  try {
    const path = getInput("path");
    const numFailures = parseInt(getInput("numFailures"));
    const accessToken = getInput("access-token");
    const title = getInput("reportTitle");

    const octokit = new GitHub(accessToken);
    const pr = context.payload.pull_request;

    const createResponse = await octokit.checks.create({
      head_sha: (pr && pr["head"] && pr["head"].sha) || context.sha,
      name: `Tests Report: ${title}`,
      status: "in_progress",
      output: {
        title: title,
        summary: "",
      },
      ...context.repo,
    });

    const results = await readResults(path);

    const summary =
      results.failed > 0
        ? `${results.failed} tests failed`
        : `${results.passed} tests passed`;

    let details =
      results.failed === 0
        ? `** ${results.passed} tests passed**`
        : `
**${results.passed} tests passed**
**${results.failed} tests failed**
`;

    for (const ann of results.annotations) {
      const annStr = generateSummary(ann);
      const newDetails = `${details}\n${annStr}`;
      if (newDetails.length > 65000) {
        details = `${details}\n\n ... and more.`;
        break;
      } else {
        details = newDetails;
      }
    }

    console.log(JSON.stringify(results.annotations));

    const updateResponse = await octokit.checks.update({
      check_run_id: createResponse.data.id,
      status: "completed",
      conclusion:
        results.failed > 0 || results.passed === 0 ? "failure" : "success",
      output: {
        title,
        summary,
        annotations: results.annotations.map((a) => {
          return {
            path: a.path,
            start_line: a.start_line,
            end_line: a.end_line,
            annotation_level: a.annotation_level,
            title: a.title,
            message: a.message,
          };
        }),
        text: details,
      },
      ...context.repo,
    });
  } catch (error) {
    setFailed(error);
  }
}

run();
