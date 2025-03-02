import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
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
  const [isMobile, setIsMobile] = useState(false);
  const [copiedTextIndex, setCopiedTextIndex] = useState(null);
  const [copiedCodeIndex, setCopiedCodeIndex] = useState({});

  const workerRef = useRef(null);
  const chatBoxRef = useRef(null);
  const textareaRef = useRef(null);

  // Initialize the worker
  const initializeWorker = () => {
    if (workerRef.current) {
      workerRef.current.terminate(); // Terminate the existing worker
    }
    workerRef.current = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

    workerRef.current.onmessage = (event) => {
      const { type, text, message } = event.data;

      if (type === 'update') {
        setMessages((prev) => {
          const lastMessage = prev[prev.length - 1];
          return lastMessage?.role === 'model'
            ? [...prev.slice(0, -1), { role: 'model', text }]
            : [...prev, { role: 'model', text }];
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
    initializeWorker(); // Initialize the worker on mount
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate(); // Cleanup worker on unmount
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('chat_messages', JSON.stringify(messages));
  }, [messages]);

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

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'; // Reset height
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`; // Adjust to content
    }
  }, [input]); // Runs every time input changes

  const handleSendMessage = async () => {
    if (input.trim() === '') return;

    const userMessage = { role: 'user', text: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    workerRef.current.postMessage({
      input: input.trim(),
      messages,
      apiKey: import.meta.env.VITE_GEMINI_API_KEY,
    });
  };

  const handleStopStreaming = () => {
    if (workerRef.current) {
      workerRef.current.terminate();
      initializeWorker(); // Re-initialize the worker
      setIsLoading(false);
    }
  };

  const handleResetConversation = () => {
    if (workerRef.current) {
      workerRef.current.terminate();
      initializeWorker(); // Re-initialize the worker
    }
    setMessages([]);
    localStorage.removeItem('chat_messages');
    setIsLoading(false);
  };

  const handleKeyDown = (e) => {
    if (!isMobile && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCopyText = (text, index) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedTextIndex(index);
      setTimeout(() => setCopiedTextIndex(null), 2000);
    });
  };

  const handleCopyCode = (code, msgIndex, codeIndex) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCodeIndex((prev) => ({
        ...prev,
        [`${msgIndex}-${codeIndex}`]: true, // Unique key for each code block
      }));
      setTimeout(() => {
        setCopiedCodeIndex((prev) => {
          const updated = { ...prev };
          delete updated[`${msgIndex}-${codeIndex}`];
          return updated;
        });
      }, 2000);
    });
  };

  const renderMessage = (msg, index) => (
    <div key={index} className={`message ${msg.role === 'user' ? 'user-message' : 'bot-message'}`}>
      {msg.role === 'user' ? (
        <div className="user-message-text">{msg.text}</div>
      ) : (
        <div className="bot-message-container">
          <div className="message-content" style={{ padding: '10px' }}>
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
                            onClick={() => handleCopyCode(String(children).replace(/\n$/, ''), index, match[1])}
                          >
                            {copiedCodeIndex[`${index}-${match[1]}`] ? <FaCheck /> : <FaCopy />}
                          </button>
                        </div>
                        <SyntaxHighlighter
                          style={oneLight}
                          language={match[1]}
                          PreTag="div"
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

          {!isLoading && (
            <button className="copy-text-button" onClick={() => handleCopyText(msg.text, index)}>
              {copiedTextIndex === index ? <FaCheck /> : <FaCopy />}
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="chat-container">
      <div className="header">
        <div className="name">Chatbot</div>
        <button className="reset-btn" onClick={handleResetConversation}>
          <FaRedo />
        </button>
      </div>

      <div className="chat-box" ref={chatBoxRef}>
        {messages.length === 0 && <div className="welcome-message">How can I assist you today?</div>}
        {messages.map(renderMessage)}
        {isLoading && <div className="streaming-indicator"><GoDotFill /></div>}
      </div>

      <div className="input-area">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Chatbot"
          rows={1}
        />
        <button className="send-btn" onClick={isLoading ? handleStopStreaming : handleSendMessage} disabled={input.trim() === '' && !isLoading}>
          {isLoading ? <FaStopCircle /> : <FaArrowCircleUp />}
        </button>
      </div>

      <div className="footer">
        <p>Powered by Gemini</p>
      </div>
    </div>
  );
};

export default App;
