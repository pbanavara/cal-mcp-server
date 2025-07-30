#!/usr/bin/env ts-node

import { GmailMonitor } from '../src/gmail-monitor';
import { MeetingRequestContext } from '../src/types';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Simple test for checkMeetingSlotAvailability - shows busy slots
 * Usage: npx ts-node scripts/test-busy-slots.ts
 */

async function testBusySlots() {
  console.log('🧪 Testing GmailMonitor.checkMeetingSlotAvailability()');
  console.log('📊 This will show busy slots from your calendar');

  // Create GmailMonitor instance
  const gmailMonitor = new GmailMonitor((message: any) => {
    console.log('📧 Message:', message.id);
  });

  // Sample meeting context with timezone -08:00 (Pacific Time)
  const meetingContext: MeetingRequestContext = {
    extracted_preferences: {
      date_range: ['2025-07-31'],
      preferred_days: ['Thursday'],
      preferred_time: '11:00 AM'
    },
    suggested_meeting_times: [
      {
        date: '2025-07-31', 
        time_slots: ['10:00-10:30', '11:00-11:30', '15:00-15:30'],
        timezone: '-08:00'
      }
    ],
    meeting_context: {
      intent: 'propose',
      meeting_type: 'sync',
      mentions_slots: true,
      user_action_required: 'confirm'
    },
    meeting_duration: '30 minutes',
    notes: 'Testing Luxon timezone handling with -08:00 timezone'
  };

  try {
    console.log('\n📋 Testing Meeting Context:');
    console.log(`📅 Dates: ${meetingContext.suggested_meeting_times.map(t => t.date).join(', ')}`);
    console.log(`🕐 Time slots: ${meetingContext.suggested_meeting_times.flatMap(t => t.time_slots).join(', ')}`);
    console.log(`🌍 Timezone: ${meetingContext.suggested_meeting_times[0]?.timezone || 'N/A'}`);

    console.log('\n🔄 Initializing Gmail Monitor & Calendar...');
    await gmailMonitor.initialize();

    console.log('\n🔄 Checking meeting slot availability...');
    console.log('   (This will fetch busy events and show timezone conversion)');
    
    const result = await gmailMonitor.checkMeetingSlotAvailability(meetingContext);

    console.log('\n✅ Results:');
    console.log(`🎯 Available: ${result.available}`);
    console.log(`📊 Available slots: ${result.available_slots.length}`);

    if (result.available_slots.length > 0) {
      console.log('\n📅 Available Time Slots:');
      result.available_slots.forEach((slot, index) => {
        console.log(`  ${index + 1}. ${slot.date} at ${slot.time_slot} (${slot.timezone})`);
      });
    } else {
      console.log('\n❌ No available slots found');
    }

    console.log('\n📝 Full Result:');
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    
    if (error instanceof Error) {
      console.error('Message:', error.message);
      if (error.stack) {
        console.error('Stack:', error.stack);
      }
    }
    
    console.log('\n💡 Troubleshooting:');
    console.log('1. Make sure the server is running (for token manager)');
    console.log('2. Check Google Calendar API credentials are valid');
    console.log('3. Verify calendar permissions in Google Cloud Console');
    console.log('4. Check DynamoDB has valid tokens');
  }
}

if (require.main === module) {
  testBusySlots().catch(console.error);
} 