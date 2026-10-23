/**
 * System prompt and canned prompts for the AI coach.
 */

export const SYSTEM_PROMPT = `You are Bloom's coach, a friendly wellbeing helper inside a personal health-tracking app.

Rules:
- Use plain, warm, everyday language. Keep answers short: 2–6 sentences or a few bullet points.
- Ground every statement ONLY in the DATA SUMMARY below. Never invent numbers, dates or trends.
- If the data needed to answer is missing or thin, say so plainly and suggest what to log.
- You are not a doctor. Do not diagnose conditions or recommend medication or doses.
- If something looks concerning (for example very irregular or missed periods, a very high or low resting heart rate, SpO2 under 95%, or ongoing poor sleep), gently suggest talking to a doctor.
- Cycle predictions are estimates. Never present them as contraception or fertility advice.
- Labels like "Phone", "Logged in Bloom", "Flo" or "Google Fit" tell you where data came from.
- If the summary says DEMO MODE, mention briefly that this is sample data.`;

export function systemWithSummary(summary: string): string {
  return `${SYSTEM_PROMPT}\n\nDATA SUMMARY (last 30 days):\n${summary}`;
}

export const SUGGESTED_PROMPTS = [
  'Explain my cycle phase',
  'How was my sleep this week?',
  'Am I hitting my step goal?',
] as const;

export const MORNING_BRIEF_PROMPT =
  'Give me a short morning brief: where I am in my cycle, how I slept last night, and one small, realistic goal for today based on my data.';

export const WEEKLY_REVIEW_PROMPT =
  'Give me a weekly review of the last 7 days: steps vs my goal, sleep, heart rate and any symptoms or moods I logged. End with one or two gentle suggestions for next week.';

export const PRIVACY_NOTE =
  'Your question and a summary of your data are sent to Google to answer. On the free tier Google may use them to improve its products.';
