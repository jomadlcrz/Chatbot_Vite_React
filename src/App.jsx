import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  FaRedo,
  FaArrowCircleUp,
  FaStopCircle,
  FaCopy,
  FaCheck,
} from "react-icons/fa";
import { GoDotFill } from "react-icons/go";
import { Tooltip, OverlayTrigger, Modal, Button } from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";
import "katex/dist/katex.min.css";
import "./App.css";
import remarkGfm from "remark-gfm";

const SplashScreen = () => (
  <div className="splash-screen">
    <div className="splash-content">
      <div className="splash-logo">🤖</div>
      <h1>Chatbot</h1>
      <div className="loading-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  </div>
);

const App = () => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState(() => {
    try {
      const savedMessages = localStorage.getItem("chat_messages");
      return savedMessages ? JSON.parse(savedMessages) : [];
    } catch (error) {
      console.error("Error loading saved messages:", error);
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [copiedTextIndex, setCopiedTextIndex] = useState(null);
  const [copiedCodeIndex, setCopiedCodeIndex] = useState({});
  const [showSplash, setShowSplash] = useState(true);
  const [showResetModal, setShowResetModal] = useState(false);

  const workerRef = useRef(null);
  const chatBoxRef = useRef(null);
  const textareaRef = useRef(null);
  const autoScrollEnabledRef = useRef(true);
  const userHasScrolledRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const scrollTimeoutRef = useRef(null);

  // Manage auto-scrolling with improved user scroll detection
  const scrollToBottom = (force = false) => {
    if (!chatBoxRef.current) return;

    if (force || autoScrollEnabledRef.current) {
      const chatBox = chatBoxRef.current;
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  };

  // Handle new message or message update
  useEffect(() => {
    if (messages.length > 0) {
      // If this is a new user message, force scroll and re-enable auto-scroll
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "user") {
        autoScrollEnabledRef.current = true;
        userHasScrolledRef.current = false;
        scrollToBottom(true);
      } else {
        // For bot messages, only scroll if auto-scroll is enabled
        scrollToBottom();
      }
    }
  }, [messages]);

  // Set up scroll event detection
  useEffect(() => {
    if (!chatBoxRef.current) return;

    const chatBox = chatBoxRef.current;

    const handleScroll = (e) => {
      // If programmatic scrolling is happening, ignore this event
      if (scrollTimeoutRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = chatBox;
      const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 5;
      const isScrollingUp = scrollTop < lastScrollTopRef.current;

      // Store the current scroll position for next comparison
      lastScrollTopRef.current = scrollTop;

      // If user is scrolling up, disable auto-scroll
      if (isScrollingUp && !isAtBottom) {
        autoScrollEnabledRef.current = false;
        userHasScrolledRef.current = true;
      }

      // If user manually scrolled to bottom, re-enable auto-scroll
      if (isAtBottom && userHasScrolledRef.current) {
        autoScrollEnabledRef.current = true;
        userHasScrolledRef.current = false;
      }
    };

    chatBox.addEventListener("scroll", handleScroll);
    return () => chatBox.removeEventListener("scroll", handleScroll);
  }, []);

  const initializeWorker = () => {
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    try {
      workerRef.current = new Worker(new URL("./worker.js", import.meta.url), {
        type: "module",
      });

      workerRef.current.onmessage = (event) => {
        const { type, text, message } = event.data;

        if (type === "update") {
          setMessages((prev) => {
            const lastMessage = prev[prev.length - 1];
            return lastMessage?.role === "model"
              ? [...prev.slice(0, -1), { role: "model", text }]
              : [...prev, { role: "model", text }];
          });
        } else if (type === "done") {
          setIsLoading(false);
        } else if (type === "error") {
          console.error("Worker Error:", message);
          setMessages((prev) => [
            ...prev,
            { role: "model", text: `Error: ${message}` },
          ]);
          setIsLoading(false);
        }
      };

      workerRef.current.onerror = (error) => {
        console.error("Worker initialization error:", error);
        setIsLoading(false);
        setMessages((prev) => [
          ...prev,
          {
            role: "model",
            text: "Sorry, there was an error with the chatbot service. Please try again later.",
          },
        ]);
      };
    } catch (error) {
      console.error("Failed to initialize worker:", error);
      setIsLoading(false);
    }
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
    try {
      localStorage.setItem("chat_messages", JSON.stringify(messages));
    } catch (error) {
      console.error("Error saving messages to localStorage:", error);
    }
  }, [messages]);

  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkIfMobile();
    window.addEventListener("resize", checkIfMobile);

    return () => {
      window.removeEventListener("resize", checkIfMobile);
    };
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleSendMessage = async () => {
    if (input.trim() === "") return;

    const userMessage = { role: "user", text: input.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    workerRef.current.postMessage({
      input: input.trim(),
      messages: updatedMessages,
      apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    });
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
    localStorage.removeItem("chat_messages");
    setIsLoading(false);
    setShowResetModal(false);
  };

  const handleResetClick = () => {
    setShowResetModal(true);
  };

  const handleKeyDown = (e) => {
    if (!isMobile && e.key === "Enter" && !e.shiftKey) {
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
        [`${msgIndex}-${codeIndex}`]: true,
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
    <div
      key={index}
      className={`message ${
        msg.role === "user" ? "user-message" : "bot-message"
      }`}
    >
      {msg.role === "user" ? (
        <div className="user-message-text">{msg.text}</div>
      ) : (
        <div className="bot-message-container">
          <div className="message-content" style={{ padding: "10px" }}>
            <ReactMarkdown
              children={msg.text}
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                code({ inline, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  if (!inline && match) {
                    const codeId = `${index}-${match[1]}`;
                    return (
                      <div className="code-block-container">
                        <div className="code-block-header">
                          <span>{match[1]}</span>
                          {isMobile ? (
                            <button
                              className="copy-code-button"
                              onClick={() =>
                                handleCopyCode(
                                  String(children).replace(/\n$/, ""),
                                  index,
                                  match[1]
                                )
                              }
                            >
                              {copiedCodeIndex[codeId] ? (
                                <FaCheck />
                              ) : (
                                <FaCopy />
                              )}
                            </button>
                          ) : (
                            <OverlayTrigger
                              placement="top"
                              overlay={
                                <Tooltip id={`tooltip-copy-code-${codeId}`}>
                                  Copy Code
                                </Tooltip>
                              }
                            >
                              <button
                                className="copy-code-button"
                                onClick={() =>
                                  handleCopyCode(
                                    String(children).replace(/\n$/, ""),
                                    index,
                                    match[1]
                                  )
                                }
                              >
                                {copiedCodeIndex[codeId] ? (
                                  <FaCheck />
                                ) : (
                                  <FaCopy />
                                )}
                              </button>
                            </OverlayTrigger>
                          )}
                        </div>
                        <SyntaxHighlighter
                          style={oneLight}
                          language={match[1]}
                          PreTag="div"
                          {...props}
                        >
                          {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                      </div>
                    );
                  }
                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
                blockquote({ children }) {
                  return (
                    <blockquote className="custom-blockquote">
                      {children}
                    </blockquote>
                  );
                },
                img({ src, alt }) {
                  return <img src={src} alt={alt} className="md-image" />;
                },
                a({ href, children }) {
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="md-link"
                    >
                      {children}
                    </a>
                  );
                },
                table({ children }) {
                  return <table className="md-table">{children}</table>;
                },
                th({ children }) {
                  return <th className="md-th">{children}</th>;
                },
                td({ children }) {
                  return <td className="md-td">{children}</td>;
                },
                del({ children }) {
                  return <del>{children}</del>;
                },
              }}
            />
          </div>

          {!isLoading && !isMobile && (
            <OverlayTrigger
              placement="top"
              overlay={<Tooltip id="tooltip-copy-text">Copy Text</Tooltip>}
            >
              <button
                className="copy-text-button"
                onClick={() => handleCopyText(msg.text, index)}
              >
                {copiedTextIndex === index ? <FaCheck /> : <FaCopy />}
              </button>
            </OverlayTrigger>
          )}

          {!isLoading && isMobile && (
            <button
              className="copy-text-button"
              onClick={() => handleCopyText(msg.text, index)}
            >
              {copiedTextIndex === index ? <FaCheck /> : <FaCopy />}
            </button>
          )}
        </div>
      )}
    </div>
  );

  useEffect(() => {
    // Hide splash screen after 2 seconds
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="chat-container">
      {showSplash ? (
        <SplashScreen />
      ) : (
        <>
          <div className="header">
            <div className="header-content">
              <div className="name">Chatbot</div>
              {messages.length > 0 && (
                <>
                  {!isMobile && (
                    <OverlayTrigger
                      placement="left"
                      overlay={<Tooltip id="tooltip-reset">Reset Conversation</Tooltip>}
                    >
                      <button className="reset-btn" onClick={handleResetClick}>
                        <FaRedo />
                      </button>
                    </OverlayTrigger>
                  )}
                  {isMobile && (
                    <button className="reset-btn" onClick={handleResetClick}>
                      <FaRedo />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Reset Confirmation Modal */}
          <Modal
            show={showResetModal}
            onHide={() => setShowResetModal(false)}
            centered
            className="reset-modal"
          >
            <Modal.Header closeButton>
              <Modal.Title>Reset Conversation</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              Are you sure you want to reset the conversation? This will clear all messages and cannot be undone.
            </Modal.Body>
            <Modal.Footer>
              <Button variant="danger" onClick={handleResetConversation}>
                Reset
              </Button>
            </Modal.Footer>
          </Modal>

          <div className="chat-box" ref={chatBoxRef}>
            {messages.length === 0 && (
              <div className="welcome-message">
                👋 Hi there! I'm your friendly AI assistant.
                <br />
                <span className="powered-by">Powered by OpenAI</span>
              </div>
            )}
            {messages.map(renderMessage)}
            {isLoading && (
              <div className="streaming-indicator">
                <GoDotFill />
              </div>
            )}
          </div>

          <div className="input-area">
            <div className="input-wrapper">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Chatbot"
                rows={1}
                style={{
                  minHeight: "100px",
                  maxHeight: "300px",
                  overflowY: "auto",
                  resize: "none",
                }}
              />
              {!isMobile && (
                <OverlayTrigger
                  placement="top"
                  overlay={
                    <Tooltip id="tooltip-send">
                      {isLoading
                        ? "Stop"
                        : input.trim() === ""
                        ? "Message is empty"
                        : "Send"}
                    </Tooltip>
                  }
                >
                  <button
                    className={`send-btn ${
                      input.trim() === "" && !isLoading ? "disabled-btn" : ""
                    }`}
                    onClick={isLoading ? handleStopStreaming : handleSendMessage}
                    disabled={input.trim() === "" && !isLoading}
                    style={{
                      cursor:
                        input.trim() === "" && !isLoading
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    {isLoading ? <FaStopCircle /> : <FaArrowCircleUp />}
                  </button>
                </OverlayTrigger>
              )}

              {isMobile && (
                <button
                  className="send-btn"
                  onClick={isLoading ? handleStopStreaming : handleSendMessage}
                  disabled={input.trim() === "" && !isLoading}
                  style={{
                    cursor:
                      input.trim() === "" && !isLoading ? "not-allowed" : "pointer",
                  }}
                >
                  {isLoading ? <FaStopCircle /> : <FaArrowCircleUp />}
                </button>
              )}
            </div>
          </div>

          <div className="footer">
            <p>
              Made with ❤️ by{" "}
              <a href="https://github.com/jomadlcrz" target="_blank">
                jomadlcrz
              </a>
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default App;
