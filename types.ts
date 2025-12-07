export enum AppSection {
  HOME = 'HOME',
  VEO_STUDIO = 'VEO_STUDIO',
  IMAGE_EDITOR = 'IMAGE_EDITOR',
  CONTACT = 'CONTACT',
  ABOUT = 'ABOUT',
  SKILLS = 'SKILLS'
}

export interface VideoGenerationState {
  isGenerating: boolean;
  videoUrl: string | null;
  error: string | null;
  progress: string;
}

export interface ImageEditingState {
  isGenerating: boolean;
  resultImageUrl: string | null;
  error: string | null;
}

export type Coordinates = {
  x: number;
  y: number;
  z: number;
};