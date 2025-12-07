import React, { useState } from 'react';
import World from './components/World';
import Overlay from './components/Overlay';
import { AppSection } from './types';

const App: React.FC = () => {
  const [activeSection, setActiveSection] = useState<AppSection>(AppSection.HOME);

  return (
    <main className="relative w-full h-screen overflow-hidden font-sans">
      {/* 3D World serves as the background and main navigation */}
      <World 
        onSectionEnter={setActiveSection} 
        isOverlayOpen={activeSection !== AppSection.HOME}
      />

      {/* Overlay UI for specific sections (Veo, Image Editor, Contact) */}
      <Overlay 
        activeSection={activeSection} 
        onClose={() => setActiveSection(AppSection.HOME)} 
      />
    </main>
  );
};

export default App;