import OpenAI from 'openai';

self.onmessage = async (event) => {
  const { input, messages, apiKey } = event.data;

  try {
    const openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    });

    const systemMessage = {
      role: 'system',
      content: "You are a friendly and helpful AI assistant. Always respond in a warm, conversational tone. Use markdown formatting to make your responses more readable and engaging. When sharing code, use proper code blocks with language specification. Feel free to use emojis occasionally to make the conversation more friendly. Break down complex explanations into clear, easy-to-understand parts using bullet points or numbered lists when appropriate."
    };

    const formattedMessages = [
      systemMessage,
      ...messages.map(msg => ({
        role: msg.role === 'model' ? 'assistant' : msg.role,
        content: msg.text
      }))
    ];

    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: formattedMessages,
      stream: true,
    });

    let responseText = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        responseText += content;
        postMessage({ type: 'update', text: responseText });
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    postMessage({ type: 'done' });
  } catch (error) {
    postMessage({ type: 'error', message: error.message });
  }
};
