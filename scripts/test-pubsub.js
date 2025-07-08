#!/usr/bin/env node

const { PubSub } = require('@google-cloud/pubsub');
require('dotenv').config();

async function testPubSubTopic() {
  console.log('🧪 Testing Pub/Sub Topic Configuration\n');

  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const topicName = process.env.GMAIL_WATCH_TOPIC?.split('/').pop();

  if (!projectId || !topicName) {
    console.error('❌ Missing configuration:');
    console.error('   GOOGLE_CLOUD_PROJECT_ID:', projectId);
    console.error('   GMAIL_WATCH_TOPIC:', process.env.GMAIL_WATCH_TOPIC);
    process.exit(1);
  }

  console.log('📋 Configuration:');
  console.log(`   Project ID: ${projectId}`);
  console.log(`   Topic Name: ${topicName}`);
  console.log(`   Full Topic: ${process.env.GMAIL_WATCH_TOPIC}\n`);

  try {
    // Initialize Pub/Sub client
    const pubsub = new PubSub({
      projectId: projectId,
    });

    console.log('🔌 Connecting to Pub/Sub...');

    // Test message data
    const testMessage = {
      type: 'test_message',
      timestamp: new Date().toISOString(),
      data: {
        message: 'Hello from MCP Email Agent!',
        test: true,
        projectId: projectId,
        topicName: topicName
      }
    };

    // Convert to Buffer
    const dataBuffer = Buffer.from(JSON.stringify(testMessage));

    console.log('📤 Publishing test message...');
    console.log('   Message:', JSON.stringify(testMessage, null, 2));

    // Publish the message
    const messageId = await pubsub.topic(topicName).publish(dataBuffer);

    console.log('\n✅ Success!');
    console.log(`   Message ID: ${messageId}`);
    console.log(`   Topic: ${topicName}`);
    console.log(`   Project: ${projectId}`);

    console.log('\n📋 Next steps:');
    console.log('   1. Check Google Cloud Console → Pub/Sub → Topics');
    console.log('   2. Verify the message appears in your topic');
    console.log('   3. Set up a subscription to receive messages');
    console.log('   4. Test Gmail watch API integration');

  } catch (error) {
    console.error('\n❌ Error testing Pub/Sub topic:');
    console.error('   Error:', error.message);
    
    if (error.code === 5) {
      console.error('\n💡 This usually means:');
      console.error('   1. Topic does not exist - create it in Google Cloud Console');
      console.error('   2. Service account lacks permissions');
      console.error('   3. Project ID is incorrect');
    } else if (error.code === 7) {
      console.error('\n💡 This usually means:');
      console.error('   1. Service account lacks permissions to publish');
      console.error('   2. Need to grant "Pub/Sub Publisher" role');
    }

    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Go to Google Cloud Console → Pub/Sub → Topics');
    console.error('   2. Create topic: ' + topicName);
    console.error('   3. Check IAM permissions for your service account');
    console.error('   4. Verify project ID: ' + projectId);

    process.exit(1);
  }
}

// Run the test
testPubSubTopic().catch(console.error); 