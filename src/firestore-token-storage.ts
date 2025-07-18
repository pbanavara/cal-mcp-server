import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

export class FirestoreTokenStorage {
  private db: FirebaseFirestore.Firestore | null = null;
  private collectionName: string = 'user_tokens';

  constructor() {
    console.log('🔧 FirestoreTokenStorage constructor called');
  }

  private async initializeFirebase(): Promise<void> {
    console.log('🔧 initializeFirebase() called');
    if (this.db) {
      console.log('✅ Firebase already initialized, skipping');
      return;
    }

    console.log('🔧 Starting Firebase initialization...');
    console.log(`🔧 Environment variables: GOOGLE_APPLICATION_CREDENTIALS=${process.env['GOOGLE_APPLICATION_CREDENTIALS'] || 'NOT_SET'}`);
    console.log(`🔧 Environment variables: FIREBASE_PROJECT_ID=${process.env['FIREBASE_PROJECT_ID'] || 'NOT_SET'}`);

    // Initialize Firebase Admin if not already initialized
    if (getApps().length === 0) {
      console.log('🔧 No existing Firebase apps found, creating new one');
      
      let serviceAccount;
      
      if (process.env['GOOGLE_APPLICATION_CREDENTIALS']) {
        console.log('🔧 Loading service account from GOOGLE_APPLICATION_CREDENTIALS');
        try {
          serviceAccount = require(process.env['GOOGLE_APPLICATION_CREDENTIALS']);
          console.log('✅ Service account loaded successfully from file');
        } catch (error) {
          console.error('❌ Error loading service account from file:', error);
          throw new Error(`Cannot load service account from ${process.env['GOOGLE_APPLICATION_CREDENTIALS']}`);
        }
      } else {
        console.log('🔧 No GOOGLE_APPLICATION_CREDENTIALS set, using Application Default Credentials');
        serviceAccount = undefined;
      }

      const projectId = process.env['FIREBASE_PROJECT_ID'] || 'strong-land-463914-c4';
      console.log(`🔧 Initializing Firebase app with project ID: ${projectId}`);
      
      try {
        initializeApp({
          credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
          projectId: projectId
        });
        console.log('✅ Firebase app initialized successfully');
      } catch (error) {
        console.error('❌ Error initializing Firebase app:', error);
        throw error;
      }
    } else {
      console.log('✅ Firebase app already exists, reusing');
    }

    try {
      this.db = getFirestore();
      console.log('✅ Firestore instance created successfully');
      console.log(`✅ Firestore initialized for project: ${process.env['FIREBASE_PROJECT_ID'] || 'strong-land-463914-c4'}`);
    } catch (error) {
      console.error('❌ Error creating Firestore instance:', error);
      throw error;
    }
  }

  async getTokens(jti: string): Promise<TokenStorageRecord | null> {
    console.log('🔧 getTokens() called');
    console.log(`🔧 Getting tokens for JTI: ${jti}`);
    
    await this.initializeFirebase();
    
    try {
      console.log(`🔧 Creating document reference for collection: ${this.collectionName}, doc: ${jti}`);
      const docRef = this.db!.collection(this.collectionName).doc(jti);
      
      console.log('🔧 Calling Firestore get() operation...');
      const doc = await docRef.get();
      
      if (!doc.exists) {
        console.log('❌ Document does not exist in Firestore');
        return null;
      }
      
      console.log('✅ Document exists, extracting data');
      const data = doc.data() as TokenStorageRecord;
      console.log('🔧 Retrieved data:', JSON.stringify(data, null, 2));
      
      // Update last used timestamp
      console.log('🔧 Updating last_used timestamp...');
      await docRef.update({
        last_used: new Date()
      });
      console.log('✅ Last used timestamp updated');
      
      return data;
    } catch (error) {
      console.error('❌ Error retrieving JWT tokens from Firestore:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      return null;
    }
  }

  async getTokensByEmail(email: string): Promise<TokenStorageRecord[]> {
    console.log('🔧 getTokensByEmail() called');
    console.log(`🔧 Getting tokens for email: ${email}`);
    
    await this.initializeFirebase();
    
    try {
      console.log(`🔧 Querying collection: ${this.collectionName} where email == ${email}`);
      const snapshot = await this.db!
        .collection(this.collectionName)
        .where('email', '==', email)
        .get();
      
      console.log(`✅ Query completed, found ${snapshot.docs.length} documents`);
      const results = snapshot.docs.map(doc => doc.data() as TokenStorageRecord);
      console.log('🔧 Retrieved tokens:', JSON.stringify(results, null, 2));
      
      return results;
    } catch (error) {
      console.error('❌ Error retrieving tokens by email from Firestore:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      return [];
    }
  }

  async getAllTokens(): Promise<TokenStorageRecord[]> {
    console.log('🔧 getAllTokens() called');
    
    await this.initializeFirebase();
    
    try {
      console.log(`🔧 Getting all documents from collection: ${this.collectionName}`);
      const snapshot = await this.db!.collection(this.collectionName).get();
      
      console.log(`✅ Retrieved ${snapshot.docs.length} total documents`);
      const results = snapshot.docs.map(doc => doc.data() as TokenStorageRecord);
      
      return results;
    } catch (error) {
      console.error('❌ Error retrieving all tokens from Firestore:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      return [];
    }
  }

  async cleanupExpiredTokens(): Promise<void> {
    console.log('🔧 cleanupExpiredTokens() called');
    
    await this.initializeFirebase();
    
    try {
      const now = new Date();
      console.log(`🔧 Current time: ${now.toISOString()}`);
      console.log(`🔧 Querying collection: ${this.collectionName} for expired tokens`);
      
      const snapshot = await this.db!
        .collection(this.collectionName)
        .where('google_tokens.expiry_date', '<', now.getTime())
        .get();
      
      console.log(`✅ Found ${snapshot.docs.length} expired tokens`);
      
      if (snapshot.docs.length > 0) {
        console.log('🔧 Creating batch delete operation...');
        const batch = this.db!.batch();
        snapshot.docs.forEach(doc => {
          console.log(`🔧 Adding document ${doc.id} to batch delete`);
          batch.delete(doc.ref);
        });
        
        console.log('🔧 Executing batch delete...');
        await batch.commit();
        
        console.log(`🧹 Cleaned up ${snapshot.docs.length} expired tokens from Firestore`);
      } else {
        console.log('✅ No expired tokens found');
      }
    } catch (error) {
      console.error('❌ Error cleaning up expired tokens from Firestore:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
    }
  }
} 