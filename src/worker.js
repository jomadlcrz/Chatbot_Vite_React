import { GoogleGenerativeAI } from "@google/generative-ai";

self.onmessage = async (event) => {
  const { input, messages, apiKey } = event.data;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const chat = model.startChat({
      history: messages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }],
      })),
    });

    const result = await chat.sendMessageStream(input);
    let responseText = "";

    for await (const chunk of result.stream) {
      const words = chunk.text().split(" ");

      for (const word of words) {
        responseText += word + " ";
        postMessage({ type: "update", text: responseText });

        // Simulate natural typing speed
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }

    postMessage({ type: "done" });
  } catch (error) {
    postMessage({ type: "error", message: error.message });
  }
};
