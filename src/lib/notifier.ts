import type { JobNotification } from "./types.js";

async function postToSlack(payload: object): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("No SLACK_WEBHOOK_URL set, skipping notification");
    return;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Slack webhook failed (${response.status}): ${text}`);
  }
}

export async function sendNotificationDigest(notifications: JobNotification[]): Promise<void> {
  if (notifications.length === 0) return;

  const newJobs = notifications.filter((n) => n.event === "NEW_JOB");
  const removedJobs = notifications.filter((n) => n.event === "REMOVED_JOB");

  const blocks: object[] = [];

  if (newJobs.length > 0) {
    blocks.push({
      type: "header",
      text: { type: "plain_text", text: `${newJobs.length} New Job(s) Found` },
    });

    for (const job of newJobs.slice(0, 20)) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*<${job.url}|${job.title}>*\n${job.companyName}  •  ${job.location}  •  ${job.department}`,
        },
      });
    }

    if (newJobs.length > 20) {
      blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `...and ${newJobs.length - 20} more new jobs` }],
      });
    }
  }

  if (removedJobs.length > 0) {
    blocks.push({
      type: "header",
      text: { type: "plain_text", text: `${removedJobs.length} Job(s) Removed` },
    });

    for (const job of removedJobs.slice(0, 10)) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `~${job.title}~ @ ${job.companyName}`,
        },
      });
    }

    if (removedJobs.length > 10) {
      blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `...and ${removedJobs.length - 10} more removed` }],
      });
    }
  }

  await postToSlack({ blocks });
}
