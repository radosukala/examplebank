/**
 * THE REFUSAL, WHERE THE TEAM ALREADY IS.
 *
 * A required check blocks the merge. It does not tell anyone. The person who can
 * unblock it is usually not the person watching the PR, and asking them to watch
 * one is how a control becomes a queue.
 *
 * **We render; the customer's own incoming webhook posts.** No bot token, no OAuth
 * grant, no events listener, nothing hosted. The CI step reads a webhook URL from
 * their repository secret and curls this payload at it — so the Slack surface adds
 * exactly zero to what we hold, which is the property that gets us through intake.
 * If the secret is absent the payload is printed to the log and nothing is posted:
 * the feature degrades into something useful rather than into an error.
 *
 * No `actions` block, deliberately. Even a button whose only job is to open a URL
 * makes Slack dispatch an interaction, and an app with no request URL answers that
 * with an error in front of the person we were trying to help. Links live in
 * mrkdwn instead, where they cost nothing and cannot fail.
 *
 * Schema checked against Slack's reference rather than recalled: header text is
 * `plain_text` only and caps at 150; section text caps at 3000 and `fields` at 10
 * items of 2000; context takes at most 10 elements; a message takes at most 50
 * blocks; and `&`, `<`, `>` are control characters that must be HTML-escaped.
 */
import type { ReportInput } from "./ci-report.js";
export interface SlackMessage {
    /** Fallback for notifications and clients that do not render blocks. */
    text: string;
    blocks: unknown[];
}
export interface SlackWhere {
    repo?: string | null;
    /** The workflow run, so a reader can reach the annotations and the manifest. */
    run_url?: string | null;
}
/**
 * One decision, two genuinely different messages.
 *
 * Everything here comes from the same `ReportInput` the CI annotations and the
 * job summary are built from, so Slack cannot say something the check did not.
 */
export declare function slackMessage(input: ReportInput, where?: SlackWhere): SlackMessage;
//# sourceMappingURL=slack.d.ts.map