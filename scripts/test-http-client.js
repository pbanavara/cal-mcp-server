#!/usr/bin/env node

const http = require('http');

const BASE_URL = 'http://localhost:3001';

console.log('🧪 MCP HTTP Test Client');
console.log('=======================\n');

async function makeRequest(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
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

async function testEndpoints() {
    try {
        console.log('🔍 Testing server health...');
        const health = await makeRequest('/health');
        console.log('✅ Health check:', health.data);
        console.log('');

        console.log('📊 Testing server status...');
        const status = await makeRequest('/status');
        console.log('✅ Server status:', status.data);
        console.log('');

        console.log('📧 Testing emails endpoint...');
        const emails = await makeRequest('/emails');
        console.log('✅ Recent emails:', emails.data);
        console.log('');

        console.log('🔄 Testing manual email check...');
        const check = await makeRequest('/check', 'POST');
        console.log('✅ Manual check result:', check.data);
        console.log('');

        console.log('🎉 All tests completed successfully!');
        console.log('\n💡 Available endpoints:');
        console.log('   GET  /health  - Server health check');
        console.log('   GET  /status  - Server status and Gmail info');
        console.log('   GET  /emails  - Get recent emails');
        console.log('   POST /check   - Trigger manual email check');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.log('\n💡 Troubleshooting:');
        console.log('   1. Make sure MCP server is running: npm run dev');
        console.log('   2. Check if server is listening on port 3001');
        console.log('   3. Verify no firewall is blocking the connection');
    }
}

// Run the tests
testEndpoints(); 