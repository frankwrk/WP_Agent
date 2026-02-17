"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillIngestError = void 0;
exports.ingestPinnedSkillSnapshot = ingestPinnedSkillSnapshot;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
class SkillIngestError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "SkillIngestError";
    }
}
exports.SkillIngestError = SkillIngestError;
function isLikelyCommitSha(value) {
    return /^[0-9a-f]{7,64}$/i.test(value);
}
function matchesSkillPath(filePath) {
    return /(^|\/)skills\/.+\/(skill|spec)\.json$/i.test(filePath)
        || /(^|\/)skills\/.+\.skill\.json$/i.test(filePath)
        || /(^|\/)skills\/.+\.json$/i.test(filePath);
}
function extractRepoOwnerAndName(repoUrl) {
    try {
        const parsed = new URL(repoUrl);
        if (parsed.hostname !== "github.com") {
            throw new SkillIngestError("SKILL_SOURCE_UNSUPPORTED", "Only github.com repositories are supported");
        }
        const parts = parsed.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
        if (parts.length < 2) {
            throw new SkillIngestError("SKILL_SOURCE_INVALID", "repo_url must be in the form https://github.com/{owner}/{repo}");
        }
        return {
            owner: parts[0],
            repo: parts[1],
        };
    }
    catch (error) {
        if (error instanceof SkillIngestError) {
            throw error;
        }
        throw new SkillIngestError("SKILL_SOURCE_INVALID", "repo_url must be a valid URL");
    }
}
async function fetchGitHubTree(repoUrl, commitSha) {
    const { owner, repo } = extractRepoOwnerAndName(repoUrl);
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`;
    const treeResponse = await fetch(treeUrl, {
        headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "wp-agent-runtime",
        },
    });
    if (!treeResponse.ok) {
        throw new SkillIngestError("SKILL_INGEST_FETCH_FAILED", `Failed to fetch repository tree (${treeResponse.status})`);
    }
    const treePayload = (await treeResponse.json());
    const skillNodes = (treePayload.tree ?? []).filter((node) => node.type === "blob"
        && typeof node.path === "string"
        && typeof node.url === "string"
        && matchesSkillPath(node.path));
    if (skillNodes.length === 0) {
        throw new SkillIngestError("SKILL_SOURCE_EMPTY", "No skill JSON files were found under the expected skills/ path");
    }
    const docs = await Promise.all(skillNodes.map(async (node) => {
        const blobResponse = await fetch(node.url, {
            headers: {
                Accept: "application/vnd.github+json",
                "User-Agent": "wp-agent-runtime",
            },
        });
        if (!blobResponse.ok) {
            throw new SkillIngestError("SKILL_INGEST_FETCH_FAILED", `Failed to fetch blob for ${node.path} (${blobResponse.status})`);
        }
        const blobPayload = (await blobResponse.json());
        if (blobPayload.encoding !== "base64" || !blobPayload.content) {
            throw new SkillIngestError("SKILL_INGEST_FETCH_FAILED", `Unexpected blob encoding for ${node.path}`);
        }
        return {
            path: node.path,
            content: Buffer.from(blobPayload.content, "base64").toString("utf8"),
        };
    }));
    docs.sort((a, b) => a.path.localeCompare(b.path));
    return docs;
}
async function walkLocalFiles(rootDir, currentDir) {
    const entries = await node_fs_1.promises.readdir(currentDir, { withFileTypes: true });
    const docs = [];
    for (const entry of entries) {
        const absolute = node_path_1.default.join(currentDir, entry.name);
        if (entry.isDirectory()) {
            docs.push(...(await walkLocalFiles(rootDir, absolute)));
            continue;
        }
        const rel = node_path_1.default.relative(rootDir, absolute).replace(/\\/g, "/");
        if (!matchesSkillPath(rel)) {
            continue;
        }
        docs.push({
            path: rel,
            content: await node_fs_1.promises.readFile(absolute, "utf8"),
        });
    }
    return docs;
}
async function fetchLocalTree(repoUrl) {
    const localPath = repoUrl.replace(/^file:\/\//, "");
    const stats = await node_fs_1.promises.stat(localPath).catch(() => null);
    if (!stats || !stats.isDirectory()) {
        throw new SkillIngestError("SKILL_SOURCE_INVALID", "file:// repo_url must point to a local directory");
    }
    const docs = await walkLocalFiles(localPath, localPath);
    docs.sort((a, b) => a.path.localeCompare(b.path));
    if (docs.length === 0) {
        throw new SkillIngestError("SKILL_SOURCE_EMPTY", "No skill JSON files were found in local repository");
    }
    return docs;
}
function computeIngestionHash(repoUrl, commitSha, docs) {
    const hash = (0, node_crypto_1.createHash)("sha256");
    hash.update(repoUrl);
    hash.update("\n");
    hash.update(commitSha);
    hash.update("\n");
    for (const doc of docs) {
        hash.update(doc.path);
        hash.update("\n");
        hash.update(doc.content);
        hash.update("\n");
    }
    return hash.digest("hex");
}
async function ingestPinnedSkillSnapshot(options) {
    const repoUrl = String(options.repoUrl ?? "").trim();
    const commitSha = String(options.commitSha ?? "").trim();
    if (!repoUrl) {
        throw new SkillIngestError("SKILL_SOURCE_INVALID", "repo_url is required");
    }
    if (!commitSha || !isLikelyCommitSha(commitSha)) {
        throw new SkillIngestError("SKILL_COMMIT_REQUIRED", "commit_sha must be a pinned commit hash");
    }
    const docs = repoUrl.startsWith("file://")
        ? await fetchLocalTree(repoUrl)
        : await fetchGitHubTree(repoUrl, commitSha);
    return {
        repoUrl,
        commitSha,
        documents: docs,
        ingestionHash: computeIngestionHash(repoUrl, commitSha, docs),
    };
}
