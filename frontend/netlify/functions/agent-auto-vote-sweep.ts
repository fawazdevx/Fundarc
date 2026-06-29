import { schedule } from "@netlify/functions";

function siteUrl() {
  return process.env.URL ?? process.env.DEPLOY_PRIME_URL ?? process.env.DEPLOY_URL;
}

async function handler() {
  const baseUrl = siteUrl();
  const automationSecret = process.env.AGENT_AUTOMATION_SECRET;

  if (!baseUrl || !automationSecret) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        skipped: true,
        reason: "URL and AGENT_AUTOMATION_SECRET are required for scheduled auto-voting.",
      }),
    };
  }

  const response = await fetch(`${baseUrl}/api/agents/auto-vote/sweep`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-fundarc-agent-secret": automationSecret,
    },
    body: JSON.stringify({ source: "netlify-scheduled-function" }),
  });

  const payload = await response.text();
  return {
    statusCode: response.ok ? 200 : response.status,
    body: payload,
  };
}

export default schedule("*/5 * * * *", handler);
