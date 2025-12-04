// Test Calendar AI Agent
// Run with: node test-agent.js

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function testAgent(query) {
  console.log(`\n📝 Query: "${query}"`);
  console.log('─'.repeat(60));
  
  try {
    const response = await fetch(`${API_URL}/api/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Success!');
      console.log('🤖 Agent Response:', result.response);
      console.log('🔧 Action Taken:', result.action);
      if (result.result) {
        console.log('📊 Result:', JSON.stringify(result.result, null, 2));
      }
    } else {
      console.log('❌ Error:', result.error);
    }
  } catch (error) {
    console.log('❌ Request failed:', error.message);
  }
}

async function runTests() {
  console.log('🧪 Testing Calendar AI Agent\n');
  console.log('API URL:', API_URL);
  console.log('='.repeat(60));

  // Test 1: Create a meeting with natural language
  await testAgent('Schedule a team standup tomorrow at 9am for 30 minutes with john@example.com as organizer');

  // Small delay between requests
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 2: Create another meeting (with potential conflict)
  await testAgent('Book a client call tomorrow from 9:15am to 10am, organizer is john@example.com, location is Zoom');

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 3: Get all meetings
  await testAgent('Show me all meetings');

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 4: Query for specific meetings
  await testAgent('What meetings does john@example.com have?');

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 5: General conversation (no function call)
  await testAgent('What can you help me with?');

  console.log('\n' + '='.repeat(60));
  console.log('✅ All tests completed!');
}

// Run tests
runTests();
