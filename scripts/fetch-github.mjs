// Writes data/github.js with the contribution calendar.
// Usage: GH_USER=yasinlatif22-cpu node scripts/fetch-github.mjs
// Source 1: GitHub GraphQL API (GITHUB_TOKEN env var, or the GitHub CLI via `gh auth token`).
// Source 2 (fallback when the API returns nothing or zero): the public contribution calendar on the profile page.
// If both come back empty the script exits with an error and leaves data/github.js untouched.
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const user = process.env.GH_USER || 'yasinlatif22-cpu';
const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

const QUERY = `query($login:String!){
  user(login:$login){
    contributionsCollection{
      contributionCalendar{
        totalContributions
        weeks{contributionDays{date contributionCount contributionLevel}}
      }
    }
  }
}`;

async function fromGraphQL() {
  try {
    const token = process.env.GITHUB_TOKEN || execSync('gh auth token').toString().trim();
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'contrib-graph' },
      body: JSON.stringify({ query: QUERY, variables: { login: user } }),
    });
    const json = await res.json();
    if (json.errors || !json.data?.user) return null;
    const cal = json.data.user.contributionsCollection.contributionCalendar;
    const days = cal.weeks.flatMap((w) => w.contributionDays).map((d) => ({
      date: d.date, count: d.contributionCount, level: LEVEL[d.contributionLevel],
    }));
    return { days, total: cal.totalContributions };
  } catch {
    return null;
  }
}

async function fromProfilePage() {
  try {
    const res = await fetch(`https://github.com/users/${user}/contributions`, { headers: { 'User-Agent': 'contrib-graph' } });
    const html = await res.text();
    const cells = [...html.matchAll(/<td[^>]*?data-date="([\d-]+)"[^>]*?id="([^"]+)"[^>]*?data-level="(\d)"/g)]
      .map((m) => ({ date: m[1], id: m[2], level: Number(m[3]) }));
    const counts = new Map([...html.matchAll(/<tool-tip[^>]*?for="([^"]+)"[^>]*>(\d+|No) contribution/g)]
      .map((m) => [m[1], m[2] === 'No' ? 0 : Number(m[2])]));
    if (!cells.length) return null;
    cells.sort((a, b) => (a.date < b.date ? -1 : 1));
    const days = cells.map((c) => ({ date: c.date, count: counts.get(c.id) ?? 0, level: c.level }));
    return { days, total: days.reduce((a, d) => a + d.count, 0) };
  } catch {
    return null;
  }
}

let source = 'GraphQL API';
let result = await fromGraphQL();
if (!result || result.total === 0) {
  source = 'public profile page';
  result = await fromProfilePage();
}
if (!result || result.total === 0) {
  console.error('No contribution data from the API or the profile page. Refusing to overwrite data/github.js.');
  process.exit(1);
}

const { days, total } = result;
const data = {
  user,
  start: days[0].date,
  updated: new Date().toISOString().slice(0, 10), // date of the last successful fetch (UTC)
  total,
  counts: days.map((d) => d.count),
  levels: days.map((d) => d.level).join(''),
};

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'github.js'), `window.GITHUB_DATA=${JSON.stringify(data)};\n`);
console.log(`Wrote data/github.js from the ${source}: ${days.length} days, ${total} contributions`);
