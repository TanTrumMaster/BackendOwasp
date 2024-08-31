import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Function to determine the primary risk level
function determineRiskLevel(riskdesc) {
    let primaryRisk = riskdesc.split(' ')[0].toLowerCase();
    return primaryRisk.charAt(0).toUpperCase() + primaryRisk.slice(1);
}

// Function to parse JSON file and count vulnerabilities
function parseAndCountVulnerabilities(filePath) {
    let vulnerabilitySummary = {
        "Informational": {
            count: 0,
            types: [],
            apis: []
        },
        "Low": {
            count: 0,
            types: [],
            apis: []
        },
        "Medium": {
            count: 0,
            types: [],
            apis: []
        },
        "High": {
            count: 0,
            types: [],
            apis: []
        }
    };

    try {
        // Read and parse the JSON file
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const jsonData = JSON.parse(fileContent);

        // Extract the alerts from the JSON data
        const sites = jsonData.site || [];
        sites.forEach(site => {
            const alerts = site.alerts || [];
            alerts.forEach(alert => {
                if (alert.riskdesc) {
                    let riskLevel = determineRiskLevel(alert.riskdesc);

                    // Handle specific cases where riskdesc includes additional information
                    if (riskLevel === "Low" && alert.riskdesc.includes("(Medium)")) {
                        riskLevel = "Medium";
                    } else if (riskLevel === "Medium" && alert.riskdesc.includes("(Low)")) {
                        riskLevel = "Low";
                    } else if (riskLevel === "High" && alert.riskdesc.includes("(Medium)")) {
                        riskLevel = "High";
                    }

                    // Increase the corresponding risk count and add alert type and API
                    if (vulnerabilitySummary[riskLevel] !== undefined) {
                        vulnerabilitySummary[riskLevel].count++;
                        vulnerabilitySummary[riskLevel].types.push(alert.alert);
                        if (alert.uri) {
                            vulnerabilitySummary[riskLevel].apis.push(alert.uri);
                        }
                    }
                }
            });
        });
    } catch (error) {
        console.error(`Error parsing or processing file ${filePath}:`, error);
    }

    return vulnerabilitySummary;
}

// Function to process all JSON files in a folder and create a summary
function processFolderAndCreateSummary(folderPath, summaryFilePath) {
    const summary = {};

    // Read all files in the directory
    fs.readdir(folderPath, (err, files) => {
        if (err) {
            console.error('Error reading directory:', err);
            return;
        }

        // Filter JSON files and process each
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        jsonFiles.forEach(file => {
            const filePath = path.join(folderPath, file);
            const summaryData = parseAndCountVulnerabilities(filePath);
            summary[file] = summaryData;
        });

        // Write the summary to a JSON file
        fs.writeFileSync(summaryFilePath, JSON.stringify(summary, null, 2), 'utf-8');
        console.log(`Summary has been saved to ${summaryFilePath}`);
    });
}

// Path to the folder containing JSON files
const folderPath = path.join(__dirname, 'extracted', 'zap-reports');

// Path for the summary JSON file
const summaryFilePath = path.join(__dirname, 'Summary.json');

// Process the folder and create the summary file
processFolderAndCreateSummary(folderPath, summaryFilePath);
