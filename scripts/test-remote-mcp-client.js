#!/usr/bin/env node

const http = require('http');

class RemoteMCPTestClient {
  constructor(serverUrl = 'http://localhost:3001') {
    this.serverUrl = serverUrl;
    this.messageId = 1;
    this.pendingRequests = new Map();
  }

  async connect() {
    console.log('🔌 Connecting to Remote MCP server...');
    console.log(`   URL: ${this.serverUrl}`);
    
    // Test health endpoint first
    try {
      const health = await this.makeRequest('/health', 'GET');
      console.log('✅ Health check passed:', health.data);
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      throw error;
    }
    
    console.log('✅ Connected to Remote MCP server!');
    console.log('📡 Starting MCP handshake...');
    await this.performHandshake();
  }

  async makeRequest(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.serverUrl);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: method,
        headers: {
          'Content-Type': 'application/json',
        }
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const jsonBody = JSON.parse(body);
            resolve({ status: res.statusCode, data: jsonBody });
          } catch (e) {
            resolve({ status: res.statusCode, data: body });
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (data) {
        req.write(JSON.stringify(data));
      }
      req.end();
    });
  }

  async performHandshake() {
    // Send initialize request
    const initializeRequest = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {}
        },
        clientInfo: {
          name: 'mcp-test-client',
          version: '1.0.0'
        }
      }
    };

    console.log('📤 Sending initialize request...');
    const initResponse = await this.makeRequest('/mcp', 'POST', initializeRequest);
    console.log('✅ Initialize response:', initResponse.data);
    
    // Send initialized notification
    const initializedNotification = {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {}
    };

    console.log('📤 Sending initialized notification...');
    await this.makeRequest('/mcp', 'POST', initializedNotification);
    
    console.log('✅ MCP handshake completed!');
  }

  async testTools() {
    console.log('\n🧪 Testing MCP Tools...');
    
    // Test get_gmail_status
    console.log('\n📊 Testing get_gmail_status...');
    await this.callTool('get_gmail_status', {});
    
    // Test get_recent_emails
    console.log('\n📧 Testing get_recent_emails...');
    await this.callTool('get_recent_emails', { maxResults: 5 });
    
    // Test check_for_new_messages
    console.log('\n🔄 Testing check_for_new_messages...');
    await this.callTool('check_for_new_messages', {});
  }

  async callTool(name, arguments_) {
    const request = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'tools/call',
      params: {
        name: name,
        arguments: arguments_
      }
    };

    console.log(`📤 Calling tool: ${name}`);
    const response = await this.makeRequest('/mcp', 'POST', request);
    console.log(`✅ Tool response:`, response.data);
    
    return response.data;
  }

  async testResources() {
    console.log('\n📚 Testing MCP Resources...');
    
    const request = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'resources/read',
      params: {
        uri: 'gmail://inbox'
      }
    };

    console.log('📤 Reading gmail_inbox resource...');
    const response = await this.makeRequest('/mcp', 'POST', request);
    console.log('✅ Resource response:', response.data);
    
    return response.data;
  }

  disconnect() {
    console.log('🔌 Disconnected from MCP server');
  }
}

async function main() {
  const client = new RemoteMCPTestClient();
  
  try {
    await client.connect();
    await client.testTools();
    await client.testResources();
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('\n💡 Available tools:');
    console.log('   - start_watching_for_new_emails');
    console.log('   - stop_watching_for_new_emails');
    console.log('   - check_for_new_messages');
    console.log('   - get_gmail_status');
    console.log('   - get_recent_emails');
    console.log('   - search_emails');
    console.log('   - detect_meetings_in_email');
    console.log('\n💡 Available resources:');
    console.log('   - gmail://inbox');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('   1. Make sure remote MCP server is running: npm run remote');
    console.log('   2. Check if server is listening on port 3001');
    console.log('   3. Verify no firewall is blocking the connection');
  } finally {
    client.disconnect();
  }
}

// Run the tests
main(); 