// Writes data/github.js with your real contribution calendar.
// Usage: GH_USER=yasinlatif22-cpu node scripts/fetch-github.mjs
// Auth: GITHUB_TOKEN env var, or the GitHub CLI (`gh auth login`).
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const user = process.env.GH_USER || 'yasinlatif22-cpu';
const token = process.env.GITHUB_TOKEN || execSync('gh auth token').toString().trim();

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

const res = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'contrib-graph' },
  body: JSON.stringify({ query: QUERY, variables: { login: user } }),
});
const json = await res.json();
if (json.errors || !json.data?.user) throw new Error(JSON.stringify(json.errors || json));

const cal = json.data.user.contributionsCollection.contributionCalendar;
const days = cal.weeks.flatMap((w) => w.contributionDays);
const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

const data = {
  user,
  start: days[0].date,
  total: cal.totalContributions,
  counts: days.map((d) => d.contributionCount),
  levels: days.map((d) => LEVEL[d.contributionLevel]).join(''),
};

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'github.js'), `window.GITHUB_DATA=${JSON.stringify(data)};\n`);
console.log(`Wrote data/github.js: ${days.length} days, ${data.total} contributions`);
