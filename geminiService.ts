
import { GoogleGenAI, Type } from "@google/genai";
import { Category } from "./types";

// Always use process.env.API_KEY directly as per guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const categorizeExpense = async (text: string): Promise<{ category: Category; amount?: number; description: string }> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Extract expense details from the following text: "${text}". Categorize it into one of these: ${Object.values(Category).join(', ')}. Return exactly as JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: {
              type: Type.STRING,
              description: 'The best matching category from the list.',
            },
            amount: {
              type: Type.NUMBER,
              description: 'The monetary amount mentioned, if any.',
            },
            description: {
              type: Type.STRING,
              description: 'A brief, clean title for the expense.',
            },
          },
          required: ["category", "description"]
        },
      },
    });

    const data = JSON.parse(response.text || '{}');
    return {
      category: data.category as Category || Category.OTHER,
      amount: data.amount,
      description: data.description || text,
    };
  } catch (error) {
    console.error("AI Categorization failed", error);
    return { category: Category.OTHER, description: text };
  }
};

export const getFinancialInsights = async (expenses: any[], budget: number): Promise<string> => {
    if (expenses.length === 0) return "Add some expenses to get AI-powered insights!";
    
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `I have a monthly budget of ${budget}. Here are my recent expenses: ${JSON.stringify(expenses)}. 
        Provide a 2-sentence sharp, actionable financial advice or observation. Keep it encouraging but realistic.`,
      });
      return response.text || "Keep tracking your spending to stay within budget.";
    } catch (error) {
      return "Unable to generate insights at this moment.";
    }
}