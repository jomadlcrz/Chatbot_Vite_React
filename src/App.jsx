import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FaRedo, FaArrowCircleUp, FaStopCircle, FaCopy, FaCheck } from 'react-icons/fa';
import { GoDotFill } from 'react-icons/go';
import './App.css';

const App = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(() => {
    const savedMessages = localStorage.getItem('chat_messages');
    return savedMessages ? JSON.parse(savedMessages) : [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const workerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const chatBoxRef = useRef(null);
  const textareaRef = useRef(null);

  // Initialize the worker
  const initializeWorker = () => {
    if (workerRef.current) {
      workerRef.current.terminate();
    }
    workerRef.current = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

    workerRef.current.onmessage = (event) => {
      const { type, text, message } = event.data;

      if (type === 'update') {
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage?.role === 'model') {
            return [...prev.slice(0, -1), { role: 'model', text }];
          } else {
            return [...prev, { role: 'model', text }];
          }
        });
      } else if (type === 'done') {
        setIsLoading(false);
      } else if (type === 'error') {
        console.error('Worker Error:', message);
        setMessages((prev) => [...prev, { role: 'model', text: `Error: ${message}` }]);
        setIsLoading(false);
      }
    };
  };

  useEffect(() => {
    initializeWorker();
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('chat_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAtBottom]);

  useEffect(() => {
    const chatBox = chatBoxRef.current;
    if (!chatBox) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = chatBox;
      setIsAtBottom(scrollHeight - (scrollTop + clientHeight) < 10);
    };

    chatBox.addEventListener('scroll', handleScroll);
    return () => chatBox.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSendMessage = async () => {
    if (input.trim() === '') return;

    const userMessage = { role: 'user', text: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    workerRef.current.postMessage({
      input,
      messages,
      apiKey: import.meta.env.VITE_GEMINI_API_KEY,
    });

    adjustTextareaHeight();
  };

  const handleStopStreaming = () => {
    if (workerRef.current) {
      workerRef.current.terminate();
      initializeWorker();
      setIsLoading(false);
    }
  };

  const handleResetConversation = () => {
    if (workerRef.current) {
      workerRef.current.terminate();
      initializeWorker();
    }
    setMessages([]);
    localStorage.removeItem('chat_messages');
    setIsLoading(false);
  };

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 300)}px`;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleChange = (e) => {
    setInput(e.target.value);
    adjustTextareaHeight();
  };

  const handleCopyCode = (code, index) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  };

  const renderMessage = (msg, index) => (
    <div key={index} className={`message ${msg.role === 'user' ? 'user-message' : 'bot-message'}`}>
      <ReactMarkdown
        components={{
          code({ inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            if (!inline && match) {
              return (
                <div className="code-block-container">
                  <div className="code-block-header">
                    <span>{match[1]}</span>
                    <button
                      className="copy-code-button"
                      title="Copy Code"
                      onClick={() => handleCopyCode(String(children).replace(/\n$/, ''), index)}
                    >
                      {copiedIndex === index ? <FaCheck /> : <FaCopy />}
                    </button>
                  </div>
                  <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div" {...props}>
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
      <div className="header">
        <div className="name">AI Chatbot</div>
        <button className="reset-btn" title="New chat" onClick={handleResetConversation}>
          <FaRedo />
        </button>
      </div>

      <div className="chat-box" ref={chatBoxRef}>
        {messages.length === 0 && <div className="welcome-message">How can I assist you today?</div>}
        {messages.map(renderMessage)}
        <div ref={messagesEndRef} />
        {isLoading && <div className="streaming-indicator"><GoDotFill /></div>}
      </div>

      <div className="input-area">
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Message Chatbot"
            rows={1}
            style={{ minHeight: "100px", maxHeight: "300px", overflowY: "auto" }}
          />
          <button
            className="send-btn"
            title={isLoading ? "Stop" : "Send"}
            onClick={isLoading ? handleStopStreaming : handleSendMessage}
            disabled={input.trim() === '' && !isLoading}
          >
            {isLoading ? <FaStopCircle /> : <FaArrowCircleUp />}
          </button>
        </div>
      </div>

      <div className="footer">
        <p>Powered by Gemini</p>
      </div>
    </div>
  );
};

export default App;
