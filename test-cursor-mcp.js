#!/usr/bin/env node

const http = require('http');

async function testCursorMCP() {
  console.log('🧪 Testing MCP connection exactly like Cursor would...\n');

  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/mcp',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMDAxMjM1NTQ0MjIyMTI0Njk1NjMiLCJlbWFpbCI6InByYWRlZXBAcmVrdXJhLnh5eiIsIm5hbWUiOiJQcmFkZWVwIEJhbmF2YXJhIiwiaWF0IjoxNzUyNjk5NDM1LCJqdGkiOiIxZDMyNzY1My02YjRlLTQxYTAtODhlZS01ZWFhMDBmYjljY2IiLCJleHAiOjE3NTI3ODU4MzV9.Wuh0i0TjZXvsoJrHvL6n9LEXOvUyfyQrL40Sw0kwKZM',
      'Mcp-Session-Id': 'cursor-session-fresh-67890'
    }
  };

  // Test 1: Initialize
  console.log('1️⃣ Testing initialize...');
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {}
      },
      clientInfo: {
        name: 'cursor',
        version: '1.0.0'
      }
    }
  };

  try {
    const initResponse = await makeRequest(options, initRequest);
    console.log('✅ Initialize successful:', JSON.stringify(initResponse, null, 2));

    // Test 2: Tools List
    console.log('\n2️⃣ Testing tools/list...');
    const toolsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    };

    const toolsResponse = await makeRequest(options, toolsRequest);
    console.log('✅ Tools list successful:');
    console.log(`   Found ${toolsResponse.result.tools.length} tools:`);
    toolsResponse.result.tools.forEach(tool => {
      console.log(`   - ${tool.name}: ${tool.description}`);
    });

    console.log('\n🎉 MCP connection test successful!');
    console.log('\n💡 If Cursor still doesn\'t show tools:');
    console.log('   1. Restart Cursor completely');
    console.log('   2. Check Cursor\'s MCP logs');
    console.log('   3. Try a different session ID');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          // Handle SSE format
          if (body.includes('event: message')) {
            const lines = body.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonData = line.substring(6);
                resolve(JSON.parse(jsonData));
                return;
              }
            }
          }
          // Handle regular JSON
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(JSON.stringify(data));
    req.end();
  });
}

testCursorMCP().catch(console.error); 