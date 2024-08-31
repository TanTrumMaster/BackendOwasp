import axios from 'axios';
import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Define __dirname and __filename
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
        // Fetch the list of artifacts
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
        console.log('Artifacts fetched:', artifacts);

        if (artifacts.length === 0) {
            console.log('No artifacts found.');
            return;
        }

        for (const artifact of artifacts) {
            console.log(`Processing artifact: ${artifact.name}`);
            
            // Download the artifact
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
            console.log(`Downloading ${artifact.name} from ${artifact.archive_download_url}`);

            const outputPath = path.join(__dirname, '..', 'Result', `${artifact.name}.zip`);
            const writer = fs.createWriteStream(outputPath);
            downloadResponse.data.pipe(writer);

            writer.on('finish', async () => {
                console.log(`Downloaded ${artifact.name} to ${outputPath}`);
                
                // Extract the zip file into the extracted folder
                const extractPath = path.join(__dirname, '..', 'extracted', artifact.name);
                await fs.promises.mkdir(extractPath, { recursive: true });

                fs.createReadStream(outputPath)
                    .pipe(unzipper.Extract({ path: extractPath }))
                    .on('close', () => {
                        console.log(`Extracted ${artifact.name} to ${extractPath}`);
                    })
                    .on('error', (error) => {
                        console.error(`Error extracting ${artifact.name}:`, error);
                    });
            });

            writer.on('error', (error) => {
                console.error(`Error downloading ${artifact.name}:`, error);
            });
        }
    } catch (error) {
        console.error('Error in downloadArtifacts function:', error.response ? error.response.data : error.message);
    }
}


async function run(branch) {
    const inputUrl = await askQuestion('Enter the repository link: ');
    await triggerWorkflow(inputUrl, branch);
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
    } else {
        console.log('Workflow did not complete successfully.');
    }
    rl.close();
}

// Example usage
run('main');
