import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FaRedo, FaArrowCircleUp, FaStopCircle, FaCopy, FaCheck } from 'react-icons/fa'; // Added FaCheck for the checkmark
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
  const [isMobile, setIsMobile] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null); // Track which code block was copied
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('chat_messages', JSON.stringify(messages));
  }, [messages]);

  // Scroll to the bottom of the chat box when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Detect mobile devices based on window size
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);

    return () => {
      window.removeEventListener('resize', checkIfMobile);
    };
  }, []);

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
    if (!isMobile && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  // Copy code to clipboard
  const handleCopyCode = (code, index) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedIndex(index); // Set the index of the copied code block
      setTimeout(() => setCopiedIndex(null), 2000); // Reset after 2 seconds
    }).catch((err) => {
      console.error('Failed to copy code:', err);
    });
  };

  const renderMessage = (msg, index) => (
    <div key={index} className={`message ${msg.role === 'user' ? 'user-message' : 'bot-message'}`}>
      <ReactMarkdown
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            if (!inline && match) {
              return (
                <div className="code-block-container">
                  <div className="code-block-header">
                    <span>{match[1]}</span>
                    <button
                      className="copy-code-button"
                      onClick={() => handleCopyCode(String(children).replace(/\n$/, ''), index)}
                      aria-label="Copy code"
                    >
                      {copiedIndex === index ? <FaCheck /> : <FaCopy />}
                    </button>
                  </div>
                  <SyntaxHighlighter
                    style={oneDark}
                    language={match[1]}
                    PreTag="div"
                    customStyle={{ margin: 0, padding: '12px', borderRadius: '0 0 8px 8px' }}
                    {...props}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              );
            }
            return <code className={className} {...props}>{children}</code>;
          },
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
          <button className="reset-btn" onClick={handleResetConversation} aria-label="Reset Conversation">
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
            style={{ minHeight: '100px', maxHeight: '300px', overflowY: 'auto' }}
            aria-label="Type your message"
          />
          <div className="send-btn-wrapper">
            <button
              className="send-btn"
              onClick={isLoading ? handleStopStreaming : handleSendMessage}
              disabled={input.trim() === '' && !isLoading}
              aria-label={isLoading ? "Stop Response" : "Send Message"}
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