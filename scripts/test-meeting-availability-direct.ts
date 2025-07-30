#!/usr/bin/env ts-node

import { GmailMonitor } from '../src/gmail-monitor';
import { MeetingRequestContext } from '../src/types';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Direct test script for checkMeetingSlotAvailability method
 * Usage: npx ts-node scripts/test-meeting-availability-direct.ts <bearer-token>
 */

async function testMeetingSlotAvailabilityDirect() {
  const bearerToken = process.argv[2];

  if (!bearerToken) {
    console.error('❌ Please provide a bearer token as argument');
    console.log('Usage: npx ts-node scripts/test-meeting-availability-direct.ts <bearer-token>');
    process.exit(1);
  }

  console.log('🧪 Direct Testing: GmailMonitor.checkMeetingSlotAvailability()');
  console.log(`🔑 Using bearer token: ${bearerToken.substring(0, 20)}...`);

  // Create a dummy callback for GmailMonitor
  const onMessageReceived = (message: any) => {
    console.log('📧 Message received:', message.id);
  };

  // Initialize GmailMonitor
  const gmailMonitor = new GmailMonitor(onMessageReceived);

  // Sample meeting request context for testing
  const sampleMeetingContext: MeetingRequestContext = {
    extracted_preferences: {
      date_range: ['2025-07-30', '2025-07-31'],
      preferred_days: ['Tuesday', 'Wednesday'],
      preferred_time: '2:00 PM'
    },
    suggested_meeting_times: [
      {
        date: '2025-07-30',
        time_slots: ['14:00-14:30', '15:00-15:30'],
        timezone: '+08:00'
      },
      {
        date: '2025-07-31', 
        time_slots: ['10:00-10:30', '14:00-14:30'],
        timezone: '+08:00'
      }
    ],
    meeting_context: {
      intent: 'propose',
      meeting_type: 'sync',
      mentions_slots: true,
      user_action_required: 'confirm'
    },
    meeting_duration: '30 minutes',
    notes: 'Testing meeting slot availability with Luxon timezone handling'
  };

  try {
    console.log('\n📋 Sample Meeting Context:');
    console.log(JSON.stringify(sampleMeetingContext, null, 2));

    console.log('\n🔄 Initializing Gmail Monitor...');
    // Note: This will use the token manager to get credentials
    await gmailMonitor.initialize();

    console.log('\n🔄 Calling checkMeetingSlotAvailability directly...');
    const result = await gmailMonitor.checkMeetingSlotAvailability(sampleMeetingContext);

    console.log('\n✅ Meeting Slot Availability Result:');
    console.log(JSON.stringify(result, null, 2));

    console.log('\n📊 Summary:');
    console.log(`Available: ${result.available}`);
    console.log(`Available slots count: ${result.available_slots.length}`);
    
    if (result.available_slots.length > 0) {
      console.log('\n📅 Available Slots:');
      result.available_slots.forEach((slot, index) => {
        console.log(`  ${index + 1}. ${slot.date} ${slot.time_slot} (${slot.timezone})`);
      });
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
    }
    
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure your bearer token is valid');
    console.log('2. Check that Google tokens are stored in DynamoDB');
    console.log('3. Ensure calendar permissions are granted');
    console.log('4. Verify the environment variables are set correctly');
  }
}

async function testWithSampleToken() {
  console.log('\n🔬 Alternative: Testing with environment token...');
  
  const envToken = process.env.TEST_BEARER_TOKEN;
  if (envToken) {
    console.log('Found TEST_BEARER_TOKEN in environment');
    process.argv[2] = envToken;
    await testMeetingSlotAvailabilityDirect();
  } else {
    console.log('No TEST_BEARER_TOKEN found in environment');
  }
}

if (require.main === module) {
  testMeetingSlotAvailabilityDirect().catch(console.error);
} 