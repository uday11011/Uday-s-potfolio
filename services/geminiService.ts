import { GoogleGenAI } from "@google/genai";

// We create instances on demand to ensure the latest API key is used
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const checkApiKey = async (): Promise<boolean> => {
  const win = window as any;
  if (win.aistudio && win.aistudio.hasSelectedApiKey) {
    return await win.aistudio.hasSelectedApiKey();
  }
  return !!process.env.API_KEY;
};

export const promptApiKeySelection = async () => {
  const win = window as any;
  if (win.aistudio && win.aistudio.openSelectKey) {
    await win.aistudio.openSelectKey();
  } else {
    alert("API Key selection helper not available in this environment.");
  }
};

/**
 * Generate Video using Veo
 */
export const generateVideo = async (
  imageFile: File, 
  prompt: string, 
  aspectRatio: '16:9' | '9:16' = '16:9'
): Promise<string> => {
  const ai = getAI();
  const base64Image = await fileToBase64(imageFile);
  
  // Clean base64 string
  const data = base64Image.split(',')[1];
  const mimeType = imageFile.type;

  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: prompt || "Animate this image cinematographically", 
    image: {
      imageBytes: data,
      mimeType: mimeType,
    },
    config: {
      numberOfVideos: 1,
      resolution: '1080p',
      aspectRatio: aspectRatio
    }
  });

  // Polling loop
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error("No video URI returned");

  // Fetch the actual video blob
  const response = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
  if (!response.ok) throw new Error("Failed to download video");
  
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

/**
 * Edit Image using Gemini 2.5 Flash Image
 */
export const editImage = async (
  imageFile: File,
  prompt: string
): Promise<string> => {
  const ai = getAI();
  const base64Image = await fileToBase64(imageFile);
  const data = base64Image.split(',')[1];
  const mimeType = imageFile.type;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image', // "Nano banana" equivalent
    contents: {
      parts: [
        {
          inlineData: {
            data: data,
            mimeType: mimeType
          }
        },
        {
          text: prompt
        }
      ]
    }
  });

  // Extract image from response
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      const base64EncodeString = part.inlineData.data;
      return `data:image/png;base64,${base64EncodeString}`;
    }
  }

  throw new Error("No image generated in response");
};

// Helper
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};
