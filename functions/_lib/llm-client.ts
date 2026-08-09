import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function callLLM(prompt: string): Promise<string> {
  if (!process.env.GROQ_API_KEY) {
    console.warn('No GROQ_API_KEY set. Falling back to stub LLM call.');
    await new Promise(resolve => setTimeout(resolve, 2000)); // artificial delay
    return `[STUB RESPONSE] Simulated analysis for prompt: ${prompt.substring(0, 50)}...`;
  }
  
  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      temperature: 0.7,
    });
    return completion.choices[0]?.message?.content || '';
  } catch (error: any) {
    console.error("LLM Error:", error);
    throw new Error(`LLM Call failed: ${error.message}`);
  }
}
