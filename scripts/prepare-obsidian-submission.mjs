import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const semverPattern = /^\d+\.\d+\.\d+$/;

const requiredFiles = ["README.md", "LICENSE", "manifest.json", "main.js", "versions.json"];
const optionalReleaseAssets = ["styles.css"];

async function exists(filePath) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

function parseGitHubRepoPath(remoteUrl) {
	const trimmed = remoteUrl.trim();
	const httpsMatch = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/i);
	if (httpsMatch) return `${httpsMatch[1]}/${httpsMatch[2]}`;

	const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/i);
	if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;

	return null;
}

const missingRequired = [];
for (const file of requiredFiles) {
	if (!(await exists(path.join(root, file)))) {
		missingRequired.push(file);
	}
}

if (missingRequired.length > 0) {
	throw new Error(`Missing required files in repository root: ${missingRequired.join(", ")}`);
}

const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const versions = JSON.parse(await fs.readFile(path.join(root, "versions.json"), "utf8"));

if (!semverPattern.test(manifest.version)) {
	throw new Error(`manifest.json version must be x.y.z. Found: ${manifest.version}`);
}

if (manifest.version !== packageJson.version) {
	throw new Error(`Version mismatch: manifest.json (${manifest.version}) != package.json (${packageJson.version})`);
}

if ((manifest.id || "").toLowerCase().includes("obsidian")) {
	throw new Error(`manifest id cannot include \"obsidian\". Found: ${manifest.id}`);
}

if (versions[manifest.version] !== manifest.minAppVersion) {
	throw new Error(
		`versions.json must include \"${manifest.version}\": \"${manifest.minAppVersion}\" to match manifest.minAppVersion`,
	);
}

let repoPath = "<github-user>/<github-repo>";

const repositoryField =
	typeof packageJson.repository === "string"
		? packageJson.repository
		: typeof packageJson.repository?.url === "string"
			? packageJson.repository.url
			: null;

if (repositoryField) {
	repoPath = parseGitHubRepoPath(repositoryField) ?? repoPath;
}

if (repoPath === "<github-user>/<github-repo>") {
	try {
		const remote = execSync("git config --get remote.origin.url", { cwd: root, encoding: "utf8" });
		repoPath = parseGitHubRepoPath(remote) ?? repoPath;
	} catch {
		// Keep placeholder if git remote is unavailable.
	}
}

const outputDir = path.join(root, "release", "obsidian-submission", manifest.version);
await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

const releaseAssets = ["main.js", "manifest.json", "versions.json"];
for (const optional of optionalReleaseAssets) {
	if (await exists(path.join(root, optional))) releaseAssets.push(optional);
}

for (const file of releaseAssets) {
	await fs.copyFile(path.join(root, file), path.join(outputDir, file));
}

await fs.copyFile(path.join(root, "README.md"), path.join(outputDir, "README.md"));
await fs.copyFile(path.join(root, "LICENSE"), path.join(outputDir, "LICENSE"));

const communityPluginEntry = {
	id: manifest.id,
	name: manifest.name,
	author: manifest.author,
	description: manifest.description,
	repo: repoPath,
};

await fs.writeFile(
	path.join(outputDir, "community-plugin-entry.json"),
	`${JSON.stringify(communityPluginEntry, null, 2)}\n`,
	"utf8",
);

const checklist = `# Obsidian Community Plugin Submission (${manifest.name})

## 1) Create a GitHub release
- Tag: \`${manifest.version}\` (must match \`manifest.json\` version)
- Attach these binary assets from this folder:
  - \`main.js\`
  - \`manifest.json\`
  - \`versions.json\`
  - \`styles.css\` (optional, include if present)

## 2) Open PR in obsidianmd/obsidian-releases
- Edit \`community-plugins.json\`
- Append this JSON object at the end of the array:

\`\`\`json
${JSON.stringify(communityPluginEntry, null, 2)}
\`\`\`

- PR title format: \`Add plugin: ${manifest.name}\`
- In PR body template, check all required boxes with \`[x]\`

## 3) Validation expectations
- Repo is public and reachable
- Root contains \`README.md\`, \`LICENSE\`, \`manifest.json\`
- Release tag equals plugin version (${manifest.version})
- Release includes required assets listed above
- Plugin id is unique and does not contain \`obsidian\`
`;

await fs.writeFile(path.join(outputDir, "SUBMISSION-CHECKLIST.md"), checklist, "utf8");

console.log(`Prepared Obsidian submission bundle: ${path.relative(root, outputDir)}`);
console.log(`Release assets: ${releaseAssets.join(", ")}`);
console.log("Generated: community-plugin-entry.json, SUBMISSION-CHECKLIST.md");
