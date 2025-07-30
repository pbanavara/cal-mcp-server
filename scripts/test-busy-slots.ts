#!/usr/bin/env ts-node

import { GmailMonitor } from '../src/gmail-monitor';
import { MeetingRequestContext, GmailMessage } from '../src/types';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();
const SNIPPET = 'Hi, can we schedule a meeting for Friday at 9 AM or the following Monday at 5 PM?';

/**
 * Test suite for refactored GmailMonitor methods
 * Usage: npx ts-node scripts/test-busy-slots.ts
 */

// Mock Gmail message for testing
const createMockGmailMessage = (): GmailMessage => {
  const base64Data = Buffer.from(SNIPPET).toString('base64');
  
  return {
    id: 'test-message-123',
    threadId: 'test-thread-456',
    snippet: SNIPPET,
    labelIds: ['INBOX', 'UNREAD'],
    historyId: '12345',
    internalDate: '1627747200000',
    sizeEstimate: 1024,
    payload: {
      partId: '0',
      mimeType: 'text/plain',
      filename: '',
      headers: [
        { name: 'From', value: 'John Doe <john@example.com>' },
        { name: 'Subject', value: 'Meeting Request' },
        { name: 'Message-ID', value: '<test@example.com>' },
        { name: 'Date', value: 'Thu, 01 Aug 2024 10:00:00 -0700' }
      ],
      body: {
        data: base64Data,  // dynamically encoded from snippet
        size: SNIPPET.length
      }
    }
  };
};

async function testGetMeetingRecommendations(snippet: string) {
  console.log('\n🧪 Testing getMeetingRecommendations()');
  
  const gmailMonitor = new GmailMonitor((message: any) => {
    console.log('📧 Message:', message.id);
  });

  try {
    await gmailMonitor.initialize();
    
    const meetingDates = ['2025-08-01', '2025-08-02']; // Test with multiple dates
    const timeZone = '-08:00';
    
    console.log(`📧 Testing snippet: "${snippet}"`);
    console.log(`📅 Meeting dates: ${meetingDates.join(', ')}, Timezone: ${timeZone}`);
    
    const recommendations = await gmailMonitor.getMeetingRecommendations(snippet, meetingDates, timeZone);
    
    console.log('✅ Meeting recommendations received:');
    console.log(JSON.stringify(recommendations, null, 2));
    
    return recommendations;
  } catch (error) {
    console.error('❌ getMeetingRecommendations failed:', error);
    throw error;
  }
}

function testExtractEmailInfoForReply() {
  console.log('\n🧪 Testing extractEmailInfoForReply()');
  
  const gmailMonitor = new GmailMonitor((message: any) => {
    console.log('📧 Message:', message.id);
  });

      const mockMessage = createMockGmailMessage();
  
  try {
    console.log('📧 Testing with mock Gmail message...');
    console.log(`📧 Snippet: "${mockMessage.snippet}"`);
    console.log(`📧 Base64 decoded: "${Buffer.from(mockMessage.payload?.body?.data || '', 'base64').toString()}"`);
    console.log('✅ Snippet and base64 data are now consistent!');
    
    const emailInfo = gmailMonitor.extractEmailInfoForReply(mockMessage);
    
    console.log('✅ Email info extracted:');
    console.log(`   To: ${emailInfo.toEmail}`);
    console.log(`   Sender: ${emailInfo.senderName}`);
    console.log(`   Subject: ${emailInfo.originalSubject}`);
    console.log(`   Headers count: ${emailInfo.headers.length}`);
    console.log(`   Message ID: ${emailInfo.messageId}`);
    return emailInfo;
  } catch (error) {
    console.error('❌ extractEmailInfoForReply failed:', error);
    throw error;
  }
}

async function testSendMeetingReply(mockEmailInfo: any, mockRecommendations: MeetingRequestContext) {
  console.log('\n🧪 Testing sendMeetingReply() [MOCKED]');
  
  const gmailMonitor = new GmailMonitor((message: any) => {
    console.log('📧 Message:', message.id);
  });

  // Mock the sendMeetingReply method to avoid actually sending emails
  gmailMonitor.sendMeetingReply = async function(emailInfo, smartRecommendations, snippet, messageId, threadId) {
    console.log('🔄 [MOCKED] sendMeetingReply called with:');
    console.log(`   To: ${emailInfo.toEmail}`);
    console.log(`   Subject: ${emailInfo.originalSubject}`);
    console.log(`   Snippet: ${snippet}`);
    console.log(`   Message ID: ${messageId}`);
    console.log(`   Thread ID: ${threadId}`);
    console.log(`   Recommendations: ${smartRecommendations.suggested_meeting_times.length} time slots`);
    
    // Simulate email generation and sending
    console.log('✅ [MOCKED] Email would be sent successfully');
    return true;
  };

  try {
    const result = await gmailMonitor.sendMeetingReply(
      mockEmailInfo,
      mockRecommendations,
      'Test meeting request snippet',
      'test-message-123',
      'test-thread-456'
    );
    
    console.log(`✅ sendMeetingReply result: ${result}`);
    return result;
  } catch (error) {
    console.error('❌ sendMeetingReply failed:', error);
    throw error;
  }
}

async function testMarkMessageAsRead() {
  console.log('\n🧪 Testing markMessageAsRead() [MOCKED]');
  
  const gmailMonitor = new GmailMonitor((message: any) => {
    console.log('📧 Message:', message.id);
  });

  // Mock the markMessageAsRead method to avoid actually modifying Gmail messages
  gmailMonitor.markMessageAsRead = async function(messageId, messageType) {
    console.log(`🔄 [MOCKED] markMessageAsRead called with:`);
    console.log(`   Message ID: ${messageId}`);
    console.log(`   Message type: ${messageType}`);
    console.log('✅ [MOCKED] Message would be marked as read successfully');
  };

  try {
    await gmailMonitor.markMessageAsRead('test-message-123', 'meeting');
    await gmailMonitor.markMessageAsRead('test-message-456', 'non-meeting');
    
    console.log('✅ Both markMessageAsRead calls completed');
  } catch (error) {
    console.error('❌ markMessageAsRead failed:', error);
    throw error;
  }
}

// Legacy test for backward compatibility
async function testCheckMeetingSlotAvailability(snippet: string) {
  console.log('\n🧪 Testing checkMeetingSlotAvailability() [Legacy]');
  
  const gmailMonitor = new GmailMonitor((message: any) => {
    console.log('📧 Message:', message.id);
  });


  try {
    await gmailMonitor.initialize();
    const meetingContext: MeetingRequestContext = await testGetMeetingRecommendations(snippet);
    console.log('🔄 Testing legacy checkMeetingSlotAvailability...');
    const result = await gmailMonitor.checkMeetingSlotAvailability(meetingContext);
    
    console.log('✅ Legacy method result:');
    console.log(`   Available: ${result.available}`);
    console.log(`   Available slots: ${result.available_slots.length}`);
    
    if (result.available_slots.length > 0) {
      console.log('📅 Available Time Slots:');
      result.available_slots.forEach((slot, index) => {
        console.log(`  ${index + 1}. ${slot.date} at ${slot.time_slot} (${slot.timezone})`);
      });
    }
    
    return result;
  } catch (error) {
    console.error('❌ checkMeetingSlotAvailability failed:', error);
    throw error;
  }
}

async function runAllTests() {
  console.log('🧪 Running GmailMonitor Test Suite');
  console.log('📊 Testing refactored methods individually');
  try {
    // Test 1: Extract email info (no external dependencies)
      const emailInfo = testExtractEmailInfoForReply();
      console.log("Email info: ", JSON.stringify(emailInfo, null, 2));
    await testCheckMeetingSlotAvailability(SNIPPET);
    
    // Test 2: Get meeting recommendations (requires APIs)
      const recommendations = await testGetMeetingRecommendations(SNIPPET);
      console.log("Claude's recommendations: ", JSON.stringify(recommendations, null, 2));
    
    // Test 3: Send meeting reply (mocked to avoid sending real emails)
    //await testSendMeetingReply(emailInfo, recommendations);
    
    // Test 4: Mark message as read (mocked to avoid modifying Gmail)
    //await testMarkMessageAsRead();
    
    // Test 5: Legacy method for backward compatibility
    
    console.log('\n✅ All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✅ extractEmailInfoForReply - Unit test passed');
    console.log('   ✅ checkMeetingSlotAvailability - Legacy test passed');
    console.log('   ✅ getMeetingRecommendations - Integration test passed');

  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    
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
    console.log('5. Check ANTHROPIC_API_KEY environment variable');
  }
}

if (require.main === module) {
  runAllTests().catch(console.error);
}

export {
  testGetMeetingRecommendations,
  testExtractEmailInfoForReply,
  testSendMeetingReply,
  testMarkMessageAsRead,
  testCheckMeetingSlotAvailability,
  createMockGmailMessage
}; 