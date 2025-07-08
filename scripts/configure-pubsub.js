#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 Gmail Pub/Sub Configuration Helper\n');

// Get user input
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function configurePubSub() {
  try {
    // Get project ID
    const projectId = await new Promise((resolve) => {
      rl.question('Enter your Google Cloud Project ID: ', resolve);
    });

    // Get topic name
    const topicName = await new Promise((resolve) => {
      rl.question('Enter your Pub/Sub topic name (e.g., gmail-notifications): ', resolve);
    });

    // Construct the full topic URL
    const topicUrl = `projects/${projectId}/topics/${topicName}`;

    console.log('\n📡 Your Pub/Sub topic URL:');
    console.log(`   ${topicUrl}\n`);

    // Update .env file
    const envPath = path.join(__dirname, '..', '.env');
    let envContent = '';

    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    } else {
      // Create default .env content
      envContent = `# MCP Server Configuration
WEBHOOK_PORT=3002
GOOGLE_CLOUD_PROJECT_ID=${projectId}
GMAIL_WATCH_TOPIC=${topicUrl}
MCP_SERVER_PORT=3001
MCP_SERVER_HOST=localhost
NODE_ENV=development
DEBUG=*
LOG_LEVEL=info
`;
    }

    // Update the GMAIL_WATCH_TOPIC line
    const lines = envContent.split('\n');
    let updated = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('GMAIL_WATCH_TOPIC=')) {
        lines[i] = `GMAIL_WATCH_TOPIC=${topicUrl}`;
        updated = true;
        break;
      }
    }

    if (!updated) {
      lines.push(`GMAIL_WATCH_TOPIC=${topicUrl}`);
    }

    // Write back to .env file
    fs.writeFileSync(envPath, lines.join('\n'));

    console.log('✅ Updated .env file with your Pub/Sub topic URL');
    console.log('\n📋 Next steps:');
    console.log('   1. Make sure your Pub/Sub topic exists in Google Cloud Console');
    console.log('   2. Ensure Gmail API has permission to publish to the topic');
    console.log('   3. Set up a webhook subscription or use polling');
    console.log('   4. Run: npm run dev (to start the MCP server)');

  } catch (error) {
    console.error('❌ Error configuring Pub/Sub:', error);
  } finally {
    rl.close();
  }
}

configurePubSub(); 