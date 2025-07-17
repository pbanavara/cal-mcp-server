/**
 * Email SSE Client Library
 * Connects to the MCP Email Server for real-time email notifications
 */
class EmailSSEClient {
  constructor(serverUrl = 'http://localhost:3001') {
    this.serverUrl = serverUrl;
    this.eventSource = null;
    this.clientId = null;
    this.isConnected = false;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
  }

  /**
   * Connect to the SSE endpoint
   */
  connect() {
    if (this.isConnected) {
      console.warn('Already connected to SSE');
      return;
    }

    try {
      this.eventSource = new EventSource(`${this.serverUrl}/sse`);
      
      this.eventSource.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        console.log('📡 Connected to Email SSE');
        this.emit('connected', { clientId: this.clientId });
      };

      this.eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.event === 'connected') {
          this.clientId = data.clientId;
          console.log(`📡 SSE Client ID: ${this.clientId}`);
        }
        
        this.emit(data.event, data.data);
      };

      this.eventSource.onerror = (error) => {
        console.error('📡 SSE Connection error:', error);
        this.isConnected = false;
        this.emit('error', error);
        
        // Attempt to reconnect
        this.attemptReconnect();
      };

    } catch (error) {
      console.error('📡 Failed to create SSE connection:', error);
      this.emit('error', error);
    }
  }

  /**
   * Disconnect from the SSE endpoint
   */
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.isConnected = false;
    this.clientId = null;
    console.log('📡 Disconnected from Email SSE');
    this.emit('disconnected');
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('📡 Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`📡 Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (!this.isConnected) {
        this.connect();
      }
    }, delay);
  }

  /**
   * Add an event listener
   * @param {string} event - Event name ('new_email', 'connected', 'disconnected', 'error')
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Remove an event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function to remove
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event to all listeners
   * @param {string} event - Event name
   * @param {any} data - Event data
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      clientId: this.clientId,
      reconnectAttempts: this.reconnectAttempts,
      serverUrl: this.serverUrl
    };
  }

  /**
   * Check if the server is reachable
   */
  async checkServerStatus() {
    try {
      const response = await fetch(`${this.serverUrl}/sse/status`);
      if (response.ok) {
        const data = await response.json();
        return { reachable: true, ...data };
      }
    } catch (error) {
      console.error('Server status check failed:', error);
    }
    return { reachable: false };
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmailSSEClient;
} else if (typeof window !== 'undefined') {
  window.EmailSSEClient = EmailSSEClient;
} 