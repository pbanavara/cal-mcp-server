import { MCPServer } from './mcp-server';
import { tokenManager } from './token-manager';

async function main() {
  console.log('🚀 Starting MCP Email Monitor Server...');
  
  // Check if tokens are available
  if (!tokenManager.hasTokens()) {
    console.error('❌ No authentication tokens found.');
    console.error('💡 Please authenticate in the web app first: http://localhost:8080');
    process.exit(1);
  }

  console.log(`✅ Found ${tokenManager.getTokenCount()} token(s)`);
  console.log(`📁 Token file: ${tokenManager.getTokenFile()}`);

  // Create and start MCP server
  const mcpServer = new MCPServer();
  
  try {
    await mcpServer.start();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Received SIGINT, shutting down gracefully...');
      await mcpServer.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
      await mcpServer.stop();
      process.exit(0);
    });

    // Keep the process alive
    process.stdin.resume();

  } catch (error) {
    console.error('❌ Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
main().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
}); 