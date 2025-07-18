const { TokenManager } = require('./dist/token-manager');

async function testFirestoreTokens() {
  try {
    console.log('🔍 Testing Firestore token storage...');
    
    const tokenManager = TokenManager.getInstance();
    
    // Test if tokens are available
    const hasTokens = await tokenManager.hasTokens();
    console.log(`✅ Has tokens: ${hasTokens}`);
    
    if (hasTokens) {
      const tokenCount = await tokenManager.getTokenCount();
      console.log(`✅ Token count: ${tokenCount}`);
      
      // Try to get a token
      const token = await tokenManager.getToken();
      if (token) {
        console.log(`✅ Retrieved token for: ${token.user_email}`);
        console.log(`✅ Token expires: ${new Date(token.expiry_date).toISOString()}`);
        console.log(`✅ Token expired: ${tokenManager.isTokenExpired(token)}`);
      } else {
        console.log('❌ No token retrieved');
      }
    } else {
      console.log('❌ No tokens found in Firestore');
    }
    
    console.log('🎉 Firestore token test completed!');
    return true;
  } catch (error) {
    console.error('❌ Firestore token test failed:', error.message);
    console.error('Error details:', error);
    return false;
  }
}

testFirestoreTokens(); 