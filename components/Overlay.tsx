import React, { useState, useRef } from 'react';
import { AppSection, VideoGenerationState, ImageEditingState } from '../types';
import { generateVideo, editImage, checkApiKey, promptApiKeySelection } from '../services/geminiService';
import { X, Upload, Play, Image as ImageIcon, Loader2, Video, Wand2, User, Code2, Briefcase } from 'lucide-react';

interface OverlayProps {
  activeSection: AppSection;
  onClose: () => void;
}

const Overlay: React.FC<OverlayProps> = ({ activeSection, onClose }) => {
  if (activeSection === AppSection.HOME) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col relative animate-in fade-in zoom-in duration-300">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors z-10"
        >
          <X className="w-5 h-5 text-gray-600" />
        </button>

        <div className="p-8">
          {activeSection === AppSection.VEO_STUDIO && <VeoStudio />}
          {activeSection === AppSection.IMAGE_EDITOR && <ImageEditor />}
          {activeSection === AppSection.CONTACT && <ContactSection />}
          {activeSection === AppSection.ABOUT && <AboutSection />}
          {activeSection === AppSection.SKILLS && <SkillsSection />}
        </div>
      </div>
    </div>
  );
};

const AboutSection: React.FC = () => (
  <div className="space-y-6">
    <div className="flex items-center gap-3 border-b pb-4">
      <div className="p-3 bg-indigo-100 rounded-lg">
        <User className="w-6 h-6 text-indigo-600" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-gray-800">About Me</h2>
        <p className="text-gray-500">The developer behind the wheel</p>
      </div>
    </div>
    <div className="grid md:grid-cols-2 gap-8 items-center">
      <div className="space-y-4 text-gray-600 leading-relaxed">
        <p>
          Hello! I'm <strong>Uday</strong>, a Creative Developer who loves bridging the gap between 
          technical engineering and interactive design.
        </p>
        <p>
          I specialize in building immersive 3D web experiences using technologies like 
          React Three Fiber and integrating cutting-edge Generative AI models to create 
          magic on the web.
        </p>
        <p>
          My goal is to make the web more fun, interactive, and intelligent. When I'm not coding, 
          you can find me exploring new game engines or experimenting with neural networks.
        </p>
      </div>
      <div className="bg-gray-100 rounded-xl h-64 flex items-center justify-center">
        <span className="text-gray-400 font-medium">Profile Photo Placeholder</span>
      </div>
    </div>
  </div>
);

const SkillsSection: React.FC = () => {
  const skills = [
    { name: "React & Next.js", level: 95 },
    { name: "Three.js / R3F", level: 90 },
    { name: "TypeScript", level: 90 },
    { name: "Generative AI API", level: 85 },
    { name: "Node.js", level: 80 },
    { name: "Tailwind CSS", level: 95 },
  ];

  return (
    <div className="space-y-6">
       <div className="flex items-center gap-3 border-b pb-4">
        <div className="p-3 bg-emerald-100 rounded-lg">
          <Code2 className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Technical Skills</h2>
          <p className="text-gray-500">My stack and expertise</p>
        </div>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        {skills.map((skill) => (
          <div key={skill.name} className="bg-gray-50 p-4 rounded-lg">
            <div className="flex justify-between mb-2">
              <span className="font-semibold text-gray-700">{skill.name}</span>
              <span className="text-emerald-600 font-bold">{skill.level}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className="bg-emerald-500 h-2.5 rounded-full transition-all duration-1000 ease-out" 
                style={{ width: `${skill.level}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const VeoStudio: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState('');
  const [state, setState] = useState<VideoGenerationState>({
    isGenerating: false,
    videoUrl: null,
    error: null,
    progress: ''
  });

  const handleGenerate = async () => {
    if (!file) return;

    // API Key Check
    const hasKey = await checkApiKey();
    if (!hasKey) {
      await promptApiKeySelection();
      // Optimistic continuation, or user tries again
      return; 
    }

    setState({ ...state, isGenerating: true, error: null, progress: 'Initializing Veo...' });

    try {
      setState(s => ({ ...s, progress: 'Generating video (this may take a minute)...' }));
      const videoUrl = await generateVideo(file, prompt);
      setState({ isGenerating: false, videoUrl, error: null, progress: '' });
    } catch (e: any) {
      setState({ isGenerating: false, videoUrl: null, error: e.message || 'Generation failed', progress: '' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 border-b pb-4">
        <div className="p-3 bg-purple-100 rounded-lg">
          <Video className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Veo Motion Studio (Project)</h2>
          <p className="text-gray-500">Bring your images to life with Veo 3.1</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">1. Upload an Image</span>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl hover:bg-gray-50 transition-colors cursor-pointer relative">
              <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <div className="space-y-1 text-center">
                {file ? (
                  <div className="text-sm text-green-600 font-medium flex items-center justify-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    {file.name}
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto h-12 w-12 text-gray-400" />
                    <p className="text-sm text-gray-600">Click to upload or drag and drop</p>
                  </>
                )}
              </div>
            </div>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">2. Describe the motion</span>
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="E.g., A cinematic pan of the car driving through the neon city..."
              className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 bg-gray-50 p-3 min-h-[100px]"
            />
          </label>

          <button
            onClick={handleGenerate}
            disabled={!file || state.isGenerating}
            className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {state.isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            {state.isGenerating ? 'Generating...' : 'Generate Video'}
          </button>
          
          {state.progress && <p className="text-sm text-purple-600 text-center animate-pulse">{state.progress}</p>}
          {state.error && <p className="text-sm text-red-500 text-center bg-red-50 p-2 rounded">{state.error}</p>}
        </div>

        <div className="bg-gray-900 rounded-xl flex items-center justify-center min-h-[300px] overflow-hidden">
          {state.videoUrl ? (
            <video src={state.videoUrl} controls className="w-full h-full object-contain" autoPlay loop />
          ) : (
            <div className="text-gray-500 text-center p-6">
              <Video className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p>Generated video will appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ImageEditor: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState('');
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [state, setState] = useState<ImageEditingState>({
    isGenerating: false,
    resultImageUrl: null,
    error: null
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      const reader = new FileReader();
      reader.onload = (e) => setFilePreview(e.target?.result as string);
      reader.readAsDataURL(f);
    }
  };

  const handleGenerate = async () => {
    if (!file || !prompt) return;
    setState({ ...state, isGenerating: true, error: null });

    try {
      const resultImageUrl = await editImage(file, prompt);
      setState({ isGenerating: false, resultImageUrl, error: null });
    } catch (e: any) {
      setState({ isGenerating: false, resultImageUrl: null, error: e.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 border-b pb-4">
        <div className="p-3 bg-blue-100 rounded-lg">
          <Wand2 className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Magic Editor (Project)</h2>
          <p className="text-gray-500">Edit images with Gemini 2.5 Flash Image</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 space-y-4">
           <label className="block">
            <span className="text-sm font-medium text-gray-700">Upload Source Image</span>
            <input type="file" onChange={handleFileChange} accept="image/*" className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-colors"/>
          </label>

          {filePreview && (
            <div className="h-48 bg-gray-100 rounded-lg overflow-hidden relative">
              <img src={filePreview} alt="Source" className="w-full h-full object-cover" />
              <div className="absolute bottom-0 left-0 bg-black/50 text-white text-xs px-2 py-1">Original</div>
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Instruction</span>
            <input 
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="E.g., Add a retro filter, remove the background..."
              className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-gray-50 p-3"
            />
          </label>

          <button
            onClick={handleGenerate}
            disabled={!file || !prompt || state.isGenerating}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-all disabled:opacity-50"
          >
            {state.isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
            {state.isGenerating ? 'Editing...' : 'Apply Magic'}
          </button>
           {state.error && <p className="text-sm text-red-500 text-center bg-red-50 p-2 rounded">{state.error}</p>}
        </div>

        <div className="flex-1 bg-gray-50 border rounded-xl flex items-center justify-center min-h-[300px] overflow-hidden relative">
          {state.resultImageUrl ? (
            <img src={state.resultImageUrl} alt="Edited Result" className="w-full h-full object-contain" />
          ) : (
            <div className="text-gray-400 text-center p-6">
              <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p>Edited image will appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ContactSection: React.FC = () => (
  <div className="text-center space-y-6">
    <div className="p-3 bg-green-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto">
      <Briefcase className="w-8 h-8 text-green-600" />
    </div>
    <h2 className="text-3xl font-bold text-gray-800">Get in Touch</h2>
    <p className="text-gray-600 max-w-lg mx-auto">
      I'm Uday, a creative developer passionate about 3D web experiences and Generative AI. 
      Let's build something amazing together.
    </p>
    <div className="flex justify-center gap-4">
      <a href="#" className="px-6 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors">
        Email Me
      </a>
      <a href="#" className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors">
        GitHub
      </a>
    </div>
  </div>
);

export default Overlay;