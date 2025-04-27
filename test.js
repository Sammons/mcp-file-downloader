import { EventSource } from 'eventsource';

// Create SSE connection
const sse = new EventSource('http://localhost:3000/mcp/stream');

sse.onopen = () => {
  console.log('SSE Connection established');
};

sse.onerror = (error) => {
  console.error('SSE connection error:', error);
};

// Listen for all events for debugging
sse.onmessage = (event) => {
  console.log('Received SSE message:', event.data);
};

sse.addEventListener('endpoint', (event) => {
  console.log('Received endpoint event:', event.data);
  
  const match = event.data.match(/sessionId=([^"\n]+)/);
  if (match) {
    const sessionId = match[1];
    console.log('Extracted session ID:', sessionId);
    
    // Wait a bit before sending the message
    setTimeout(() => {
      fetch(`http://localhost:3000/mcp/message?sessionId=${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "fetch",
          params: {
            url: "https://example.com"
          },
          id: 1
        })
      })
      .then(async response => {
        const text = await response.text();
        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        console.log('Response text:', text);
        return text;
      })
      .catch(error => console.error('Error sending message:', error));
    }, 1000);
  }
}); 