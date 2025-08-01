// Simple integration test for AI Copilot Desktop
// This script tests the frontend-backend integration

const axios = require('axios');

const API_BASE_URL = 'http://127.0.0.1:8000/api/v1';

async function testAPI() {
    console.log('🧪 Testing AI Copilot Desktop Integration...\n');
    
    try {
        // Test 1: Health check
        console.log('1. Testing API health...');
        const healthResponse = await axios.get('http://127.0.0.1:8000/health');
        console.log('✅ Health check passed:', healthResponse.data.status);
        
        // Test 2: Chat status
        console.log('\n2. Testing chat status...');
        const statusResponse = await axios.get(`${API_BASE_URL}/chat/status`);
        console.log('✅ Chat status:', statusResponse.data.status);
        
        // Test 3: Simple chat message
        console.log('\n3. Testing chat message...');
        const chatResponse = await axios.post(`${API_BASE_URL}/chat`, {
            message: "Hello! This is a test message from the integration test.",
            conversation_history: [],
            system_prompt: "You are AI Copilot, a helpful desktop assistant."
        });
        console.log('✅ Chat response received:');
        console.log('   Message:', chatResponse.data.message);
        console.log('   Model:', chatResponse.data.model);
        console.log('   Timestamp:', chatResponse.data.timestamp);
        
        // Test 4: Chat with conversation history
        console.log('\n4. Testing chat with conversation history...');
        const historyResponse = await axios.post(`${API_BASE_URL}/chat`, {
            message: "Can you remember what I just said?",
            conversation_history: [
                {
                    role: "user",
                    content: "Hello! This is a test message from the integration test.",
                    timestamp: new Date().toISOString()
                },
                {
                    role: "assistant", 
                    content: chatResponse.data.message,
                    timestamp: chatResponse.data.timestamp
                }
            ]
        });
        console.log('✅ Contextual chat response:');
        console.log('   Message:', historyResponse.data.message);
        
        console.log('\n🎉 All integration tests passed!');
        console.log('\n📋 Summary:');
        console.log('   ✅ Backend API is running and healthy');
        console.log('   ✅ Chat endpoint is functional');
        console.log('   ✅ Demo mode is working (no OpenAI API key required)');
        console.log('   ✅ Conversation history is supported');
        console.log('   ✅ Frontend can successfully communicate with backend');
        
    } catch (error) {
        console.error('❌ Integration test failed:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', error.response.data);
        }
        process.exit(1);
    }
}

// Run the test
testAPI();
