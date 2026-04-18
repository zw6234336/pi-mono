import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { promises as fs } from 'fs';

const app = express();
const CONFIG_PATH = path.resolve(__dirname, 'config.json');

app.use(bodyParser.json());
app.use(express.static(__dirname)); // serve index.html and assets

// Get current config
app.get('/config', async (req, res) => {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8');
    res.json(JSON.parse(data));
  } catch (e) {
    res.json({});
  }
});

// Save config & optionally trigger Jenkins
app.post('/save', async (req, res) => {
  const cfg = req.body; // expecting keys: projectUrl, jenkinsUrl, jenkinsJob, jenkinsToken, logServerUrl
  try {
    await fs.writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
    // Execute the CI trigger script
    const { exec } = await import('child_process');
    const env = {
      JENKINS_URL: cfg.jenkinsUrl,
      JENKINS_JOB: cfg.jenkinsJob,
      JENKINS_TOKEN: cfg.jenkinsToken,
    };
    exec('bash ./ci/trigger-jenkins.sh', { env, cwd: path.resolve(__dirname, '..') }, (error, stdout, stderr) => {
      if (error) {
        res.send(`Error triggering CI: ${error.message}`);
      } else {
        res.send(`CI triggered.\n${stdout}\n${stderr}`);
      }
    });
  } catch (e) {
    res.status(500).send('Failed to save config: ' + e.message);
  }
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`CI config UI listening on http://localhost:${PORT}`));
