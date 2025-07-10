const axios = require('axios');

async function testJWTAuth() {
  console.log('🧪 Testing JWT Authentication\n');

  const jwtToken = process.env.REKURA_JWT_TOKEN;
  const mcpServerUrl = process.env.MCP_SERVER_URL || 'http://localhost:3001';

  if (!jwtToken) {
    console.error('❌ REKURA_JWT_TOKEN environment variable not set');
    console.log('Please set your JWT token:');
    console.log('export REKURA_JWT_TOKEN="your-jwt-token-here"');
    return;
  }

  console.log(`🔗 Testing MCP server at: ${mcpServerUrl}`);
  console.log(`🔑 Using JWT token: ${jwtToken.substring(0, 20)}...\n`);

  try {
    // Test health endpoint (should work without auth)
    console.log('1️⃣ Testing health endpoint...');
    const healthResponse = await axios.get(`${mcpServerUrl}/health`);
    console.log('✅ Health check passed:', healthResponse.data);

    // Test MCP endpoint with JWT
    console.log('\n2️⃣ Testing MCP endpoint with JWT...');
    const mcpResponse = await axios.post(`${mcpServerUrl}/mcp`, {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      },
      id: 1
    }, {
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ MCP authentication successful!');
    console.log('Response:', JSON.stringify(mcpResponse.data, null, 2));

    // Test without JWT (should fail)
    console.log('\n3️⃣ Testing MCP endpoint without JWT (should fail)...');
    try {
      await axios.post(`${mcpServerUrl}/mcp`, {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        },
        id: 2
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      console.log('❌ Expected authentication failure, but request succeeded');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Authentication correctly rejected (401 Unauthorized)');
        console.log('Error message:', error.response.data.message);
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }

    console.log('\n🎉 JWT authentication test completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Configure Cursor with the MCP server settings');
    console.log('2. Set REKURA_JWT_TOKEN in Cursor environment');
    console.log('3. Test with: "Check my emails" in Cursor chat');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    console.log('\nTroubleshooting:');
    console.log('1. Make sure the MCP server is running');
    console.log('2. Verify your JWT token is valid');
    console.log('3. Check that Google tokens are stored in Firestore');
  }
}

// Run the test
testJWTAuth().catch(console.error); 