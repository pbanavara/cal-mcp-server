#!/usr/bin/env node

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function testTokenRefresh() {
  console.log('🧪 Testing Token Refresh\n');

  try {
    // Load token from web app storage
    const tokenPath = path.join(__dirname, '..', '..', 'mcp-webapp', 'tokens', 'mcp_tokens.json');
    
    if (!fs.existsSync(tokenPath)) {
      console.error('❌ Token file not found:', tokenPath);
      return;
    }

    const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    const userEmail = Object.keys(tokenData)[0];
    const token = tokenData[userEmail];

    console.log('📋 Token Info:');
    console.log(`   User: ${userEmail}`);
    console.log(`   Has client_id: ${!!token.client_id}`);
    console.log(`   Has client_secret: ${!!token.client_secret}`);
    console.log(`   Has token_uri: ${!!token.token_uri}`);
    console.log(`   Expiry: ${new Date(token.expiry_date).toISOString()}`);
    console.log(`   Is expired: ${Date.now() > token.expiry_date}\n`);

    // Initialize OAuth2 client with client credentials
    const oauth2Client = new google.auth.OAuth2(
      token.client_id,
      token.client_secret,
      token.token_uri
    );

    oauth2Client.setCredentials({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      scope: token.scopes?.join(' ') || token.scope,
      expiry_date: token.expiry_date,
    });

    console.log('🔌 Testing Gmail API connection...');

    // Test Gmail API call
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });

    console.log('✅ Gmail API connection successful!');
    console.log(`   Email: ${profile.data.emailAddress}`);
    console.log(`   Messages Total: ${profile.data.messagesTotal}`);
    console.log(`   History ID: ${profile.data.historyId}`);

    // Test token refresh if needed
    if (Date.now() > token.expiry_date) {
      console.log('\n🔄 Testing token refresh...');
      
      // Force token refresh by making a request
      await gmail.users.messages.list({ userId: 'me', maxResults: 1 });
      
      const newCredentials = oauth2Client.credentials;
      console.log('✅ Token refresh successful!');
      console.log(`   New expiry: ${new Date(newCredentials.expiry_date).toISOString()}`);
    } else {
      console.log('\n✅ Token is still valid, no refresh needed');
    }

  } catch (error) {
    console.error('\n❌ Error testing token refresh:');
    console.error('   Error:', error.message);
    
    if (error.code === 401) {
      console.error('\n💡 This usually means:');
      console.error('   1. Token is expired and refresh failed');
      console.error('   2. Client credentials are incorrect');
      console.error('   3. Need to re-authenticate in the web app');
    }
  }
}

// Run the test
testTokenRefresh().catch(console.error); 