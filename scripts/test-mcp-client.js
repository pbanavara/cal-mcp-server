#!/usr/bin/env node

const WebSocket = require('ws');
const readline = require('readline');

class MCPTestClient {
  constructor(serverUrl = 'ws://localhost:3001') {
    this.serverUrl = serverUrl;
    this.ws = null;
    this.messageId = 1;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async connect() {
    console.log('🔌 Connecting to MCP server...');
    console.log(`   URL: ${this.serverUrl}`);
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl);
        
        this.ws.on('open', () => {
          console.log('✅ Connected to MCP server!');
          console.log('📡 Starting MCP handshake...');
          this.performHandshake().then(resolve).catch(reject);
        });
        
        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            console.log('📥 Received:', JSON.stringify(message, null, 2));
            this.handleMessage(message);
          } catch (error) {
            console.error('❌ Error parsing message:', error);
          }
        });
        
        this.ws.on('error', (error) => {
          console.error('❌ WebSocket error:', error.message);
          reject(error);
        });
        
        this.ws.on('close', (code, reason) => {
          console.log(`🔌 Connection closed: ${code} - ${reason}`);
        });
        
      } catch (error) {
        console.error('❌ Connection failed:', error.message);
        reject(error);
      }
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
          notebooks: {},
          codeActions: {},
          diagnostics: {},
          experimental: {}
        },
        clientInfo: {
          name: 'MCP Test Client',
          version: '1.0.0'
        }
      }
    };

    console.log('📤 Sending initialize request...');
    this.sendMessage(initializeRequest);
  }

  handleMessage(message) {
    if (message.method === 'notifications/notify') {
      console.log('🔔 Notification received:', message.params);
    } else if (message.result) {
      console.log('✅ Request successful:', message.result);
    } else if (message.error) {
      console.error('❌ Request failed:', message.error);
    }
  }

  sendMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const messageStr = JSON.stringify(message);
      console.log('📤 Sending:', messageStr);
      this.ws.send(messageStr);
    } else {
      console.error('❌ WebSocket not connected');
    }
  }

  async testEmailQuery() {
    console.log('\n📧 Testing email query...');
    
    const emailRequest = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'tools/call',
      params: {
        name: 'get_recent_emails',
        arguments: {
          limit: 5
        }
      }
    };

    this.sendMessage(emailRequest);
  }

  async testMeetingDetection() {
    console.log('\n📅 Testing meeting detection...');
    
    const meetingRequest = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'tools/call',
      params: {
        name: 'detect_meetings',
        arguments: {
          hours: 24
        }
      }
    };

    this.sendMessage(meetingRequest);
  }

  async startInteractiveMode() {
    console.log('\n🎮 Interactive mode started. Type commands:');
    console.log('   email - Test email query');
    console.log('   meeting - Test meeting detection');
    console.log('   quit - Exit');
    
    this.rl.on('line', (input) => {
      const command = input.trim().toLowerCase();
      
      switch (command) {
        case 'email':
          this.testEmailQuery();
          break;
        case 'meeting':
          this.testMeetingDetection();
          break;
        case 'quit':
          console.log('👋 Goodbye!');
          this.close();
          break;
        default:
          console.log('❓ Unknown command. Try: email, meeting, quit');
      }
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
    if (this.rl) {
      this.rl.close();
    }
    process.exit(0);
  }
}

async function main() {
  console.log('🧪 MCP Test Client');
  console.log('==================\n');

  const client = new MCPTestClient();
  
  try {
    await client.connect();
    await client.startInteractiveMode();
  } catch (error) {
    console.error('❌ Failed to connect:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('   1. Make sure MCP server is running: cd mcp-server && npm run dev');
    console.log('   2. Check if server is listening on port 3001');
    console.log('   3. Verify no firewall is blocking the connection');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  process.exit(0);
});

main().catch(console.error); 