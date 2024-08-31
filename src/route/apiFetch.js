import { exec } from 'child_process';
import { Router } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import 'dotenv/config';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// GitHub Personal Access Token
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = process.env.OWNER;
const REPO = process.env.REPO;
const WORKFLOW_ID = process.env.WORKFLOW_ID;

// Function to ask user input from terminal
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function triggerWorkflow(inputUrl, branch) {
    try {
        const response = await axios.post(
            `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_ID}/dispatches`,
            {
                ref: branch, // Specify the branch to run the workflow on
                inputs: {
                    url: inputUrl
                }
            },
            {
                headers: {
                    Authorization: `token ${GITHUB_TOKEN}`,
                    Accept: 'application/vnd.github.v3+json'
                }
            }
        );
        console.log(`Workflow triggered successfully on branch ${branch}.`);
    } catch (error) {
        console.error('Error triggering workflow:', error.response ? error.response.data : error.message);
    }
}

async function getWorkflowRun(branch) {
    try {
        const response = await axios.get(
            `https://api.github.com/repos/${OWNER}/${REPO}/actions/runs`,
            {
                headers: {
                    Authorization: `token ${GITHUB_TOKEN}`,
                    Accept: 'application/vnd.github.v3+json'
                }
            }
        );
        const runs = response.data.workflow_runs.filter(run => run.head_branch === branch);
        const latestRun = runs.find(run => run.status === 'completed');
        return latestRun;
    } catch (error) {
        console.error('Error fetching workflow run:', error.response ? error.response.data : error.message);
    }
}

async function downloadArtifacts(runId) {
    try {
        const response = await axios.get(
            `https://api.github.com/repos/${OWNER}/${REPO}/actions/runs/${runId}/artifacts`,
            {
                headers: {
                    Authorization: `token ${GITHUB_TOKEN}`,
                    Accept: 'application/vnd.github.v3+json'
                }
            }
        );
        const artifacts = response.data.artifacts;
        for (const artifact of artifacts) {
            const downloadResponse = await axios.get(
                artifact.archive_download_url,
                {
                    headers: {
                        Authorization: `token ${GITHUB_TOKEN}`,
                        Accept: 'application/vnd.github.v3+json'
                    },
                    responseType: 'stream'
                }
            );
            const outputPath = path.join(__dirname, '..', "Result", `${artifact.name}.zip`);
            const writer = fs.createWriteStream(outputPath);
            downloadResponse.data.pipe(writer);

            writer.on('finish', async () => {
                console.log(`Downloaded ${artifact.name} to ${outputPath}`);
                // Extract the zip file into the extracted folder
                const extractPath = path.join(__dirname, '..', "extracted", artifact.name);
                await fs.promises.mkdir(extractPath, { recursive: true });
                fs.createReadStream(outputPath)
                    .pipe(unzipper.Extract({ path: extractPath }))
                    .on('close', () => {
                        console.log(`Extracted ${artifact.name} to ${extractPath}`);
                    });
            });
        }
    } catch (error) {
        console.error('Error downloading artifacts:', error.response ? error.response.data : error.message);
    }
}

const router = Router();

router.post('/', async (req, res) => {
    try {
        // const { url, branch } = req.body;
        const url = "https://github.com/gothinkster/node-express-realworld-example-app";
        const branch = "main";
        if (!url || !branch) {
            return res.status(400).json({ message: 'URL and branch are required' });
        }

        console.log(`Received URL: ${url} and branch: ${branch}`);

        // Trigger the workflow
        await triggerWorkflow(url, branch);
        console.log(`Waiting for the workflow to complete on branch ${branch}...`);

        // Polling the workflow status
        let run;
        while (!run || run.status !== 'completed') {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds before checking again
            run = await getWorkflowRun(branch);
        }

        if (run.conclusion === 'success') {
            console.log('Workflow completed successfully. Downloading and extracting artifacts...');
            await downloadArtifacts(run.id);
            res.json({ message: 'Workflow completed successfully and artifacts downloaded.' });
        } else {
            res.json({ message: 'Workflow did not complete successfully.' });
        }
    } catch (error) {
        console.error('Error in POST request handler:', error.message);
        res.status(500).json({ message: 'Error processing request', error: error.message });
    }
});

export default router;
