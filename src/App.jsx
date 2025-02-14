import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FaRedo, FaArrowCircleUp, FaStopCircle } from 'react-icons/fa'; // Icons
import './App.css';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const App = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(() => {
    const savedMessages = localStorage.getItem('chat_messages');
    return savedMessages ? JSON.parse(savedMessages) : [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [controller, setController] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('chat_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Stop bot response
  const handleStopStreaming = () => {
    if (controller) {
      controller.abort();
      setController(null);
      setIsLoading(false);
    }
  };

  // Reset conversation and stop ongoing message
  const handleResetConversation = () => {
    if (controller) controller.abort(); // Stop response
    setMessages([]);
    setController(null);
    localStorage.removeItem('chat_messages');
  };

  const handleSendMessage = async () => {
    if (input.trim() === '') return;

    if (controller) controller.abort(); // Cancel any ongoing response

    const newController = new AbortController();
    setController(newController);

    const userMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const chat = model.startChat({
        history: messages.map(msg => ({
          role: msg.role,
          parts: [{ text: msg.text }], 
        })),
      });

      const result = await chat.sendMessageStream(input, { signal: newController.signal });
      let responseText = '';

      for await (const chunk of result.stream) {
        responseText += chunk.text();
        setMessages(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage?.role === 'model') {
            return [...prev.slice(0, -1), { role: 'model', text: responseText }];
          } else {
            return [...prev, { role: 'model', text: responseText }];
          }
        });
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Error sending message:', error);
        setMessages(prev => [...prev, { role: 'model', text: `Error processing your message: ${error.message}` }]);
      }
    } finally {
      setIsLoading(false);
      setController(null); // Reset controller after completion
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      // Auto-resize the textarea
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const renderMessage = (msg, index) => (
    <div key={index} className={`message ${msg.role === 'user' ? 'user-message' : 'bot-message'}`}>
      <ReactMarkdown
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div" {...props}>
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...props}>{children}</code>
            );
          }
        }}
      >
        {msg.text}
      </ReactMarkdown>
    </div>
  );

  return (
    <div className="chat-container">
      {/* Header */}
      <div className="header">
        <div className="name">AI Chatbot</div>
        <div className="reset-btn-wrapper">
          <button className="reset-btn" onClick={handleResetConversation}>
            <FaRedo />
          </button>
          <span className="tooltip-text">New chat</span>
        </div>
      </div>

      {/* Chat Box */}
      <div className="chat-box">
        {messages.length === 0 && (
          <div className="welcome-message">
            How can I assist you today?
          </div>
        )}
        {messages.map(renderMessage)}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="input-area">
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Chatbot"
            rows={1}
            style={{ minHeight: '100px', maxHeight: '300px', overflowY: 'auto', resize: 'none' }} // Ensure auto-resizing
          />
          <div className="send-btn-wrapper">
            <button
              className="send-btn"
              onClick={isLoading ? handleStopStreaming : handleSendMessage}
              disabled={input.trim() === '' && !isLoading}
            >
              {isLoading ? <FaStopCircle /> : <FaArrowCircleUp />}
            </button>
            <span className="tooltip-text">
              {isLoading ? "Stop" : input.trim() === '' ? "Message is empty" : "Send"}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer>
        <p>This Chatbot is for demonstration purposes only.</p>
      </footer>
    </div>
  );
};

export default App;
