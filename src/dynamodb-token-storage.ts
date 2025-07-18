import 'dotenv/config';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export interface TokenStorageRecord {
  jti: string;
  user_id: string;
  email: string;
  name?: string;
  google_tokens: {
    access_token: string;
    refresh_token: string;
    expiry_date: number;
    scopes: string[];
  };
  created_at: string;
  updated_at: string;
  last_used?: string;
}

export class DynamoDBTokenStorage {
  private tableName: string = 'user_tokens';
  private client: DynamoDBDocumentClient;
  private isInitialized: boolean = false;

  constructor() {
    console.log('🔧 DynamoDBTokenStorage constructor called');
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({
      region: process.env['AWS_REGION'] || 'us-east-1'
    }));
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log('🔧 Initializing DynamoDB connection...');
    console.log(`🔧 Environment variables: AWS_REGION=${process.env['AWS_REGION'] || 'us-east-1'}`);
    console.log(`🔧 Environment variables: AWS_ACCESS_KEY_ID=${process.env['AWS_ACCESS_KEY_ID'] ? 'SET' : 'NOT_SET'}`);
    console.log(`🔧 Environment variables: AWS_SECRET_ACCESS_KEY=${process.env['AWS_SECRET_ACCESS_KEY'] ? 'SET' : 'NOT_SET'}`);
    
    this.isInitialized = true;
    console.log('✅ DynamoDB client initialized successfully');
  }

  async getTokens(jti: string): Promise<TokenStorageRecord | null> {
    console.log('🔧 getTokens() called');
    console.log(`🔧 Getting tokens for JTI: ${jti}`);
    
    await this.initialize();
    
    try {
      console.log(`🔧 Querying DynamoDB table: ${this.tableName}, key: ${jti}`);
      const result = await this.client.send(new GetCommand({
        TableName: this.tableName,
        Key: { jti }
      }));
      
      if (!result.Item) {
        console.log('❌ Item does not exist in DynamoDB');
        return null;
      }
      
      console.log('✅ Item exists, extracting data');
      const data = result.Item as TokenStorageRecord;
      console.log('🔧 Retrieved data:', JSON.stringify(data, null, 2));
      
      // Update last used timestamp
      console.log('🔧 Updating last_used timestamp...');
      await this.updateLastUsed(jti);
      console.log('✅ Last used timestamp updated');
      
      return data;
    } catch (error) {
      console.error('❌ Error retrieving JWT tokens from DynamoDB:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      return null;
    }
  }

  async getTokensByEmail(email: string): Promise<TokenStorageRecord[]> {
    console.log('🔧 getTokensByEmail() called');
    console.log(`🔧 Getting tokens for email: ${email}`);
    
    await this.initialize();
    
    try {
      console.log(`🔧 Scanning DynamoDB table: ${this.tableName} for email: ${email}`);
      const result = await this.client.send(new ScanCommand({
        TableName: this.tableName,
        FilterExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email }
      }));
      
      console.log(`✅ Scan completed, found ${result.Items?.length || 0} documents`);
      const results = result.Items as TokenStorageRecord[] || [];
      console.log('🔧 Retrieved tokens:', JSON.stringify(results, null, 2));
      
      return results;
    } catch (error) {
      console.error('❌ Error retrieving tokens by email from DynamoDB:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      return [];
    }
  }

  async getAllTokens(): Promise<TokenStorageRecord[]> {
    console.log('🔧 getAllTokens() called');
    
    await this.initialize();
    
    try {
      console.log(`🔧 Scanning all documents from table: ${this.tableName}`);
      const result = await this.client.send(new ScanCommand({
        TableName: this.tableName
      }));
      
      console.log(`✅ Retrieved ${result.Items?.length || 0} total documents`);
      const results = result.Items as TokenStorageRecord[] || [];
      
      return results;
    } catch (error) {
      console.error('❌ Error retrieving all tokens from DynamoDB:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      return [];
    }
  }

  async putTokens(record: TokenStorageRecord): Promise<void> {
    console.log('🔧 putTokens() called');
    console.log(`🔧 Storing tokens for JTI: ${record.jti}`);
    
    await this.initialize();
    
    try {
      console.log(`🔧 Putting item into DynamoDB table: ${this.tableName}`);
      await this.client.send(new PutCommand({
        TableName: this.tableName,
        Item: record
      }));
      
      console.log('✅ Tokens stored successfully in DynamoDB');
    } catch (error) {
      console.error('❌ Error storing tokens in DynamoDB:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async updateLastUsed(jti: string): Promise<void> {
    console.log('🔧 updateLastUsed() called');
    console.log(`🔧 Updating last_used for JTI: ${jti}`);
    
    await this.initialize();
    
    try {
      await this.client.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { jti },
        UpdateExpression: 'set last_used = :now',
        ExpressionAttributeValues: { ':now': new Date().toISOString() }
      }));
      
      console.log('✅ Last used timestamp updated successfully');
    } catch (error) {
      console.error('❌ Error updating last_used in DynamoDB:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async cleanupExpiredTokens(): Promise<void> {
    console.log('🔧 cleanupExpiredTokens() called');
    
    await this.initialize();
    
    try {
      const now = new Date();
      console.log(`🔧 Current time: ${now.toISOString()}`);
      console.log(`🔧 Scanning table: ${this.tableName} for expired tokens`);
      
      const result = await this.client.send(new ScanCommand({
        TableName: this.tableName,
        FilterExpression: 'google_tokens.expiry_date < :now',
        ExpressionAttributeValues: { ':now': now.getTime() }
      }));
      
      console.log(`✅ Found ${result.Items?.length || 0} expired tokens`);
      
      if (result.Items && result.Items.length > 0) {
        console.log('🔧 Deleting expired tokens...');
        
        // Delete expired tokens one by one (DynamoDB doesn't support batch delete with conditions)
        for (const item of result.Items) {
          try {
            await this.client.send(new DeleteCommand({
              TableName: this.tableName,
              Key: { jti: item['jti'] }
            }));
            console.log(`🔧 Deleted expired token: ${item['jti']}`);
          } catch (deleteError) {
            console.error(`❌ Error deleting expired token ${item['jti']}:`, deleteError);
          }
        }
        
        console.log(`🧹 Cleaned up ${result.Items.length} expired tokens from DynamoDB`);
      } else {
        console.log('✅ No expired tokens found');
      }
    } catch (error) {
      console.error('❌ Error cleaning up expired tokens from DynamoDB:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
    }
  }
} 